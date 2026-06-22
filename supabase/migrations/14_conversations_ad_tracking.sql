-- Add ad source tracking to conversations
-- Populated when a user clicks a Click-to-Messenger ad (referral object in webhook)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ad_id   text;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ad_name text;
