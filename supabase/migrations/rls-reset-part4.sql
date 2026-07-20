-- ============================================================
-- GLOBAL RLS RESET — PART 4 of 4
-- Tables 50-55: Service-role tables, settings, app-store, media
-- + media-messaging-system + app-store-readiness
-- Paste this in Supabase SQL Editor and click RUN
-- ============================================================

-- Re-create temp helper (needed per session)
CREATE OR REPLACE FUNCTION pg_temp.drop_all_policies(tbl TEXT) RETURNS void AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, tbl);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- 50. PROCESSED_WEBHOOK_EVENTS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='processed_webhook_events') THEN
    PERFORM pg_temp.drop_all_policies('processed_webhook_events');
    ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 51. RATE_LIMITS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rate_limits') THEN
    PERFORM pg_temp.drop_all_policies('rate_limits');
    ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 52. APP_SECRETS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='app_secrets') THEN
    PERFORM pg_temp.drop_all_policies('app_secrets');
    ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 53. MECENAS_SETTINGS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mecenas_settings') THEN
    PERFORM pg_temp.drop_all_policies('mecenas_settings');
    ALTER TABLE public.mecenas_settings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY mecenas_settings_select ON public.mecenas_settings FOR SELECT USING (true);
    CREATE POLICY mecenas_settings_insert ON public.mecenas_settings FOR INSERT WITH CHECK (auth.uid() = creator_id);
    CREATE POLICY mecenas_settings_update ON public.mecenas_settings FOR UPDATE USING (auth.uid() = creator_id);
  END IF;
END $$;

-- 54. ONBOARDING_PROGRESS / ONBOARDING_DISMISSALS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='onboarding_progress') THEN
    PERFORM pg_temp.drop_all_policies('onboarding_progress');
    ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
    CREATE POLICY onboarding_progress_select ON public.onboarding_progress FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY onboarding_progress_insert ON public.onboarding_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY onboarding_progress_update ON public.onboarding_progress FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='onboarding_dismissals') THEN
    PERFORM pg_temp.drop_all_policies('onboarding_dismissals');
    ALTER TABLE public.onboarding_dismissals ENABLE ROW LEVEL SECURITY;
    CREATE POLICY onboarding_dismissals_select ON public.onboarding_dismissals FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY onboarding_dismissals_insert ON public.onboarding_dismissals FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 55. FEATURE_FLAGS (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='feature_flags') THEN
    PERFORM pg_temp.drop_all_policies('feature_flags');
    ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY feature_flags_select ON public.feature_flags FOR SELECT USING (true);
    CREATE POLICY feature_flags_admin ON public.feature_flags FOR ALL USING (is_admin());
  END IF;
END $$;

-- Cleanup temp helper
DROP FUNCTION IF EXISTS pg_temp.drop_all_policies(TEXT);


-- ============================================================
-- MEDIA MESSAGING SYSTEM
-- ============================================================

-- Add attachment support to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_id UUID;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES public.messages(id);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create message_attachments table
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_name_sanitized TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  mime_type TEXT NOT NULL,
  file_category TEXT NOT NULL DEFAULT 'file'
    CHECK (file_category IN ('image','video','audio','document','archive','code','other','file')),
  storage_bucket TEXT NOT NULL DEFAULT 'dm-media',
  storage_path TEXT NOT NULL,
  public_url TEXT,
  signed_url TEXT,
  signed_url_expires_at TIMESTAMPTZ,
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  thumbnail_url TEXT,
  waveform_data JSONB,
  checksum TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','complete','failed')),
  processing_error TEXT,
  upload_status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (upload_status IN ('uploading','complete','failed','cancelled')),
  upload_progress REAL DEFAULT 0,
  chunks_total INTEGER DEFAULT 1,
  chunks_uploaded INTEGER DEFAULT 0,
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

