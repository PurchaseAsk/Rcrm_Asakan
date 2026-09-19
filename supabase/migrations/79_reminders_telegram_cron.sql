-- Migration 79: Telegram reminder notifications per Sales via pg_cron
-- Sends individual Telegram messages for due lead_reminders

-- Helper: send Telegram to a specific chat_id (per-person)
CREATE OR REPLACE FUNCTION send_telegram_to_chat(p_chat_id text, p_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  SELECT value INTO v_token FROM app_config WHERE key = 'telegram_bot_token';
  IF v_token IS NULL THEN
    RAISE WARNING '[send_telegram_to_chat] missing telegram_bot_token';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url  := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := json_build_object(
      'chat_id',    p_chat_id,
      'text',       p_text,
      'parse_mode', 'HTML'
    )::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[send_telegram_to_chat] error: %', SQLERRM;
END;
$$;

REVOKE ALL   ON FUNCTION send_telegram_to_chat(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION send_telegram_to_chat(text, text) TO service_role;

-- Main function: process all due reminders
CREATE OR REPLACE FUNCTION process_due_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_msg text;
  v_time text;
BEGIN
  FOR v_rec IN
    SELECT
      r.id              AS reminder_id,
      r.note,
      r.remind_at,
      l.customer_name,
      l.phone,
      p.telegram_chat_id
    FROM lead_reminders r
    JOIN leads          l ON l.id = r.lead_id
    LEFT JOIN profiles  p ON p.id = l.assigned_to
    WHERE r.is_done    = false
      AND r.remind_at <= now()
    ORDER BY r.remind_at
    LIMIT 200
  LOOP
    -- Mark done first to prevent duplicate sends on slow runs
    UPDATE lead_reminders SET is_done = true WHERE id = v_rec.reminder_id;

    -- Skip if no telegram_chat_id
    CONTINUE WHEN v_rec.telegram_chat_id IS NULL;

    v_time := to_char(v_rec.remind_at AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI');

    v_msg := '<b>🔔 แจ้งเตือนนัดหมาย</b>' || E'\n' ||
             '👤 ' || COALESCE(v_rec.customer_name, '(ไม่ระบุชื่อ)') || E'\n' ||
             '📞 ' || COALESCE(v_rec.phone, '-') || E'\n' ||
             CASE WHEN v_rec.note IS NOT NULL AND trim(v_rec.note) <> ''
               THEN '📝 ' || trim(v_rec.note) || E'\n'
               ELSE ''
             END ||
             '🕐 ' || v_time;

    PERFORM send_telegram_to_chat(v_rec.telegram_chat_id, v_msg);
  END LOOP;
END;
$$;

REVOKE ALL   ON FUNCTION process_due_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_due_reminders() TO service_role;

-- Schedule every minute via pg_cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-due-reminders') THEN
    PERFORM cron.unschedule('process-due-reminders');
  END IF;
END$$;

SELECT cron.schedule(
  'process-due-reminders',
  '* * * * *',
  $$SELECT process_due_reminders();$$
);
