-- Add parent_id to cfh_subcategories for nested categories
-- and created_by alias (same as creator_id but exposed for frontend convenience)
ALTER TABLE public.cfh_subcategories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.cfh_subcategories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cfh_subcategories_parent ON public.cfh_subcategories(parent_id);

-- Drop the old unique constraint and add one that includes parent_id
ALTER TABLE public.cfh_subcategories DROP CONSTRAINT IF EXISTS cfh_subcategories_creator_id_category_name_key;
ALTER TABLE public.cfh_subcategories ADD CONSTRAINT cfh_subcategories_unique_name UNIQUE(creator_id, category, name, parent_id);
