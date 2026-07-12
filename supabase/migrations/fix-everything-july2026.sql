-- ============================================================
-- CREO Platform — MASTER Migration (July 2026)
-- Run this ONCE in Supabase SQL Editor to fix ALL known issues
-- Covers: brand deals, reports, announcements, onboarding,
--         Stripe Connect, CREO ID, webhooks, storage buckets
-- ============================================================

-- ===== 1. PROFILE COLUMNS (Stripe, Identity, Onboarding) =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_connect_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS identity_session_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'creator';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_attempts INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_verification_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS community_intro_seen BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS community_intro_dismissed_at TIMESTAMPTZ;

-- ===== 2. BRAND DEALS: Add missing columns + fix constraints =====
ALTER TABLE public.brand_deals
  ADD COLUMN IF NOT EXISTS video_vibe TEXT,
  ADD COLUMN IF NOT EXISTS payment_description TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_deadline DATE;

ALTER TABLE public.brand_deals DROP CONSTRAINT IF EXISTS brand_deals_budget_per_creator_cents_check;
ALTER TABLE public.brand_deals ADD CONSTRAINT brand_deals_budget_per_creator_cents_check CHECK (budget_per_creator_cents >= 100);

ALTER TABLE public.brand_deals ALTER COLUMN terms_conditions DROP NOT NULL;
ALTER TABLE public.brand_deals ALTER COLUMN requirements DROP NOT NULL;

-- ===== 3. BRAND DEALS: Fix RLS =====
ALTER TABLE public.brand_deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brand_deals_read" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_insert" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_update" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_delete" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow authenticated users to insert brand_deals" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow users to update their own brand_deals" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow users to delete their own brand_deals" ON public.brand_deals;
DROP POLICY IF EXISTS "Allow public read access to brand_deals" ON public.brand_deals;

CREATE POLICY "brand_deals_read" ON public.brand_deals FOR SELECT USING (true);
CREATE POLICY "brand_deals_insert" ON public.brand_deals FOR INSERT WITH CHECK (auth.uid() = brand_id);
CREATE POLICY "brand_deals_update" ON public.brand_deals FOR UPDATE USING (
  auth.uid() = brand_id OR auth.email() = 'fullnessmindset@gmail.com'
);
CREATE POLICY "brand_deals_delete" ON public.brand_deals FOR DELETE USING (
  auth.uid() = brand_id OR auth.email() = 'fullnessmindset@gmail.com'
);

-- ===== 4. DEAL CATEGORIES =====
CREATE TABLE IF NOT EXISTS public.deal_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.deal_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "deal_categories_read" ON public.deal_categories FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "deal_categories_insert" ON public.deal_categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 5. REPORTS TABLE: Fix column name =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='reported_user_id') THEN
    ALTER TABLE public.reports ADD COLUMN reported_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
UPDATE public.reports SET reported_user_id = reported_id WHERE reported_user_id IS NULL AND reported_id IS NOT NULL;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_read_admin" ON public.reports;
DROP POLICY IF EXISTS "reports_read_own" ON public.reports;
DROP POLICY IF EXISTS "reports_read" ON public.reports;
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
DROP POLICY IF EXISTS "reports_update_admin" ON public.reports;
DROP POLICY IF EXISTS "reports_update" ON public.reports;

CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_read" ON public.reports FOR SELECT USING (
  auth.uid() = reporter_id
  OR auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);
CREATE POLICY "reports_update" ON public.reports FOR UPDATE USING (
  auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);

-- ===== 6. ANNOUNCEMENTS TABLE =====
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'global',
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_username TEXT,
  style TEXT DEFAULT 'info',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "announcements_read" ON public.announcements;
DROP POLICY IF EXISTS "announcements_insert" ON public.announcements;
DROP POLICY IF EXISTS "announcements_update" ON public.announcements;
DROP POLICY IF EXISTS "announcements_delete" ON public.announcements;

CREATE POLICY "announcements_read" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "announcements_insert" ON public.announcements FOR INSERT WITH CHECK (
  auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);
CREATE POLICY "announcements_update" ON public.announcements FOR UPDATE USING (
  auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);
CREATE POLICY "announcements_delete" ON public.announcements FOR DELETE USING (
  auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);

