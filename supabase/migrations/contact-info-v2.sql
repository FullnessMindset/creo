-- Contact Info V2: add website, city, country to profiles
-- Run in Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_website TEXT,
  ADD COLUMN IF NOT EXISTS contact_city TEXT,
  ADD COLUMN IF NOT EXISTS contact_country TEXT;
