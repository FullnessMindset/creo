-- ============================================================
-- CREO Platform — Stability Audit Migration
-- Fixes missing columns, broken FKs, dead policies/indexes,
-- and schema inconsistencies found during full audit.
-- Safe to run multiple times (idempotent).
-- ============================================================


-- ===== 1. MISSING BRANDING COLUMN (ROOT CAUSE) =====
-- The entire branding system saves to profiles.profile_colors
-- but this column was never created in any migration.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_colors JSONB DEFAULT '{}';


-- ===== 2. MISSING FOREIGN KEYS =====

-- report_messages.report_id has no FK — orphaned rows on report delete
DO $$ BEGIN
  ALTER TABLE public.report_messages
    ADD CONSTRAINT fk_report_messages_report
    FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_table THEN NULL;
END $$;

-- user_sanctions.report_id has no FK
DO $$ BEGIN
  ALTER TABLE public.user_sanctions
    ADD CONSTRAINT fk_user_sanctions_report
    FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_table THEN NULL;
END $$;

-- reports.resolved_by has no FK
DO $$ BEGIN
  ALTER TABLE public.reports
    ADD CONSTRAINT fk_reports_resolved_by
    FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_table THEN NULL;
END $$;

-- story_likes.story_id has no FK
DO $$ BEGIN
  ALTER TABLE public.story_likes
    ADD CONSTRAINT fk_story_likes_story
    FOREIGN KEY (story_id) REFERENCES public.creator_stories(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_table THEN NULL;
END $$;

-- story_comments.story_id has no FK
DO $$ BEGIN
  ALTER TABLE public.story_comments
    ADD CONSTRAINT fk_story_comments_story
    FOREIGN KEY (story_id) REFERENCES public.creator_stories(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_table THEN NULL;
END $$;


-- ===== 3. FIX NOTIFICATIONS INSERT POLICY =====
-- Current policy blocks self-notifications (auth.uid() != user_id),
-- which breaks onboarding functions that insert notifications for
-- the calling user. Fix: allow authenticated users to insert for anyone.
DO $$ BEGIN
  DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY notifications_insert_any ON public.notifications
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ===== 4. FIX BROKEN VIEW =====
-- profiles_public references nonexistent creo_id_verified column.
-- Replace with correct column name: identity_verified.
DROP VIEW IF EXISTS public.profiles_public;
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  id, username, display_name, bio, avatar_url, cover_url,
  social_links, follower_count, following_count,
  COALESCE(identity_verified, false) AS identity_verified,
  COALESCE(stripe_onboarded, false) AS stripe_onboarded,
  created_at
FROM public.profiles;


-- ===== 5. FIX update_deal_payment_status FUNCTION =====
-- References nonexistent deal_payments table. Fix to use deal_messages.
CREATE OR REPLACE FUNCTION public.update_deal_payment_status(
  p_payment_id UUID,
  p_status TEXT
) RETURNS void AS $$
  UPDATE public.deal_messages
  SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{payment_status}', to_jsonb(p_status))
  WHERE id = p_payment_id;
$$ LANGUAGE sql SECURITY DEFINER;


-- ===== 6. ADD MISSING INDEXES FOR BRANDING =====
CREATE INDEX IF NOT EXISTS idx_profiles_profile_colors
  ON public.profiles USING GIN (profile_colors);

CREATE INDEX IF NOT EXISTS idx_profiles_mecenas_settings
  ON public.profiles USING GIN (mecenas_settings);


-- ===== 7. CLEAN UP CONTRADICTORY DEAL_MESSAGES POLICIES =====
-- Remove dead USING(false) policies that are overridden by USING(true)
DO $$ BEGIN
  DROP POLICY IF EXISTS deal_msgs_no_direct_select ON public.deal_messages;
  DROP POLICY IF EXISTS deal_msgs_no_direct_insert ON public.deal_messages;
  DROP POLICY IF EXISTS deal_msgs_no_direct_update ON public.deal_messages;
EXCEPTION WHEN undefined_object THEN NULL;
          WHEN undefined_table THEN NULL;
END $$;


-- ===== 8. ADD admin_notifications MISSING COLUMNS =====
-- Two migrations created this table with incompatible schemas.
-- Add all columns from both schemas so nothing breaks.
DO $$ BEGIN
  ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS event_type TEXT;
  ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS user_id UUID;
  ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS details JSONB;
  ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS type TEXT;
  ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS title TEXT;
  ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS data JSONB;
  ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ===== 9. ADD subscriber_id TO SUBSCRIPTIONS =====
-- Policy references this column but it may not exist
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS subscriber_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;


-- ===== 10. ENSURE processed_webhook_events HAS UNIQUE CONSTRAINT =====
-- Prevents duplicate webhook processing race condition
DO $$ BEGIN
  ALTER TABLE public.processed_webhook_events
    ADD CONSTRAINT uq_processed_webhook_event_id UNIQUE (stripe_event_id);
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_table THEN NULL;
          WHEN undefined_column THEN NULL;
END $$;


-- ===== ANALYZE AFFECTED TABLES =====
ANALYZE public.profiles;
ANALYZE public.notifications;
