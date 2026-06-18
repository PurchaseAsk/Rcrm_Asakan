-- ============================================================
-- ADD: pipeline_id to distribution_rules
-- กฎกระจายลีดสามารถระบุได้ว่าจะส่งลีดเข้า Pipeline ไหน
-- รันใน Supabase Dashboard → SQL Editor
-- ============================================================

alter table distribution_rules
  add column if not exists pipeline_id uuid references pipelines(id) on delete set null;

create index if not exists dist_rules_pipeline_idx on distribution_rules(pipeline_id);

-- ============================================================
-- DONE — ตอนนี้กฎกระจายลีดสามารถกำหนด Pipeline ปลายทางได้แล้ว
-- ============================================================
