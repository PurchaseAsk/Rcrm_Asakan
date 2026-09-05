-- Add label column to cases for document workflow tracking
-- Separate from status (active/pending_close/closed) which controls the close workflow
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT 'in_progress'
  CHECK (label IN ('in_progress', 'docs_submitted', 'bank_accepted'));

-- Backfill existing cases based on current data
UPDATE cases
SET label = CASE
  WHEN bank_accepted IS NOT NULL AND jsonb_array_length(bank_accepted) > 0 THEN 'bank_accepted'
  WHEN docs_submitted_at IS NOT NULL THEN 'docs_submitted'
  ELSE 'in_progress'
END;
