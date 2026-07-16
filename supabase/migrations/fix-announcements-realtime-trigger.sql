-- ============================================================
-- Fix: Drop realtime.send trigger on announcements table
-- Error: "function realtime.send(text, text, jsonb, boolean) does not exist"
-- The trigger was likely created via Dashboard Realtime settings
-- Run in Supabase SQL Editor
-- ============================================================

-- Drop ALL triggers on announcements table that reference realtime
DO $$
DECLARE
  trg RECORD;
BEGIN
  FOR trg IN
    SELECT tgname
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'announcements'
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.announcements', trg.tgname);
    RAISE NOTICE 'Dropped trigger: %', trg.tgname;
  END LOOP;
END $$;

-- Also remove announcements from realtime publication if present
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.announcements;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
