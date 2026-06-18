-- page_teams: which teams can see which page's inbox conversations
-- If a page has NO rows here → visible to everyone (open access)
-- If a page has rows → only those teams (+ admin) can see it
CREATE TABLE IF NOT EXISTS public.page_teams (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  UNIQUE (page_id, team_id)
);

ALTER TABLE public.page_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_page_teams" ON public.page_teams
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
