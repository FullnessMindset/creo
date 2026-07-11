-- Mecenas Settings — Run in Supabase SQL Editor
-- Stores per-creator customization for the 3 Mecenas payment sections
-- Structure: { tip: { title, description, image_url, video_url, button_color, card_color }, meta: { ... }, subscription: { ... } }

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mecenas_settings JSONB DEFAULT '{}';
