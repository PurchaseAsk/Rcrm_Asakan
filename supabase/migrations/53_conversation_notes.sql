-- Migration 53: Internal notes for conversations (staff-only, customer never sees these)
CREATE TABLE public.conversation_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  content        text NOT NULL,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read and write notes (internal only)
CREATE POLICY "conv_notes: select" ON public.conversation_notes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "conv_notes: insert" ON public.conversation_notes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "conv_notes: delete" ON public.conversation_notes
  FOR DELETE USING (created_by = auth.uid());
