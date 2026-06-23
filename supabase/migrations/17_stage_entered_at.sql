-- Add stage_entered_at to leads so recall is based on time-in-stage,
-- not last_activity_at (which resets on any edit).

alter table leads add column if not exists stage_entered_at timestamptz;

-- Backfill: approximate with last_activity_at for existing rows
update leads set stage_entered_at = last_activity_at where stage_entered_at is null;

-- Update recall function to use stage_entered_at instead of last_activity_at
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
      and  stage_entered_at < now() - (v_rule.inactive_days || ' days')::interval;

    continue when v_ids is null or array_length(v_ids, 1) = 0;

    v_target := null;
    if v_rule.recall_to = 'admin' then
      select id into v_target
      from   profiles
      where  role = 'admin'
      order  by created_at asc
      limit  1;
    end if;

    update leads
    set    assigned_to      = v_target,
           last_activity_at = now(),
           stage_entered_at = now(),
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
