-- Add is_auto_reply flag to messages so the trigger can skip direction update
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_auto_reply boolean NOT NULL DEFAULT false;

-- Update trigger: auto-replies only bump last_message_at,
-- NOT last_message_direction or last_message_text (Sales must still respond)
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_auto_reply THEN
    UPDATE conversations SET
      last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  ELSE
    UPDATE conversations SET
      last_message_text      = NEW.content,
      last_message_direction = NEW.direction,
      last_message_at        = NEW.created_at
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;
