-- Prevent recursive RLS evaluation on team_members.
-- The previous management policy queried team_members from inside a
-- team_members policy, which can recurse indefinitely when the API loads teams.

create or replace function my_led_team_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select team_id
  from team_members
  where user_id = auth.uid()
    and is_lead = true
$$;

drop policy if exists "team_members: manage by lead or admin" on team_members;
drop policy if exists "team_members: read all" on team_members;
drop policy if exists "team_members: insert admin or team_lead" on team_members;
drop policy if exists "team_members: update admin or team lead" on team_members;
drop policy if exists "team_members: delete admin or team lead" on team_members;

create policy "team_members: read all"
  on team_members for select
  using (true);

create policy "team_members: insert admin or team_lead"
  on team_members for insert
  with check (
    my_role() in ('admin', 'team_lead')
    or team_id in (select my_led_team_ids())
  );

create policy "team_members: update admin or team lead"
  on team_members for update
  using (
    my_role() = 'admin'
    or team_id in (select my_led_team_ids())
  )
  with check (
    my_role() = 'admin'
    or team_id in (select my_led_team_ids())
  );

create policy "team_members: delete admin or team lead"
  on team_members for delete
  using (
    my_role() = 'admin'
    or team_id in (select my_led_team_ids())
  );
