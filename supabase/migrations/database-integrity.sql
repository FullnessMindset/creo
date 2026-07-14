-- ============================================================
-- CREO Platform — Database Integrity Migration
-- Fixes broken RPCs, missing tables, nonexistent column refs
-- Safe to run multiple times (idempotent)
-- ============================================================

-- ===== 1. FIX update_deal_payment_status: write to deal_messages instead of nonexistent deal_payments =====
CREATE OR REPLACE FUNCTION public.update_deal_payment_status(
  p_stripe_session_id TEXT,
  p_status TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE public.deal_messages
  SET payment_status = p_status
  WHERE stripe_session_id = p_stripe_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== 2. FIX performance-indexes.sql broken references =====
-- These indexes reference objects that don't exist (conversations, mecenas_settings)
-- Add correct indexes for objects that DO exist

CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages (receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages (created_at DESC);

-- ===== 3. FIX app-store-readiness.sql: correct column names for tips/subscriptions RLS =====
-- The original migration referenced tipper_id/subscriber_id which don't exist
-- Drop the broken policies if they exist and recreate with correct columns

DO $$ BEGIN
  DROP POLICY IF EXISTS users_read_own_tips ON public.tips;
  DROP POLICY IF EXISTS users_read_own_subscriptions ON public.subscriptions;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- tips: creator can read tips they received (creator_id is the receiver)
DO $$ BEGIN
  CREATE POLICY users_read_own_tips ON public.tips FOR SELECT
    USING (auth.uid() = creator_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- subscriptions: creator can read their own subscriptions
DO $$ BEGIN
  CREATE POLICY users_read_own_subscriptions ON public.subscriptions FOR SELECT
    USING (auth.uid() = creator_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== 4. Add counter triggers for meta/post/story tables =====

-- meta_likes counter trigger
CREATE OR REPLACE FUNCTION public.update_meta_likes_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.metas SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.meta_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.metas SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.meta_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_meta_likes_count ON public.meta_likes;
CREATE TRIGGER trg_meta_likes_count
  AFTER INSERT OR DELETE ON public.meta_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_meta_likes_count();

-- meta_comments counter trigger
CREATE OR REPLACE FUNCTION public.update_meta_comments_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.metas SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.meta_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.metas SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id = OLD.meta_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_meta_comments_count ON public.meta_comments;
CREATE TRIGGER trg_meta_comments_count
  AFTER INSERT OR DELETE ON public.meta_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_meta_comments_count();

-- post_likes counter trigger
CREATE OR REPLACE FUNCTION public.update_post_likes_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_post_likes_count ON public.post_likes;
CREATE TRIGGER trg_post_likes_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_post_likes_count();

-- post_comments counter trigger
CREATE OR REPLACE FUNCTION public.update_post_comments_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_post_comments_count ON public.post_comments;
CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_post_comments_count();

-- story_likes counter trigger
CREATE OR REPLACE FUNCTION public.update_story_likes_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.creator_stories SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.story_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.creator_stories SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.story_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_story_likes_count ON public.story_likes;
CREATE TRIGGER trg_story_likes_count
  AFTER INSERT OR DELETE ON public.story_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_story_likes_count();

-- story_comments counter trigger
CREATE OR REPLACE FUNCTION public.update_story_comments_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.creator_stories SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.story_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.creator_stories SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id = OLD.story_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_story_comments_count ON public.story_comments;
CREATE TRIGGER trg_story_comments_count
  AFTER INSERT OR DELETE ON public.story_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_story_comments_count();

-- ===== 5. Ensure likes_count/comments_count columns exist =====
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
ALTER TABLE public.creator_stories ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE public.creator_stories ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

-- ===== 6. Add admin_notifications table if not exists =====
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  priority TEXT DEFAULT 'normal',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- ===== ANALYZE =====
ANALYZE public.metas;
ANALYZE public.posts;
ANALYZE public.creator_stories;
ANALYZE public.messages;
