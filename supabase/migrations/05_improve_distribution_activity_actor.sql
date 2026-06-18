-- Make server-side distribution activity readable and actor-aware.

create or replace function distribute_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page_id uuid;
  v_rule record;
  v_members uuid[];
  v_last_idx int;
  v_next_idx int;
  v_assign uuid;
  v_stage_id uuid;
  v_assignee_name text;
  v_pipeline_name text;
begin
  select page_id into v_page_id
  from leads
  where id = p_lead_id;

  if v_page_id is null then
    return;
  end if;

  select *
  into v_rule
  from distribution_rules
  where page_id = v_page_id
    and is_active = true
  order by priority desc, created_at asc
  limit 1;

  if not found then
    return;
  end if;

  if v_rule.pipeline_id is not null then
    select id, name into v_stage_id, v_pipeline_name
    from funnel_stages
    where pipeline_id = v_rule.pipeline_id
      and is_unfollow = false
    order by position asc
    limit 1;

    select name into v_pipeline_name
    from pipelines
    where id = v_rule.pipeline_id;
  end if;

  if v_rule.config ? 'user_ids' then
    select array_agg(user_id::uuid)
    into v_members
    from jsonb_array_elements_text(v_rule.config -> 'user_ids') as user_id;
  elsif v_rule.team_id is not null then
    select array_agg(user_id)
    into v_members
    from team_members
    where team_id = v_rule.team_id;
  end if;

  if v_members is not null and array_length(v_members, 1) > 0 then
    if v_rule.method = 'round_robin' then
      v_last_idx := coalesce((v_rule.config ->> 'last_index')::int, -1);
      v_next_idx := (v_last_idx + 1) % array_length(v_members, 1);
      v_assign := v_members[v_next_idx + 1];

      update distribution_rules
      set config = jsonb_set(coalesce(config, '{}'), '{last_index}', to_jsonb(v_next_idx))
      where id = v_rule.id;
    else
      v_assign := v_members[1 + (floor(random() * array_length(v_members, 1)))::int];
    end if;
  end if;

  if v_assign is not null then
    select coalesce(full_name, email, v_assign::text)
    into v_assignee_name
    from profiles
    where id = v_assign;
  end if;

  update leads
  set pipeline_id = coalesce(v_rule.pipeline_id, pipeline_id),
      stage_id = coalesce(v_stage_id, stage_id),
      assigned_to = coalesce(v_assign, assigned_to),
      last_activity_at = now()
  where id = p_lead_id;

  insert into lead_activities (lead_id, type, content)
  values (
    p_lead_id,
    'assigned',
    format(
      'Central pool assigned lead to %s via %s%s',
      coalesce(v_assignee_name, 'central pool'),
      v_rule.method,
      case when v_pipeline_name is null then '' else format(' in %s', v_pipeline_name) end
    )
  );
end
$$;
