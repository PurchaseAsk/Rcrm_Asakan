-- Migration 36: Fix leads UPDATE RLS for admin and team_lead.
-- Website leads have page_id = NULL, so existing policies that check
-- page_id IN (facebook_pages) silently fail for those rows.
-- Adding a permissive policy so admin/team_lead can update any lead.

CREATE POLICY "leads_admin_teamlead_update"
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING  (my_role() IN ('admin', 'team_lead'))
  WITH CHECK (my_role() IN ('admin', 'team_lead'));
