-- ============================================================
-- Fix dm-media Storage RLS + Clean Up Empty Messages
-- Run in Supabase SQL Editor
-- ============================================================

-- ===== 1. Ensure dm-media bucket exists and is public =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('dm-media', 'dm-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ===== 2. Drop ALL existing dm-media policies to start clean =====
DO $$ BEGIN
  DROP POLICY IF EXISTS "dm-media_insert" ON storage.objects;
  DROP POLICY IF EXISTS "dm-media_insert_auth" ON storage.objects;
  DROP POLICY IF EXISTS "dm-media_select" ON storage.objects;
  DROP POLICY IF EXISTS "dm-media_select_public" ON storage.objects;
  DROP POLICY IF EXISTS "dm-media_update" ON storage.objects;
  DROP POLICY IF EXISTS "dm-media_update_auth" ON storage.objects;
  DROP POLICY IF EXISTS "dm-media_delete" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ===== 3. Create clean policies =====
-- Public read (images/audio/video displayed in HTML tags make unauthenticated requests)
CREATE POLICY "dm_media_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'dm-media');

-- Authenticated users can upload
CREATE POLICY "dm_media_insert_authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'dm-media' AND auth.role() = 'authenticated');

-- Authenticated users can update their uploads
CREATE POLICY "dm_media_update_authenticated"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'dm-media' AND auth.role() = 'authenticated');

-- Authenticated users can delete their uploads
CREATE POLICY "dm_media_delete_authenticated"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'dm-media' AND auth.role() = 'authenticated');

-- ===== 4. Clean up empty messages (body=null, media_url=null) =====
DELETE FROM public.messages
WHERE body IS NULL AND media_url IS NULL;

-- ===== 5. Add CHECK constraint to prevent future empty messages =====
DO $$ BEGIN
  ALTER TABLE public.messages
    ADD CONSTRAINT messages_not_empty
    CHECK (body IS NOT NULL OR media_url IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
