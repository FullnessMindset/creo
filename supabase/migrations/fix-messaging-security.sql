-- ===== MESSAGING SECURITY & ENCRYPTION FIXES =====
-- 1. Fix dm-media storage RLS: scope delete/update to file owner
-- 2. Add encrypted deal message insert RPC
-- 3. Restore encrypted get_deal_messages with pgp_sym_decrypt

-- ===== 1. FIX STORAGE RLS — scope to owner only =====

-- Drop overly permissive policies
DROP POLICY IF EXISTS "dm-media_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "dm-media_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "dm-media_auth_insert" ON storage.objects;

-- Insert: authenticated users can only upload to their own folder
CREATE POLICY "dm-media_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dm-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update: only the uploader can modify their own files
CREATE POLICY "dm-media_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dm-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete: only the uploader can delete their own files
CREATE POLICY "dm-media_owner_delete_v2" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dm-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read stays (anyone can view shared media)
DO $$ BEGIN
  CREATE POLICY "dm-media_public_read" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'dm-media');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ===== 2. ENCRYPTED DEAL MESSAGE INSERT RPC =====
-- Uses pgp_sym_encrypt so content is stored encrypted at rest

CREATE OR REPLACE FUNCTION public.insert_deal_message_encrypted(
  p_conversation_id UUID,
  p_sender_id UUID,
  p_content TEXT,
  p_enc_key TEXT,
  p_message_type TEXT DEFAULT 'text',
  p_payment_amount_cents INTEGER DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL,
  p_stripe_session_id TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  -- Verify sender is participant
  IF NOT EXISTS (
    SELECT 1 FROM public.deal_conversations
    WHERE id = p_conversation_id
    AND (brand_id = p_sender_id OR creator_id = p_sender_id)
  ) THEN
    RAISE EXCEPTION 'Not a participant in this conversation';
  END IF;

  INSERT INTO public.deal_messages (
    conversation_id, sender_id, encrypted_content,
    message_type, payment_amount_cents, payment_status, stripe_session_id
  ) VALUES (
    p_conversation_id, p_sender_id,
    pgp_sym_encrypt(p_content, p_enc_key),
    p_message_type, p_payment_amount_cents, p_payment_status, p_stripe_session_id
  );

  UPDATE public.deal_conversations
  SET updated_at = now()
  WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===== 3. RESTORE ENCRYPTED get_deal_messages =====

CREATE OR REPLACE FUNCTION public.get_deal_messages(
  p_conversation_id UUID,
  p_caller_id UUID
) RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  content TEXT,
  message_type TEXT,
  payment_amount_cents INTEGER,
  payment_status TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  enc_key TEXT;
BEGIN
  -- Verify caller is participant
  IF NOT EXISTS (
    SELECT 1 FROM public.deal_conversations dc
    WHERE dc.id = p_conversation_id
    AND (dc.brand_id = p_caller_id OR dc.creator_id = p_caller_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  enc_key := current_setting('app.deal_encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    enc_key := 'creo_deal_default_key';
  END IF;

  RETURN QUERY
  SELECT
    dm.id,
    dm.conversation_id,
    dm.sender_id,
    COALESCE(
      pgp_sym_decrypt(dm.encrypted_content, enc_key),
      dm.content
    ) as content,
    dm.message_type,
    dm.payment_amount_cents,
    dm.payment_status,
    dm.stripe_session_id,
    dm.created_at
  FROM public.deal_messages dm
  WHERE dm.conversation_id = p_conversation_id
  ORDER BY dm.created_at ASC;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback: if decryption fails, return plaintext content column
    RETURN QUERY
    SELECT
      dm.id,
      dm.conversation_id,
      dm.sender_id,
      dm.content,
      dm.message_type,
      dm.payment_amount_cents,
      dm.payment_status,
      dm.stripe_session_id,
      dm.created_at
    FROM public.deal_messages dm
    WHERE dm.conversation_id = p_conversation_id
    ORDER BY dm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===== 4. ENSURE pgcrypto EXTENSION =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;
