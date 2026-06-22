-- Conversation tagging (reuses existing tags table)
CREATE TABLE IF NOT EXISTS public.conversation_tags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id       uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(conversation_id, tag_id)
);
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_conversation_tags" ON public.conversation_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
