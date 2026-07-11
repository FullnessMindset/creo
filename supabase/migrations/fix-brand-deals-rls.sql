-- Fix Brand Deals RLS — Run in Supabase SQL Editor
-- Drops and recreates all RLS policies to ensure they work

ALTER TABLE public.brand_deals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "brand_deals_read" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_insert" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_update" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_delete" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow authenticated users to insert brand_deals" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow users to update their own brand_deals" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow users to delete their own brand_deals" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow public read access to brand_deals" ON public.brand_deals;

-- Recreate clean policies
CREATE POLICY "brand_deals_read" ON public.brand_deals FOR SELECT USING (true);
CREATE POLICY "brand_deals_insert" ON public.brand_deals FOR INSERT WITH CHECK (auth.uid() = brand_id);
CREATE POLICY "brand_deals_update" ON public.brand_deals FOR UPDATE USING (auth.uid() = brand_id);
CREATE POLICY "brand_deals_delete" ON public.brand_deals FOR DELETE USING (auth.uid() = brand_id);

-- Also fix deal_conversations and deal_messages RLS
ALTER TABLE public.deal_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deal_conversations_read" ON public.deal_conversations;
DROP POLICY IF EXISTS "deal_conversations_insert" ON public.deal_conversations;
DROP POLICY IF EXISTS "deal_conversations_update" ON public.deal_conversations;
CREATE POLICY "deal_conversations_read" ON public.deal_conversations FOR SELECT USING (auth.uid() = brand_id OR auth.uid() = creator_id);
CREATE POLICY "deal_conversations_insert" ON public.deal_conversations FOR INSERT WITH CHECK (auth.uid() = brand_id OR auth.uid() = creator_id);
CREATE POLICY "deal_conversations_update" ON public.deal_conversations FOR UPDATE USING (auth.uid() = brand_id OR auth.uid() = creator_id);

-- Deal messages table (if exists)
DO $$ BEGIN
  ALTER TABLE public.deal_messages ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "deal_messages_read" ON public.deal_messages;
  DROP POLICY IF EXISTS "deal_messages_insert" ON public.deal_messages;
  CREATE POLICY "deal_messages_read" ON public.deal_messages FOR SELECT USING (true);
  CREATE POLICY "deal_messages_insert" ON public.deal_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
