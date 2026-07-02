-- Migration 47: Add line_id column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS line_id text;
