-- Migration 39: Store quoted/replied message references for Facebook chat.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
    REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON public.messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
