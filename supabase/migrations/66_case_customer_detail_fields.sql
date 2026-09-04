ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS main_salary    numeric,
  ADD COLUMN IF NOT EXISTS main_debt      numeric,
  ADD COLUMN IF NOT EXISTS has_co_borrower boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS co_salary      numeric,
  ADD COLUMN IF NOT EXISTS co_debt        numeric,
  ADD COLUMN IF NOT EXISTS docs_submitted_at date,
  ADD COLUMN IF NOT EXISTS bank_accepted  jsonb NOT NULL DEFAULT '[]'::jsonb;
