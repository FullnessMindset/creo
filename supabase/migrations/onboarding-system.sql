-- CREO Onboarding System Migration
-- Verification events tracking, terms acceptance, onboarding state

-- ===== VERIFICATION EVENTS =====
CREATE TABLE IF NOT EXISTS public.verification_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','started','submitted','verified','rejected','needs_review','expired','cancelled')),
  stripe_session_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_events_user
  ON public.verification_events (user_id, created_at DESC);

ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own verification events"
    ON public.verification_events FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role inserts verification events"
    ON public.verification_events FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== TERMS ACCEPTANCE =====
CREATE TABLE IF NOT EXISTS public.terms_acceptance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('terms','privacy','community_guidelines','stripe_acknowledgment')),
  policy_version TEXT NOT NULL DEFAULT '1.0',
  accepted_at TIMESTAMPTZ DEFAULT now(),
  app_version TEXT DEFAULT '1.0',
  UNIQUE(user_id, policy_type, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptance_user
  ON public.terms_acceptance (user_id);

ALTER TABLE public.terms_acceptance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own terms acceptance"
    ON public.terms_acceptance FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users insert terms acceptance"
    ON public.terms_acceptance FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== PROFILE COLUMNS FOR ONBOARDING =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_attempts INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_verification_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- ===== NOTIFICATION CATEGORIES =====
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent'));
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url TEXT;

-- ===== ADMIN NOTIFICATION PREFERENCES =====
-- Admin gets notified of important platform events
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON public.admin_notifications (is_read, created_at DESC)
  WHERE is_read = false;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin reads admin notifications"
    ON public.admin_notifications FOR SELECT
    USING (
      auth.email() = 'fullnessmindset@gmail.com'
      OR auth.uid() IN (SELECT id FROM profiles WHERE account_type = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role inserts admin notifications"
    ON public.admin_notifications FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin updates admin notifications"
    ON public.admin_notifications FOR UPDATE
    USING (
      auth.email() = 'fullnessmindset@gmail.com'
      OR auth.uid() IN (SELECT id FROM profiles WHERE account_type = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== FUNCTION: Record verification event + notification =====
CREATE OR REPLACE FUNCTION record_verification_event(
  p_user_id UUID,
  p_status TEXT,
  p_stripe_session_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_category TEXT := 'verification';
BEGIN
  INSERT INTO public.verification_events (user_id, status, stripe_session_id, metadata)
  VALUES (p_user_id, p_status, p_stripe_session_id, p_metadata);

  UPDATE public.profiles SET
    verification_status = p_status,
    last_verification_at = now(),
    verification_attempts = CASE WHEN p_status = 'started' THEN verification_attempts + 1 ELSE verification_attempts END,
    identity_verified = CASE WHEN p_status = 'verified' THEN true ELSE identity_verified END
  WHERE id = p_user_id;

  CASE p_status
    WHEN 'started' THEN v_title := 'Verificación Iniciada'; v_body := 'Tu verificación de identidad ha comenzado. Completa el proceso para activar tu cuenta.';
    WHEN 'submitted' THEN v_title := 'Verificación Enviada'; v_body := 'Tu documentación ha sido enviada. Estamos verificando tu identidad.';
    WHEN 'verified' THEN v_title := '¡Identidad Verificada!'; v_body := '¡Felicidades! Tu Creo ID ha sido verificado. Ya puedes recibir pagos y publicar contenido.';
    WHEN 'rejected' THEN v_title := 'Verificación Rechazada'; v_body := 'Tu verificación no pudo completarse. Puedes intentarlo de nuevo desde tu panel.';
    WHEN 'expired' THEN v_title := 'Verificación Expirada'; v_body := 'Tu sesión de verificación ha expirado. Inicia el proceso nuevamente.';
    WHEN 'cancelled' THEN v_title := 'Verificación Cancelada'; v_body := 'La verificación fue cancelada. Puedes reintentarlo cuando estés listo.';
    ELSE v_title := 'Actualización de Verificación'; v_body := 'El estado de tu verificación ha cambiado a: ' || p_status;
  END CASE;

  INSERT INTO public.notifications (user_id, type, title, body, category, priority, icon, link)
  VALUES (p_user_id, 'approval', v_title, v_body, v_category,
    CASE WHEN p_status = 'verified' THEN 'high' WHEN p_status = 'rejected' THEN 'urgent' ELSE 'normal' END,
    CASE WHEN p_status = 'verified' THEN '✅' WHEN p_status = 'rejected' THEN '❌' ELSE '🔄' END,
    'index.html?panel=1'
  );

  INSERT INTO public.admin_notifications (event_type, user_id, details)
  VALUES ('verification_' || p_status, p_user_id, jsonb_build_object(
    'status', p_status,
    'stripe_session_id', p_stripe_session_id
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== FUNCTION: Record terms acceptance =====
CREATE OR REPLACE FUNCTION accept_platform_terms(
  p_policy_version TEXT DEFAULT '1.0',
  p_app_version TEXT DEFAULT '1.0'
) RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  INSERT INTO public.terms_acceptance (user_id, policy_type, policy_version, app_version)
  VALUES
    (v_user_id, 'terms', p_policy_version, p_app_version),
    (v_user_id, 'privacy', p_policy_version, p_app_version),
    (v_user_id, 'community_guidelines', p_policy_version, p_app_version),
    (v_user_id, 'stripe_acknowledgment', p_policy_version, p_app_version)
  ON CONFLICT (user_id, policy_type, policy_version) DO NOTHING;

  UPDATE public.profiles SET
    terms_accepted_at = now(),
    onboarding_completed = true,
    onboarding_completed_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.notifications (user_id, type, title, body, category, icon)
  VALUES (v_user_id, 'approval', '¡Bienvenido a CREO!', 'Has aceptado los términos y estás listo para comenzar tu camino como creador.', 'general', '🎉');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== FUNCTION: Create platform notification =====
CREATE OR REPLACE FUNCTION create_platform_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_category TEXT DEFAULT 'general',
  p_priority TEXT DEFAULT 'normal',
  p_icon TEXT DEFAULT '🔔',
  p_link TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, category, priority, icon, link)
  VALUES (p_user_id, p_type, p_title, p_body, p_category, p_priority, p_icon, p_link);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
