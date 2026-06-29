-- Migration 41: Manager-created team reminders shown to every user until deleted.

CREATE TABLE IF NOT EXISTS public.team_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_reminders_created_at
  ON public.team_reminders(created_at DESC);

ALTER TABLE public.team_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_reminders_read_all" ON public.team_reminders;
DROP POLICY IF EXISTS "team_reminders_manage_managers" ON public.team_reminders;

CREATE POLICY "team_reminders_read_all"
  ON public.team_reminders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "team_reminders_manage_managers"
  ON public.team_reminders
  FOR ALL
  TO authenticated
  USING (my_role() IN ('admin', 'team_lead'))
  WITH CHECK (my_role() IN ('admin', 'team_lead'));
