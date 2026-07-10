-- Admin Emails Log — Run in Supabase SQL Editor
-- Tracks emails sent from admin panel to users

CREATE TABLE IF NOT EXISTS public.admin_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_by TEXT NOT NULL,
  resend_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/read (admin-api uses service role key)
DO $$ BEGIN
  CREATE POLICY "admin_emails_service_only" ON public.admin_emails
    FOR ALL USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payout Log — Tracks fund releases to creators
CREATE TABLE IF NOT EXISTS public.payout_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_id UUID REFERENCES public.metas(id) ON DELETE SET NULL,
  connect_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  stripe_transfer_id TEXT,
  approved_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.payout_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "payout_log_service_only" ON public.payout_log
    FOR ALL USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
