-- page_auto_reply: auto-greeting settings per Facebook page
CREATE TABLE IF NOT EXISTS page_auto_reply (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id               uuid REFERENCES facebook_pages(id) ON DELETE CASCADE UNIQUE NOT NULL,
  is_active             boolean DEFAULT true NOT NULL,
  greeting_text         text,
  image_url             text,
  trigger_new_conv      boolean DEFAULT true NOT NULL,
  trigger_from_ad       boolean DEFAULT true NOT NULL,
  trigger_returning_days integer DEFAULT NULL,  -- null = disabled; integer = days threshold
  created_by            uuid REFERENCES profiles(id),
  updated_at            timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE page_auto_reply ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_lead_manage_auto_reply" ON page_auto_reply
  FOR ALL USING (my_role() IN ('admin', 'team_lead'));

CREATE POLICY "staff_read_auto_reply" ON page_auto_reply
  FOR SELECT USING (true);

-- Storage bucket for auto-reply images (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('auto-reply-images', 'auto-reply-images', true, 5242880)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_auto_reply_images" ON storage.objects
  FOR SELECT USING (bucket_id = 'auto-reply-images');

CREATE POLICY "auth_upload_auto_reply_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'auto-reply-images');

CREATE POLICY "auth_delete_auto_reply_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'auto-reply-images');

CREATE POLICY "auth_update_auto_reply_images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'auto-reply-images');
