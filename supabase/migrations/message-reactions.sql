-- Message Reactions — Run in Supabase SQL Editor
-- Adds reactions JSONB column to messages table

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

-- Example reactions format: {"❤️": ["user-id-1"], "😂": ["user-id-1", "user-id-2"]}
