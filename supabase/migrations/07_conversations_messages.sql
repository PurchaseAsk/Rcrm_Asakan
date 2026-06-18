-- conversations: one per (facebook_page, sender)
CREATE TABLE IF NOT EXISTS public.conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         uuid NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  sender_psid     text NOT NULL,
  sender_name     text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, sender_psid)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content         text NOT NULL,
  fb_message_id   text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_last ON public.conversations(last_message_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_conversations" ON public.conversations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_messages" ON public.messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
