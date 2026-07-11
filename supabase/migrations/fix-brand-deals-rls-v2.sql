-- Fix Brand Deals RLS v2: Allow admin to also insert/update/delete brand deals
ALTER TABLE public.brand_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_deals_read" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_insert" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_update" ON public.brand_deals;
DROP POLICY IF EXISTS "brand_deals_delete" ON public.brand_deals;

CREATE POLICY "brand_deals_read" ON public.brand_deals FOR SELECT USING (true);

CREATE POLICY "brand_deals_insert" ON public.brand_deals FOR INSERT WITH CHECK (
  auth.uid() = brand_id
  OR auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);

CREATE POLICY "brand_deals_update" ON public.brand_deals FOR UPDATE USING (
  auth.uid() = brand_id
  OR auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);

CREATE POLICY "brand_deals_delete" ON public.brand_deals FOR DELETE USING (
  auth.uid() = brand_id
  OR auth.email() = 'fullnessmindset@gmail.com'
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE account_type = 'admin')
);
