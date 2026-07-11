-- Add reaction_type column to community_likes
ALTER TABLE public.community_likes ADD COLUMN IF NOT EXISTS reaction_type TEXT DEFAULT '❤️';

-- Drop the old unique constraint and add a new one
-- (The old one is on post_id, user_id — we keep that since one reaction per user per post)
