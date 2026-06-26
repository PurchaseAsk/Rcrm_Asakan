-- Migration 32: Run recall automatically.
-- Runs hourly. The function itself decides which leads are due.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   cron.job
    WHERE  jobname = 'recall-inactive-leads'
  ) THEN
    PERFORM cron.unschedule('recall-inactive-leads');
  END IF;
END
$$;

SELECT cron.schedule(
  'recall-inactive-leads',
  '0 * * * *',
  $$SELECT public.recall_inactive_leads();$$
);
