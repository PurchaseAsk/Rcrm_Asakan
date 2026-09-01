-- Trigger: auto-update leads.last_activity_at on every lead_activities insert
CREATE OR REPLACE FUNCTION update_lead_last_activity_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE leads
  SET last_activity_at = NEW.created_at
  WHERE id = NEW.lead_id
    AND (last_activity_at IS NULL OR NEW.created_at > last_activity_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_update_last_activity_at ON lead_activities;

CREATE TRIGGER trg_update_last_activity_at
AFTER INSERT ON lead_activities
FOR EACH ROW
EXECUTE FUNCTION update_lead_last_activity_at();
