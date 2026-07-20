-- ============================================================
-- GLOBAL RLS RESET — PART 1 of 4
-- Tables 1-20: Core tables (profiles through deal_categories)
-- Paste this in Supabase SQL Editor and click RUN
-- ============================================================

-- Helper: reusable admin check function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT auth.email() = 'fullnessmindset@gmail.com'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Utility: Drop all policies on a table
CREATE OR REPLACE FUNCTION pg_temp.drop_all_policies(tbl TEXT) RETURNS void AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, tbl);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- Drop realtime triggers on announcements
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

-- 1. PROFILES
SELECT pg_temp.drop_all_policies('profiles');
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid() = id OR is_admin());

-- 2. METAS
SELECT pg_temp.drop_all_policies('metas');
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY metas_select ON public.metas FOR SELECT USING (true);
CREATE POLICY metas_insert ON public.metas FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY metas_update ON public.metas FOR UPDATE USING (auth.uid() = creator_id OR is_admin());
CREATE POLICY metas_delete ON public.metas FOR DELETE USING (auth.uid() = creator_id OR is_admin());

-- 3. META_CONTRIBUTIONS
SELECT pg_temp.drop_all_policies('meta_contributions');
ALTER TABLE public.meta_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_contributions_select ON public.meta_contributions FOR SELECT USING (true);

-- 4. POSTS
SELECT pg_temp.drop_all_policies('posts');
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY posts_select ON public.posts FOR SELECT USING (true);
CREATE POLICY posts_insert ON public.posts FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY posts_update ON public.posts FOR UPDATE USING (auth.uid() = creator_id OR is_admin());
CREATE POLICY posts_delete ON public.posts FOR DELETE USING (auth.uid() = creator_id OR is_admin());

-- 5. POST_LIKES
SELECT pg_temp.drop_all_policies('post_likes');
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_likes_select ON public.post_likes FOR SELECT USING (true);
CREATE POLICY post_likes_insert ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY post_likes_delete ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

-- 6. POST_COMMENTS
SELECT pg_temp.drop_all_policies('post_comments');
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_comments_select ON public.post_comments FOR SELECT USING (true);
CREATE POLICY post_comments_insert ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY post_comments_update ON public.post_comments FOR UPDATE USING (auth.uid() = user_id OR is_admin());
CREATE POLICY post_comments_delete ON public.post_comments FOR DELETE USING (auth.uid() = user_id OR is_admin());

-- 7. COMMENT_LIKES
SELECT pg_temp.drop_all_policies('comment_likes');
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY comment_likes_select ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY comment_likes_insert ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY comment_likes_delete ON public.comment_likes FOR DELETE USING (auth.uid() = user_id);

-- 8. NOTIFICATIONS
SELECT pg_temp.drop_all_policies('notifications');
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY notifications_delete ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- 9. FOLLOWS
SELECT pg_temp.drop_all_policies('follows');
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY follows_select ON public.follows FOR SELECT USING (true);
CREATE POLICY follows_insert ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY follows_delete ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- 10. COMMUNITY_POSTS
SELECT pg_temp.drop_all_policies('community_posts');
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_posts_select ON public.community_posts FOR SELECT USING (true);
CREATE POLICY community_posts_insert ON public.community_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY community_posts_update ON public.community_posts FOR UPDATE USING (auth.uid() = author_id OR is_admin());
CREATE POLICY community_posts_delete ON public.community_posts FOR DELETE USING (auth.uid() = author_id OR is_admin());

-- 11. COMMUNITY_LIKES
SELECT pg_temp.drop_all_policies('community_likes');
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_likes_select ON public.community_likes FOR SELECT USING (true);
CREATE POLICY community_likes_insert ON public.community_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY community_likes_delete ON public.community_likes FOR DELETE USING (auth.uid() = user_id);

