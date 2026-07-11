-- Announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'global',
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_username TEXT,
  style TEXT DEFAULT 'info',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "announcements_read" ON public.announcements;
DROP POLICY IF EXISTS "announcements_insert" ON public.announcements;
DROP POLICY IF EXISTS "announcements_update" ON public.announcements;
DROP POLICY IF EXISTS "announcements_delete" ON public.announcements;
CREATE POLICY "announcements_read" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "announcements_insert" ON public.announcements FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
  OR auth.email() = 'fullnessmindset@gmail.com'
);
CREATE POLICY "announcements_update" ON public.announcements FOR UPDATE USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
  OR auth.email() = 'fullnessmindset@gmail.com'
);
CREATE POLICY "announcements_delete" ON public.announcements FOR DELETE USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
  OR auth.email() = 'fullnessmindset@gmail.com'
);

-- Fix reports RLS: allow admin to update reports
DROP POLICY IF EXISTS "reports_update_admin" ON public.reports;
CREATE POLICY "reports_update_admin" ON public.reports FOR UPDATE USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
  OR auth.email() = 'fullnessmindset@gmail.com'
);

-- Allow admin to read ALL reports (merge into one policy)
DROP POLICY IF EXISTS "reports_read_admin" ON public.reports;
DROP POLICY IF EXISTS "reports_read_own" ON public.reports;
CREATE POLICY "reports_read" ON public.reports FOR SELECT USING (
  auth.uid() = reporter_id
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
  OR auth.email() = 'fullnessmindset@gmail.com'
);
