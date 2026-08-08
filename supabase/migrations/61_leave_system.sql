-- Migration 61: Leave system — is_available toggle on profiles
-- When a user is on leave, distribute_lead() skips them.
-- The last available member in any active rule cannot go on leave.

-- 1. Add column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

-- 2. Helper: can this user go on leave?
--    Returns false if they are the only available member in any active distribution rule.
CREATE OR REPLACE FUNCTION can_go_on_leave(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_available_count int;
BEGIN
  FOR v_rule IN
    SELECT id, team_id, config
    FROM distribution_rules
    WHERE is_active = true
  LOOP
    -- Rules using explicit user_ids list
    IF coalesce(v_rule.config, '{}'::jsonb) ? 'user_ids' THEN
      -- Check if this user is in the list
      IF v_rule.config -> 'user_ids' @> to_jsonb(p_user_id::text) THEN
        SELECT COUNT(*)
        INTO   v_available_count
        FROM   jsonb_array_elements_text(v_rule.config -> 'user_ids') AS uid
        JOIN   profiles p ON p.id = uid::uuid
        WHERE  p.is_available = true
          AND  p.id <> p_user_id;

        IF v_available_count = 0 THEN
          RETURN false;
        END IF;
      END IF;

    -- Rules using team
    ELSIF v_rule.team_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM team_members WHERE team_id = v_rule.team_id AND user_id = p_user_id) THEN
        SELECT COUNT(*)
        INTO   v_available_count
        FROM   team_members tm
        JOIN   profiles p ON p.id = tm.user_id
        WHERE  tm.team_id = v_rule.team_id
          AND  p.is_available = true
          AND  p.id <> p_user_id;

        IF v_available_count = 0 THEN
          RETURN false;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION can_go_on_leave(uuid) TO authenticated, service_role;

-- 3. Update distribute_lead() to skip unavailable members
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

  IF v_page_id IS NULL THEN RETURN; END IF;

  SELECT *
  INTO   v_rule
  FROM   distribution_rules
  WHERE  page_id = v_page_id
    AND  is_active = true
  ORDER  BY priority DESC, created_at ASC
  LIMIT  1;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT id
  INTO   v_stage_id
  FROM   funnel_stages
  WHERE  pipeline_id IS NOT DISTINCT FROM v_rule.pipeline_id
    AND  is_unfollow = false
  ORDER  BY position ASC
  LIMIT  1;

  IF v_rule.pipeline_id IS NOT NULL THEN
    SELECT name INTO v_pipeline_name FROM pipelines WHERE id = v_rule.pipeline_id;
  END IF;

  IF coalesce(v_rule.config, '{}'::jsonb) ? 'user_ids' THEN
    -- Preserve JSON array order, skip unavailable users
    SELECT array_agg(user_id::uuid ORDER BY ordinality)
    INTO   v_members
    FROM   jsonb_array_elements_text(v_rule.config -> 'user_ids') WITH ORDINALITY AS t(user_id, ordinality)
    JOIN   profiles p ON p.id = t.user_id::uuid
    WHERE  p.is_available = true;

  ELSIF v_rule.team_id IS NOT NULL THEN
    SELECT array_agg(tm.user_id ORDER BY tm.joined_at)
    INTO   v_members
    FROM   team_members tm
    JOIN   profiles p ON p.id = tm.user_id
    WHERE  tm.team_id = v_rule.team_id
      AND  p.is_available = true;
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
  -- If v_members is NULL or empty → v_assign stays NULL → lead goes to pool

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
