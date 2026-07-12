-- ============================================================
-- CREO Platform — Comprehensive Fix Migration (July 2026)
-- Run this ONCE in Supabase SQL Editor to fix all known issues
-- ============================================================

-- ===== 1. BRAND DEALS: Add missing columns =====
ALTER TABLE public.brand_deals
  ADD COLUMN IF NOT EXISTS video_vibe TEXT,
  ADD COLUMN IF NOT EXISTS payment_description TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_deadline DATE;

ALTER TABLE public.brand_deals DROP CONSTRAINT IF EXISTS brand_deals_budget_per_creator_cents_check;
ALTER TABLE public.brand_deals ADD CONSTRAINT brand_deals_budget_per_creator_cents_check CHECK (budget_per_creator_cents >= 100);

ALTER TABLE public.brand_deals ALTER COLUMN terms_conditions DROP NOT NULL;
ALTER TABLE public.brand_deals ALTER COLUMN requirements DROP NOT NULL;

-- ===== 2. BRAND DEALS: Fix RLS — allow any authenticated user to post =====
ALTER TABLE public.brand_deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brand_deals_read" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_insert" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_update" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_delete" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow authenticated users to insert brand_deals" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow users to update their own brand_deals" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow users to delete their own brand_deals" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow public read access to brand_deals" ON public.brand_deals;

CREATE POLICY "brand_deals_read" ON public.brand_deals FOR SELECT USING (true);
CREATE POLICY "brand_deals_insert" ON public.brand_deals FOR INSERT WITH CHECK (auth.uid() = brand_id);
CREATE POLICY "brand_deals_update" ON public.brand_deals FOR UPDATE USING (
  auth.uid() = brand_id OR auth.email() = 'fullnessmindset@gmail.com'
);
CREATE POLICY "brand_deals_delete" ON public.brand_deals FOR DELETE USING (
  auth.uid() = brand_id OR auth.email() = 'fullnessmindset@gmail.com'
);

-- ===== 3. DEAL CATEGORIES =====
CREATE TABLE IF NOT EXISTS public.deal_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.deal_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "deal_categories_read" ON public.deal_categories FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "deal_categories_insert" ON public.deal_categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 4. REPORTS TABLE: Fix column name =====
-- The table uses reported_id but code was inserting reported_user_id
-- Add reported_user_id as alias column if it doesn't exist, or rename
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='reported_user_id') THEN
    ALTER TABLE public.reports ADD COLUMN reported_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill: copy reported_id values into reported_user_id where missing
UPDATE public.reports SET reported_user_id = reported_id WHERE reported_user_id IS NULL AND reported_id IS NOT NULL;

-- Fix reports RLS so admin can read/update all reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_read_admin" ON public.reports;
DROP POLICY IF EXISTS "reports_read_own" ON public.reports;
DROP POLICY IF EXISTS "reports_read" ON public.reports;
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
DROP POLICY IF EXISTS "reports_update_admin" ON public.reports;

CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_read" ON public.reports FOR SELECT USING (
  auth.uid() = reporter_id
  OR auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);
CREATE POLICY "reports_update" ON public.reports FOR UPDATE USING (
  auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);

-- ===== 5. ANNOUNCEMENTS TABLE =====
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
  auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);
CREATE POLICY "announcements_update" ON public.announcements FOR UPDATE USING (
  auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);
CREATE POLICY "announcements_delete" ON public.announcements FOR DELETE USING (
  auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);

-- ===== 6. STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-deals', 'brand-deals', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('dm-media', 'dm-media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for brand-deals bucket
DO $$
BEGIN
  BEGIN CREATE POLICY "brand_deals_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'brand-deals');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "brand_deals_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'brand-deals' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "brand_deals_storage_update" ON storage.objects FOR UPDATE USING (bucket_id = 'brand-deals' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- dm-media public read
DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS "dm-media_select" ON storage.objects; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN CREATE POLICY "dm-media_select_public" ON storage.objects FOR SELECT USING (bucket_id = 'dm-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
UPDATE storage.buckets SET public = true WHERE id = 'dm-media';

-- ===== 7. NOTIFICATIONS: ensure category/priority columns exist =====
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS icon TEXT;

-- ===== DONE =====
