-- Migration 45: Enable pg_net + daily recall summary via pg_cron
-- Replaces unreliable Vercel cron with a PostgreSQL-native approach.

-- Enable pg_net for HTTP requests from PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Secure config table (no public access, service_role only)
CREATE TABLE IF NOT EXISTS app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
REVOKE ALL ON app_config FROM PUBLIC;
GRANT ALL  ON app_config TO service_role;

-- Store Telegram credentials
INSERT INTO app_config (key, value) VALUES
  ('telegram_bot_token', '8473181692:AAEa3mJqypXAharUEJtSdOj9u_Y8YJdhpkY'),
  ('telegram_chat_id',   '-5149941541')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Helper: send Telegram message via pg_net (async, fire-and-forget)
CREATE OR REPLACE FUNCTION send_telegram_via_net(p_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token   text;
  v_chat_id text;
BEGIN
  SELECT value INTO v_token   FROM app_config WHERE key = 'telegram_bot_token';
  SELECT value INTO v_chat_id FROM app_config WHERE key = 'telegram_chat_id';
  IF v_token IS NULL OR v_chat_id IS NULL THEN
    RAISE WARNING '[send_telegram_via_net] missing credentials';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url  := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := json_build_object(
      'chat_id',    v_chat_id::bigint,
      'text',       p_text,
      'parse_mode', 'HTML'
    )::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[send_telegram_via_net] error: %', SQLERRM;
END;
$$;

REVOKE ALL  ON FUNCTION send_telegram_via_net(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION send_telegram_via_net(text) TO service_role;

-- Daily recall summary (called by pg_cron at 10:00 UTC = 17:00 BKK)
CREATE OR REPLACE FUNCTION daily_recall_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - interval '24 hours';
  v_total int;
  v_lines text := '';
  v_rec   record;
  v_msg   text;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM lead_activities
  WHERE type = 'recalled'
    AND created_at >= v_since;

  IF v_total = 0 THEN
    PERFORM send_telegram_via_net(
      E'📊 <b>สรุป Recall วันนี้</b>\n✅ ไม่มีลีดถูกดึงกลับวันนี้'
    );
    RETURN;
  END IF;

  FOR v_rec IN
    SELECT
      coalesce(
        (regexp_match(content, 'ดึงลีดกลับเข้าส่วนกลางจาก (.+?) หลังอยู่ใน stage'))[1],
        'ไม่ระบุ'
      ) AS staff_name,
      COUNT(*) AS cnt
    FROM lead_activities
    WHERE type = 'recalled'
      AND created_at >= v_since
    GROUP BY 1
    ORDER BY 2 DESC
  LOOP
    v_lines := v_lines || E'\n• ' || v_rec.staff_name || ': ' || v_rec.cnt || ' lead' ||
               CASE WHEN v_rec.cnt > 1 THEN 's' ELSE '' END;
  END LOOP;

  v_msg := '📊 <b>สรุป Recall วันนี้ (' || v_total || ' leads)</b>' || v_lines;
  PERFORM send_telegram_via_net(v_msg);
END;
$$;

REVOKE ALL  ON FUNCTION daily_recall_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION daily_recall_summary() TO service_role;

-- Schedule daily summary at 10:00 UTC (17:00 BKK) via pg_cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-recall-summary') THEN
    PERFORM cron.unschedule('daily-recall-summary');
  END IF;
END$$;

SELECT cron.schedule(
  'daily-recall-summary',
  '0 10 * * *',
  $$SELECT daily_recall_summary();$$
);
