-- Profile Layout & Extended Theme — stores section order, visibility, and full theme customization
-- All data is stored as JSONB columns on profiles to avoid extra joins

-- Section layout: order + visibility for each profile section
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_layout JSONB DEFAULT '{
  "sections": [
    {"id": "cover", "visible": true, "order": 0},
    {"id": "header", "visible": true, "order": 1},
    {"id": "story", "visible": true, "order": 2},
    {"id": "creo-en-ellos", "visible": true, "order": 3},
    {"id": "metas", "visible": true, "order": 4},
    {"id": "completed-metas", "visible": true, "order": 5},
    {"id": "posts", "visible": true, "order": 6},
    {"id": "business", "visible": true, "order": 7},
    {"id": "payments", "visible": true, "order": 8}
  ],
  "profileImage": {"size": "md", "shape": "round"},
  "banner": {"type": "gradient", "value": ""},
  "cardStyle": {"radius": "xl", "shadow": "lg", "glass": true, "border": false},
  "buttonStyle": {"shape": "rounded", "shadow": false, "animation": "none"},
  "galleryLayout": "grid"
}'::jsonb;

-- Extended theme colors beyond profile_colors
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_theme JSONB DEFAULT '{}'::jsonb;

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_profiles_profile_layout ON public.profiles USING gin (profile_layout);
CREATE INDEX IF NOT EXISTS idx_profiles_profile_theme ON public.profiles USING gin (profile_theme);
