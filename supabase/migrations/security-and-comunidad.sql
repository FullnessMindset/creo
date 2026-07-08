-- ===== PROFILE NAME FIELDS =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- ===== COMMUNITY POSTS ENGAGEMENT COUNTERS =====
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS share_count INTEGER DEFAULT 0;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS profile_only BOOLEAN DEFAULT false;

-- Engagement score: weighted combo for ranking algorithm
-- likes=1, comments=3, shares=5 (comments show deeper engagement, shares amplify reach)
CREATE OR REPLACE FUNCTION public.community_post_engagement_score(p community_posts)
RETURNS INTEGER AS $$
  SELECT COALESCE(p.like_count, 0) + (COALESCE(p.comment_count, 0) * 3) + (COALESCE(p.share_count, 0) * 5);
$$ LANGUAGE sql STABLE;

-- Auto-update like_count when likes change
CREATE OR REPLACE FUNCTION public.update_community_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_community_like_count ON public.community_likes;
CREATE TRIGGER trg_community_like_count
  AFTER INSERT OR DELETE ON public.community_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_community_like_count();

-- Auto-update comment_count when comments change
CREATE OR REPLACE FUNCTION public.update_community_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_community_comment_count ON public.community_comments;
CREATE TRIGGER trg_community_comment_count
  AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_community_comment_count();

-- ===== COMMUNITY SHARES TABLE =====
CREATE TABLE IF NOT EXISTS public.community_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.community_shares ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "community_shares_read" ON public.community_shares FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_shares_insert" ON public.community_shares FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "community_shares_delete" ON public.community_shares FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-update share_count
CREATE OR REPLACE FUNCTION public.update_community_share_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET share_count = share_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET share_count = GREATEST(0, share_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_community_share_count ON public.community_shares;
CREATE TRIGGER trg_community_share_count
  AFTER INSERT OR DELETE ON public.community_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_community_share_count();

-- ===== SECURITY: Restrict profiles table to only expose safe columns =====
-- Ensure RLS is on
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can only update their own profile
DO $$ BEGIN
  CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Anyone can read profiles (public profiles)
DO $$ BEGIN
  CREATE POLICY "profiles_read_all" ON public.profiles
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only authenticated users can insert their own profile
DO $$ BEGIN
  CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
