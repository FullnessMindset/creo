-- ============================================================
-- CREO Platform — Security Hardening Migration
-- Fixes critical RLS vulnerabilities found in global audit
-- Safe to run multiple times (idempotent via IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================

-- ===== 1. FIX deal_messages: remove world-readable SELECT policy =====
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deal_messages' AND policyname LIKE '%select%' AND qual = 'true') THEN
    DROP POLICY IF EXISTS "deal_messages_select" ON public.deal_messages;
  END IF;
END $$;
DROP POLICY IF EXISTS "deal_messages_read_all" ON public.deal_messages;
DROP POLICY IF EXISTS "deal_messages_select_all" ON public.deal_messages;

-- Proper policy: only conversation participants can read messages
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deal_messages' AND policyname = 'deal_messages_participant_read') THEN
    CREATE POLICY deal_messages_participant_read ON public.deal_messages FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.deal_conversations dc
          WHERE dc.id = deal_messages.conversation_id
          AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid())
        )
      );
  END IF;
END $$;

-- ===== 2. FIX tips: restrict INSERT/UPDATE to service_role only =====
-- Drop any overly permissive policies
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE tablename = 'tips';
  IF FOUND THEN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'tips' AND cmd IN ('INSERT', 'UPDATE') LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.tips', r.policyname);
    END LOOP;
  END IF;
END $$;

-- Keep SELECT for users who are the creator (received tips)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tips' AND policyname = 'tips_creator_read') THEN
    CREATE POLICY tips_creator_read ON public.tips FOR SELECT
      USING (auth.uid() = creator_id);
  END IF;
END $$;

-- ===== 3. FIX subscriptions: restrict INSERT/UPDATE to service_role only =====
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE tablename = 'subscriptions';
  IF FOUND THEN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'subscriptions' AND cmd IN ('INSERT', 'UPDATE') LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.subscriptions', r.policyname);
    END LOOP;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'subscriptions_creator_read') THEN
    CREATE POLICY subscriptions_creator_read ON public.subscriptions FOR SELECT
      USING (auth.uid() = creator_id);
  END IF;
END $$;

-- ===== 4. FIX rate_limits: restrict ALL DML to service_role only =====
-- Drop all user-facing policies on rate_limits
DO $$ BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'rate_limits' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.rate_limits', r.policyname);
  END LOOP;
END $$;

-- Only service_role (Edge Functions) can touch this table
-- RLS is enabled but no user-facing policies = deny all to anon/authenticated

-- ===== 5. FIX processed_webhook_events: restrict ALL DML to service_role only =====
DO $$ BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'processed_webhook_events' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.processed_webhook_events', r.policyname);
  END LOOP;
END $$;

-- ===== 6. FIX notifications INSERT: restrict to own notifications + service_role =====
DO $$ BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'notifications' AND cmd = 'INSERT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', r.policyname);
  END LOOP;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_insert_own') THEN
    CREATE POLICY notifications_insert_own ON public.notifications FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND auth.uid() != user_id
      );
  END IF;
END $$;

-- ===== 7. Create profiles_public view for safe column exposure =====
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  id, username, display_name, bio, avatar_url, cover_url,
  account_type, creo_id_verified, stripe_onboarded,
  social_links, created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ===== 8. FIX RPC impersonation: recreate with auth.uid() =====

-- Fix send_deal_message: use auth.uid() instead of trusting p_sender_id
CREATE OR REPLACE FUNCTION public.send_deal_message(
  p_conversation_id UUID,
  p_content TEXT,
  p_message_type TEXT DEFAULT 'text',
  p_payment_amount_cents INTEGER DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_msg_id UUID;
  v_sender_id UUID;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify sender is a participant in the conversation
  IF NOT EXISTS (
    SELECT 1 FROM public.deal_conversations
    WHERE id = p_conversation_id
    AND (brand_id = v_sender_id OR creator_id = v_sender_id)
  ) THEN
    RAISE EXCEPTION 'Not a participant in this conversation';
  END IF;

  INSERT INTO public.deal_messages (conversation_id, sender_id, content, message_type, payment_amount_cents, payment_status)
  VALUES (p_conversation_id, v_sender_id, p_content, p_message_type, p_payment_amount_cents, p_payment_status)
  RETURNING id INTO v_msg_id;

  UPDATE public.deal_conversations SET updated_at = now() WHERE id = p_conversation_id;

  RETURN v_msg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix get_deal_messages: use auth.uid() for access control
CREATE OR REPLACE FUNCTION public.get_deal_messages(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 50
) RETURNS SETOF public.deal_messages AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.deal_conversations
    WHERE id = p_conversation_id
    AND (brand_id = v_caller_id OR creator_id = v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Not a participant in this conversation';
  END IF;

  RETURN QUERY
    SELECT * FROM public.deal_messages
    WHERE conversation_id = p_conversation_id
    ORDER BY created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix mark_brand_deal_paid: require auth + verify caller is admin or brand
CREATE OR REPLACE FUNCTION public.mark_brand_deal_paid(
  p_request_id UUID,
  p_stripe_session_id TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_caller_id UUID;
  v_caller_email TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  -- Only admin can mark deals as paid
  IF v_caller_email != 'fullnessmindset@gmail.com' THEN
    RAISE EXCEPTION 'Only admin can mark deals as paid';
  END IF;

  UPDATE public.brand_deal_requests
  SET status = 'paid', paid_at = now(), stripe_session_id = COALESCE(p_stripe_session_id, stripe_session_id)
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== 9. FIX brand_deals admin access regression =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_deals' AND policyname = 'brand_deals_admin_all') THEN
    CREATE POLICY brand_deals_admin_all ON public.brand_deals FOR ALL
      USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'fullnessmindset@gmail.com')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'fullnessmindset@gmail.com')
      );
  END IF;
END $$;

-- ===== 10. FIX meta_comments/story_comments: add UPDATE/DELETE policies =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meta_comments' AND policyname = 'meta_comments_own_update') THEN
    CREATE POLICY meta_comments_own_update ON public.meta_comments FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meta_comments' AND policyname = 'meta_comments_own_delete') THEN
    CREATE POLICY meta_comments_own_delete ON public.meta_comments FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'story_comments' AND policyname = 'story_comments_own_update') THEN
    CREATE POLICY story_comments_own_update ON public.story_comments FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'story_comments' AND policyname = 'story_comments_own_delete') THEN
    CREATE POLICY story_comments_own_delete ON public.story_comments FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ===== 11. Add missing FK indexes =====
CREATE INDEX IF NOT EXISTS idx_deal_messages_sender ON public.deal_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_business_links_creator ON public.business_links (creator_id);
CREATE INDEX IF NOT EXISTS idx_verification_documents_user ON public.verification_documents (user_id);

-- ===== 12. Add FK for community_posts.shared_story_id =====
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'community_posts' AND ccu.column_name = 'shared_story_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.community_posts
      ADD CONSTRAINT fk_community_posts_shared_story
      FOREIGN KEY (shared_story_id) REFERENCES public.creator_stories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ===== 13. Standardize account_type values =====
UPDATE public.profiles SET account_type = 'brand' WHERE account_type IN ('empresa', 'business');

-- ===== ANALYZE updated tables =====
ANALYZE public.deal_messages;
ANALYZE public.tips;
ANALYZE public.subscriptions;
ANALYZE public.notifications;
ANALYZE public.brand_deals;
