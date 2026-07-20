-- ============================================================
-- GLOBAL RLS RESET — PART 2 of 4
-- Tables 21-38: Admin, financial, verification, social tables
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

-- 21. ANNOUNCEMENTS
SELECT pg_temp.drop_all_policies('announcements');
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcements_select ON public.announcements FOR SELECT USING (true);
CREATE POLICY announcements_insert ON public.announcements FOR INSERT WITH CHECK (is_admin());
CREATE POLICY announcements_update ON public.announcements FOR UPDATE USING (is_admin());
CREATE POLICY announcements_delete ON public.announcements FOR DELETE USING (is_admin());

-- 22. REPORTS
SELECT pg_temp.drop_all_policies('reports');
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_select ON public.reports FOR SELECT USING (auth.uid() = reporter_id OR is_admin());
CREATE POLICY reports_insert ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY reports_update ON public.reports FOR UPDATE USING (is_admin());
CREATE POLICY reports_delete ON public.reports FOR DELETE USING (is_admin());

-- 23. REPORT_MESSAGES (conditional — table may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='report_messages') THEN
    PERFORM pg_temp.drop_all_policies('report_messages');
    ALTER TABLE public.report_messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY report_messages_all ON public.report_messages FOR ALL USING (is_admin());
  END IF;
END $$;

-- 24. USER_SANCTIONS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_sanctions') THEN
    PERFORM pg_temp.drop_all_policies('user_sanctions');
    ALTER TABLE public.user_sanctions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY user_sanctions_admin ON public.user_sanctions FOR ALL USING (is_admin());
    CREATE POLICY user_sanctions_own_read ON public.user_sanctions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- 25. TIPS
SELECT pg_temp.drop_all_policies('tips');
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;
CREATE POLICY tips_select ON public.tips FOR SELECT USING (auth.uid() = creator_id OR is_admin());

-- 26. SUBSCRIPTIONS
SELECT pg_temp.drop_all_policies('subscriptions');
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT USING (auth.uid() = creator_id OR is_admin());

-- 27. VERIFICATION_DOCUMENTS
SELECT pg_temp.drop_all_policies('verification_documents');
ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='verification_documents' AND column_name='user_id'
  ) THEN
    CREATE POLICY verification_documents_select ON public.verification_documents
      FOR SELECT USING (auth.uid() = user_id OR is_admin());
    CREATE POLICY verification_documents_insert ON public.verification_documents
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='verification_documents' AND column_name='creator_id'
  ) THEN
    CREATE POLICY verification_documents_select ON public.verification_documents
      FOR SELECT USING (auth.uid() = creator_id OR is_admin());
    CREATE POLICY verification_documents_insert ON public.verification_documents
      FOR INSERT WITH CHECK (auth.uid() = creator_id);
  END IF;
END $$;
CREATE POLICY verification_documents_admin ON public.verification_documents FOR ALL USING (is_admin());

-- 28. VERIFICATION_EVENTS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='verification_events') THEN
    PERFORM pg_temp.drop_all_policies('verification_events');
    ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY verification_events_select ON public.verification_events
      FOR SELECT USING (auth.uid() = user_id OR is_admin());
  END IF;
END $$;

