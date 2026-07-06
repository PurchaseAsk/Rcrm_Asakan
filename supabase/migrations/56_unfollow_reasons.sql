-- Unfollow reasons: configurable per pipeline
create table if not exists unfollow_reasons (
  id           uuid primary key default gen_random_uuid(),
  pipeline_id  uuid references pipelines(id) on delete cascade,
  name         text not null,
  position     int  not null default 0,
  is_active    bool not null default true,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

alter table unfollow_reasons enable row level security;

-- Everyone in the pipeline can read reasons
create policy "read unfollow_reasons" on unfollow_reasons
  for select using (true);

-- admin / team_lead can manage
create policy "manage unfollow_reasons" on unfollow_reasons
  for all using (my_role() in ('admin', 'team_lead'));

-- Track which reason was chosen when a lead is unfollowed
alter table leads
  add column if not exists unfollow_reason_id uuid references unfollow_reasons(id) on delete set null;
