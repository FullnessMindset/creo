-- ===== LAUNCH FIXES =====
-- Fixes: missing reports table, missing storage buckets, missing RLS policies,
-- documents bucket changed to private

-- ===== 1. CREATE MISSING REPORTS TABLE =====
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reported_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "reports_read_own" ON public.reports FOR SELECT USING (auth.uid() = reporter_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "reports_read_admin" ON public.reports FOR SELECT USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE email = 'fullnessmindset@gmail.com')
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 2. CREATE MISSING STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES ('dm-media', 'dm-media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meta-receipts', 'meta-receipts', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meta-evidence', 'meta-evidence', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meta-final-proof', 'meta-final-proof', false) ON CONFLICT (id) DO NOTHING;

-- ===== 3. MAKE DOCUMENTS BUCKET PRIVATE =====
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- ===== 4. STORAGE POLICIES FOR NEW BUCKETS =====
DO $$
DECLARE
  bucket_name TEXT;
  policy_name TEXT;
BEGIN
  FOR bucket_name IN SELECT unnest(ARRAY['dm-media', 'videos', 'meta-receipts', 'meta-evidence', 'meta-final-proof'])
  LOOP
    BEGIN
      policy_name := bucket_name || '_insert';
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR INSERT WITH CHECK (bucket_id = %L AND auth.role() = ''authenticated'')',
        policy_name, bucket_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      policy_name := bucket_name || '_select';
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L AND auth.role() = ''authenticated'')',
        policy_name, bucket_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      policy_name := bucket_name || '_update';
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR UPDATE USING (bucket_id = %L AND auth.role() = ''authenticated'')',
        policy_name, bucket_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      policy_name := bucket_name || '_delete';
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR DELETE USING (bucket_id = %L AND auth.role() = ''authenticated'')',
        policy_name, bucket_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- Also update documents bucket policy to require auth for reading (private bucket)
DO $$ BEGIN
  CREATE POLICY "documents_select_auth" ON storage.objects FOR SELECT USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 5. RLS FOR METAS TABLE =====
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "metas_read" ON public.metas FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "metas_insert" ON public.metas FOR INSERT WITH CHECK (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "metas_update" ON public.metas FOR UPDATE USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "metas_delete" ON public.metas FOR DELETE USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 6. RLS FOR POSTS TABLE =====
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "posts_read" ON public.posts FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "posts_insert" ON public.posts FOR INSERT WITH CHECK (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "posts_update" ON public.posts FOR UPDATE USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "posts_delete" ON public.posts FOR DELETE USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 7. RLS FOR CREATOR_STORIES TABLE =====
ALTER TABLE public.creator_stories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "creator_stories_read" ON public.creator_stories FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "creator_stories_insert" ON public.creator_stories FOR INSERT WITH CHECK (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "creator_stories_update" ON public.creator_stories FOR UPDATE USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "creator_stories_delete" ON public.creator_stories FOR DELETE USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
