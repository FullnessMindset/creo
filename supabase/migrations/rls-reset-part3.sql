-- ============================================================
-- GLOBAL RLS RESET — PART 3 of 4
-- Tables 39-55: System tables, algorithm, moderation, settings
-- Paste this in Supabase SQL Editor and click RUN
-- ============================================================

-- Re-create temp helper (needed per session)
CREATE OR REPLACE FUNCTION pg_temp.drop_all_policies(tbl TEXT) RETURNS void AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, tbl);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- 39. TERMS_ACCEPTANCE (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='terms_acceptance') THEN
    PERFORM pg_temp.drop_all_policies('terms_acceptance');
    ALTER TABLE public.terms_acceptance ENABLE ROW LEVEL SECURITY;
    CREATE POLICY terms_acceptance_select ON public.terms_acceptance FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY terms_acceptance_insert ON public.terms_acceptance FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 40. ADMIN_NOTIFICATIONS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_notifications') THEN
    PERFORM pg_temp.drop_all_policies('admin_notifications');
    ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY admin_notifications_select ON public.admin_notifications FOR SELECT USING (is_admin());
    CREATE POLICY admin_notifications_update ON public.admin_notifications FOR UPDATE USING (is_admin());
  END IF;
END $$;

-- 41. ENGAGEMENTS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='engagements') THEN
    PERFORM pg_temp.drop_all_policies('engagements');
    ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
    CREATE POLICY engagements_select ON public.engagements FOR SELECT USING (true);
    CREATE POLICY engagements_insert ON public.engagements FOR INSERT WITH CHECK (auth.uid() = actor_id);
  END IF;
END $$;

-- 42. ALGORITHM_CONFIG (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='algorithm_config') THEN
    PERFORM pg_temp.drop_all_policies('algorithm_config');
    ALTER TABLE public.algorithm_config ENABLE ROW LEVEL SECURITY;
    CREATE POLICY algorithm_config_select ON public.algorithm_config FOR SELECT USING (true);
    CREATE POLICY algorithm_config_admin ON public.algorithm_config FOR ALL USING (is_admin());
  END IF;
END $$;

-- 43. POST_IMPRESSIONS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_impressions') THEN
    PERFORM pg_temp.drop_all_policies('post_impressions');
    ALTER TABLE public.post_impressions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY post_impressions_select ON public.post_impressions FOR SELECT USING (true);
    CREATE POLICY post_impressions_insert ON public.post_impressions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 44. POST_SHARES (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_shares') THEN
    PERFORM pg_temp.drop_all_policies('post_shares');
    ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;
    CREATE POLICY post_shares_select ON public.post_shares FOR SELECT USING (true);
    CREATE POLICY post_shares_insert ON public.post_shares FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 45. FEED_SCORES (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='feed_scores') THEN
    PERFORM pg_temp.drop_all_policies('feed_scores');
    ALTER TABLE public.feed_scores ENABLE ROW LEVEL SECURITY;
    CREATE POLICY feed_scores_select ON public.feed_scores FOR SELECT USING (true);
  END IF;
END $$;

-- 46. CREATOR_FAIRNESS_LOG (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='creator_fairness_log') THEN
    PERFORM pg_temp.drop_all_policies('creator_fairness_log');
    ALTER TABLE public.creator_fairness_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY creator_fairness_log_admin ON public.creator_fairness_log FOR SELECT USING (is_admin());
  END IF;
END $$;

-- 47. MANIPULATION_SIGNALS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='manipulation_signals') THEN
    PERFORM pg_temp.drop_all_policies('manipulation_signals');
    ALTER TABLE public.manipulation_signals ENABLE ROW LEVEL SECURITY;
    CREATE POLICY manipulation_signals_select ON public.manipulation_signals FOR SELECT USING (is_admin());
  END IF;
END $$;

-- 48. MODERATION_FLAGS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='moderation_flags') THEN
    PERFORM pg_temp.drop_all_policies('moderation_flags');
    ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY moderation_flags_admin ON public.moderation_flags FOR ALL USING (is_admin());
  END IF;
END $$;

-- 49. SYSTEM_METRICS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='system_metrics') THEN
    PERFORM pg_temp.drop_all_policies('system_metrics');
    ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;
    CREATE POLICY system_metrics_select ON public.system_metrics FOR SELECT USING (is_admin());
  END IF;
END $$;
