ALTER TABLE public.fb_post_cache
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS fb_created_at timestamptz;
