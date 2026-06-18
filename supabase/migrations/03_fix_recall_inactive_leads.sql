-- Update recall_inactive_leads() to honour the recall_to field.
-- 'pool'  → assigned_to = null  (unchanged behaviour)
-- 'admin' → assigned_to = oldest admin profile
-- 'team'  → falls back to pool (no team_id stored on the rule)

create or replace function recall_inactive_leads()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule   record;
  v_ids    uuid[];
  v_count  int := 0;
  v_lid    uuid;
  v_target uuid;
begin
  for v_rule in
    select id, stage_id, inactive_days, recall_to
    from   auto_recall_rules
    where  is_active = true
  loop
    select array_agg(id)
    into   v_ids
    from   leads
    where  stage_id         = v_rule.stage_id
      and  status           = 'active'
      and  assigned_to      is not null
      and  last_activity_at < now() - (v_rule.inactive_days || ' days')::interval;

    continue when v_ids is null or array_length(v_ids, 1) = 0;

    -- Resolve target assignee based on recall_to
    v_target := null;
    if v_rule.recall_to = 'admin' then
      select id into v_target
      from   profiles
      where  role = 'admin'
      order  by created_at asc
      limit  1;
    end if;
    -- 'pool' and 'team' (no team_id on rule) → v_target stays null

    update leads
    set    assigned_to      = v_target,
           last_activity_at = now(),
           metadata         = jsonb_set(
                                coalesce(metadata, '{}'),
                                '{last_recalled_at}',
                                to_jsonb(now()::text)
                              )
    where  id = any(v_ids);

    foreach v_lid in array v_ids loop
      insert into lead_activities (lead_id, type, content)
      values (
        v_lid,
        'recalled',
        format('Auto-recalled after %s inactive days (recall_to: %s)', v_rule.inactive_days, v_rule.recall_to)
      );
    end loop;

    v_count := v_count + array_length(v_ids, 1);
  end loop;

  return v_count;
end
$$;
