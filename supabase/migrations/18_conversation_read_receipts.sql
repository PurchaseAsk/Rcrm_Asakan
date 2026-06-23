-- customer_read_at: timestamp when customer last read our outbound messages
--   set by message_reads webhook event (watermark)
-- last_message_text: preview text of the most recent message (any direction)
--   set on every inbound/outbound message upsert

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS customer_read_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_text text;