-- 12. COMMUNITY_COMMENTS
SELECT pg_temp.drop_all_policies('community_comments');
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_comments_select ON public.community_comments FOR SELECT USING (true);
CREATE POLICY community_comments_insert ON public.community_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY community_comments_update ON public.community_comments FOR UPDATE USING (auth.uid() = author_id OR is_admin());
CREATE POLICY community_comments_delete ON public.community_comments FOR DELETE USING (auth.uid() = author_id OR is_admin());

-- 13. COMMUNITY_SHARES (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='community_shares') THEN
    PERFORM pg_temp.drop_all_policies('community_shares');
    ALTER TABLE public.community_shares ENABLE ROW LEVEL SECURITY;
    CREATE POLICY community_shares_select ON public.community_shares FOR SELECT USING (true);
    CREATE POLICY community_shares_insert ON public.community_shares FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY community_shares_delete ON public.community_shares FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 14. MESSAGES
SELECT pg_temp.drop_all_policies('messages');
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_select ON public.messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY messages_update ON public.messages FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY messages_delete ON public.messages FOR DELETE USING (auth.uid() = sender_id);

-- 15. CONVERSATIONS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='conversations') THEN
    PERFORM pg_temp.drop_all_policies('conversations');
    ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY conversations_select ON public.conversations FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);
    CREATE POLICY conversations_insert ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);
    CREATE POLICY conversations_update ON public.conversations FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);
  END IF;
END $$;

-- 16. BRAND_DEALS
SELECT pg_temp.drop_all_policies('brand_deals');
ALTER TABLE public.brand_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_deals_select ON public.brand_deals FOR SELECT USING (true);
CREATE POLICY brand_deals_insert ON public.brand_deals FOR INSERT WITH CHECK (auth.uid() = brand_id OR is_admin());
CREATE POLICY brand_deals_update ON public.brand_deals FOR UPDATE USING (auth.uid() = brand_id OR is_admin());
CREATE POLICY brand_deals_delete ON public.brand_deals FOR DELETE USING (auth.uid() = brand_id OR is_admin());

-- 17. BRAND_DEAL_REQUESTS
SELECT pg_temp.drop_all_policies('brand_deal_requests');
ALTER TABLE public.brand_deal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_deal_requests_select ON public.brand_deal_requests FOR SELECT USING (auth.uid() = brand_id OR auth.uid() = creator_id OR is_admin());
CREATE POLICY brand_deal_requests_insert ON public.brand_deal_requests FOR INSERT WITH CHECK (auth.uid() = brand_id OR auth.uid() = creator_id);
CREATE POLICY brand_deal_requests_update ON public.brand_deal_requests FOR UPDATE USING (auth.uid() = brand_id OR auth.uid() = creator_id OR is_admin());

-- 18. DEAL_CONVERSATIONS
SELECT pg_temp.drop_all_policies('deal_conversations');
ALTER TABLE public.deal_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_conversations_select ON public.deal_conversations FOR SELECT USING (auth.uid() = brand_id OR auth.uid() = creator_id);
CREATE POLICY deal_conversations_insert ON public.deal_conversations FOR INSERT WITH CHECK (auth.uid() = brand_id OR auth.uid() = creator_id);
CREATE POLICY deal_conversations_update ON public.deal_conversations FOR UPDATE USING (auth.uid() = brand_id OR auth.uid() = creator_id);

-- 19. DEAL_MESSAGES
SELECT pg_temp.drop_all_policies('deal_messages');
ALTER TABLE public.deal_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_messages_select ON public.deal_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.deal_conversations dc WHERE dc.id = deal_messages.conversation_id AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid()))
);
CREATE POLICY deal_messages_insert ON public.deal_messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.deal_conversations dc WHERE dc.id = conversation_id AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid()))
);

-- 20. DEAL_CATEGORIES
SELECT pg_temp.drop_all_policies('deal_categories');
ALTER TABLE public.deal_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_categories_select ON public.deal_categories FOR SELECT USING (true);
CREATE POLICY deal_categories_insert ON public.deal_categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
