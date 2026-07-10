-- Meta Contributions — Run in Supabase SQL Editor
-- Tracks individual contributions to creator metas (goals)

CREATE TABLE IF NOT EXISTS public.meta_contributions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_id UUID REFERENCES public.metas(id) ON DELETE CASCADE NOT NULL,
  stripe_session_id TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  contributor_name TEXT DEFAULT 'Anónimo',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.meta_contributions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "meta_contributions_read" ON public.meta_contributions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
