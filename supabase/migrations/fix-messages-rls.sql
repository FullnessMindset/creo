-- ============================================================
-- Fix Messages RLS & Functions
-- Run in Supabase SQL Editor
-- ============================================================

-- ===== 1. FIX messages UPDATE policy: allow sender OR receiver to update (for reactions) =====
DROP POLICY IF EXISTS "Receivers can mark messages read" ON public.messages;

CREATE POLICY "Participants can update own messages" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ===== 2. ADD messages DELETE policy: users can delete messages they sent =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND cmd = 'DELETE') THEN
    CREATE POLICY "Senders can delete own messages" ON public.messages
      FOR DELETE USING (auth.uid() = sender_id);
  END IF;
END $$;

-- ===== 3. FIX deal_messages INSERT policy: require conversation participation =====
DROP POLICY IF EXISTS "deal_messages_insert" ON public.deal_messages;

CREATE POLICY "deal_messages_participant_insert" ON public.deal_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.deal_conversations dc
      WHERE dc.id = conversation_id
      AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid())
    )
  );

-- ===== 4. Atomic reaction toggle function (prevents race conditions) =====
CREATE OR REPLACE FUNCTION public.toggle_message_reaction(
  p_message_id UUID,
  p_emoji TEXT
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_reactions JSONB;
  v_users JSONB;
  v_idx INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify the user is a participant in this conversation
  IF NOT EXISTS (
    SELECT 1 FROM public.messages
    WHERE id = p_message_id
    AND (sender_id = v_user_id OR receiver_id = v_user_id)
  ) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  -- Lock the row to prevent concurrent modifications
  SELECT reactions INTO v_reactions
  FROM public.messages
  WHERE id = p_message_id
  FOR UPDATE;

  IF v_reactions IS NULL THEN
    v_reactions := '{}'::JSONB;
  END IF;

  v_users := COALESCE(v_reactions->p_emoji, '[]'::JSONB);

  -- Check if user already reacted with this emoji
  SELECT i - 1 INTO v_idx
  FROM generate_series(0, jsonb_array_length(v_users) - 1) AS i
  WHERE v_users->i = to_jsonb(v_user_id::TEXT)
  LIMIT 1;

  IF v_idx IS NOT NULL THEN
    -- Remove the reaction
    v_users := v_users - v_idx;
    IF jsonb_array_length(v_users) = 0 THEN
      v_reactions := v_reactions - p_emoji;
    ELSE
      v_reactions := jsonb_set(v_reactions, ARRAY[p_emoji], v_users);
    END IF;
  ELSE
    -- Add the reaction
    v_users := v_users || to_jsonb(ARRAY[v_user_id::TEXT]);
    v_reactions := jsonb_set(v_reactions, ARRAY[p_emoji], v_users);
  END IF;

  UPDATE public.messages SET reactions = v_reactions WHERE id = p_message_id;

  RETURN v_reactions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
