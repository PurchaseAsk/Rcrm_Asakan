-- Migration 52: Create global coupon workflow tags for auto-tagging in chat
-- "รอส่งคูปอง" is auto-applied when customer sends a phone number in Messenger.
-- "ส่งคูปองแล้ว" is applied manually by admin after sending the coupon.
INSERT INTO public.tags (name, color, type, created_by)
VALUES
  ('รอส่งคูปอง',  '#f59e0b', 'global', NULL),
  ('ส่งคูปองแล้ว', '#10b981', 'global', NULL)
ON CONFLICT DO NOTHING;
