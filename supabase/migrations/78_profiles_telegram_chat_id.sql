-- Add telegram_chat_id to profiles for reminder notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT NULL;
