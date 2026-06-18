-- Allow messages to carry image/file attachments
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_url  text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_type text; -- 'image' | 'video' | 'file'

-- Storage bucket for chat attachments (public read, auth upload)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY IF NOT EXISTS "chat_attach_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY IF NOT EXISTS "chat_attach_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-attachments');
