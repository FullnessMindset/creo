-- ============================================================
-- GLOBAL RLS RESET — Clean slate for all tables
-- Drops ALL existing policies, recreates correct ones
-- Run in Supabase SQL Editor
-- ============================================================

-- Helper: reusable admin check function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT auth.email() = 'fullnessmindset@gmail.com'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- UTILITY: Drop all policies on a table
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.drop_all_policies(tbl TEXT) RETURNS void AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, tbl);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- Also drop any realtime triggers on announcements
-- ============================================================
DO $$
DECLARE trg RECORD;
BEGIN
  FOR trg IN
    SELECT tgname FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'announcements' AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.announcements', trg.tgname);
  END LOOP;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.announcements;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;


-- ============================================================
-- 1. PROFILES
-- Public read, owner insert/update, admin can update any
-- ============================================================
SELECT pg_temp.drop_all_policies('profiles');

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR is_admin());


-- ============================================================
-- 2. METAS
-- Public read, owner CUD, admin can update any
-- ============================================================
SELECT pg_temp.drop_all_policies('metas');

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY metas_select ON public.metas
  FOR SELECT USING (true);

CREATE POLICY metas_insert ON public.metas
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY metas_update ON public.metas
  FOR UPDATE USING (auth.uid() = creator_id OR is_admin());

CREATE POLICY metas_delete ON public.metas
  FOR DELETE USING (auth.uid() = creator_id OR is_admin());


-- ============================================================
-- 3. META_CONTRIBUTIONS
-- Public read, service-role insert only (no client inserts)
-- ============================================================
SELECT pg_temp.drop_all_policies('meta_contributions');

ALTER TABLE public.meta_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_contributions_select ON public.meta_contributions
  FOR SELECT USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only


-- ============================================================
-- 4. POSTS
-- Public read, owner CUD, admin delete
-- ============================================================
SELECT pg_temp.drop_all_policies('posts');

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY posts_select ON public.posts
  FOR SELECT USING (true);

CREATE POLICY posts_insert ON public.posts
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY posts_update ON public.posts
  FOR UPDATE USING (auth.uid() = creator_id OR is_admin());

CREATE POLICY posts_delete ON public.posts
  FOR DELETE USING (auth.uid() = creator_id OR is_admin());


-- ============================================================
-- 5. POST_LIKES
-- Public read, owner insert/delete
-- ============================================================
SELECT pg_temp.drop_all_policies('post_likes');

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_likes_select ON public.post_likes
  FOR SELECT USING (true);

CREATE POLICY post_likes_insert ON public.post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY post_likes_delete ON public.post_likes
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 6. POST_COMMENTS
-- Public read, owner insert/update/delete
-- ============================================================
SELECT pg_temp.drop_all_policies('post_comments');

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_comments_select ON public.post_comments
  FOR SELECT USING (true);

CREATE POLICY post_comments_insert ON public.post_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY post_comments_update ON public.post_comments
  FOR UPDATE USING (auth.uid() = user_id OR is_admin());

CREATE POLICY post_comments_delete ON public.post_comments
  FOR DELETE USING (auth.uid() = user_id OR is_admin());


-- ============================================================
-- 7. COMMENT_LIKES
-- Public read, owner insert/delete
-- ============================================================
SELECT pg_temp.drop_all_policies('comment_likes');

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY comment_likes_select ON public.comment_likes
  FOR SELECT USING (true);

CREATE POLICY comment_likes_insert ON public.comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY comment_likes_delete ON public.comment_likes
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 8. NOTIFICATIONS
-- Own read/update/delete, authenticated insert for others
-- ============================================================
SELECT pg_temp.drop_all_policies('notifications');

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 9. FOLLOWS
-- Public read, owner insert/delete
-- ============================================================
SELECT pg_temp.drop_all_policies('follows');

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY follows_select ON public.follows
  FOR SELECT USING (true);

CREATE POLICY follows_insert ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY follows_delete ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);


-- ============================================================
-- 10. COMMUNITY_POSTS
-- Public read, owner CUD, admin delete
-- ============================================================
SELECT pg_temp.drop_all_policies('community_posts');

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_posts_select ON public.community_posts
  FOR SELECT USING (true);

CREATE POLICY community_posts_insert ON public.community_posts
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY community_posts_update ON public.community_posts
  FOR UPDATE USING (auth.uid() = author_id OR is_admin());

CREATE POLICY community_posts_delete ON public.community_posts
  FOR DELETE USING (auth.uid() = author_id OR is_admin());


