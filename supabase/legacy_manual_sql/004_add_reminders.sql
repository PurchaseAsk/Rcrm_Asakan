-- ============================================================
-- ADD: lead_reminders table
-- รันใน Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists lead_reminders (
  id          uuid        primary key default gen_random_uuid(),
  lead_id     uuid        not null references leads(id) on delete cascade,
  remind_at   timestamptz not null,
  note        text,
  created_by  uuid        references profiles(id) on delete set null,
  is_done     boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index lead_reminders_lead_idx on lead_reminders(lead_id);
create index lead_reminders_due_idx  on lead_reminders(remind_at) where is_done = false;

alter table lead_reminders enable row level security;

create policy "reminders: all via lead"
  on lead_reminders for all
  using (lead_id in (select id from leads));

-- เพิ่ม phone/email และ value ให้ leads ถ้ายังไม่มี
alter table leads add column if not exists value numeric(12,2) not null default 0;
