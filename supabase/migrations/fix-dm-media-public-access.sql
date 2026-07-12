-- Fix dm-media bucket: ensure public read access for media in messages
-- The existing SELECT policy requires authentication, but <audio>/<video>/<img> tags
-- make unauthenticated requests. Public buckets bypass RLS on the /object/public/ path,
-- but this adds an explicit anon-read policy as a safety net.

-- Drop the overly-restrictive SELECT policy and replace with public read
DO $$
BEGIN
  BEGIN
    DROP POLICY IF EXISTS "dm-media_select" ON storage.objects;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "dm-media_select_public" ON storage.objects
      FOR SELECT USING (bucket_id = 'dm-media');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Ensure the bucket is marked public
UPDATE storage.buckets SET public = true WHERE id = 'dm-media';
