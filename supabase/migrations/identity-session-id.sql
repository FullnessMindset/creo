-- Identity Session ID — Run in Supabase SQL Editor
-- Stores the Stripe Identity verification session ID for tracking

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS identity_session_id TEXT;
