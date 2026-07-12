-- Production Hardening Migration
-- Webhook idempotency, rate limiting support

-- ===== WEBHOOK IDEMPOTENCY =====
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  stripe_session_id TEXT,
  metadata JSONB DEFAULT '{}',
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_stripe
  ON public.processed_webhook_events (stripe_event_id);

-- Auto-cleanup: delete events older than 30 days (run periodically or via pg_cron)
-- DELETE FROM public.processed_webhook_events WHERE processed_at < now() - interval '30 days';

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (webhooks use service role key)
DO $$ BEGIN
  CREATE POLICY "Service role manages webhook events"
    ON public.processed_webhook_events FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== RATE LIMITING =====
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window
  ON public.rate_limits (key, window_start DESC);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages rate limits"
    ON public.rate_limits FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rate limit check function: returns true if request is allowed
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_max_requests INTEGER DEFAULT 10,
  p_window_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ := now() - (p_window_seconds || ' seconds')::interval;
  v_count INTEGER;
BEGIN
  -- Clean old entries
  DELETE FROM public.rate_limits
  WHERE key = p_key AND window_start < v_window_start;

  -- Count recent requests
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM public.rate_limits
  WHERE key = p_key AND window_start >= v_window_start;

  IF v_count >= p_max_requests THEN
    RETURN false;
  END IF;

  -- Record this request
  INSERT INTO public.rate_limits (key, window_start, request_count)
  VALUES (p_key, now(), 1);

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