-- ============================================================
-- 11. COMMUNITY_LIKES
-- Public read, owner insert/delete
-- ============================================================
SELECT pg_temp.drop_all_policies('community_likes');

ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_likes_select ON public.community_likes
  FOR SELECT USING (true);

CREATE POLICY community_likes_insert ON public.community_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY community_likes_delete ON public.community_likes
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 12. COMMUNITY_COMMENTS
-- Public read, owner CUD
-- ============================================================
SELECT pg_temp.drop_all_policies('community_comments');

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_comments_select ON public.community_comments
  FOR SELECT USING (true);

CREATE POLICY community_comments_insert ON public.community_comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY community_comments_update ON public.community_comments
  FOR UPDATE USING (auth.uid() = author_id OR is_admin());

CREATE POLICY community_comments_delete ON public.community_comments
  FOR DELETE USING (auth.uid() = author_id OR is_admin());


-- ============================================================
-- 13. COMMUNITY_SHARES
-- Public read, owner insert/delete
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='community_shares') THEN
    PERFORM pg_temp.drop_all_policies('community_shares');
    ALTER TABLE public.community_shares ENABLE ROW LEVEL SECURITY;
    CREATE POLICY community_shares_select ON public.community_shares FOR SELECT USING (true);
    CREATE POLICY community_shares_insert ON public.community_shares FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY community_shares_delete ON public.community_shares FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- 14. MESSAGES (DMs)
-- Participants read/update, sender insert/delete
-- ============================================================
SELECT pg_temp.drop_all_policies('messages');

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON public.messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY messages_insert ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY messages_update ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY messages_delete ON public.messages
  FOR DELETE USING (auth.uid() = sender_id);


-- ============================================================
-- 15. CONVERSATIONS
-- Participants read/insert/update
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='conversations') THEN
    PERFORM pg_temp.drop_all_policies('conversations');
    ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY conversations_select ON public.conversations
      FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);
    CREATE POLICY conversations_insert ON public.conversations
      FOR INSERT WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);
    CREATE POLICY conversations_update ON public.conversations
      FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);
  END IF;
END $$;


-- ============================================================
-- 16. BRAND_DEALS
-- Public read, owner CUD + admin CUD
-- ============================================================
SELECT pg_temp.drop_all_policies('brand_deals');

ALTER TABLE public.brand_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_deals_select ON public.brand_deals
  FOR SELECT USING (true);

CREATE POLICY brand_deals_insert ON public.brand_deals
  FOR INSERT WITH CHECK (auth.uid() = brand_id OR is_admin());

CREATE POLICY brand_deals_update ON public.brand_deals
  FOR UPDATE USING (auth.uid() = brand_id OR is_admin());

CREATE POLICY brand_deals_delete ON public.brand_deals
  FOR DELETE USING (auth.uid() = brand_id OR is_admin());


-- ============================================================
-- 17. BRAND_DEAL_REQUESTS
-- Participants read/insert/update
-- ============================================================
SELECT pg_temp.drop_all_policies('brand_deal_requests');

ALTER TABLE public.brand_deal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_deal_requests_select ON public.brand_deal_requests
  FOR SELECT USING (auth.uid() = brand_id OR auth.uid() = creator_id OR is_admin());

CREATE POLICY brand_deal_requests_insert ON public.brand_deal_requests
  FOR INSERT WITH CHECK (auth.uid() = brand_id OR auth.uid() = creator_id);

CREATE POLICY brand_deal_requests_update ON public.brand_deal_requests
  FOR UPDATE USING (auth.uid() = brand_id OR auth.uid() = creator_id OR is_admin());


-- ============================================================
-- 18. DEAL_CONVERSATIONS
-- Participants read/insert/update
-- ============================================================
SELECT pg_temp.drop_all_policies('deal_conversations');

ALTER TABLE public.deal_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_conversations_select ON public.deal_conversations
  FOR SELECT USING (auth.uid() = brand_id OR auth.uid() = creator_id);

CREATE POLICY deal_conversations_insert ON public.deal_conversations
  FOR INSERT WITH CHECK (auth.uid() = brand_id OR auth.uid() = creator_id);

CREATE POLICY deal_conversations_update ON public.deal_conversations
  FOR UPDATE USING (auth.uid() = brand_id OR auth.uid() = creator_id);


-- ============================================================
-- 19. DEAL_MESSAGES
-- Participant read/insert only (via conversation membership)
-- ============================================================
SELECT pg_temp.drop_all_policies('deal_messages');

