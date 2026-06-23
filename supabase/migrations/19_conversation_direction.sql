-- Track whether the last message in a conversation was inbound or outbound.
-- 'inbound'  = customer sent the last message (needs a reply)
-- 'outbound' = page/agent sent the last message (already replied)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_direction text
    CHECK (last_message_direction IN ('inbound', 'outbound'));
