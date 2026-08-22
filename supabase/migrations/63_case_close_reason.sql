ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS close_reason text
  CHECK (close_reason IN ('transferred', 'cancelled'));
