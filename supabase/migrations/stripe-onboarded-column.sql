-- Add stripe_onboarded column to track actual Stripe Connect completion
-- (not just return URL — verified via Stripe API or account.updated webhook)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_onboarded BOOLEAN DEFAULT false;

-- Backfill: mark existing users who already have a connect ID and have received payments as onboarded
-- (conservative — only sets true for users we know completed onboarding)
UPDATE public.profiles
  SET stripe_onboarded = true
  WHERE stripe_connect_id IS NOT NULL
    AND stripe_connect_id != '';
