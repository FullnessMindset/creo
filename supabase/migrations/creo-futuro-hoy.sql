-- ============================================================
-- CREO FUTURO HOY — Content Platform Migration
-- 5 tables: cfh_content, cfh_subcategories, cfh_likes, cfh_comments, cfh_access_grants
-- ============================================================

-- 1. Creator-defined subcategories
CREATE TABLE IF NOT EXISTS public.cfh_subcategories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('music','books','food','health','fitness','education','faith')),
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(creator_id, category, name)
);

-- 2. Content items (videos, books, recipes, courses, articles)
CREATE TABLE IF NOT EXISTS public.cfh_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('music','books','food','health','fitness','education','faith')),
  subcategory_id UUID REFERENCES public.cfh_subcategories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('video','book','recipe','course','article')),
  -- Video fields
  video_url TEXT,
  video_type TEXT CHECK (video_type IS NULL OR video_type IN ('direct','youtube','vimeo','tiktok','instagram')),
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  -- Book fields
  book_file_url TEXT,
  book_format TEXT CHECK (book_format IS NULL OR book_format IN ('pdf','epub')),
  allow_download BOOLEAN DEFAULT false,
  -- Downloadable materials [{name, url, type, size_bytes}]
  downloadable_urls JSONB DEFAULT '[]'::jsonb,
  -- Access control
  is_free BOOLEAN DEFAULT true,
  -- Tagging
  tags TEXT[] DEFAULT '{}',
  co_creators UUID[] DEFAULT '{}',
  brand_deal_id UUID,
  -- Counters (denormalized for performance)
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  -- Status
  status TEXT DEFAULT 'published' CHECK (status IN ('draft','published','archived','flagged')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Content likes
CREATE TABLE IF NOT EXISTS public.cfh_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.cfh_content(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(content_id, user_id)
);

-- 4. Content comments (with threading)
CREATE TABLE IF NOT EXISTS public.cfh_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.cfh_content(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  parent_id UUID REFERENCES public.cfh_comments(id) ON DELETE CASCADE,
  like_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Access grants (preserves download rights after subscription cancel)
CREATE TABLE IF NOT EXISTS public.cfh_access_grants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.cfh_content(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  grant_type TEXT DEFAULT 'subscription' CHECK (grant_type IN ('subscription','purchase','gift')),
  downloads_only BOOLEAN DEFAULT false,
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, content_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cfh_content_creator ON public.cfh_content(creator_id);
CREATE INDEX IF NOT EXISTS idx_cfh_content_category ON public.cfh_content(category);
CREATE INDEX IF NOT EXISTS idx_cfh_content_category_free ON public.cfh_content(category, is_free) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_cfh_content_subcategory ON public.cfh_content(subcategory_id) WHERE subcategory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cfh_content_status ON public.cfh_content(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cfh_content_cocreators ON public.cfh_content USING gin(co_creators);
CREATE INDEX IF NOT EXISTS idx_cfh_content_tags ON public.cfh_content USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_cfh_subcategories_creator ON public.cfh_subcategories(creator_id, category);

CREATE INDEX IF NOT EXISTS idx_cfh_likes_content ON public.cfh_likes(content_id);
CREATE INDEX IF NOT EXISTS idx_cfh_likes_user ON public.cfh_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_cfh_comments_content ON public.cfh_comments(content_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cfh_comments_author ON public.cfh_comments(author_id);

CREATE INDEX IF NOT EXISTS idx_cfh_access_user ON public.cfh_access_grants(user_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_cfh_access_content ON public.cfh_access_grants(content_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- cfh_subcategories
ALTER TABLE public.cfh_subcategories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cfh_subcategories_select" ON public.cfh_subcategories;
CREATE POLICY "cfh_subcategories_select" ON public.cfh_subcategories FOR SELECT USING (true);
DROP POLICY IF EXISTS "cfh_subcategories_insert" ON public.cfh_subcategories;
CREATE POLICY "cfh_subcategories_insert" ON public.cfh_subcategories FOR INSERT WITH CHECK (auth.uid() = creator_id);
DROP POLICY IF EXISTS "cfh_subcategories_update" ON public.cfh_subcategories;
CREATE POLICY "cfh_subcategories_update" ON public.cfh_subcategories FOR UPDATE USING (auth.uid() = creator_id);
DROP POLICY IF EXISTS "cfh_subcategories_delete" ON public.cfh_subcategories;
CREATE POLICY "cfh_subcategories_delete" ON public.cfh_subcategories FOR DELETE USING (auth.uid() = creator_id);

-- cfh_content
ALTER TABLE public.cfh_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cfh_content_select" ON public.cfh_content;
CREATE POLICY "cfh_content_select" ON public.cfh_content FOR SELECT USING (status = 'published' OR auth.uid() = creator_id);
DROP POLICY IF EXISTS "cfh_content_insert" ON public.cfh_content;
CREATE POLICY "cfh_content_insert" ON public.cfh_content FOR INSERT WITH CHECK (auth.uid() = creator_id);
DROP POLICY IF EXISTS "cfh_content_update" ON public.cfh_content;
CREATE POLICY "cfh_content_update" ON public.cfh_content FOR UPDATE USING (auth.uid() = creator_id);
DROP POLICY IF EXISTS "cfh_content_delete" ON public.cfh_content;
CREATE POLICY "cfh_content_delete" ON public.cfh_content FOR DELETE USING (auth.uid() = creator_id);

-- cfh_likes
ALTER TABLE public.cfh_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cfh_likes_select" ON public.cfh_likes;
CREATE POLICY "cfh_likes_select" ON public.cfh_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "cfh_likes_insert" ON public.cfh_likes;
CREATE POLICY "cfh_likes_insert" ON public.cfh_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "cfh_likes_delete" ON public.cfh_likes;
CREATE POLICY "cfh_likes_delete" ON public.cfh_likes FOR DELETE USING (auth.uid() = user_id);

-- cfh_comments
ALTER TABLE public.cfh_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cfh_comments_select" ON public.cfh_comments;
CREATE POLICY "cfh_comments_select" ON public.cfh_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "cfh_comments_insert" ON public.cfh_comments;
CREATE POLICY "cfh_comments_insert" ON public.cfh_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
DROP POLICY IF EXISTS "cfh_comments_update" ON public.cfh_comments;
CREATE POLICY "cfh_comments_update" ON public.cfh_comments FOR UPDATE USING (auth.uid() = author_id);
DROP POLICY IF EXISTS "cfh_comments_delete" ON public.cfh_comments;
CREATE POLICY "cfh_comments_delete" ON public.cfh_comments FOR DELETE USING (auth.uid() = author_id);

-- cfh_access_grants
ALTER TABLE public.cfh_access_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cfh_access_select" ON public.cfh_access_grants;
CREATE POLICY "cfh_access_select" ON public.cfh_access_grants FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "cfh_access_insert" ON public.cfh_access_grants;
CREATE POLICY "cfh_access_insert" ON public.cfh_access_grants FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Increment view count
CREATE OR REPLACE FUNCTION public.cfh_record_view(p_content_id UUID)
RETURNS void AS $$
  UPDATE public.cfh_content SET view_count = view_count + 1 WHERE id = p_content_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Toggle like (insert or delete, update counter)
CREATE OR REPLACE FUNCTION public.cfh_toggle_like(p_content_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  existed BOOLEAN;
BEGIN
  DELETE FROM public.cfh_likes WHERE content_id = p_content_id AND user_id = p_user_id;
  IF FOUND THEN
    UPDATE public.cfh_content SET like_count = GREATEST(like_count - 1, 0) WHERE id = p_content_id;
    RETURN false;
  ELSE
    INSERT INTO public.cfh_likes (content_id, user_id) VALUES (p_content_id, p_user_id);
    UPDATE public.cfh_content SET like_count = like_count + 1 WHERE id = p_content_id;
    RETURN true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment/decrement comment count
CREATE OR REPLACE FUNCTION public.cfh_update_comment_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.cfh_content SET comment_count = comment_count + 1 WHERE id = NEW.content_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.cfh_content SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.content_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS cfh_comment_count_trigger ON public.cfh_comments;
CREATE TRIGGER cfh_comment_count_trigger
  AFTER INSERT OR DELETE ON public.cfh_comments
  FOR EACH ROW EXECUTE FUNCTION public.cfh_update_comment_count();

-- Grant access to all paid content from a creator for a subscriber
CREATE OR REPLACE FUNCTION public.cfh_grant_subscriber_access(p_user_id UUID, p_creator_id UUID)
RETURNS void AS $$
  INSERT INTO public.cfh_access_grants (user_id, content_id, creator_id, grant_type, downloads_only)
  SELECT p_user_id, id, creator_id, 'subscription', false
  FROM public.cfh_content
  WHERE creator_id = p_creator_id AND is_free = false AND status = 'published'
  ON CONFLICT (user_id, content_id) DO UPDATE SET downloads_only = false;
$$ LANGUAGE sql SECURITY DEFINER;

-- On subscription cancel: mark existing grants as downloads-only
CREATE OR REPLACE FUNCTION public.cfh_revoke_streaming_access(p_user_id UUID, p_creator_id UUID)
RETURNS void AS $$
  UPDATE public.cfh_access_grants
  SET downloads_only = true
  WHERE user_id = p_user_id AND creator_id = p_creator_id AND grant_type = 'subscription';
$$ LANGUAGE sql SECURITY DEFINER;

-- Auto-update updated_at on cfh_content changes
CREATE OR REPLACE FUNCTION public.cfh_content_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cfh_content_updated_at_trigger ON public.cfh_content;
CREATE TRIGGER cfh_content_updated_at_trigger
  BEFORE UPDATE ON public.cfh_content
  FOR EACH ROW EXECUTE FUNCTION public.cfh_content_updated_at();

-- Add mi_meta fixed price to profiles if not present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'meta_fixed_price_cents'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN meta_fixed_price_cents INTEGER;
  END IF;
END $$;

-- Storage bucket for CFH content uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('cfh-content', 'cfh-content', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for cfh-content bucket
DROP POLICY IF EXISTS "cfh_storage_read" ON storage.objects;
CREATE POLICY "cfh_storage_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'cfh-content');

DROP POLICY IF EXISTS "cfh_storage_insert" ON storage.objects;
CREATE POLICY "cfh_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cfh-content' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cfh_storage_delete" ON storage.objects;
CREATE POLICY "cfh_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'cfh-content' AND auth.uid() IS NOT NULL);
