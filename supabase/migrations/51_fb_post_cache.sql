-- Migration 51: Cache Facebook post info for Comment Center
-- fb_post_cache: one row per unique post, populated at webhook time
-- page_comments: add post_message + permalink_url filled from cache on insert

CREATE TABLE public.fb_post_cache (
  fb_post_id   text PRIMARY KEY,
  page_id      uuid REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  post_message text,
  permalink_url text,
  fetched_at   timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.page_comments
  ADD COLUMN IF NOT EXISTS post_message  text,
  ADD COLUMN IF NOT EXISTS permalink_url text;

ALTER TABLE public.fb_post_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fb_post_cache_all" ON public.fb_post_cache
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
