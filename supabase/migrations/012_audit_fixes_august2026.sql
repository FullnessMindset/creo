-- 012_audit_fixes_august2026.sql
-- Security audit fixes — August 2026

-- H-02: Add unique constraint on processed_webhook_events.stripe_event_id
-- for atomic idempotency (insert-first pattern instead of check-then-act)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'processed_webhook_events_stripe_event_id_key'
  ) THEN
    ALTER TABLE public.processed_webhook_events
      ADD CONSTRAINT processed_webhook_events_stripe_event_id_key UNIQUE (stripe_event_id);
  END IF;
END $$;

-- C-06: verification_documents "Service read all docs" uses USING(true) which lets
-- ANY authenticated user read all documents. Replace with a policy scoped to service_role.
DROP POLICY IF EXISTS "Service read all docs" ON public.verification_documents;
CREATE POLICY "Service read all docs" ON public.verification_documents
  FOR SELECT TO service_role USING (true);

-- M-02: meta_contributions INSERT policy uses WITH CHECK(true) allowing any user
-- to insert contributions directly. Scope to service_role (only webhook inserts).
DROP POLICY IF EXISTS "Service insert contributions" ON public.meta_contributions;
CREATE POLICY "Service insert contributions" ON public.meta_contributions
  FOR INSERT TO service_role WITH CHECK (true);

-- H-09: increment_meta_raised is SECURITY DEFINER and callable by any authenticated user.
-- Add internal auth check so only service_role callers can use it.
CREATE OR REPLACE FUNCTION increment_meta_raised(p_meta_id UUID, p_amount INTEGER)
RETURNS void AS $$
BEGIN
  IF current_setting('role') != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: service_role required';
  END IF;
  UPDATE public.metas SET raised_cents = raised_cents + p_amount WHERE id = p_meta_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- H-07: void_financial_record is SECURITY DEFINER with no auth check.
