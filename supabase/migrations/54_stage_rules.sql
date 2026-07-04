CREATE TABLE public.stage_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id    uuid NOT NULL UNIQUE REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  questions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stage_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage_rules: select" ON public.stage_rules
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stage_rules: write" ON public.stage_rules
  FOR ALL USING (my_role() IN ('admin', 'team_lead'));
