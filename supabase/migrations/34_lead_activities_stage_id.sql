-- Migration 34: Add stage_id to lead_activities for historical funnel tracking.
-- Previously, stage_change activities only stored stage name in text content,
-- making it impossible to query historical funnel entries by stage.
-- Fix: add stage_id column + indexes + best-effort backfill from content text.

ALTER TABLE lead_activities
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES funnel_stages(id) ON DELETE SET NULL;

-- Index for dashboard cohort queries: activities by type + lead
CREATE INDEX IF NOT EXISTS idx_lead_activities_type_lead
  ON lead_activities(type, lead_id);

-- Index for stage-based aggregation
CREATE INDEX IF NOT EXISTS idx_lead_activities_stage_id
  ON lead_activities(stage_id) WHERE stage_id IS NOT NULL;

-- Best-effort backfill: match stage name from English format "moved lead to {name}:"
UPDATE lead_activities la
SET stage_id = (
  SELECT fs.id
  FROM   funnel_stages fs
  WHERE  la.content LIKE '%moved lead to ' || fs.name || ':%'
  ORDER  BY length(fs.name) DESC   -- prefer longer match to avoid substring false-positives
  LIMIT  1
)
WHERE la.type = 'stage_change'
  AND la.stage_id IS NULL
  AND la.content ILIKE '%moved lead to%';

-- Best-effort backfill: match Thai format 'ย้ายไปขั้นตอน "{name}"'
UPDATE lead_activities la
SET stage_id = (
  SELECT fs.id
  FROM   funnel_stages fs
  WHERE  la.content LIKE '%ย้ายไปขั้นตอน "' || fs.name || '"%'
     OR  la.content LIKE '%ย้ายไป "' || fs.name || '"%'
  ORDER  BY length(fs.name) DESC
  LIMIT  1
)
WHERE la.type = 'stage_change'
  AND la.stage_id IS NULL
  AND (la.content LIKE '%ย้ายไป%');
