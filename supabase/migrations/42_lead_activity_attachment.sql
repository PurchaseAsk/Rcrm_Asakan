-- Add attachment_url to lead_activities for note image uploads
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS attachment_url text;

-- Storage bucket for lead note attachments (public read, auth write)
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-attachments', 'lead-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "auth upload lead attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lead-attachments');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "auth delete lead attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lead-attachments');

-- Public read
CREATE POLICY "public read lead attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'lead-attachments');
