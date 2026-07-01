-- Track how many times a lead has submitted a Facebook Lead Form.
-- Default 1 (first submission created the lead). Incremented on each duplicate.
-- Sum across all leads = total Facebook conversions, should match Ads Manager count.
alter table leads add column if not exists facebook_conversions int not null default 1;

-- RPC called by the webhook server to safely increment the counter
create or replace function increment_lead_conversions(p_lead_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update leads
  set facebook_conversions = facebook_conversions + 1
  where id = p_lead_id;
$$;
