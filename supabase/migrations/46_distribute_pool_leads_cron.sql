-- Migration 46: Auto-distribute pool leads every 30 minutes via pg_cron
-- Picks up leads with assigned_to IS NULL and redistributes via distribute_lead().

CREATE OR REPLACE FUNCTION distribute_pool_leads()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lid   uuid;
  v_count int := 0;
BEGIN
  FOR v_lid IN
    SELECT l.id
    FROM   leads l
    WHERE  l.status      = 'active'
      AND  l.assigned_to IS NULL
      -- only distribute if a rule exists for this page
      AND  EXISTS (
        SELECT 1 FROM distribution_rules dr
        WHERE  dr.page_id   = l.page_id
          AND  dr.is_active = true
      )
    ORDER BY l.last_activity_at ASC   -- oldest-waiting first
  LOOP
    PERFORM distribute_lead(v_lid);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL  ON FUNCTION distribute_pool_leads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION distribute_pool_leads() TO service_role;

-- Schedule every 30 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'distribute-pool-leads') THEN
    PERFORM cron.unschedule('distribute-pool-leads');
  END IF;
END$$;

SELECT cron.schedule(
  'distribute-pool-leads',
  '*/30 * * * *',
  $$SELECT distribute_pool_leads();$$
);
