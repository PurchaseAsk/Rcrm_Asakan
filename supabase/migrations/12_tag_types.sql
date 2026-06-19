-- Update tag types from system/custom to global/personal
ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_type_check;

UPDATE public.tags SET type = 'global' WHERE type IN ('system', 'custom');

ALTER TABLE public.tags ADD CONSTRAINT tags_type_check
  CHECK (type IN ('global', 'personal'));
