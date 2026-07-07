-- CREO: LAUNCH-READY MIGRATION
-- Only creates what's MISSING from the live database
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE)

-- ===== DROP FUNCTIONS WITH CHANGED SIGNATURES =====
DROP FUNCTION IF EXISTS add_meta_comment(UUID, TEXT);
DROP FUNCTION IF EXISTS add_post_comment(UUID, TEXT);
DROP FUNCTION IF EXISTS add_comment_reply(UUID, TEXT);
DROP FUNCTION IF EXISTS add_story_comment(UUID, TEXT);
DROP FUNCTION IF EXISTS toggle_meta_like(UUID);
DROP FUNCTION IF EXISTS toggle_post_like(UUID);
DROP FUNCTION IF EXISTS toggle_comment_like(UUID);
DROP FUNCTION IF EXISTS toggle_story_like(UUID);
DROP FUNCTION IF EXISTS toggle_follow(UUID);
DROP FUNCTION IF EXISTS send_meta_invite(UUID, TEXT);
DROP FUNCTION IF EXISTS accept_meta_invite(UUID);
DROP FUNCTION IF EXISTS decline_meta_invite(UUID);
DROP FUNCTION IF EXISTS increment_meta_raised(UUID, INTEGER);
DROP FUNCTION IF EXISTS accept_brand_deal(UUID);
DROP FUNCTION IF EXISTS reject_brand_deal(UUID);
DROP FUNCTION IF EXISTS submit_brand_deal_work(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS approve_brand_deal_work(UUID);
DROP FUNCTION IF EXISTS mark_brand_deal_paid(UUID, TEXT);
DROP FUNCTION IF EXISTS send_deal_message(UUID, UUID, TEXT, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS get_deal_messages(UUID, UUID);
DROP FUNCTION IF EXISTS update_deal_payment_status(TEXT, TEXT);

-- ===== EXTENSIONS =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== PROFILE COLUMNS =====
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

-- ===== META COLUMNS =====
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

-- ===== POST COLUMNS =====
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- ===== STORY COLUMNS =====
ALTER TABLE public.creator_stories ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE public.creator_stories ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- ===== FOLLOWS (missing table) =====
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

-- ===== COMMUNITY POSTS (missing tables) =====
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

-- ===== BRAND DEALS (missing tables) =====
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

-- ===== ENCRYPTED MESSAGING (new tables) =====
CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO app_secrets (key, value)
VALUES ('message_encryption_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS deal_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES brand_deals(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(deal_id, creator_id)
);
ALTER TABLE deal_conversations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "deal_convos_select" ON deal_conversations FOR SELECT USING (auth.uid() = creator_id OR auth.uid() = brand_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "deal_convos_insert" ON deal_conversations FOR INSERT WITH CHECK (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "deal_convos_update" ON deal_conversations FOR UPDATE USING (auth.uid() = creator_id OR auth.uid() = brand_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS deal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES deal_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) NOT NULL,
  encrypted_content BYTEA NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text','payment','system')),
  payment_amount_cents INTEGER,
  payment_status TEXT CHECK (payment_status IN (NULL, 'pending','completed','failed')),
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE deal_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "deal_msgs_no_direct_select" ON deal_messages FOR SELECT USING (false); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "deal_msgs_no_direct_insert" ON deal_messages FOR INSERT WITH CHECK (false); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== ALL FUNCTIONS =====

CREATE OR REPLACE FUNCTION toggle_follow(p_following_id UUID)
RETURNS JSONB AS $$
DECLARE v_follower_id UUID; v_existing UUID; v_follower_count INTEGER;
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

CREATE OR REPLACE FUNCTION toggle_meta_like(p_meta_id UUID)
RETURNS JSONB AS $$
DECLARE v_user_id UUID; v_existing UUID; v_count INTEGER;
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

CREATE OR REPLACE FUNCTION add_meta_comment(p_meta_id UUID, p_body TEXT)
RETURNS JSONB AS $$
DECLARE v_user_id UUID; v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO meta_comments (meta_id, user_id, body) VALUES (p_meta_id, v_user_id, p_body);
  UPDATE metas SET comment_count = comment_count + 1 WHERE id = p_meta_id;
  SELECT comment_count INTO v_count FROM metas WHERE id = p_meta_id;
  RETURN jsonb_build_object('count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION send_meta_invite(p_meta_id UUID, p_invitee_username TEXT)
RETURNS JSONB AS $$
DECLARE v_invitee_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_invitee_id FROM profiles WHERE username = p_invitee_username;
  IF v_invitee_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  INSERT INTO meta_invites (meta_id, inviter_id, invitee_id) VALUES (p_meta_id, auth.uid(), v_invitee_id);
  RETURN jsonb_build_object('success', true, 'invitee_id', v_invitee_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION accept_meta_invite(p_invite_id UUID)
RETURNS JSONB AS $$
DECLARE v_invite meta_invites;
BEGIN
  SELECT * INTO v_invite FROM meta_invites WHERE id = p_invite_id AND invitee_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  UPDATE meta_invites SET status = 'accepted' WHERE id = p_invite_id;
  INSERT INTO meta_collaborators (meta_id, user_id) VALUES (v_invite.meta_id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decline_meta_invite(p_invite_id UUID)
RETURNS JSONB AS $$
BEGIN
  UPDATE meta_invites SET status = 'declined' WHERE id = p_invite_id AND invitee_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_meta_raised(p_meta_id UUID, p_amount INTEGER)
RETURNS void AS $$
  UPDATE public.metas SET raised_cents = raised_cents + p_amount WHERE id = p_meta_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION toggle_post_like(p_post_id UUID)
RETURNS JSONB AS $$
DECLARE v_user_id UUID; v_existing UUID; v_count INTEGER;
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

CREATE OR REPLACE FUNCTION toggle_comment_like(p_comment_id UUID)
RETURNS JSONB AS $$
DECLARE v_user_id UUID; v_existing UUID; v_count INTEGER;
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

CREATE OR REPLACE FUNCTION add_post_comment(p_post_id UUID, p_body TEXT)
RETURNS JSONB AS $$
DECLARE v_user_id UUID; v_count INTEGER; v_comment_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO post_comments (post_id, user_id, body) VALUES (p_post_id, v_user_id, p_body) RETURNING id INTO v_comment_id;
  UPDATE posts SET comment_count = comment_count + 1 WHERE id = p_post_id;
  SELECT comment_count INTO v_count FROM posts WHERE id = p_post_id;
  RETURN jsonb_build_object('comment_id', v_comment_id, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION add_comment_reply(p_comment_id UUID, p_body TEXT)
RETURNS JSONB AS $$
DECLARE v_user_id UUID; v_post_id UUID; v_reply_id UUID;
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

CREATE OR REPLACE FUNCTION toggle_story_like(p_story_id UUID)
RETURNS JSONB AS $$
DECLARE v_user_id UUID; v_existing UUID; v_count INTEGER;
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

CREATE OR REPLACE FUNCTION add_story_comment(p_story_id UUID, p_body TEXT)
RETURNS JSONB AS $$
DECLARE v_user_id UUID; v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO story_comments (story_id, user_id, body) VALUES (p_story_id, v_user_id, p_body);
  UPDATE creator_stories SET comment_count = comment_count + 1 WHERE id = p_story_id;
  SELECT comment_count INTO v_count FROM creator_stories WHERE id = p_story_id;
  RETURN jsonb_build_object('count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Encrypted messaging functions
CREATE OR REPLACE FUNCTION send_deal_message(
  p_conversation_id UUID, p_sender_id UUID, p_content TEXT,
  p_message_type TEXT DEFAULT 'text', p_payment_amount_cents INTEGER DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE new_id UUID; enc_key TEXT; conv_record RECORD;
BEGIN
  SELECT * INTO conv_record FROM deal_conversations
  WHERE id = p_conversation_id AND (creator_id = p_sender_id OR brand_id = p_sender_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a participant'; END IF;
  SELECT value INTO enc_key FROM app_secrets WHERE key = 'message_encryption_key';
  IF enc_key IS NULL THEN RAISE EXCEPTION 'Encryption key not configured'; END IF;
  INSERT INTO deal_messages (conversation_id, sender_id, encrypted_content, message_type, payment_amount_cents, payment_status)
  VALUES (p_conversation_id, p_sender_id, pgp_sym_encrypt(p_content, enc_key), p_message_type, p_payment_amount_cents, p_payment_status)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_deal_messages(p_conversation_id UUID, p_caller_id UUID)
RETURNS TABLE (id UUID, conversation_id UUID, sender_id UUID, content TEXT, message_type TEXT,
  payment_amount_cents INTEGER, payment_status TEXT, stripe_session_id TEXT, created_at TIMESTAMPTZ
) AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM deal_conversations dc WHERE dc.id = p_conversation_id
    AND (dc.creator_id = p_caller_id OR dc.brand_id = p_caller_id)) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  SELECT value INTO enc_key FROM app_secrets WHERE key = 'message_encryption_key';
  RETURN QUERY SELECT dm.id, dm.conversation_id, dm.sender_id,
    pgp_sym_decrypt(dm.encrypted_content, enc_key) as content,
    dm.message_type, dm.payment_amount_cents, dm.payment_status, dm.stripe_session_id, dm.created_at
  FROM deal_messages dm WHERE dm.conversation_id = p_conversation_id ORDER BY dm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_deal_payment_status(p_stripe_session_id TEXT, p_status TEXT)
RETURNS void AS $$
BEGIN
  UPDATE deal_messages SET payment_status = p_status WHERE stripe_session_id = p_stripe_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('community-media', 'community-media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meta-images', 'meta-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('backgrounds', 'backgrounds', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('post-videos', 'post-videos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('business-images', 'business-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('message-media', 'message-media', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload to all buckets
DO $$
DECLARE
  bucket_name TEXT;
  policy_name TEXT;
BEGIN
  FOREACH bucket_name IN ARRAY ARRAY['avatars','covers','stories','community-media','meta-images','documents','backgrounds','post-videos','business-images','message-media']
  LOOP
    policy_name := bucket_name || '_upload';
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR INSERT WITH CHECK (bucket_id = %L AND auth.role() = ''authenticated'')',
        policy_name, bucket_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    policy_name := bucket_name || '_select';
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L)',
        policy_name, bucket_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    policy_name := bucket_name || '_update';
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR UPDATE USING (bucket_id = %L AND auth.role() = ''authenticated'')',
        policy_name, bucket_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    policy_name := bucket_name || '_delete';
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR DELETE USING (bucket_id = %L AND auth.role() = ''authenticated'')',
        policy_name, bucket_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ===== DONE =====
