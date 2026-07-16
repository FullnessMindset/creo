-- ============================================================
-- CREO Platform — Admin Moderation System
-- Report messages, user sanctions, warning tracking
-- Safe to run multiple times (idempotent)
-- ============================================================

-- ===== 1. REPORT MESSAGES — Admin/user message history per report =====
CREATE TABLE IF NOT EXISTS public.report_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role TEXT DEFAULT 'admin' CHECK (sender_role IN ('admin', 'user')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'message' CHECK (message_type IN ('message', 'warning', 'action', 'system')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.report_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_report_messages_report ON public.report_messages (report_id, created_at);

DO $$ BEGIN
  CREATE POLICY report_messages_admin_all ON public.report_messages FOR ALL
    USING (auth.email() = 'fullnessmindset@gmail.com' OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin'))
    WITH CHECK (auth.email() = 'fullnessmindset@gmail.com' OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== 2. USER SANCTIONS — Track warnings, locks, bans =====
CREATE TABLE IF NOT EXISTS public.user_sanctions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  report_id UUID,
  sanction_type TEXT NOT NULL CHECK (sanction_type IN ('warning', 'partial_lock', 'temporary_lock', 'life_ban')),
  reason TEXT,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_sanctions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_user_sanctions_user ON public.user_sanctions (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sanctions_active ON public.user_sanctions (is_active, sanction_type);

DO $$ BEGIN
  CREATE POLICY user_sanctions_admin_all ON public.user_sanctions FOR ALL
    USING (auth.email() = 'fullnessmindset@gmail.com' OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin'))
    WITH CHECK (auth.email() = 'fullnessmindset@gmail.com' OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY user_sanctions_user_read ON public.user_sanctions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== 3. ADD COLUMNS TO REPORTS TABLE =====
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_by UUID;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0;

-- ===== 4. ADD SANCTION FIELDS TO PROFILES =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sanction_status TEXT DEFAULT 'none' CHECK (sanction_status IN ('none', 'warned', 'partial_lock', 'temporary_lock', 'life_ban'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sanction_expires_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_warnings INTEGER DEFAULT 0;

-- ===== 5. ADD ADMIN UPDATE POLICY FOR REPORTS =====
DO $$ BEGIN
  CREATE POLICY reports_admin_update ON public.reports FOR UPDATE
    USING (auth.email() = 'fullnessmindset@gmail.com' OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY reports_admin_delete ON public.reports FOR DELETE
    USING (auth.email() = 'fullnessmindset@gmail.com' OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== ANALYZE =====
ANALYZE public.reports;
