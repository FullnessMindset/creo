-- CREO ID + Comunidad V2 Migration
-- Run in Supabase SQL Editor

-- 1. Profiles: identity verification + community intro columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS community_intro_seen BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS community_intro_dismissed_at TIMESTAMPTZ;

-- 2. Community posts: V2 columns
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS shared_post_id UUID REFERENCES public.community_posts(id) ON DELETE SET NULL;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS event_time TEXT;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS event_link TEXT;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS live_platform TEXT;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS live_url TEXT;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- 3. Messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT,
  media_url TEXT,
  media_type TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own messages" ON public.messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Authenticated users can send messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Receivers can mark messages read" ON public.messages
  FOR UPDATE USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- 4. Story likes table
CREATE TABLE IF NOT EXISTS public.story_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(story_id, user_id)
);

ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read story likes" ON public.story_likes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like stories" ON public.story_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike own story likes" ON public.story_likes
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Story comments table
CREATE TABLE IF NOT EXISTS public.story_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read story comments" ON public.story_comments
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can comment on stories" ON public.story_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own story comments" ON public.story_comments
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Index for feed category filtering
CREATE INDEX IF NOT EXISTS idx_community_posts_category ON public.community_posts(category);
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON public.community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages(receiver_id, is_read);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(sender_id, receiver_id, created_at DESC);
