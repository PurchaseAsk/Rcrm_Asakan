-- Migration 49: Fix distribute_lead() — team_members uses joined_at not created_at
-- Migration 48 incorrectly used ORDER BY created_at which does not exist in team_members.
-- The correct column is joined_at, causing the function to throw on every team-based rule.

CREATE OR REPLACE FUNCTION distribute_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page_id       uuid;
  v_current_stage uuid;
  v_rule          record;
  v_members       uuid[];
  v_last_idx      int;
  v_next_idx      int;
  v_assign        uuid;
  v_stage_id      uuid;
  v_assignee_name text;
  v_pipeline_name text;
BEGIN
  SELECT page_id, stage_id
  INTO   v_page_id, v_current_stage
  FROM   leads
  WHERE  id = p_lead_id;

  IF v_page_id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO   v_rule
  FROM   distribution_rules
  WHERE  page_id = v_page_id
    AND  is_active = true
  ORDER  BY priority DESC, created_at ASC
  LIMIT  1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT id
  INTO   v_stage_id
  FROM   funnel_stages
  WHERE  pipeline_id IS NOT DISTINCT FROM v_rule.pipeline_id
    AND  is_unfollow = false
  ORDER  BY position ASC
  LIMIT  1;

  IF v_rule.pipeline_id IS NOT NULL THEN
    SELECT name INTO v_pipeline_name
    FROM   pipelines
    WHERE  id = v_rule.pipeline_id;
  END IF;

  IF coalesce(v_rule.config, '{}'::jsonb) ? 'user_ids' THEN
    -- preserve JSON array order via ordinality
    SELECT array_agg(user_id::uuid ORDER BY ordinality)
    INTO   v_members
    FROM   jsonb_array_elements_text(v_rule.config -> 'user_ids') WITH ORDINALITY AS t(user_id, ordinality);
  ELSIF v_rule.team_id IS NOT NULL THEN
    -- stable order by join date so round-robin cycle is deterministic
    SELECT array_agg(user_id ORDER BY joined_at)
    INTO   v_members
    FROM   team_members
    WHERE  team_id = v_rule.team_id;
  END IF;

  IF v_members IS NOT NULL AND array_length(v_members, 1) > 0 THEN
    IF v_rule.method = 'round_robin' THEN
      v_last_idx := coalesce((v_rule.config ->> 'last_index')::int, -1);
      v_next_idx := (v_last_idx + 1) % array_length(v_members, 1);
      v_assign   := v_members[v_next_idx + 1];

      UPDATE distribution_rules
      SET    config = jsonb_set(coalesce(config, '{}'::jsonb), '{last_index}', to_jsonb(v_next_idx))
      WHERE  id = v_rule.id;
    ELSE
      v_assign := v_members[1 + (floor(random() * array_length(v_members, 1)))::int];
    END IF;
  END IF;

  IF v_assign IS NOT NULL THEN
    SELECT coalesce(full_name, email, v_assign::text)
    INTO   v_assignee_name
    FROM   profiles
    WHERE  id = v_assign;
  END IF;

  UPDATE leads
  SET    pipeline_id      = coalesce(v_rule.pipeline_id, pipeline_id),
         stage_id         = coalesce(v_stage_id, stage_id),
         assigned_to      = v_assign,
         last_activity_at = now(),
         stage_entered_at = CASE
           WHEN coalesce(v_stage_id, v_current_stage) IS DISTINCT FROM v_current_stage
           THEN now()
           ELSE coalesce(stage_entered_at, now())
         END
  WHERE  id = p_lead_id;

  INSERT INTO lead_activities (lead_id, type, content)
  VALUES (
    p_lead_id,
    'assigned',
    format('📋 แจกลีดจากกองกลางให้ %s ผ่าน %s%s',
      coalesce(v_assignee_name, 'กองกลาง'),
      v_rule.method,
      CASE WHEN v_pipeline_name IS NULL THEN '' ELSE format(' ใน %s', v_pipeline_name) END
    )
  );
END
$$;

REVOKE ALL ON FUNCTION distribute_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION distribute_lead(uuid) TO authenticated, service_role;
