-- Fix Brand Deals RLS — Run in Supabase SQL Editor
-- Re-creates INSERT/UPDATE/DELETE policies if missing

ALTER TABLE public.brand_deals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "brand_deals_read" ON public.brand_deals FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "brand_deals_insert" ON public.brand_deals FOR INSERT WITH CHECK (auth.uid() = brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "brand_deals_update" ON public.brand_deals FOR UPDATE USING (auth.uid() = brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "brand_deals_delete" ON public.brand_deals FOR DELETE USING (auth.uid() = brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