-- Add admin role verification via admin_emails table.
CREATE OR REPLACE FUNCTION void_financial_record(
  p_table TEXT,
  p_record_id UUID,
  p_reason TEXT
)
RETURNS void AS $$
BEGIN
  -- Only allow admins (checked via admin_emails table)
  IF NOT EXISTS (
    SELECT 1 FROM admin_emails WHERE email = auth.jwt()->>'email'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  IF p_table = 'tips' THEN
    UPDATE tips SET voided = true, void_reason = p_reason, voided_at = now() WHERE id = p_record_id;
  ELSIF p_table = 'subscriptions' THEN
    UPDATE subscriptions SET voided = true, void_reason = p_reason, voided_at = now() WHERE id = p_record_id;
  ELSIF p_table = 'meta_contributions' THEN
    UPDATE meta_contributions SET voided = true, void_reason = p_reason WHERE id = p_record_id;
  ELSE
    RAISE EXCEPTION 'Unknown financial table: %', p_table;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- H-07: review_moderation_flag is SECURITY DEFINER with no auth check.
-- Add admin role verification.
CREATE OR REPLACE FUNCTION review_moderation_flag(
  p_flag_id UUID,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_flag RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_emails WHERE email = auth.jwt()->>'email'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT * INTO v_flag FROM moderation_flags WHERE id = p_flag_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Flag not found'; END IF;

  UPDATE moderation_flags SET
    status = p_decision,
    reviewer_id = auth.uid(),
    review_notes = p_notes,
    decided_at = now()
  WHERE id = p_flag_id;

  IF p_decision = 'approved' THEN
    PERFORM set_moderation_status(v_flag.content_type, v_flag.content_id, 'approved', v_flag.category, v_flag.confidence, 'admin');
  ELSIF p_decision = 'removed' THEN
    PERFORM set_moderation_status(v_flag.content_type, v_flag.content_id, 'removed', v_flag.category, v_flag.confidence, 'admin');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- M-08: creator_fairness_log FOR ALL USING(true) lets any user read/write fairness data.
-- Scope to service_role only.
DROP POLICY IF EXISTS "Service manage fairness" ON public.creator_fairness_log;
CREATE POLICY "Service manage fairness" ON public.creator_fairness_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- C-01: Storage bucket "documents" SELECT policy has no ownership check.
-- Any authenticated user can download any user's KYC/verification files.
DROP POLICY IF EXISTS "Auth read own documents" ON storage.objects;
CREATE POLICY "Auth read own documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- C-02: Storage bucket "documents" INSERT policy has no ownership check.
-- Any authenticated user can upload/overwrite files at any path.
DROP POLICY IF EXISTS "Auth upload documents" ON storage.objects;
CREATE POLICY "Auth upload documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- H-04: set_moderation_status is SECURITY DEFINER with no auth check.
-- Add service_role OR admin check (called by moderate-content Edge Function and review_moderation_flag).
CREATE OR REPLACE FUNCTION set_moderation_status(
  p_content_type TEXT,
  p_content_id UUID,
  p_status TEXT,
  p_category TEXT DEFAULT 'safe',
  p_confidence NUMERIC DEFAULT 1.0,
  p_source TEXT DEFAULT 'automated'
)
RETURNS void AS $$
BEGIN
  -- Only service_role or admins may call this
  IF current_setting('role') != 'service_role' AND NOT EXISTS (
    SELECT 1 FROM admin_emails WHERE email = auth.jwt()->>'email'
  ) THEN
    RAISE EXCEPTION 'Access denied: service_role or admin required';
  END IF;

  IF p_content_type = 'post' THEN
    UPDATE posts SET moderation_status = p_status WHERE id = p_content_id;
  ELSIF p_content_type = 'community_post' THEN
    UPDATE community_posts SET moderation_status = p_status WHERE id = p_content_id;
  END IF;

  INSERT INTO moderation_flags (content_type, content_id, category, confidence, status, source, decided_at)
  VALUES (
    p_content_type, p_content_id, p_category, p_confidence,
    CASE p_status
      WHEN 'approved' THEN 'approved'
      WHEN 'removed' THEN 'removed'
      WHEN 'under_review' THEN 'pending'
      ELSE 'pending'
    END,
    p_source,
    CASE WHEN p_status IN ('approved', 'removed') THEN now() ELSE NULL END
  )
  ON CONFLICT (content_type, content_id, category) DO UPDATE SET
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    decided_at = EXCLUDED.decided_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- M-02b: Notifications INSERT allows any user to spoof notifications for any user_id.
DROP POLICY IF EXISTS "Service insert notifications" ON public.notifications;
CREATE POLICY "Service insert notifications" ON public.notifications
  FOR INSERT TO service_role WITH CHECK (true);

-- H-03: Add stripe_payment_intent column to tips and meta_contributions
-- so refund handler can match by payment_intent instead of session ID.
ALTER TABLE public.tips ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT;
ALTER TABLE public.meta_contributions ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT;
CREATE INDEX IF NOT EXISTS idx_tips_payment_intent ON public.tips(stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_contributions_payment_intent ON public.meta_contributions(stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL;

-- =============================================
-- AUDIT V3 FIXES — August 2, 2026
-- =============================================

-- C-02: Views fairness_metrics and system_health bypass RLS (run with view owner privileges).
-- Any authenticated user can read admin-only moderation/manipulation data via REST API.
ALTER VIEW IF EXISTS fairness_metrics SET (security_invoker = true);
ALTER VIEW IF EXISTS system_health SET (security_invoker = true);
REVOKE SELECT ON fairness_metrics FROM anon, authenticated;
REVOKE SELECT ON system_health FROM anon, authenticated;
GRANT SELECT ON fairness_metrics TO service_role;
GRANT SELECT ON system_health TO service_role;

-- H-02: Storage buckets avatars/covers/meta-images lack folder-ownership enforcement.
-- Any authenticated user can overwrite another user's avatar/cover/meta-image.
-- Fix: Add ownership check matching the documents bucket pattern.

-- Avatars bucket
DROP POLICY IF EXISTS "Auth upload avatars" ON storage.objects;
CREATE POLICY "Auth upload avatars" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS "Auth update avatars" ON storage.objects;
CREATE POLICY "Auth update avatars" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Covers bucket
DROP POLICY IF EXISTS "Auth upload covers" ON storage.objects;
CREATE POLICY "Auth upload covers" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'covers'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS "Auth update covers" ON storage.objects;
CREATE POLICY "Auth update covers" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'covers'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Meta-images bucket
DROP POLICY IF EXISTS "Auth upload meta-images" ON storage.objects;
CREATE POLICY "Auth upload meta-images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meta-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS "Auth update meta-images" ON storage.objects;
CREATE POLICY "Auth update meta-images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'meta-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- H-03: manipulation_signals and moderation_flags INSERT policies unscoped to service_role.
-- Any authenticated user can insert fabricated anti-abuse signals.
DROP POLICY IF EXISTS "manipulation_signals_service_insert" ON public.manipulation_signals;
CREATE POLICY "manipulation_signals_service_insert" ON public.manipulation_signals
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "moderation_flags_service_insert" ON public.moderation_flags;
CREATE POLICY "moderation_flags_service_insert" ON public.moderation_flags
  FOR INSERT TO service_role WITH CHECK (true);

-- H-04: check_manipulation() takes unvalidated p_actor_id — griefing vector.
-- Add auth check: p_actor_id must equal auth.uid() unless caller is service_role.
CREATE OR REPLACE FUNCTION check_manipulation(p_actor_id UUID, p_post_id UUID)
RETURNS TABLE(allowed BOOLEAN, action TEXT, confidence NUMERIC) AS $$
DECLARE
  v_velocity INT;
  v_config RECORD;
  v_result_action TEXT := 'none';
  v_result_confidence NUMERIC := 0;
  v_allowed BOOLEAN := true;
BEGIN
  -- Auth check: only the actor themselves or service_role can call this
  IF p_actor_id != auth.uid() AND current_setting('role') != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: can only check own actor_id';
  END IF;

  SELECT * INTO v_config FROM algorithm_config LIMIT 1;

  SELECT COUNT(*) INTO v_velocity
  FROM engagements
  WHERE actor_id = p_actor_id
    AND created_at > now() - interval '5 minutes';

  IF v_velocity > COALESCE(v_config.manipulation_velocity_threshold, 20) THEN
    v_result_action := 'rate_limit';
    v_result_confidence := LEAST(v_velocity::NUMERIC / COALESCE(v_config.manipulation_velocity_threshold, 20), 1.0);
    v_allowed := false;

    INSERT INTO manipulation_signals (actor_id, signal_type, confidence, details)
    VALUES (p_actor_id, 'velocity_spike', v_result_confidence,
      jsonb_build_object('velocity', v_velocity, 'threshold', v_config.manipulation_velocity_threshold));
  END IF;

  RETURN QUERY SELECT v_allowed, v_result_action, v_result_confidence;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
