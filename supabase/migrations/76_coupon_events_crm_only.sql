-- Fix: approved event fires only when note is added by CRM (created_by IS NULL)
-- GAS callbacks insert with service role → created_by = null
-- Manual notes by sales always have created_by = user UUID
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

  ELSIF NEW.type = 'note'
    AND NEW.created_by IS NULL
    AND NEW.content LIKE '%🎟️ คูปอง:%' THEN
    v_coupon_id := trim(regexp_replace(NEW.content, '.*🎟️ คูปอง:\s*([^\n]+).*', '\1', 'gs'));
    INSERT INTO coupon_events (lead_id, pipeline_id, event_type, coupon_id, activity_id)
    VALUES (NEW.lead_id, v_pipeline_id, 'approved', v_coupon_id, NEW.id);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
