-- ============================================================
-- CREO Platform — Production Fixes V2
-- Payment fee tracking, schema conflict resolution,
-- deal message encryption, missing tables
-- Safe to run multiple times (idempotent)
-- ============================================================

-- ===== 1. PAYMENT FEE TRACKING: Add columns to tips, subscriptions, meta_contributions =====

ALTER TABLE public.tips ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER DEFAULT 0;
ALTER TABLE public.tips ADD COLUMN IF NOT EXISTS stripe_surcharge_cents INTEGER DEFAULT 0;
ALTER TABLE public.tips ADD COLUMN IF NOT EXISTS creator_payout_cents INTEGER GENERATED ALWAYS AS (amount_cents - platform_fee_cents) STORED;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_surcharge_cents INTEGER DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS subscriber_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.meta_contributions ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER DEFAULT 0;
ALTER TABLE public.meta_contributions ADD COLUMN IF NOT EXISTS stripe_surcharge_cents INTEGER DEFAULT 0;

-- ===== 2. FIX COUNTER COLUMN DUPLICATION =====
-- Standardize on likes_count/comments_count (used by triggers in database-integrity.sql)
-- Migrate data from old like_count/comment_count columns, then drop them

DO $$ BEGIN
  -- Metas: sync old columns to new ones if old ones have data
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='metas' AND column_name='like_count') THEN
    UPDATE public.metas SET likes_count = GREATEST(COALESCE(likes_count,0), COALESCE(like_count,0))
    WHERE COALESCE(like_count,0) > COALESCE(likes_count,0);
    UPDATE public.metas SET comments_count = GREATEST(COALESCE(comments_count,0), COALESCE(comment_count,0))
    WHERE COALESCE(comment_count,0) > COALESCE(comments_count,0);
    ALTER TABLE public.metas DROP COLUMN IF EXISTS like_count;
    ALTER TABLE public.metas DROP COLUMN IF EXISTS comment_count;
  END IF;

  -- Posts: same treatment
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='like_count') THEN
    UPDATE public.posts SET likes_count = GREATEST(COALESCE(likes_count,0), COALESCE(like_count,0))
    WHERE COALESCE(like_count,0) > COALESCE(likes_count,0);
    UPDATE public.posts SET comments_count = GREATEST(COALESCE(comments_count,0), COALESCE(comment_count,0))
    WHERE COALESCE(comment_count,0) > COALESCE(comments_count,0);
    ALTER TABLE public.posts DROP COLUMN IF EXISTS like_count;
    ALTER TABLE public.posts DROP COLUMN IF EXISTS comment_count;
  END IF;

  -- Creator stories: same treatment
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creator_stories' AND column_name='like_count') THEN
    UPDATE public.creator_stories SET likes_count = GREATEST(COALESCE(likes_count,0), COALESCE(like_count,0))
    WHERE COALESCE(like_count,0) > COALESCE(likes_count,0);
    UPDATE public.creator_stories SET comments_count = GREATEST(COALESCE(comments_count,0), COALESCE(comment_count,0))
    WHERE COALESCE(comment_count,0) > COALESCE(comments_count,0);
    ALTER TABLE public.creator_stories DROP COLUMN IF EXISTS like_count;
    ALTER TABLE public.creator_stories DROP COLUMN IF EXISTS comment_count;
  END IF;
END $$;

-- ===== 3. FIX admin_notifications SCHEMA CONFLICT =====
-- Two migrations created this table with different columns.
-- Ensure ALL columns from both schemas exist.
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

-- Backfill: copy type->event_type and data->details where one is null
UPDATE public.admin_notifications SET event_type = type WHERE event_type IS NULL AND type IS NOT NULL;
UPDATE public.admin_notifications SET details = data WHERE details = '{}' AND data != '{}';

-- ===== 4. DEAL MESSAGES: Add content TEXT column =====
-- The table has encrypted_content BYTEA but the RPC and Edge Functions write to 'content'
ALTER TABLE public.deal_messages ADD COLUMN IF NOT EXISTS content TEXT;

