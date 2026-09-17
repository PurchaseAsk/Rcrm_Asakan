-- Coupon event tracking table
CREATE TABLE coupon_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN ('requested', 'approved')),
  coupon_id   TEXT NULL,
  activity_id UUID REFERENCES lead_activities(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coupon_events_pipeline ON coupon_events(pipeline_id, event_type);
CREATE INDEX idx_coupon_events_lead     ON coupon_events(lead_id);

-- RLS
ALTER TABLE coupon_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users can read coupon_events"
  ON coupon_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "service role full access coupon_events"
  ON coupon_events FOR ALL TO service_role USING (true);

-- Trigger function
CREATE OR REPLACE FUNCTION track_coupon_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id UUID;
  v_coupon_id   TEXT;
BEGIN
  SELECT pipeline_id INTO v_pipeline_id
  FROM leads WHERE id = NEW.lead_id;

  IF NEW.type = 'stage_change' AND NEW.content LIKE '%ส่งขอออกคูปอง%' THEN
    INSERT INTO coupon_events (lead_id, pipeline_id, event_type, activity_id)
    VALUES (NEW.lead_id, v_pipeline_id, 'requested', NEW.id);

  ELSIF NEW.type = 'note' AND NEW.content LIKE '%🎟️ คูปอง:%' THEN
    v_coupon_id := trim(regexp_replace(NEW.content, '.*🎟️ คูปอง:\s*([^\n]+).*', '\1', 'gs'));
    INSERT INTO coupon_events (lead_id, pipeline_id, event_type, coupon_id, activity_id)
    VALUES (NEW.lead_id, v_pipeline_id, 'approved', v_coupon_id, NEW.id);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- non-fatal: never block the original INSERT
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_track_coupon_event
AFTER INSERT ON lead_activities
FOR EACH ROW EXECUTE FUNCTION track_coupon_event();
