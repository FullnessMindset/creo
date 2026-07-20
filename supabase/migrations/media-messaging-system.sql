-- ============================================================
-- MEDIA MESSAGING SYSTEM — Production-grade attachments
-- Run in Supabase SQL Editor
-- ============================================================

-- ===== 1. ALTER messages TABLE — add attachment support =====
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_id UUID;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES public.messages(id);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ===== 2. CREATE message_attachments TABLE =====
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- File identity
  file_name TEXT NOT NULL,
  file_name_sanitized TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  mime_type TEXT NOT NULL,
  file_category TEXT NOT NULL DEFAULT 'file'
    CHECK (file_category IN ('image','video','audio','document','archive','code','other','file')),

  -- Storage
  storage_bucket TEXT NOT NULL DEFAULT 'dm-media',
  storage_path TEXT NOT NULL,
  public_url TEXT,
  signed_url TEXT,
  signed_url_expires_at TIMESTAMPTZ,

  -- Media metadata
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  thumbnail_url TEXT,
  waveform_data JSONB,
  checksum TEXT,

  -- Processing state
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','complete','failed')),
  processing_error TEXT,

  -- Upload tracking
  upload_status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (upload_status IN ('uploading','complete','failed','cancelled')),
  upload_progress REAL DEFAULT 0,
  chunks_total INTEGER DEFAULT 1,
  chunks_uploaded INTEGER DEFAULT 0,

  -- Security
  is_safe BOOLEAN DEFAULT true,
  scan_status TEXT DEFAULT 'skipped'
    CHECK (scan_status IN ('pending','scanning','clean','flagged','skipped')),
  scan_result JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_message ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploader ON public.message_attachments(uploader_id);
CREATE INDEX IF NOT EXISTS idx_attachments_status ON public.message_attachments(upload_status, processing_status);

-- ===== 3. RLS for message_attachments =====
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY attachments_select ON public.message_attachments
  FOR SELECT USING (
    uploader_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_attachments.message_id
        AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );

CREATE POLICY attachments_insert ON public.message_attachments
  FOR INSERT WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY attachments_update ON public.message_attachments
  FOR UPDATE USING (auth.uid() = uploader_id);

CREATE POLICY attachments_delete ON public.message_attachments
  FOR DELETE USING (auth.uid() = uploader_id OR is_admin());


-- ===== 4. STORAGE BUCKETS =====

-- Ensure dm-media bucket exists and is public (for read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dm-media', 'dm-media', true,
  524288000, -- 500MB max
  NULL -- allow all MIME types
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = NULL;

-- Drop ALL existing dm-media storage policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'dm-media%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- Clean storage policies
CREATE POLICY "dm-media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'dm-media');

CREATE POLICY "dm-media_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'dm-media'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "dm-media_auth_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'dm-media'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "dm-media_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'dm-media'
    AND auth.role() = 'authenticated'
  );


-- ===== 5. HELPER FUNCTIONS =====

-- Categorize file by MIME type
CREATE OR REPLACE FUNCTION public.categorize_mime(p_mime TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_mime LIKE 'image/%' THEN RETURN 'image';
  ELSIF p_mime LIKE 'video/%' THEN RETURN 'video';
  ELSIF p_mime LIKE 'audio/%' THEN RETURN 'audio';
  ELSIF p_mime IN (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'text/html', 'text/markdown',
    'application/json', 'application/xml'
  ) THEN RETURN 'document';
  ELSIF p_mime IN (
    'application/zip',
    'application/x-rar-compressed',
    'application/gzip',
    'application/x-tar',
    'application/x-7z-compressed'
  ) THEN RETURN 'archive';
  ELSIF p_mime LIKE 'text/x-%' OR p_mime IN (
    'application/javascript',
    'application/typescript',
    'application/x-python'
  ) THEN RETURN 'code';
  ELSE RETURN 'file';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Auto-update updated_at on attachments
CREATE OR REPLACE FUNCTION public.update_attachment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attachment_updated ON public.message_attachments;
CREATE TRIGGER trg_attachment_updated
  BEFORE UPDATE ON public.message_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_attachment_timestamp();


-- ===== 6. ADD messages TO REALTIME =====
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ===== 7. Upload tracking table for resumable uploads =====
CREATE TABLE IF NOT EXISTS public.upload_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uploader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  attachment_id UUID REFERENCES public.message_attachments(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  chunk_size INTEGER NOT NULL DEFAULT 5242880, -- 5MB default
  total_chunks INTEGER NOT NULL DEFAULT 1,
  uploaded_chunks INTEGER[] DEFAULT '{}',
  storage_path TEXT NOT NULL,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completing','complete','expired','cancelled')),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY upload_sessions_own ON public.upload_sessions
  FOR ALL USING (auth.uid() = uploader_id);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_uploader ON public.upload_sessions(uploader_id, status);

-- Auto-expire stale upload sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_uploads()
RETURNS void AS $$
  UPDATE public.upload_sessions SET status = 'expired'
  WHERE status = 'active' AND expires_at < now();
  DELETE FROM public.upload_sessions WHERE status IN ('expired', 'cancelled') AND updated_at < now() - interval '7 days';
$$ LANGUAGE sql SECURITY DEFINER;
