-- ============================================================
-- ADD: Pipelines feature
-- รันใน Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Pipelines table
create table pipelines (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  color       text        not null default '#6366f1',
  is_active   boolean     not null default true,
  created_by  uuid        references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 2. Pipeline ↔ Team assignment
create table pipeline_teams (
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  team_id     uuid not null references teams(id)     on delete cascade,
  primary key (pipeline_id, team_id)
);

-- 3. Pipeline ↔ User (รายบุคคล)
create table pipeline_users (
  pipeline_id uuid not null references pipelines(id)  on delete cascade,
  user_id     uuid not null references profiles(id)   on delete cascade,
  primary key (pipeline_id, user_id)
);

-- 4. funnel_stages: เพิ่ม pipeline_id (null = global/ใช้ร่วมกัน)
alter table funnel_stages
  add column if not exists pipeline_id uuid references pipelines(id) on delete cascade;

-- 5. leads: เพิ่ม pipeline_id
alter table leads
  add column if not exists pipeline_id uuid references pipelines(id) on delete set null;

create index if not exists leads_pipeline_idx         on leads(pipeline_id);
create index if not exists funnel_stages_pipeline_idx on funnel_stages(pipeline_id);

-- 6. RLS
alter table pipelines      enable row level security;
alter table pipeline_teams enable row level security;
alter table pipeline_users enable row level security;

create policy "pipelines: read all"
  on pipelines for select using (true);
create policy "pipelines: write admin/lead"
  on pipelines for all using (my_role() in ('admin','team_lead'));

create policy "pipeline_teams: read all"
  on pipeline_teams for select using (true);
create policy "pipeline_teams: write admin/lead"
  on pipeline_teams for all using (my_role() in ('admin','team_lead'));

create policy "pipeline_users: read all"
  on pipeline_users for select using (true);
create policy "pipeline_users: write admin/lead"
  on pipeline_users for all using (my_role() in ('admin','team_lead'));

-- ============================================================
-- DONE — ตอนนี้สร้าง pipeline ได้จาก UI แล้ว
-- ============================================================
