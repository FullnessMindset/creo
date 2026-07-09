-- Brand Deals V2: add video_vibe, payment_description, cover_url columns
-- Run in Supabase SQL Editor

ALTER TABLE public.brand_deals
  ADD COLUMN IF NOT EXISTS video_vibe TEXT,
  ADD COLUMN IF NOT EXISTS payment_description TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Lower minimum budget from $5 (500 cents) to $1 (100 cents)
ALTER TABLE public.brand_deals DROP CONSTRAINT IF EXISTS brand_deals_budget_per_creator_cents_check;
ALTER TABLE public.brand_deals ADD CONSTRAINT brand_deals_budget_per_creator_cents_check CHECK (budget_per_creator_cents >= 100);

-- Make terms_conditions and requirements optional for flexibility
ALTER TABLE public.brand_deals ALTER COLUMN terms_conditions DROP NOT NULL;
ALTER TABLE public.brand_deals ALTER COLUMN requirements DROP NOT NULL;

-- Deal categories (brand-created)
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

-- Storage bucket for brand deal cover images
-- Run this in Supabase Dashboard > Storage > New Bucket:
--   Name: brand-deals
--   Public: true
--   File size limit: 10MB
--   Allowed MIME types: image/*
