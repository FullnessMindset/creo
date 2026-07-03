-- =============================================
-- CREO: COMPLETE DATABASE SETUP
-- Run this ENTIRE file in Supabase SQL Editor
-- It covers ALL tables, RPCs, and policies needed
-- Uses IF NOT EXISTS / OR REPLACE so it's safe to re-run
-- =============================================


-- ==================== PROFILES EXTENSIONS ====================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'creator';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS creo_en_ellos JSONB DEFAULT '[]';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS community_intro_seen BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS community_intro_dismissed_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT NULL;


-- ==================== NOTIFICATIONS ====================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT,
  body TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ==================== FOLLOWS ====================
CREATE TABLE IF NOT EXISTS public.follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "follows_read" ON public.follows FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "follows_insert" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "follows_delete" ON public.follows FOR DELETE USING (auth.uid() = follower_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION toggle_follow(p_following_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_follower_id UUID;
  v_existing UUID;
  v_follower_count INTEGER;
BEGIN
  v_follower_id := auth.uid();
  IF v_follower_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_follower_id = p_following_id THEN RAISE EXCEPTION 'Cannot follow yourself'; END IF;
  SELECT id INTO v_existing FROM follows WHERE follower_id = v_follower_id AND following_id = p_following_id;
  IF v_existing IS NOT NULL THEN
    DELETE FROM follows WHERE id = v_existing;
    UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE id = p_following_id;
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = v_follower_id;
  ELSE
    INSERT INTO follows (follower_id, following_id) VALUES (v_follower_id, p_following_id);
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = p_following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = v_follower_id;
  END IF;
  SELECT follower_count INTO v_follower_count FROM profiles WHERE id = p_following_id;
  RETURN jsonb_build_object('followed', v_existing IS NULL, 'follower_count', v_follower_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==================== METAS (Goals) ====================
-- Assumes metas table already exists from initial setup
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS fund_stage INTEGER DEFAULT 0;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS fund_status TEXT DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS stage2_receipt_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS stage2_update_text TEXT DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS stage2_update_media TEXT[] DEFAULT '{}';
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS stage2_submitted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS stage2_approved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS stage3_proof_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS stage3_proof_text TEXT DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS stage3_submitted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS stage3_approved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS cancellation_reason TEXT DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS cancellation_submitted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS admin_review_notes TEXT DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS completion_badge TEXT DEFAULT NULL;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- Meta likes
CREATE TABLE IF NOT EXISTS public.meta_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_id UUID REFERENCES public.metas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meta_id, user_id)
);
ALTER TABLE public.meta_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "meta_likes_select" ON public.meta_likes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "meta_likes_insert" ON public.meta_likes FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "meta_likes_delete" ON public.meta_likes FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Meta comments
CREATE TABLE IF NOT EXISTS public.meta_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_id UUID REFERENCES public.metas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.meta_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "meta_comments_select" ON public.meta_comments FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "meta_comments_insert" ON public.meta_comments FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "meta_comments_delete" ON public.meta_comments FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Meta invites
CREATE TABLE IF NOT EXISTS public.meta_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_id UUID REFERENCES public.metas(id) ON DELETE CASCADE NOT NULL,
  inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invitee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meta_id, invitee_id)
);
ALTER TABLE public.meta_invites ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "meta_invites_select" ON public.meta_invites FOR SELECT USING (auth.uid() = inviter_id OR auth.uid() = invitee_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "meta_invites_insert" ON public.meta_invites FOR INSERT WITH CHECK (auth.uid() = inviter_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "meta_invites_update" ON public.meta_invites FOR UPDATE USING (auth.uid() = invitee_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Meta collaborators
CREATE TABLE IF NOT EXISTS public.meta_collaborators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_id UUID REFERENCES public.metas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meta_id, user_id)
);
ALTER TABLE public.meta_collaborators ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "meta_collabs_select" ON public.meta_collaborators FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "meta_collabs_insert" ON public.meta_collaborators FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "meta_collabs_delete" ON public.meta_collaborators FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Toggle meta like RPC
CREATE OR REPLACE FUNCTION toggle_meta_like(p_meta_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_existing UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_existing FROM meta_likes WHERE meta_id = p_meta_id AND user_id = v_user_id;
  IF v_existing IS NOT NULL THEN
    DELETE FROM meta_likes WHERE id = v_existing;
    UPDATE metas SET like_count = GREATEST(0, like_count - 1) WHERE id = p_meta_id;
  ELSE
    INSERT INTO meta_likes (meta_id, user_id) VALUES (p_meta_id, v_user_id);
    UPDATE metas SET like_count = like_count + 1 WHERE id = p_meta_id;
  END IF;
  SELECT like_count INTO v_count FROM metas WHERE id = p_meta_id;
  RETURN jsonb_build_object('liked', v_existing IS NULL, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add meta comment RPC
CREATE OR REPLACE FUNCTION add_meta_comment(p_meta_id UUID, p_body TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO meta_comments (meta_id, user_id, body) VALUES (p_meta_id, v_user_id, p_body);
  UPDATE metas SET comment_count = comment_count + 1 WHERE id = p_meta_id;
  SELECT comment_count INTO v_count FROM metas WHERE id = p_meta_id;
  RETURN jsonb_build_object('count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Send meta invite RPC
CREATE OR REPLACE FUNCTION send_meta_invite(p_meta_id UUID, p_invitee_username TEXT)
RETURNS JSONB AS $$
DECLARE
  v_invitee_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_invitee_id FROM profiles WHERE username = p_invitee_username;
  IF v_invitee_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  INSERT INTO meta_invites (meta_id, inviter_id, invitee_id) VALUES (p_meta_id, auth.uid(), v_invitee_id);
  RETURN jsonb_build_object('success', true, 'invitee_id', v_invitee_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Accept meta invite RPC
CREATE OR REPLACE FUNCTION accept_meta_invite(p_invite_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_invite meta_invites;
BEGIN
  SELECT * INTO v_invite FROM meta_invites WHERE id = p_invite_id AND invitee_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  UPDATE meta_invites SET status = 'accepted' WHERE id = p_invite_id;
  INSERT INTO meta_collaborators (meta_id, user_id) VALUES (v_invite.meta_id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decline meta invite RPC
CREATE OR REPLACE FUNCTION decline_meta_invite(p_invite_id UUID)
RETURNS JSONB AS $$
BEGIN
  UPDATE meta_invites SET status = 'declined' WHERE id = p_invite_id AND invitee_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment meta raised (for Stripe webhooks)
CREATE OR REPLACE FUNCTION increment_meta_raised(p_meta_id UUID, p_amount INTEGER)
RETURNS void AS $$
  UPDATE public.metas SET raised_cents = raised_cents + p_amount WHERE id = p_meta_id;
$$ LANGUAGE sql SECURITY DEFINER;


-- ==================== POSTS (Video Feed) ====================
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- Post likes
CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "post_likes_select" ON public.post_likes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "post_likes_insert" ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "post_likes_delete" ON public.post_likes FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Post comments
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  parent_comment_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  like_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "post_comments_select" ON public.post_comments FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "post_comments_insert" ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "post_comments_update" ON public.post_comments FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "post_comments_delete" ON public.post_comments FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Comment likes
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, user_id)
);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "comment_likes_select" ON public.comment_likes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "comment_likes_insert" ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "comment_likes_delete" ON public.comment_likes FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Toggle post like RPC
CREATE OR REPLACE FUNCTION toggle_post_like(p_post_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_existing UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_existing FROM post_likes WHERE post_id = p_post_id AND user_id = v_user_id;
  IF v_existing IS NOT NULL THEN
    DELETE FROM post_likes WHERE id = v_existing;
    UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = p_post_id;
  ELSE
    INSERT INTO post_likes (post_id, user_id) VALUES (p_post_id, v_user_id);
    UPDATE posts SET like_count = like_count + 1 WHERE id = p_post_id;
  END IF;
  SELECT like_count INTO v_count FROM posts WHERE id = p_post_id;
  RETURN jsonb_build_object('liked', v_existing IS NULL, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Toggle comment like RPC
CREATE OR REPLACE FUNCTION toggle_comment_like(p_comment_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_existing UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_existing FROM comment_likes WHERE comment_id = p_comment_id AND user_id = v_user_id;
  IF v_existing IS NOT NULL THEN
    DELETE FROM comment_likes WHERE id = v_existing;
    UPDATE post_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = p_comment_id;
  ELSE
    INSERT INTO comment_likes (comment_id, user_id) VALUES (p_comment_id, v_user_id);
    UPDATE post_comments SET like_count = like_count + 1 WHERE id = p_comment_id;
  END IF;
  SELECT like_count INTO v_count FROM post_comments WHERE id = p_comment_id;
  RETURN jsonb_build_object('liked', v_existing IS NULL, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add post comment RPC
CREATE OR REPLACE FUNCTION add_post_comment(p_post_id UUID, p_body TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
  v_comment_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO post_comments (post_id, user_id, body) VALUES (p_post_id, v_user_id, p_body) RETURNING id INTO v_comment_id;
  UPDATE posts SET comment_count = comment_count + 1 WHERE id = p_post_id;
  SELECT comment_count INTO v_count FROM posts WHERE id = p_post_id;
  RETURN jsonb_build_object('comment_id', v_comment_id, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment reply RPC
CREATE OR REPLACE FUNCTION add_comment_reply(p_comment_id UUID, p_body TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_post_id UUID;
  v_reply_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT post_id INTO v_post_id FROM post_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment not found'; END IF;
  INSERT INTO post_comments (post_id, user_id, body, parent_comment_id) VALUES (v_post_id, v_user_id, p_body, p_comment_id) RETURNING id INTO v_reply_id;
  UPDATE posts SET comment_count = comment_count + 1 WHERE id = v_post_id;
  RETURN jsonb_build_object('reply_id', v_reply_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==================== CREATOR STORIES ====================
ALTER TABLE public.creator_stories ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE public.creator_stories ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- Story likes
CREATE TABLE IF NOT EXISTS public.story_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID REFERENCES public.creator_stories(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(story_id, user_id)
);
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "story_likes_select" ON public.story_likes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "story_likes_insert" ON public.story_likes FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "story_likes_delete" ON public.story_likes FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Story comments
CREATE TABLE IF NOT EXISTS public.story_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID REFERENCES public.creator_stories(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "story_comments_select" ON public.story_comments FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "story_comments_insert" ON public.story_comments FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "story_comments_delete" ON public.story_comments FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Toggle story like RPC
CREATE OR REPLACE FUNCTION toggle_story_like(p_story_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_existing UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_existing FROM story_likes WHERE story_id = p_story_id AND user_id = v_user_id;
  IF v_existing IS NOT NULL THEN
    DELETE FROM story_likes WHERE id = v_existing;
    UPDATE creator_stories SET like_count = GREATEST(0, like_count - 1) WHERE id = p_story_id;
  ELSE
    INSERT INTO story_likes (story_id, user_id) VALUES (p_story_id, v_user_id);
    UPDATE creator_stories SET like_count = like_count + 1 WHERE id = p_story_id;
  END IF;
  SELECT like_count INTO v_count FROM creator_stories WHERE id = p_story_id;
  RETURN jsonb_build_object('liked', v_existing IS NULL, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add story comment RPC
CREATE OR REPLACE FUNCTION add_story_comment(p_story_id UUID, p_body TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO story_comments (story_id, user_id, body) VALUES (p_story_id, v_user_id, p_body);
  UPDATE creator_stories SET comment_count = comment_count + 1 WHERE id = p_story_id;
  SELECT comment_count INTO v_count FROM creator_stories WHERE id = p_story_id;
  RETURN jsonb_build_object('count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==================== COMMUNITY (Comunidad) ====================
CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'text' CHECK (post_type IN ('text','photo','video','share_post','share_story')),
  title TEXT,
  body TEXT,
  media_urls JSONB DEFAULT '[]',
  video_orientation TEXT CHECK (video_orientation IN ('vertical','horizontal',NULL)),
  shared_post_id UUID REFERENCES public.community_posts(id) ON DELETE SET NULL,
  shared_story_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "community_posts_read" ON public.community_posts FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_posts_insert" ON public.community_posts FOR INSERT WITH CHECK (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_posts_update" ON public.community_posts FOR UPDATE USING (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_posts_delete" ON public.community_posts FOR DELETE USING (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.community_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "community_likes_read" ON public.community_likes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_likes_insert" ON public.community_likes FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_likes_delete" ON public.community_likes FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.community_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  parent_comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "community_comments_read" ON public.community_comments FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_comments_insert" ON public.community_comments FOR INSERT WITH CHECK (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_comments_update" ON public.community_comments FOR UPDATE USING (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_comments_delete" ON public.community_comments FOR DELETE USING (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ==================== MESSAGES (DMs) ====================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image','gif','audio','video', NULL)),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "messages_select" ON public.messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "messages_insert" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "messages_update" ON public.messages FOR UPDATE USING (auth.uid() = receiver_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "messages_delete" ON public.messages FOR DELETE USING (auth.uid() = sender_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ==================== BUSINESS LINKS ====================
CREATE TABLE IF NOT EXISTS public.business_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.business_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "business_links_read" ON public.business_links FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "business_links_insert" ON public.business_links FOR INSERT WITH CHECK (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "business_links_update" ON public.business_links FOR UPDATE USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "business_links_delete" ON public.business_links FOR DELETE USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ==================== VERIFICATION DOCUMENTS ====================
CREATE TABLE IF NOT EXISTS public.verification_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_url TEXT NOT NULL,
  document_type TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "verification_docs_select" ON public.verification_documents FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "verification_docs_insert" ON public.verification_documents FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ==================== BRAND DEALS ====================
CREATE TABLE IF NOT EXISTS public.brand_deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requirements TEXT NOT NULL,
  budget_per_creator_cents INTEGER NOT NULL CHECK (budget_per_creator_cents >= 500),
  terms_conditions TEXT NOT NULL,
  max_creators INTEGER DEFAULT 1,
  category TEXT,
  deadline DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.brand_deals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "brand_deals_read" ON public.brand_deals FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "brand_deals_insert" ON public.brand_deals FOR INSERT WITH CHECK (auth.uid() = brand_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "brand_deals_update" ON public.brand_deals FOR UPDATE USING (auth.uid() = brand_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "brand_deals_delete" ON public.brand_deals FOR DELETE USING (auth.uid() = brand_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.brand_deal_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES public.brand_deals(id) ON DELETE CASCADE NOT NULL,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','submitted','approved','paid','disputed','cancelled')),
  contract_accepted_at TIMESTAMPTZ,
  submission_url TEXT,
  submission_notes TEXT,
  revision_notes TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(deal_id, creator_id)
);
ALTER TABLE public.brand_deal_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "deal_requests_read" ON public.brand_deal_requests FOR SELECT USING (auth.uid() = brand_id OR auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "deal_requests_insert" ON public.brand_deal_requests FOR INSERT WITH CHECK (auth.uid() = creator_id OR auth.uid() = brand_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "deal_requests_update" ON public.brand_deal_requests FOR UPDATE USING (auth.uid() = brand_id OR auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Brand deal RPCs
CREATE OR REPLACE FUNCTION accept_brand_deal(p_request_id UUID)
RETURNS JSON AS $$
DECLARE v_request brand_deal_requests;
BEGIN
  SELECT * INTO v_request FROM brand_deal_requests WHERE id = p_request_id AND creator_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Deal request not found'; END IF;
  IF v_request.status != 'pending' THEN RAISE EXCEPTION 'Deal already responded to'; END IF;
  UPDATE brand_deal_requests SET status = 'accepted', contract_accepted_at = now() WHERE id = p_request_id;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_brand_deal(p_request_id UUID)
RETURNS JSON AS $$
BEGIN
  UPDATE brand_deal_requests SET status = 'rejected' WHERE id = p_request_id AND creator_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cannot reject this deal'; END IF;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION submit_brand_deal_work(p_request_id UUID, p_url TEXT, p_notes TEXT DEFAULT NULL)
RETURNS JSON AS $$
BEGIN
  UPDATE brand_deal_requests SET status = 'submitted', submission_url = p_url, submission_notes = p_notes, submitted_at = now()
  WHERE id = p_request_id AND creator_id = auth.uid() AND status = 'accepted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cannot submit for this deal'; END IF;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION approve_brand_deal_work(p_request_id UUID)
RETURNS JSON AS $$
BEGIN
  UPDATE brand_deal_requests SET status = 'approved', approved_at = now()
  WHERE id = p_request_id AND brand_id = auth.uid() AND status = 'submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cannot approve this deal'; END IF;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_brand_deal_paid(p_request_id UUID, p_stripe_session TEXT)
RETURNS void AS $$
  UPDATE brand_deal_requests SET status = 'paid', paid_at = now(), stripe_session_id = p_stripe_session
  WHERE id = p_request_id AND status = 'approved';
$$ LANGUAGE sql SECURITY DEFINER;


-- ==================== DONE ====================
-- After running this, create these Storage buckets in Supabase Dashboard:
-- 1. avatars (public)
-- 2. covers (public)
-- 3. stories (public)
-- 4. community-media (public)
-- 5. meta-images (public)
-- 6. documents (public)
-- 7. backgrounds (public)
-- 8. post-videos (public)
-- 9. business-images (public)
-- 10. message-media (public)
--
-- For each bucket: Settings > Make public (toggle ON)
-- Then add a storage policy: Allow authenticated users to upload
--   Policy: ((bucket_id = 'BUCKET_NAME') AND (auth.role() = 'authenticated'))
