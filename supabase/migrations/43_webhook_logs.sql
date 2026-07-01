-- Persistent log of every leadgen webhook event received from Facebook.
-- This survives Vercel's 1-hour log retention so we can audit missing leads.
create table if not exists webhook_logs (
  id           bigserial primary key,
  received_at  timestamptz not null default now(),
  event_type   text        not null,  -- 'leadgen' | 'leadgen_skipped' | 'leadgen_error' | 'leadgen_merged'
  fb_page_id   text,
  leadgen_id   text,
  lead_id      uuid,                  -- set when a new lead row was created
  phone        text,
  name         text,
  detail       jsonb                  -- raw error, Graph API response, dedup info, etc.
);

-- Only admins (service role) can read these; no public access needed
alter table webhook_logs enable row level security;
create policy "service role only" on webhook_logs using (false);

-- Index for querying by time and leadgen_id
create index on webhook_logs (received_at desc);
create index on webhook_logs (leadgen_id);
