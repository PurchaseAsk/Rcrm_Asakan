-- ============================================================
-- RCRM — Full Schema Migration
-- วิธีใช้: รันทั้งหมดใน Supabase SQL Editor (Dashboard → SQL Editor)
-- ถ้ามี table เก่าอยู่แล้ว: รัน DROP section ก่อน แล้วค่อยรัน CREATE
-- ============================================================

-- ============================================================
-- SECTION 1: DROP EVERYTHING (รันก่อนถ้าต้องการ fresh start)
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user()        cascade;
drop function if exists distribute_lead(uuid)    cascade;
drop function if exists recall_inactive_leads()  cascade;
drop function if exists my_role()                cascade;
drop function if exists my_team_member_ids()     cascade;

drop table if exists lead_tags          cascade;
drop table if exists lead_activities    cascade;
drop table if exists leads              cascade;
drop table if exists auto_recall_rules  cascade;
drop table if exists distribution_rules cascade;
drop table if exists tags               cascade;
drop table if exists funnel_stages      cascade;
drop table if exists facebook_pages     cascade;
drop table if exists team_members       cascade;
drop table if exists teams              cascade;
drop table if exists profiles           cascade;

-- ============================================================
-- SECTION 2: CREATE TABLES
-- ============================================================

-- 2.1 Profiles (ต้อง reference auth.users)
create table profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text        not null,
  full_name   text,
  role        text        not null default 'staff'
                          check (role in ('admin','team_lead','staff')),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on column profiles.role is 'admin=เห็นทั้งหมด | team_lead=เห็นทีม | staff=เห็นของตัวเอง';