ALTER TABLE public.deal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_messages_select ON public.deal_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.deal_conversations dc
      WHERE dc.id = deal_messages.conversation_id
        AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid())
    )
  );

CREATE POLICY deal_messages_insert ON public.deal_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.deal_conversations dc
      WHERE dc.id = conversation_id
        AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid())
    )
  );


-- ============================================================
-- 20. DEAL_CATEGORIES
-- Public read, auth insert
-- ============================================================
SELECT pg_temp.drop_all_policies('deal_categories');

ALTER TABLE public.deal_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_categories_select ON public.deal_categories
  FOR SELECT USING (true);

CREATE POLICY deal_categories_insert ON public.deal_categories
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ============================================================
-- 21. ANNOUNCEMENTS
-- Public read, admin CUD
-- ============================================================
SELECT pg_temp.drop_all_policies('announcements');

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY announcements_select ON public.announcements
  FOR SELECT USING (true);

CREATE POLICY announcements_insert ON public.announcements
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY announcements_update ON public.announcements
  FOR UPDATE USING (is_admin());

CREATE POLICY announcements_delete ON public.announcements
  FOR DELETE USING (is_admin());


-- ============================================================
-- 22. REPORTS
-- Reporter reads own + admin reads all, reporter insert, admin update/delete
-- ============================================================
SELECT pg_temp.drop_all_policies('reports');

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_select ON public.reports
  FOR SELECT USING (auth.uid() = reporter_id OR is_admin());

CREATE POLICY reports_insert ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY reports_update ON public.reports
  FOR UPDATE USING (is_admin());

CREATE POLICY reports_delete ON public.reports
  FOR DELETE USING (is_admin());


-- ============================================================
-- 23. REPORT_MESSAGES
-- Admin only
-- ============================================================
SELECT pg_temp.drop_all_policies('report_messages');

ALTER TABLE public.report_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_messages_all ON public.report_messages
  FOR ALL USING (is_admin());


-- ============================================================
-- 24. USER_SANCTIONS
-- Admin full, user reads own
-- ============================================================
SELECT pg_temp.drop_all_policies('user_sanctions');

ALTER TABLE public.user_sanctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_sanctions_admin ON public.user_sanctions
  FOR ALL USING (is_admin());

CREATE POLICY user_sanctions_own_read ON public.user_sanctions
  FOR SELECT USING (auth.uid() = user_id);


-- ============================================================
-- 25. TIPS
-- Creator reads own, service-role insert/update only
-- ============================================================
SELECT pg_temp.drop_all_policies('tips');

ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY tips_select ON public.tips
  FOR SELECT USING (auth.uid() = creator_id OR is_admin());

-- No INSERT/UPDATE/DELETE = service role only


-- ============================================================
-- 26. SUBSCRIPTIONS
-- Creator reads own, service-role insert/update only
-- ============================================================
SELECT pg_temp.drop_all_policies('subscriptions');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON public.subscriptions
  FOR SELECT USING (auth.uid() = creator_id OR is_admin());

-- No INSERT/UPDATE/DELETE = service role only


-- ============================================================
-- 27. VERIFICATION_DOCUMENTS
-- Owner read/insert, admin full (NOT public!)
-- ============================================================
SELECT pg_temp.drop_all_policies('verification_documents');

ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;

-- Detect column name (creator_id vs user_id)
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

CREATE POLICY verification_documents_admin ON public.verification_documents
  FOR ALL USING (is_admin());


-- ============================================================
-- 28. VERIFICATION_EVENTS
-- Own read, service insert only
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='verification_events') THEN
    PERFORM pg_temp.drop_all_policies('verification_events');
    ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY verification_events_select ON public.verification_events
      FOR SELECT USING (auth.uid() = user_id OR is_admin());
  END IF;
END $$;


-- ============================================================
-- 29. ADMIN_EMAILS
-- Service role only (fully locked)
-- ============================================================
SELECT pg_temp.drop_all_policies('admin_emails');

ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- No policies = service role only


-- ============================================================
-- 30. PAYOUT_LOG
-- Service role only (fully locked)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payout_log') THEN
    PERFORM pg_temp.drop_all_policies('payout_log');
    ALTER TABLE public.payout_log ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;


-- ============================================================
-- 31. CREATOR_STORIES
-- Public read, owner CUD
-- ============================================================
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


-- ============================================================
-- 32. STORY_LIKES
-- Public read, owner insert/delete
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='story_likes') THEN
    PERFORM pg_temp.drop_all_policies('story_likes');
    ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY story_likes_select ON public.story_likes FOR SELECT USING (true);
    CREATE POLICY story_likes_insert ON public.story_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY story_likes_delete ON public.story_likes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- 33. STORY_COMMENTS
