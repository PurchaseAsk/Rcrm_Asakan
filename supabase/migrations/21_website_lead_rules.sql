-- Website lead integration: settings + mapping rules
-- website_settings holds the shared webhook secret (one row)
-- website_lead_rules maps project_slug → pipeline + stage + assignee

CREATE TABLE IF NOT EXISTS public.website_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at    timestamptz DEFAULT now()
);

-- Ensure exactly one row exists
INSERT INTO public.website_settings DEFAULT VALUES
ON CONFLICT DO NOTHING;

-- RLS: only admins can read/update the secret
ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_website_settings"
  ON public.website_settings FOR SELECT
  USING (my_role() = 'admin');

CREATE POLICY "admin_update_website_settings"
  ON public.website_settings FOR UPDATE
  USING (my_role() = 'admin');

-- Project slug → pipeline routing rules
CREATE TABLE IF NOT EXISTS public.website_lead_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_slug text NOT NULL,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id    uuid REFERENCES public.funnel_stages(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.website_lead_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_website_lead_rules"
  ON public.website_lead_rules FOR ALL
  USING (my_role() = 'admin')
  WITH CHECK (my_role() = 'admin');

CREATE POLICY "staff_read_website_lead_rules"
  ON public.website_lead_rules FOR SELECT
  USING (true);
