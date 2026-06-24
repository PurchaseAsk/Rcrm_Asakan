-- Fix 1: recall_inactive_leads — log previous assignee name + reset stage_entered_at
-- Fix 2: distribute_lead — reset stage_entered_at so recall countdown restarts

CREATE OR REPLACE FUNCTION recall_inactive_leads()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule      record;
  v_ids       uuid[];
  v_count     int := 0;
  v_lid       uuid;
  v_target    uuid;
  v_prev_name text;
BEGIN
  FOR v_rule IN
    SELECT id, stage_id, inactive_days, recall_to
    FROM   auto_recall_rules
    WHERE  is_active = true
  LOOP
    SELECT array_agg(id)
    INTO   v_ids
    FROM   leads
    WHERE  stage_id         = v_rule.stage_id
      AND  status           = 'active'
      AND  assigned_to      IS NOT NULL
      AND  last_activity_at < now() - (v_rule.inactive_days || ' days')::interval;

    CONTINUE WHEN v_ids IS NULL OR array_length(v_ids, 1) = 0;

    v_target := NULL;
    IF v_rule.recall_to = 'admin' THEN
      SELECT id INTO v_target FROM profiles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
    END IF;

    FOREACH v_lid IN ARRAY v_ids LOOP
      -- capture previous assignee name before update
      SELECT coalesce(p.full_name, p.email, 'ไม่ระบุ')
      INTO   v_prev_name
      FROM   leads l
      LEFT JOIN profiles p ON p.id = l.assigned_to
      WHERE  l.id = v_lid;

      UPDATE leads
      SET    assigned_to      = v_target,
             last_activity_at = now(),
             stage_entered_at = now(),
             metadata         = jsonb_set(coalesce(metadata, '{}'), '{last_recalled_at}', to_jsonb(now()::text))
      WHERE  id = v_lid;

      INSERT INTO lead_activities (lead_id, type, content)
      VALUES (
        v_lid,
        'recalled',
        format('🔄 ดึงลีดกลับจาก %s หลังไม่มีกิจกรรม %s วัน', v_prev_name, v_rule.inactive_days)
      );
    END LOOP;

    v_count := v_count + array_length(v_ids, 1);
  END LOOP;

  RETURN v_count;
END
$$;


CREATE OR REPLACE FUNCTION distribute_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page_id       uuid;
  v_rule          record;
  v_members       uuid[];
  v_last_idx      int;
  v_next_idx      int;
  v_assign        uuid;
  v_stage_id      uuid;
  v_assignee_name text;
  v_pipeline_name text;
BEGIN
  SELECT page_id INTO v_page_id FROM leads WHERE id = p_lead_id;
  IF v_page_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_rule FROM distribution_rules
  WHERE  page_id = v_page_id AND is_active = true
  ORDER  BY priority DESC, created_at ASC LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_rule.pipeline_id IS NOT NULL THEN
    SELECT id INTO v_stage_id
    FROM   funnel_stages
    WHERE  pipeline_id = v_rule.pipeline_id AND is_unfollow = false
    ORDER  BY position ASC LIMIT 1;

    SELECT name INTO v_pipeline_name FROM pipelines WHERE id = v_rule.pipeline_id;
  END IF;

  IF v_rule.config ? 'user_ids' THEN
    SELECT array_agg(user_id::uuid) INTO v_members
    FROM   jsonb_array_elements_text(v_rule.config -> 'user_ids') AS user_id;
  ELSIF v_rule.team_id IS NOT NULL THEN
    SELECT array_agg(user_id) INTO v_members FROM team_members WHERE team_id = v_rule.team_id;
  END IF;

  IF v_members IS NOT NULL AND array_length(v_members, 1) > 0 THEN
    IF v_rule.method = 'round_robin' THEN
      v_last_idx := coalesce((v_rule.config ->> 'last_index')::int, -1);
      v_next_idx := (v_last_idx + 1) % array_length(v_members, 1);
      v_assign   := v_members[v_next_idx + 1];
      UPDATE distribution_rules
      SET    config = jsonb_set(coalesce(config, '{}'), '{last_index}', to_jsonb(v_next_idx))
      WHERE  id = v_rule.id;
    ELSE
      v_assign := v_members[1 + (floor(random() * array_length(v_members, 1)))::int];
    END IF;
  END IF;

  IF v_assign IS NOT NULL THEN
    SELECT coalesce(full_name, email, v_assign::text) INTO v_assignee_name
    FROM   profiles WHERE id = v_assign;
  END IF;

  UPDATE leads
  SET    pipeline_id      = coalesce(v_rule.pipeline_id, pipeline_id),
         stage_id         = coalesce(v_stage_id, stage_id),
         assigned_to      = coalesce(v_assign, assigned_to),
         last_activity_at = now(),
         stage_entered_at = now()
  WHERE  id = p_lead_id;

  INSERT INTO lead_activities (lead_id, type, content)
  VALUES (
    p_lead_id,
    'assigned',
    format('📋 Central pool assigned lead to %s via %s%s',
      coalesce(v_assignee_name, 'กองกลาง'),
      v_rule.method,
      CASE WHEN v_pipeline_name IS NULL THEN '' ELSE format(' in %s', v_pipeline_name) END
    )
  );
END
$$;