-- Public read, owner insert/update/delete
-- ============================================================
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


-- ============================================================
-- 34. META_LIKES
-- Public read, owner insert/delete
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='meta_likes') THEN
    PERFORM pg_temp.drop_all_policies('meta_likes');
    ALTER TABLE public.meta_likes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY meta_likes_select ON public.meta_likes FOR SELECT USING (true);
    CREATE POLICY meta_likes_insert ON public.meta_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY meta_likes_delete ON public.meta_likes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- 35. META_COMMENTS
-- Public read, owner insert/update/delete
-- ============================================================
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


-- ============================================================
-- 36. META_INVITES
-- Participants read, inviter insert, invitee update
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='meta_invites') THEN
    PERFORM pg_temp.drop_all_policies('meta_invites');
    ALTER TABLE public.meta_invites ENABLE ROW LEVEL SECURITY;
    CREATE POLICY meta_invites_select ON public.meta_invites
      FOR SELECT USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);
    CREATE POLICY meta_invites_insert ON public.meta_invites
      FOR INSERT WITH CHECK (auth.uid() = inviter_id);
    CREATE POLICY meta_invites_update ON public.meta_invites
      FOR UPDATE USING (auth.uid() = invitee_id);
  END IF;
END $$;


-- ============================================================
-- 37. META_COLLABORATORS
-- Public read, auth insert/delete
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='meta_collaborators') THEN
    PERFORM pg_temp.drop_all_policies('meta_collaborators');
    ALTER TABLE public.meta_collaborators ENABLE ROW LEVEL SECURITY;
    CREATE POLICY meta_collaborators_select ON public.meta_collaborators FOR SELECT USING (true);
    CREATE POLICY meta_collaborators_insert ON public.meta_collaborators FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY meta_collaborators_delete ON public.meta_collaborators FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- 38. BUSINESS_LINKS
-- Public read, owner CUD
-- ============================================================
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


-- ============================================================
-- 39. TERMS_ACCEPTANCE
-- Own read/insert
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='terms_acceptance') THEN
    PERFORM pg_temp.drop_all_policies('terms_acceptance');
    ALTER TABLE public.terms_acceptance ENABLE ROW LEVEL SECURITY;
    CREATE POLICY terms_acceptance_select ON public.terms_acceptance
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY terms_acceptance_insert ON public.terms_acceptance
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- 40. ADMIN_NOTIFICATIONS
-- Admin read/update, service insert
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_notifications') THEN
    PERFORM pg_temp.drop_all_policies('admin_notifications');
    ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY admin_notifications_select ON public.admin_notifications
      FOR SELECT USING (is_admin());
    CREATE POLICY admin_notifications_update ON public.admin_notifications
      FOR UPDATE USING (is_admin());
  END IF;
END $$;


-- ============================================================
-- 41. ENGAGEMENTS
-- Public read, auth insert
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='engagements') THEN
    PERFORM pg_temp.drop_all_policies('engagements');
    ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
    CREATE POLICY engagements_select ON public.engagements FOR SELECT USING (true);
    CREATE POLICY engagements_insert ON public.engagements
      FOR INSERT WITH CHECK (auth.uid() = actor_id);
  END IF;
END $$;


-- ============================================================
-- 42. ALGORITHM_CONFIG
-- Public read only
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='algorithm_config') THEN
    PERFORM pg_temp.drop_all_policies('algorithm_config');
    ALTER TABLE public.algorithm_config ENABLE ROW LEVEL SECURITY;
    CREATE POLICY algorithm_config_select ON public.algorithm_config FOR SELECT USING (true);
    CREATE POLICY algorithm_config_admin ON public.algorithm_config
      FOR ALL USING (is_admin());
  END IF;
END $$;


-- ============================================================
-- 43. POST_IMPRESSIONS
-- Public read, owner insert
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_impressions') THEN
    PERFORM pg_temp.drop_all_policies('post_impressions');
    ALTER TABLE public.post_impressions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY post_impressions_select ON public.post_impressions FOR SELECT USING (true);
    CREATE POLICY post_impressions_insert ON public.post_impressions
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- 44. POST_SHARES
-- Public read, owner insert
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_shares') THEN
    PERFORM pg_temp.drop_all_policies('post_shares');
    ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;
    CREATE POLICY post_shares_select ON public.post_shares FOR SELECT USING (true);
    CREATE POLICY post_shares_insert ON public.post_shares
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- 45. FEED_SCORES
-- Public read, service write
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='feed_scores') THEN
    PERFORM pg_temp.drop_all_policies('feed_scores');
    ALTER TABLE public.feed_scores ENABLE ROW LEVEL SECURITY;
    CREATE POLICY feed_scores_select ON public.feed_scores FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================
