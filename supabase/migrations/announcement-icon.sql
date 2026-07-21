-- Add icon column to announcements for admin-selected emoji
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS icon TEXT;