-- 2.2 Teams
create table teams (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  created_by  uuid        references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 2.3 Team Members
create table team_members (
  team_id    uuid    not null references teams(id)    on delete cascade,
  user_id    uuid    not null references profiles(id) on delete cascade,
  is_lead    boolean not null default false,
  joined_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- 2.4 Funnel Stages
create table funnel_stages (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  position    int         not null default 0,
  color       text        not null default '#6366f1',
  is_unfollow boolean     not null default false,
  created_at  timestamptz not null default now()
);
comment on column funnel_stages.is_unfollow is 'ถ้า true ลีดที่อยู่ขั้นตอนนี้ status จะเป็น unfollowed';

-- 2.5 Facebook Pages
create table facebook_pages (
  id          uuid        primary key default gen_random_uuid(),
  page_id     text        not null unique,
  name        text        not null,
  token       text,       -- Page Access Token (เก็บ encrypted ใน production)
  owner_id    uuid        references profiles(id) on delete set null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- 2.6 Leads
create table leads (
  id               uuid        primary key default gen_random_uuid(),
  customer_name    text        not null,
  facebook_id      text,
  phone            text,
  email            text,
  page_id          uuid        references facebook_pages(id) on delete set null,
  stage_id         uuid        references funnel_stages(id)  on delete set null,
  assigned_to      uuid        references profiles(id)        on delete set null,
  status           text        not null default 'active'
                               check (status in ('active','unfollowed')),
  source           text        default 'facebook',
  metadata         jsonb       not null default '{}',
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index leads_assigned_to_idx    on leads(assigned_to);
create index leads_stage_id_idx       on leads(stage_id);
create index leads_page_id_idx        on leads(page_id);
create index leads_status_idx         on leads(status);
create index leads_last_activity_idx  on leads(last_activity_at);
create index leads_created_at_idx     on leads(created_at desc);

-- 2.7 Lead Activities (Timeline)
create table lead_activities (
  id          uuid        primary key default gen_random_uuid(),
  lead_id     uuid        not null references leads(id) on delete cascade,
  type        text        not null default 'note'
                          check (type in ('note','stage_change','tag_add','tag_remove','assigned','recalled','created','unfollow')),
  content     text,
  created_by  uuid        references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index lead_activities_lead_id_idx on lead_activities(lead_id, created_at desc);

-- 2.8 Tags
create table tags (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  color       text        not null default '#8b5cf6',
  type        text        not null default 'custom'
                          check (type in ('system','custom')),
  created_by  uuid        references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (name, created_by)   -- ชื่อซ้ำได้ถ้าคนละ owner
);

-- 2.9 Lead ↔ Tag junction
create table lead_tags (
  lead_id     uuid not null references leads(id) on delete cascade,
  tag_id      uuid not null references tags(id)  on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (lead_id, tag_id)
);

-- 2.10 Distribution Rules
-- page_id → (team_id หรือ config.user_ids) ด้วย method
-- config JSONB:
--   round_robin: { "last_index": N }
--   individual:  { "user_ids": ["uuid1","uuid2",...], "last_index": N }
create table distribution_rules (
  id          uuid        primary key default gen_random_uuid(),
  page_id     uuid        references facebook_pages(id) on delete cascade,
  team_id     uuid        references teams(id) on delete set null,
  method      text        not null default 'round_robin'
                          check (method in ('round_robin','random','weighted')),
  config      jsonb       not null default '{}',
  is_active   boolean     not null default true,
  priority    int         not null default 0,  -- สูงกว่า = ใช้ก่อน
  created_at  timestamptz not null default now()
);
comment on column distribution_rules.config is
  'round_robin: {"last_index":N} | individual: {"user_ids":["uuid",...], "last_index":N}';

-- 2.11 Auto Recall Rules
create table auto_recall_rules (
  id            uuid        primary key default gen_random_uuid(),
  stage_id      uuid        not null references funnel_stages(id) on delete cascade,
  inactive_days int         not null default 3 check (inactive_days > 0),
  recall_to     text        not null default 'pool'
                            check (recall_to in ('pool','admin')),
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  unique (stage_id)   -- 1 rule ต่อ stage
);

-- ============================================================
-- SECTION 3: SEED DATA
-- ============================================================

insert into funnel_stages (name, position, color, is_unfollow) values
  ('ใหม่',          1, '#8b5cf6', false),
  ('ทักแล้ว',       2, '#06b6d4', false),
  ('นัดหมาย',       3, '#f59e0b', false),
  ('เสนอราคา',      4, '#f97316', false),
  ('ปิดการขาย',     5, '#22c55e', false),
  ('เลิกติดตาม',    6, '#94a3b8', true )
on conflict do nothing;

-- ============================================================
-- SECTION 4: HELPER FUNCTIONS
-- ============================================================

-- role ของ user ปัจจุบัน (ใช้ใน RLS)
create or replace function my_role()
returns text
language sql security definer stable
as $$
  select role from profiles where id = auth.uid()
$$;

-- IDs ของสมาชิกทีมเดียวกับ user ปัจจุบัน (ใช้ใน RLS)
create or replace function my_team_member_ids()
returns setof uuid
language sql security definer stable
as $$
  select distinct tm2.user_id
  from   team_members tm1
  join   team_members tm2 on tm2.team_id = tm1.team_id
  where  tm1.user_id = auth.uid()
$$;

-- ============================================================
-- SECTION 5: DISTRIBUTE LEAD FUNCTION
-- ใช้ distribution_rules จริง พร้อม round-robin state tracking
-- ============================================================

create or replace function distribute_lead(p_lead_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_page_id   uuid;
  v_rule      record;
  v_members   uuid[];
  v_last_idx  int;
  v_next_idx  int;
  v_assign    uuid;
begin
  -- 1. หา page_id ของ lead
  select page_id into v_page_id
  from   leads
  where  id = p_lead_id;

  if v_page_id is null then return; end if;

  -- 2. หา rule ที่ active สำหรับเพจนี้ (priority สูงสุดก่อน)
  select *
  into   v_rule
  from   distribution_rules
  where  page_id   = v_page_id
    and  is_active = true
  order  by priority desc, created_at asc
  limit  1;

  if not found then return; end if;   -- ไม่มี rule: ปล่อยเป็น pool

  -- 3. หา candidates
  if v_rule.config ? 'user_ids' then
    -- รายบุคคล
    select array_agg(u::uuid)
    into   v_members
    from   jsonb_array_elements_text(v_rule.config -> 'user_ids') u;
  elsif v_rule.team_id is not null then
    -- สมาชิกทีม
    select array_agg(user_id)
    into   v_members
    from   team_members
    where  team_id = v_rule.team_id;
  end if;

  if v_members is null or array_length(v_members, 1) = 0 then
    return;   -- ไม่มีคนรับ
  end if;

  -- 4. เลือก assignee
  if v_rule.method = 'round_robin' then
    v_last_idx := coalesce((v_rule.config ->> 'last_index')::int, -1);
    v_next_idx := (v_last_idx + 1) % array_length(v_members, 1);
    v_assign   := v_members[v_next_idx + 1];   -- Postgres array is 1-indexed
    -- บันทึก last_index ไว้ใน rule
    update distribution_rules
    set    config = jsonb_set(coalesce(config, '{}'), '{last_index}', to_jsonb(v_next_idx))
    where  id = v_rule.id;
  else
    -- random (default fallback)
    v_assign := v_members[1 + (floor(random() * array_length(v_members, 1)))::int];
  end if;

  -- 5. แจก lead
  update leads
  set    assigned_to      = v_assign,
         last_activity_at = now()
  where  id = p_lead_id;

  -- 6. Log
  insert into lead_activities (lead_id, type, content)
  values (p_lead_id, 'assigned',
          format('แจกอัตโนมัติ [%s] → %s', v_rule.method, v_assign::text));
end
$$;

-- ============================================================
-- SECTION 6: RECALL INACTIVE LEADS FUNCTION
-- อ่าน auto_recall_rules จริง ไม่ hardcode
-- ============================================================

create or replace function recall_inactive_leads()
returns int
language plpgsql security definer
as $$
declare
  v_rule    record;
  v_ids     uuid[];
  v_count   int := 0;
  v_tmp     int;
  v_lid     uuid;
begin
  for v_rule in
    select r.id, r.stage_id, r.inactive_days, r.recall_to
    from   auto_recall_rules r
    where  r.is_active = true
  loop
    -- หา leads ที่นิ่งในขั้นตอนนั้นเกิน inactive_days
    select array_agg(id)
    into   v_ids
    from   leads
    where  stage_id         = v_rule.stage_id
      and  status           = 'active'
      and  assigned_to      is not null
      and  last_activity_at < now() - (v_rule.inactive_days || ' days')::interval;

    continue when v_ids is null or array_length(v_ids, 1) = 0;

    -- เรียกคืนไปกองกลาง (pool)
    update leads
    set    assigned_to      = null,
           last_activity_at = now(),
           metadata         = jsonb_set(
                                coalesce(metadata, '{}'),
                                '{last_recalled_at}',
                                to_jsonb(now()::text)
                              )
    where  id = any(v_ids);

    -- Log แต่ละ lead
    foreach v_lid in array v_ids loop
      insert into lead_activities (lead_id, type, content)
      values (v_lid, 'recalled',
              format('เรียกคืนอัตโนมัติ: ไม่มีกิจกรรม %s วัน', v_rule.inactive_days));
    end loop;

    get diagnostics v_tmp = row_count;
    v_count := v_count + array_length(v_ids, 1);
  end loop;

  return v_count;
end
$$;

-- ============================================================
-- SECTION 7: TRIGGER — Auto-create profile on signup
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    'staff'
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    raise warning 'handle_new_user error: %', sqlerrm;
    return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- SECTION 8: ROW LEVEL SECURITY
-- ============================================================

alter table profiles         enable row level security;
alter table teams            enable row level security;
alter table team_members     enable row level security;
alter table funnel_stages    enable row level security;
alter table facebook_pages   enable row level security;
alter table leads            enable row level security;
alter table lead_activities  enable row level security;
alter table tags             enable row level security;
alter table lead_tags        enable row level security;
alter table distribution_rules  enable row level security;
alter table auto_recall_rules   enable row level security;

-- ─── profiles ───────────────────────────────────────────────

-- ทุกคนอ่านได้ (เพื่อแสดงชื่อ)
create policy "profiles: read all"
  on profiles for select using (true);

-- INSERT: เฉพาะของตัวเอง (ensureProfile ใช้ path นี้)
create policy "profiles: insert own"
  on profiles for insert
  with check (id = auth.uid());

-- แก้ได้เฉพาะของตัวเอง หรือ admin
create policy "profiles: update own or admin"
  on profiles for update
  using (id = auth.uid() or my_role() = 'admin');

-- ─── teams ──────────────────────────────────────────────────

create policy "teams: read all"
  on teams for select using (true);

create policy "teams: insert admin or team_lead"
  on teams for insert
  with check (my_role() in ('admin', 'team_lead'));

create policy "teams: delete admin"
  on teams for delete
  using (my_role() = 'admin' or created_by = auth.uid());

-- ─── team_members ───────────────────────────────────────────

create policy "team_members: read all"
  on team_members for select using (true);

create policy "team_members: manage by lead or admin"
  on team_members for all
  using (
    my_role() = 'admin'
    or exists (
      select 1 from team_members tm
      where tm.team_id  = team_members.team_id
        and tm.user_id  = auth.uid()
        and tm.is_lead  = true
    )
  );

-- ─── funnel_stages ──────────────────────────────────────────

create policy "stages: read all"
  on funnel_stages for select using (true);

create policy "stages: write admin or team_lead"
  on funnel_stages for all
  using (my_role() in ('admin','team_lead'));

-- ─── facebook_pages ─────────────────────────────────────────

create policy "pages: read all"
  on facebook_pages for select using (true);

create policy "pages: write admin"
  on facebook_pages for all
  using (my_role() = 'admin' or owner_id = auth.uid());

-- ─── leads ──────────────────────────────────────────────────
-- Visibility rules:
--   admin     → เห็นทั้งหมด
--   team_lead → เห็นลีดของสมาชิกทีมเดียวกัน + pool (assigned_to IS NULL)
--   staff     → เห็นเฉพาะลีดของตัวเอง + pool

create policy "leads: select"
  on leads for select
  using (
    my_role() = 'admin'
    or assigned_to is null                          -- pool: ทุกคนเห็น
    or assigned_to = auth.uid()                     -- ของตัวเอง
    or (                                            -- team_lead เห็นทีม
      my_role() = 'team_lead'
      and assigned_to in (select my_team_member_ids())
    )
  );

create policy "leads: insert"
  on leads for insert
  with check (true);   -- webhook/service role insert

create policy "leads: update"
  on leads for update
  using (
    my_role() = 'admin'
    or assigned_to = auth.uid()
    or assigned_to is null   -- pool lead: ใครก็รับได้
    or (my_role() = 'team_lead' and assigned_to in (select my_team_member_ids()))
  );

create policy "leads: delete admin"
  on leads for delete
  using (my_role() = 'admin');

-- ─── lead_activities ────────────────────────────────────────

create policy "activities: select via lead"
  on lead_activities for select
  using (lead_id in (select id from leads));   -- ใช้ leads policy

create policy "activities: insert"
  on lead_activities for insert
  with check (true);

-- ─── tags ───────────────────────────────────────────────────
-- system tag: ทุกคนเห็น
-- custom tag: เห็นเฉพาะเจ้าของ (admin เห็นทั้งหมด)

create policy "tags: select"
  on tags for select
  using (
    type = 'system'
    or created_by = auth.uid()
    or my_role() = 'admin'
  );

create policy "tags: insert"
  on tags for insert
  with check (created_by = auth.uid());

create policy "tags: update own or admin"
  on tags for update
  using (created_by = auth.uid() or my_role() = 'admin');

create policy "tags: delete own or admin"
  on tags for delete
  using (created_by = auth.uid() or my_role() = 'admin');

-- ─── lead_tags ───────────────────────────────────────────────

create policy "lead_tags: all via lead"
  on lead_tags for all
  using (lead_id in (select id from leads));

-- ─── distribution_rules ──────────────────────────────────────

create policy "dist_rules: read all"
  on distribution_rules for select using (true);

create policy "dist_rules: write admin or team_lead"
  on distribution_rules for all
  using (my_role() in ('admin','team_lead'));

-- ─── auto_recall_rules ───────────────────────────────────────

create policy "recall_rules: read all"
  on auto_recall_rules for select using (true);

create policy "recall_rules: write admin or team_lead"
  on auto_recall_rules for all
  using (my_role() in ('admin','team_lead'));

-- ============================================================
-- DONE ✓
-- หลังรันเสร็จ:
-- 1. ไป Authentication → Email → เปิด Enable Magic Link
-- 2. ตั้ง Site URL ใน Authentication → URL Configuration
-- 3. ใส่ Supabase URL + Anon Key ในหน้า webapp
-- ============================================================