-- Migrate any encrypted_content to content (as text) for existing messages
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deal_messages' AND column_name='encrypted_content') THEN
    UPDATE public.deal_messages
    SET content = convert_from(encrypted_content, 'UTF8')
    WHERE content IS NULL AND encrypted_content IS NOT NULL;
  END IF;
EXCEPTION WHEN others THEN
  -- encrypted_content might contain actual encrypted bytes that can't convert to UTF8
  NULL;
END $$;

-- ===== 5. MISSING TABLES: conversations, business_links, verification_documents =====
-- These are referenced by indexes and code but never created

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user2_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user1_id, user2_id)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY conversations_participant_read ON public.conversations FOR SELECT
    USING (auth.uid() = user1_id OR auth.uid() = user2_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY conversations_participant_insert ON public.conversations FOR INSERT
    WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY conversations_participant_update ON public.conversations FOR UPDATE
    USING (auth.uid() = user1_id OR auth.uid() = user2_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.business_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.business_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY business_links_public_read ON public.business_links FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY business_links_owner_write ON public.business_links FOR ALL
    USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.verification_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY verification_docs_owner_read ON public.verification_documents FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY verification_docs_owner_insert ON public.verification_documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY verification_docs_admin_all ON public.verification_documents FOR ALL
    USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'fullnessmindset@gmail.com'))
    WITH CHECK (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'fullnessmindset@gmail.com'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== 6. FIX INDEXES: recreate for tables that now exist =====
CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON public.conversations (user1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON public.conversations (user2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON public.conversations (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_business_links_creator ON public.business_links (creator_id);
CREATE INDEX IF NOT EXISTS idx_verification_documents_user ON public.verification_documents (user_id);

-- ===== 7. FIX RPC FUNCTIONS that reference old like_count/comment_count =====
-- Update toggle functions to use likes_count/comments_count

CREATE OR REPLACE FUNCTION public.toggle_meta_like(p_meta_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.meta_likes WHERE meta_id = p_meta_id AND user_id = v_user_id) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.meta_likes WHERE meta_id = p_meta_id AND user_id = v_user_id;
    RETURN false;
  ELSE
    INSERT INTO public.meta_likes (meta_id, user_id) VALUES (p_meta_id, v_user_id);
    RETURN true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_user_id) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_user_id;
    RETURN false;
  ELSE
    INSERT INTO public.post_likes (post_id, user_id) VALUES (p_post_id, v_user_id);
    RETURN true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.toggle_story_like(p_story_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.story_likes WHERE story_id = p_story_id AND user_id = v_user_id) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.story_likes WHERE story_id = p_story_id AND user_id = v_user_id;
    RETURN false;
  ELSE
    INSERT INTO public.story_likes (story_id, user_id) VALUES (p_story_id, v_user_id);
    RETURN true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== 8. PLATFORM REVENUE VIEW =====
-- Queryable view for admin dashboard to see platform revenue

CREATE OR REPLACE VIEW public.platform_revenue AS
SELECT
  'tip' AS type,
  id,
  created_at,
  amount_cents AS base_amount_cents,
  platform_fee_cents,
  stripe_surcharge_cents,
  creator_id
FROM public.tips
UNION ALL
SELECT
  'subscription' AS type,
  id,
  created_at,
  amount_cents AS base_amount_cents,
  platform_fee_cents,
  stripe_surcharge_cents,
  creator_id
FROM public.subscriptions
UNION ALL
SELECT
  'meta_contribution' AS type,
  id,
  created_at,
  amount_cents AS base_amount_cents,
  platform_fee_cents,
  stripe_surcharge_cents,
  NULL::UUID AS creator_id
FROM public.meta_contributions;

-- ===== ANALYZE =====
ANALYZE public.tips;
ANALYZE public.subscriptions;
ANALYZE public.meta_contributions;
ANALYZE public.deal_messages;
ANALYZE public.admin_notifications;
ANALYZE public.metas;
ANALYZE public.posts;
ANALYZE public.creator_stories;