-- RLS for message_attachments
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachments_select ON public.message_attachments;
CREATE POLICY attachments_select ON public.message_attachments
  FOR SELECT USING (
    uploader_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_attachments.message_id
        AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS attachments_insert ON public.message_attachments;
CREATE POLICY attachments_insert ON public.message_attachments
  FOR INSERT WITH CHECK (auth.uid() = uploader_id);

DROP POLICY IF EXISTS attachments_update ON public.message_attachments;
CREATE POLICY attachments_update ON public.message_attachments
  FOR UPDATE USING (auth.uid() = uploader_id);

DROP POLICY IF EXISTS attachments_delete ON public.message_attachments;
CREATE POLICY attachments_delete ON public.message_attachments
  FOR DELETE USING (auth.uid() = uploader_id OR is_admin());

-- dm-media storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dm-media', 'dm-media', true, 524288000, NULL)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 524288000, allowed_mime_types = NULL;

-- Drop existing dm-media storage policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'dm-media%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "dm-media_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'dm-media');
CREATE POLICY "dm-media_auth_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dm-media' AND auth.role() = 'authenticated');
CREATE POLICY "dm-media_auth_update" ON storage.objects FOR UPDATE USING (bucket_id = 'dm-media' AND auth.role() = 'authenticated');
CREATE POLICY "dm-media_owner_delete" ON storage.objects FOR DELETE USING (bucket_id = 'dm-media' AND auth.role() = 'authenticated');

-- Helper functions
CREATE OR REPLACE FUNCTION public.categorize_mime(p_mime TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_mime LIKE 'image/%' THEN RETURN 'image';
  ELSIF p_mime LIKE 'video/%' THEN RETURN 'video';
  ELSIF p_mime LIKE 'audio/%' THEN RETURN 'audio';
  ELSIF p_mime IN ('application/pdf','application/msword','text/plain','text/csv','text/html','text/markdown','application/json','application/xml')
    OR p_mime LIKE '%officedocument%' OR p_mime LIKE 'application/vnd.ms-%' THEN RETURN 'document';
  ELSIF p_mime IN ('application/zip','application/x-rar-compressed','application/gzip','application/x-tar','application/x-7z-compressed') THEN RETURN 'archive';
  ELSIF p_mime LIKE 'text/x-%' OR p_mime IN ('application/javascript','application/typescript','application/x-python') THEN RETURN 'code';
  ELSE RETURN 'file';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.update_attachment_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attachment_updated ON public.message_attachments;
CREATE TRIGGER trg_attachment_updated
  BEFORE UPDATE ON public.message_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_attachment_timestamp();

-- Add messages and attachments to realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Upload sessions table
CREATE TABLE IF NOT EXISTS public.upload_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uploader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  attachment_id UUID REFERENCES public.message_attachments(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  chunk_size INTEGER NOT NULL DEFAULT 5242880,
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

DROP POLICY IF EXISTS upload_sessions_own ON public.upload_sessions;
CREATE POLICY upload_sessions_own ON public.upload_sessions FOR ALL USING (auth.uid() = uploader_id);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_uploader ON public.upload_sessions(uploader_id, status);

CREATE OR REPLACE FUNCTION public.cleanup_expired_uploads()
RETURNS void AS $$
  UPDATE public.upload_sessions SET status = 'expired' WHERE status = 'active' AND expires_at < now();
  DELETE FROM public.upload_sessions WHERE status IN ('expired', 'cancelled') AND updated_at < now() - interval '7 days';
$$ LANGUAGE sql SECURITY DEFINER;


-- ============================================================
-- APP STORE READINESS — Account deletion columns
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_scheduled
  ON public.profiles (deletion_scheduled_for)
  WHERE deletion_scheduled_for IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_tips') THEN
    CREATE POLICY users_read_own_tips ON public.tips FOR SELECT
      USING (auth.uid() = creator_id OR auth.uid() = tipper_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_subscriptions') THEN
    CREATE POLICY users_read_own_subscriptions ON public.subscriptions FOR SELECT
      USING (auth.uid() = creator_id OR auth.uid() = subscriber_id);
  END IF;
END $$;

ANALYZE public.profiles;


-- ============================================================
-- VERIFY: List all policies after reset
-- ============================================================
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
