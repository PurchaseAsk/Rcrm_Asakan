-- Migration 40: Facebook Comment Center
-- page_comments: one row per incoming comment
-- page_comment_replies: replies sent by sales via Comment Center

CREATE TABLE public.page_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  fb_comment_id text NOT NULL UNIQUE,
  fb_post_id text NOT NULL,
  from_user_id text,
  from_user_name text,
  message text,
  fb_created_time timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archive_reason text CHECK (archive_reason IN ('chat', 'done')),
  private_reply_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.page_comment_replies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES public.page_comments(id) ON DELETE CASCADE,
  message text NOT NULL,
  fb_reply_id text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX page_comments_page_status_idx ON public.page_comments (page_id, status, created_at DESC);
CREATE INDEX page_comment_replies_comment_idx ON public.page_comment_replies (comment_id);

ALTER TABLE public.page_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_comment_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_comments_all" ON public.page_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "page_comment_replies_all" ON public.page_comment_replies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
