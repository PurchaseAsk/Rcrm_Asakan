-- Migration 30: Fix recall logic order and remove unsafe fallback rule
-- 1. Find first_stage + reset stage_id/stage_entered_at BEFORE checking distribution rule
--    so pool leads always go back to first stage even without a rule
-- 2. Distribution rule match: pipeline_id only — no fallback to other pipeline's rule

CREATE OR REPLACE FUNCTION recall_inactive_leads()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule          record;
  v_ids           uuid[];
  v_count         int := 0;
  v_lid           uuid;
  v_prev_name     text;
  v_lead_page     uuid;
  v_lead_pipeline uuid;
  v_lead_stage    uuid;
  -- redistribution
  v_dist_rule     record;
  v_first_stage   uuid;
  v_members       uuid[];
  v_new_assign    uuid;
  v_new_name      text;
  v_rr_last       int;
  v_rr_next       int;
BEGIN
  FOR v_rule IN
    SELECT r.id, r.stage_id, r.inactive_days, s.name AS stage_name
    FROM   auto_recall_rules r
    JOIN   funnel_stages s ON s.id = r.stage_id
    WHERE  r.is_active = true
  LOOP
    SELECT array_agg(id)
    INTO   v_ids
    FROM   leads
    WHERE  stage_id         = v_rule.stage_id
      AND  status           = 'active'
      AND  assigned_to      IS NOT NULL
      AND  stage_entered_at < now() - (v_rule.inactive_days || ' days')::interval;

    CONTINUE WHEN v_ids IS NULL OR array_length(v_ids, 1) = 0;

    FOREACH v_lid IN ARRAY v_ids LOOP
      -- จับข้อมูลก่อน update
      SELECT
        coalesce(p.full_name, p.email, 'ไม่ระบุ'),
        l.page_id,
        l.pipeline_id,
        l.stage_id
      INTO v_prev_name, v_lead_page, v_lead_pipeline, v_lead_stage
      FROM  leads l
      LEFT JOIN profiles p ON p.id = l.assigned_to
      WHERE l.id = v_lid;

      -- ── หา first stage ก่อนเสมอ — ไม่รอ distribution rule ──────────────
      v_first_stage := NULL;
      IF v_lead_pipeline IS NOT NULL THEN
        SELECT id INTO v_first_stage
        FROM   funnel_stages
        WHERE  pipeline_id = v_lead_pipeline AND is_unfollow = false
        ORDER  BY position ASC LIMIT 1;
      END IF;

      -- ── หา distribution rule ที่ตรง pipeline เดิมเท่านั้น ───────────────
      -- ไม่ fallback ไป rule ของ pipeline อื่น เพราะจะแจกทีมผิด
      v_new_assign := NULL;
      v_new_name   := 'กองกลาง';

      SELECT * INTO v_dist_rule
      FROM   distribution_rules
      WHERE  page_id     = v_lead_page
        AND  pipeline_id = v_lead_pipeline
        AND  is_active   = true
      ORDER  BY priority DESC, created_at ASC LIMIT 1;

      IF FOUND THEN
        -- หาสมาชิกจาก rule
        v_members := NULL;
        IF v_dist_rule.config ? 'user_ids' THEN
          SELECT array_agg(uid::uuid) INTO v_members
          FROM   jsonb_array_elements_text(v_dist_rule.config -> 'user_ids') AS uid;
        ELSIF v_dist_rule.team_id IS NOT NULL THEN
          SELECT array_agg(user_id) INTO v_members
          FROM   team_members WHERE team_id = v_dist_rule.team_id;
        END IF;

        -- เลือก assignee
        IF v_members IS NOT NULL AND array_length(v_members, 1) > 0 THEN
          IF v_dist_rule.method = 'round_robin' THEN
            v_rr_last    := coalesce((v_dist_rule.config ->> 'last_index')::int, -1);
            v_rr_next    := (v_rr_last + 1) % array_length(v_members, 1);
            v_new_assign := v_members[v_rr_next + 1];
            UPDATE distribution_rules
            SET config = jsonb_set(coalesce(config, '{}'), '{last_index}', to_jsonb(v_rr_next))
            WHERE id = v_dist_rule.id;
          ELSE
            v_new_assign := v_members[1 + (floor(random() * array_length(v_members, 1)))::int];
          END IF;
        END IF;

        IF v_new_assign IS NOT NULL THEN
          SELECT coalesce(full_name, email) INTO v_new_name FROM profiles WHERE id = v_new_assign;
        END IF;
      END IF;

      -- ── UPDATE เดียว: recall + ย้าย stage แรก + แจก (หรือค้างใน pool) ──
      -- stage_entered_at = now() เสมอ ไม่ว่าจะมี rule หรือไม่
      -- pipeline ไม่เปลี่ยน
      UPDATE leads
      SET assigned_to      = v_new_assign,
          stage_id         = coalesce(v_first_stage, stage_id),
          stage_entered_at = now(),
          last_activity_at = now(),
          metadata         = jsonb_set(coalesce(metadata, '{}'), '{last_recalled_at}', to_jsonb(now()::text))
      WHERE id = v_lid;

      -- บันทึก activity: recall
      INSERT INTO lead_activities (lead_id, type, content)
      VALUES (
        v_lid,
        'recalled',
        format('🔄 ดึงลีดกลับเข้าส่วนกลาง จากคุณ %s หลังอยู่ใน stage "%s" ครบ %s วัน',
          v_prev_name, v_rule.stage_name, v_rule.inactive_days)
      );

      -- บันทึก activity: assigned (เฉพาะเมื่อแจกได้)
      IF v_new_assign IS NOT NULL THEN
        INSERT INTO lead_activities (lead_id, type, content)
        VALUES (
          v_lid,
          'assigned',
          format('📋 แจก lead จาก pool ให้ %s ผ่าน %s',
            v_new_name, v_dist_rule.method)
        );
      END IF;
    END LOOP;

    v_count := v_count + array_length(v_ids, 1);
  END LOOP;

  RETURN v_count;
END
$$;
