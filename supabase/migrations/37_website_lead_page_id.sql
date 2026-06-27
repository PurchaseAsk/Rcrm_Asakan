-- Migration 37: Link website_lead_rules to a facebook_pages row (virtual page).
-- When a website lead comes in, it gets page_id from the rule so that
-- distribute_lead() and the normal RLS update path both work.

ALTER TABLE public.website_lead_rules
  ADD COLUMN IF NOT EXISTS facebook_page_id uuid
    REFERENCES public.facebook_pages(id) ON DELETE SET NULL;
