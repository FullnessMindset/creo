-- Tips & Subscriptions tables — Run in Supabase SQL Editor
-- Tracks all tip payments and subscription lifecycle

-- Tips table
CREATE TABLE IF NOT EXISTS public.tips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id TEXT UNIQUE,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  creator_username TEXT,
  amount_cents INTEGER NOT NULL,
  tipper_name TEXT,
  tipper_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tips_read_own" ON public.tips
    FOR SELECT USING (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "tips_service_insert" ON public.tips
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subscriber_email TEXT,
  subscriber_name TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','cancelled','past_due')),
  last_payment_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "subscriptions_read_own" ON public.subscriptions
    FOR SELECT USING (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "subscriptions_service_insert" ON public.subscriptions
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "subscriptions_service_update" ON public.subscriptions
    FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
