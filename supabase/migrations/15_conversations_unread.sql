-- Track when a conversation was last read (global, not per-user)
-- NULL = never read (unread), < last_message_at = has new messages (unread)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_read_at timestamptz;
