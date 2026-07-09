-- Contact Info V2: add website, city, country, terms acceptance to profiles
-- Run in Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_website TEXT,
  ADD COLUMN IF NOT EXISTS contact_city TEXT,
  ADD COLUMN IF NOT EXISTS contact_country TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
