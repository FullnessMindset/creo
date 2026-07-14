-- ============================================================
-- CREO Platform — App Store Readiness Migration
-- Account deletion support + data export permissions
-- Safe to run multiple times (IF NOT EXISTS / idempotent)
-- ============================================================

-- ===== ACCOUNT DELETION COLUMNS =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_scheduled
  ON public.profiles (deletion_scheduled_for)
  WHERE deletion_scheduled_for IS NOT NULL;

-- ===== RLS POLICY: allow users to read their own full data for export =====
-- (Most tables already have SELECT policies; these cover any gaps)

DO $$
BEGIN
  -- Tips: user can read tips they sent or received
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_tips') THEN
    CREATE POLICY users_read_own_tips ON public.tips FOR SELECT
      USING (auth.uid() = creator_id OR auth.uid() = tipper_id);
  END IF;

  -- Subscriptions: user can read their own
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_subscriptions') THEN
    CREATE POLICY users_read_own_subscriptions ON public.subscriptions FOR SELECT
      USING (auth.uid() = creator_id OR auth.uid() = subscriber_id);
  END IF;
END $$;

-- ===== ANALYZE updated tables =====
ANALYZE public.profiles;
