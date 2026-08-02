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
