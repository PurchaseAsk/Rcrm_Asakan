-- Add facebook_lead_id for deduplicating lead form submissions
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS facebook_lead_id text;

CREATE UNIQUE INDEX IF NOT EXISTS leads_facebook_lead_id_idx
  ON public.leads (facebook_lead_id)
  WHERE facebook_lead_id IS NOT NULL;
