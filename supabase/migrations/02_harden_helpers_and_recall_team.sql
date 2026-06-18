-- Harden SECURITY DEFINER helpers and align recall_to values with the UI.

create or replace function my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function my_team_member_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select distinct tm2.user_id
  from team_members tm1
  join team_members tm2 on tm2.team_id = tm1.team_id
  where tm1.user_id = auth.uid()
$$;

alter table auto_recall_rules
  drop constraint if exists auto_recall_rules_recall_to_check;

alter table auto_recall_rules
  add constraint auto_recall_rules_recall_to_check
  check (recall_to in ('pool', 'admin', 'team'));
