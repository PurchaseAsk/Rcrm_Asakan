-- Push subscriptions: one per user per device/browser
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth_key   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_push_subs" ON push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow service role to read all subscriptions (for sending pushes)
CREATE POLICY "service_role_read_push_subs" ON push_subscriptions
  FOR SELECT TO service_role USING (true);

CREATE POLICY "service_role_delete_push_subs" ON push_subscriptions
  FOR DELETE TO service_role USING (true);

-- Debounce: track last time we pushed for this conversation
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;