-- 29. ADMIN_EMAILS
SELECT pg_temp.drop_all_policies('admin_emails');
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- 30. PAYOUT_LOG (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payout_log') THEN
    PERFORM pg_temp.drop_all_policies('payout_log');
    ALTER TABLE public.payout_log ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 31. CREATOR_STORIES (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='creator_stories') THEN
    PERFORM pg_temp.drop_all_policies('creator_stories');
    ALTER TABLE public.creator_stories ENABLE ROW LEVEL SECURITY;
    CREATE POLICY creator_stories_select ON public.creator_stories FOR SELECT USING (true);
    CREATE POLICY creator_stories_insert ON public.creator_stories FOR INSERT WITH CHECK (auth.uid() = creator_id);
    CREATE POLICY creator_stories_update ON public.creator_stories FOR UPDATE USING (auth.uid() = creator_id);
    CREATE POLICY creator_stories_delete ON public.creator_stories FOR DELETE USING (auth.uid() = creator_id OR is_admin());
  END IF;
END $$;

-- 32. STORY_LIKES (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='story_likes') THEN
    PERFORM pg_temp.drop_all_policies('story_likes');
    ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY story_likes_select ON public.story_likes FOR SELECT USING (true);
    CREATE POLICY story_likes_insert ON public.story_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY story_likes_delete ON public.story_likes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 33. STORY_COMMENTS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='story_comments') THEN
    PERFORM pg_temp.drop_all_policies('story_comments');
    ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY story_comments_select ON public.story_comments FOR SELECT USING (true);
    CREATE POLICY story_comments_insert ON public.story_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY story_comments_update ON public.story_comments FOR UPDATE USING (auth.uid() = user_id OR is_admin());
    CREATE POLICY story_comments_delete ON public.story_comments FOR DELETE USING (auth.uid() = user_id OR is_admin());
  END IF;
END $$;

-- 34. META_LIKES (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='meta_likes') THEN
    PERFORM pg_temp.drop_all_policies('meta_likes');
    ALTER TABLE public.meta_likes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY meta_likes_select ON public.meta_likes FOR SELECT USING (true);
    CREATE POLICY meta_likes_insert ON public.meta_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY meta_likes_delete ON public.meta_likes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 35. META_COMMENTS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='meta_comments') THEN
    PERFORM pg_temp.drop_all_policies('meta_comments');
    ALTER TABLE public.meta_comments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY meta_comments_select ON public.meta_comments FOR SELECT USING (true);
    CREATE POLICY meta_comments_insert ON public.meta_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY meta_comments_update ON public.meta_comments FOR UPDATE USING (auth.uid() = user_id OR is_admin());
    CREATE POLICY meta_comments_delete ON public.meta_comments FOR DELETE USING (auth.uid() = user_id OR is_admin());
  END IF;
END $$;

-- 36. META_INVITES (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='meta_invites') THEN
    PERFORM pg_temp.drop_all_policies('meta_invites');
    ALTER TABLE public.meta_invites ENABLE ROW LEVEL SECURITY;
    CREATE POLICY meta_invites_select ON public.meta_invites FOR SELECT USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);
    CREATE POLICY meta_invites_insert ON public.meta_invites FOR INSERT WITH CHECK (auth.uid() = inviter_id);
    CREATE POLICY meta_invites_update ON public.meta_invites FOR UPDATE USING (auth.uid() = invitee_id);
  END IF;
END $$;

-- 37. META_COLLABORATORS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='meta_collaborators') THEN
    PERFORM pg_temp.drop_all_policies('meta_collaborators');
    ALTER TABLE public.meta_collaborators ENABLE ROW LEVEL SECURITY;
    CREATE POLICY meta_collaborators_select ON public.meta_collaborators FOR SELECT USING (true);
    CREATE POLICY meta_collaborators_insert ON public.meta_collaborators FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY meta_collaborators_delete ON public.meta_collaborators FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 38. BUSINESS_LINKS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='business_links') THEN
    PERFORM pg_temp.drop_all_policies('business_links');
    ALTER TABLE public.business_links ENABLE ROW LEVEL SECURITY;
    CREATE POLICY business_links_select ON public.business_links FOR SELECT USING (true);
    CREATE POLICY business_links_insert ON public.business_links FOR INSERT WITH CHECK (auth.uid() = creator_id);
    CREATE POLICY business_links_update ON public.business_links FOR UPDATE USING (auth.uid() = creator_id);
    CREATE POLICY business_links_delete ON public.business_links FOR DELETE USING (auth.uid() = creator_id);
  END IF;
END $$;