-- ===== 7. VERIFICATION EVENTS TABLE =====
CREATE TABLE IF NOT EXISTS public.verification_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','started','submitted','verified','rejected','needs_review','expired','cancelled')),
  stripe_session_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_events_user ON public.verification_events (user_id, created_at DESC);
ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users read own verification events" ON public.verification_events FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service role inserts verification events" ON public.verification_events FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 8. TERMS ACCEPTANCE TABLE =====
CREATE TABLE IF NOT EXISTS public.terms_acceptance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('terms','privacy','community_guidelines','stripe_acknowledgment')),
  policy_version TEXT NOT NULL DEFAULT '1.0',
  accepted_at TIMESTAMPTZ DEFAULT now(),
  app_version TEXT DEFAULT '1.0',
  UNIQUE(user_id, policy_type, policy_version)
);
CREATE INDEX IF NOT EXISTS idx_terms_acceptance_user ON public.terms_acceptance (user_id);
ALTER TABLE public.terms_acceptance ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users read own terms acceptance" ON public.terms_acceptance FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users insert terms acceptance" ON public.terms_acceptance FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 9. ADMIN NOTIFICATIONS TABLE =====
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON public.admin_notifications (is_read, created_at DESC) WHERE is_read = false;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admin reads admin notifications" ON public.admin_notifications FOR SELECT USING (auth.email() = 'fullnessmindset@gmail.com' OR auth.uid() IN (SELECT id FROM profiles WHERE account_type = 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service role inserts admin notifications" ON public.admin_notifications FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admin updates admin notifications" ON public.admin_notifications FOR UPDATE USING (auth.email() = 'fullnessmindset@gmail.com' OR auth.uid() IN (SELECT id FROM profiles WHERE account_type = 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 10. PROCESSED WEBHOOK EVENTS (idempotency) =====
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT,
  stripe_session_id TEXT,
  metadata JSONB DEFAULT '{}',
  processed_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_stripe ON public.processed_webhook_events (stripe_event_id);
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Service role manages webhook events" ON public.processed_webhook_events FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 11. TIPS TABLE =====
CREATE TABLE IF NOT EXISTS public.tips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id TEXT UNIQUE,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  creator_username TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  tipper_name TEXT,
  tipper_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "tips_read_own" ON public.tips FOR SELECT USING (auth.uid() = creator_id OR auth.email() = 'fullnessmindset@gmail.com'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "tips_service_insert" ON public.tips FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 12. SUBSCRIPTIONS TABLE =====
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id TEXT,
  stripe_subscription_id TEXT,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subscriber_email TEXT,
  subscriber_name TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'active',
  last_payment_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "subscriptions_read_own" ON public.subscriptions FOR SELECT USING (auth.uid() = creator_id OR auth.email() = 'fullnessmindset@gmail.com'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "subscriptions_service_insert" ON public.subscriptions FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "subscriptions_service_update" ON public.subscriptions FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 13. NOTIFICATIONS: ensure extra columns exist =====
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url TEXT;

-- ===== 14. STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-deals', 'brand-deals', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('dm-media', 'dm-media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meta-receipts', 'meta-receipts', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meta-evidence', 'meta-evidence', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meta-final-proof', 'meta-final-proof', false) ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$
BEGIN
  -- brand-deals bucket
  BEGIN CREATE POLICY "brand_deals_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'brand-deals'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "brand_deals_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'brand-deals' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "brand_deals_storage_update" ON storage.objects FOR UPDATE USING (bucket_id = 'brand-deals' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  -- dm-media bucket
  BEGIN DROP POLICY IF EXISTS "dm-media_select" ON storage.objects; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN CREATE POLICY "dm-media_select_public" ON storage.objects FOR SELECT USING (bucket_id = 'dm-media'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "dm-media_insert_auth" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dm-media' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "dm-media_update_auth" ON storage.objects FOR UPDATE USING (bucket_id = 'dm-media' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  -- videos bucket
  BEGIN CREATE POLICY "videos_select_public" ON storage.objects FOR SELECT USING (bucket_id = 'videos'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "videos_insert_auth" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'videos' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  -- meta evidence buckets
  BEGIN CREATE POLICY "meta_receipts_select" ON storage.objects FOR SELECT USING (bucket_id = 'meta-receipts' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "meta_receipts_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'meta-receipts' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "meta_evidence_select" ON storage.objects FOR SELECT USING (bucket_id = 'meta-evidence' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "meta_evidence_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'meta-evidence' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "meta_final_select" ON storage.objects FOR SELECT USING (bucket_id = 'meta-final-proof' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "meta_final_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'meta-final-proof' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

UPDATE storage.buckets SET public = true WHERE id = 'dm-media';

-- ===== 15. DATABASE FUNCTIONS =====

-- Record verification event + create notifications
CREATE OR REPLACE FUNCTION record_verification_event(
  p_user_id UUID, p_status TEXT, p_stripe_session_id TEXT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
DECLARE v_title TEXT; v_body TEXT; v_category TEXT := 'verification';
BEGIN
  INSERT INTO public.verification_events (user_id, status, stripe_session_id, metadata)
  VALUES (p_user_id, p_status, p_stripe_session_id, p_metadata);

  UPDATE public.profiles SET
    verification_status = p_status, last_verification_at = now(),
    verification_attempts = CASE WHEN p_status = 'started' THEN verification_attempts + 1 ELSE verification_attempts END,
    identity_verified = CASE WHEN p_status = 'verified' THEN true ELSE identity_verified END
  WHERE id = p_user_id;

  CASE p_status
    WHEN 'started' THEN v_title := 'Verificación Iniciada'; v_body := 'Tu verificación de identidad ha comenzado.';
    WHEN 'submitted' THEN v_title := 'Verificación Enviada'; v_body := 'Tu documentación ha sido enviada.';
    WHEN 'verified' THEN v_title := '¡Identidad Verificada!'; v_body := '¡Tu Creo ID ha sido verificado! Ya puedes recibir pagos.';
    WHEN 'rejected' THEN v_title := 'Verificación Rechazada'; v_body := 'Tu verificación no pudo completarse. Intenta de nuevo.';
    WHEN 'expired' THEN v_title := 'Verificación Expirada'; v_body := 'Tu sesión de verificación ha expirado.';
    WHEN 'cancelled' THEN v_title := 'Verificación Cancelada'; v_body := 'La verificación fue cancelada.';
    ELSE v_title := 'Actualización de Verificación'; v_body := 'Estado: ' || p_status;
  END CASE;

  INSERT INTO public.notifications (user_id, type, title, body, category, priority, icon, link)
  VALUES (p_user_id, 'approval', v_title, v_body, v_category,
    CASE WHEN p_status = 'verified' THEN 'high' WHEN p_status = 'rejected' THEN 'urgent' ELSE 'normal' END,
    CASE WHEN p_status = 'verified' THEN '✅' WHEN p_status = 'rejected' THEN '❌' ELSE '🔄' END,
    'index.html?panel=1');

  INSERT INTO public.admin_notifications (event_type, user_id, details)
  VALUES ('verification_' || p_status, p_user_id, jsonb_build_object('status', p_status, 'stripe_session_id', p_stripe_session_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Accept platform terms
CREATE OR REPLACE FUNCTION accept_platform_terms(
  p_policy_version TEXT DEFAULT '1.0', p_app_version TEXT DEFAULT '1.0'
) RETURNS void AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  INSERT INTO public.terms_acceptance (user_id, policy_type, policy_version, app_version)
  VALUES (v_user_id,'terms',p_policy_version,p_app_version),(v_user_id,'privacy',p_policy_version,p_app_version),
         (v_user_id,'community_guidelines',p_policy_version,p_app_version),(v_user_id,'stripe_acknowledgment',p_policy_version,p_app_version)
  ON CONFLICT (user_id, policy_type, policy_version) DO NOTHING;
  UPDATE public.profiles SET terms_accepted_at = now(), onboarding_completed = true, onboarding_completed_at = now() WHERE id = v_user_id;
  INSERT INTO public.notifications (user_id, type, title, body, category, icon)
  VALUES (v_user_id, 'approval', '¡Bienvenido a CREO!', 'Has aceptado los términos y estás listo para comenzar.', 'general', '🎉');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create platform notification helper
CREATE OR REPLACE FUNCTION create_platform_notification(
  p_user_id UUID, p_type TEXT, p_title TEXT, p_body TEXT,
  p_category TEXT DEFAULT 'general', p_priority TEXT DEFAULT 'normal',
  p_icon TEXT DEFAULT '🔔', p_link TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, category, priority, icon, link)
  VALUES (p_user_id, p_type, p_title, p_body, p_category, p_priority, p_icon, p_link);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment meta raised (atomic)
DROP FUNCTION IF EXISTS increment_meta_raised(UUID, INTEGER);
CREATE OR REPLACE FUNCTION increment_meta_raised(p_meta_id UUID, p_amount INTEGER)
RETURNS void AS $$
  UPDATE public.metas SET raised_cents = raised_cents + p_amount WHERE id = p_meta_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Update deal payment status
DROP FUNCTION IF EXISTS update_deal_payment_status(TEXT, TEXT);
CREATE OR REPLACE FUNCTION update_deal_payment_status(p_stripe_session_id TEXT, p_status TEXT)
RETURNS void AS $$
  UPDATE public.deal_payments SET status = p_status, paid_at = now() WHERE stripe_session_id = p_stripe_session_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- ===== DONE =====
