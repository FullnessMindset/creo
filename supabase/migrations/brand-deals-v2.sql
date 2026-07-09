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