-- 46. CREATOR_FAIRNESS_LOG
-- Service role only (was wide open — FIXED)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='creator_fairness_log') THEN
    PERFORM pg_temp.drop_all_policies('creator_fairness_log');
    ALTER TABLE public.creator_fairness_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY creator_fairness_log_admin ON public.creator_fairness_log
      FOR SELECT USING (is_admin());
  END IF;
END $$;


-- ============================================================
-- 47. MANIPULATION_SIGNALS
-- Admin read, service insert
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='manipulation_signals') THEN
    PERFORM pg_temp.drop_all_policies('manipulation_signals');
    ALTER TABLE public.manipulation_signals ENABLE ROW LEVEL SECURITY;
    CREATE POLICY manipulation_signals_select ON public.manipulation_signals
      FOR SELECT USING (is_admin());
  END IF;
END $$;


-- ============================================================
-- 48. MODERATION_FLAGS
-- Admin read/update, service insert
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='moderation_flags') THEN
    PERFORM pg_temp.drop_all_policies('moderation_flags');
    ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY moderation_flags_admin ON public.moderation_flags
      FOR ALL USING (is_admin());
  END IF;
END $$;


-- ============================================================
-- 49. SYSTEM_METRICS
-- Admin read, service insert
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='system_metrics') THEN
    PERFORM pg_temp.drop_all_policies('system_metrics');
    ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;
    CREATE POLICY system_metrics_select ON public.system_metrics
      FOR SELECT USING (is_admin());
  END IF;
END $$;


-- ============================================================
-- 50. PROCESSED_WEBHOOK_EVENTS
-- Service role only
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='processed_webhook_events') THEN
    PERFORM pg_temp.drop_all_policies('processed_webhook_events');
    ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;


-- ============================================================
-- 51. RATE_LIMITS
-- Service role only
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rate_limits') THEN
    PERFORM pg_temp.drop_all_policies('rate_limits');
    ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;


-- ============================================================
-- 52. APP_SECRETS
-- Service role only (no policies = locked)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='app_secrets') THEN
    PERFORM pg_temp.drop_all_policies('app_secrets');
    ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;


-- ============================================================
-- 53. MECENAS_SETTINGS
-- Public read, owner insert/update
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mecenas_settings') THEN
    PERFORM pg_temp.drop_all_policies('mecenas_settings');
    ALTER TABLE public.mecenas_settings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY mecenas_settings_select ON public.mecenas_settings FOR SELECT USING (true);
    CREATE POLICY mecenas_settings_insert ON public.mecenas_settings
      FOR INSERT WITH CHECK (auth.uid() = creator_id);
    CREATE POLICY mecenas_settings_update ON public.mecenas_settings
      FOR UPDATE USING (auth.uid() = creator_id);
  END IF;
END $$;


-- ============================================================
-- 54. ONBOARDING_PROGRESS / ONBOARDING_DISMISSALS
-- Own read/insert/update
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='onboarding_progress') THEN
    PERFORM pg_temp.drop_all_policies('onboarding_progress');
    ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
    CREATE POLICY onboarding_progress_select ON public.onboarding_progress
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY onboarding_progress_insert ON public.onboarding_progress
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY onboarding_progress_update ON public.onboarding_progress
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='onboarding_dismissals') THEN
    PERFORM pg_temp.drop_all_policies('onboarding_dismissals');
    ALTER TABLE public.onboarding_dismissals ENABLE ROW LEVEL SECURITY;
    CREATE POLICY onboarding_dismissals_select ON public.onboarding_dismissals
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY onboarding_dismissals_insert ON public.onboarding_dismissals
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- 55. FEATURE_FLAGS
-- Public read, admin write
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='feature_flags') THEN
    PERFORM pg_temp.drop_all_policies('feature_flags');
    ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY feature_flags_select ON public.feature_flags FOR SELECT USING (true);
    CREATE POLICY feature_flags_admin ON public.feature_flags
      FOR ALL USING (is_admin());
  END IF;
END $$;


-- ============================================================
-- CLEANUP: Drop the temp helper function
-- ============================================================
DROP FUNCTION IF EXISTS pg_temp.drop_all_policies(TEXT);


-- ============================================================
-- VERIFY: List all policies after reset
-- ============================================================
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
