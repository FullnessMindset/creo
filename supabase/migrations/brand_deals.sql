-- Brand Deals: tables, encryption, RLS
-- Run in Supabase SQL Editor

-- 1. Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Secure encryption key storage (no RLS policies = only SECURITY DEFINER functions can read)
CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- Insert the encryption key (change this to a strong random string in production!)
INSERT INTO app_secrets (key, value)
VALUES ('message_encryption_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 3. Brand deals listings
CREATE TABLE brand_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  budget_min INTEGER DEFAULT 0,
  budget_max INTEGER DEFAULT 0,
  category TEXT,
  requirements TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE brand_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active deals" ON brand_deals FOR SELECT USING (is_active = true);
CREATE POLICY "Empresas manage own deals" ON brand_deals FOR ALL USING (auth.uid() = empresa_id);

-- 4. Conversations between creator and empresa about a deal
CREATE TABLE deal_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES brand_deals(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  empresa_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(deal_id, creator_id)
);
ALTER TABLE deal_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view own conversations" ON deal_conversations
  FOR SELECT USING (auth.uid() = creator_id OR auth.uid() = empresa_id);
CREATE POLICY "Creators can start conversations" ON deal_conversations
  FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Participants can update own conversations" ON deal_conversations
  FOR UPDATE USING (auth.uid() = creator_id OR auth.uid() = empresa_id);

-- 5. Encrypted messages (content stored encrypted, accessed only via functions)
CREATE TABLE deal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES deal_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) NOT NULL,
  encrypted_content BYTEA NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text','payment','system')),
  payment_amount_cents INTEGER,
  payment_status TEXT CHECK (payment_status IN (NULL, 'pending','completed','failed')),
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE deal_messages ENABLE ROW LEVEL SECURITY;
-- No direct SELECT policy — messages are read only through the decrypt function
-- But we need insert for the encrypt function
CREATE POLICY "No direct message access" ON deal_messages FOR SELECT USING (false);
CREATE POLICY "No direct message insert" ON deal_messages FOR INSERT WITH CHECK (false);

-- 6. Encrypt & insert a message (SECURITY DEFINER — bypasses RLS, accesses the key)
CREATE OR REPLACE FUNCTION send_deal_message(
  p_conversation_id UUID,
  p_sender_id UUID,
  p_content TEXT,
  p_message_type TEXT DEFAULT 'text',
  p_payment_amount_cents INTEGER DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  new_id UUID;
  enc_key TEXT;
  conv_record RECORD;
BEGIN
  -- Verify sender is a participant
  SELECT * INTO conv_record FROM deal_conversations
  WHERE id = p_conversation_id
    AND (creator_id = p_sender_id OR empresa_id = p_sender_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a participant in this conversation';
  END IF;

  SELECT value INTO enc_key FROM app_secrets WHERE key = 'message_encryption_key';
  IF enc_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured';
  END IF;

  INSERT INTO deal_messages (conversation_id, sender_id, encrypted_content, message_type, payment_amount_cents, payment_status)
  VALUES (p_conversation_id, p_sender_id, pgp_sym_encrypt(p_content, enc_key), p_message_type, p_payment_amount_cents, p_payment_status)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Decrypt & read messages (SECURITY DEFINER — only participants can call, decrypts on the fly)
CREATE OR REPLACE FUNCTION get_deal_messages(p_conversation_id UUID, p_caller_id UUID)
RETURNS TABLE (
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
  conv_record RECORD;
BEGIN
  -- Verify caller is a participant
  SELECT * INTO conv_record FROM deal_conversations dc
  WHERE dc.id = p_conversation_id
    AND (dc.creator_id = p_caller_id OR dc.empresa_id = p_caller_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a participant in this conversation';
  END IF;

  SELECT value INTO enc_key FROM app_secrets WHERE key = 'message_encryption_key';

  RETURN QUERY
  SELECT
    dm.id,
    dm.conversation_id,
    dm.sender_id,
    pgp_sym_decrypt(dm.encrypted_content, enc_key) as content,
    dm.message_type,
    dm.payment_amount_cents,
    dm.payment_status,
    dm.stripe_session_id,
    dm.created_at
  FROM deal_messages dm
  WHERE dm.conversation_id = p_conversation_id
  ORDER BY dm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Update payment status (for webhook use)
CREATE OR REPLACE FUNCTION update_deal_payment_status(
  p_stripe_session_id TEXT,
  p_status TEXT
) RETURNS void AS $$
BEGIN
  UPDATE deal_messages
  SET payment_status = p_status
  WHERE stripe_session_id = p_stripe_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
