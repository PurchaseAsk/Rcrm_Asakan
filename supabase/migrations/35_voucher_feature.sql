-- Migration 35: Voucher feature
-- sales_suffix on profiles: 2-4 char code sent to GAS as "sales" field
-- is_voucher_stage on funnel_stages: marks stage that triggers voucher modal
-- gas_webhook_url / gas_project_key on pipelines: GAS Web App config per pipeline

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sales_suffix text;

ALTER TABLE funnel_stages
  ADD COLUMN IF NOT EXISTS is_voucher_stage boolean NOT NULL DEFAULT false;

ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS gas_webhook_url text,
  ADD COLUMN IF NOT EXISTS gas_project_key text;
