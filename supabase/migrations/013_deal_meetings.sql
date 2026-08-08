-- 013: Deal Meetings — Jitsi-backed video calls for Project Collabs
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS deal_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES deal_conversations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  room_name TEXT NOT NULL UNIQUE,
  meeting_url TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 480),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_meetings_conversation ON deal_meetings(conversation_id, status, scheduled_at);
CREATE INDEX idx_deal_meetings_created_by ON deal_meetings(created_by);

ALTER TABLE deal_meetings ENABLE ROW LEVEL SECURITY;

-- Participants of the conversation can view meetings
CREATE POLICY "deal_meetings_select" ON deal_meetings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM deal_conversations dc
    WHERE dc.id = deal_meetings.conversation_id
    AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid())
  )
);

-- Only conversation participants can create meetings
CREATE POLICY "deal_meetings_insert" ON deal_meetings FOR INSERT WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM deal_conversations dc
    WHERE dc.id = deal_meetings.conversation_id
    AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid())
  )
);

-- Creator of the meeting can update it (status changes)
CREATE POLICY "deal_meetings_update" ON deal_meetings FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM deal_conversations dc
    WHERE dc.id = deal_meetings.conversation_id
    AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid())
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM deal_conversations dc
    WHERE dc.id = deal_meetings.conversation_id
    AND (dc.brand_id = auth.uid() OR dc.creator_id = auth.uid())
  )
);

-- Auto-update updated_at
CREATE TRIGGER deal_meetings_updated_at
  BEFORE UPDATE ON deal_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
