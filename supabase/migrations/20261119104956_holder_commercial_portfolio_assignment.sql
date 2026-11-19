-- Commercial grouping of every current supply belonging to one legal holder.
-- Ownership, client access, supply lifecycle and invoice history are untouched.
-- The existing profile validation remains the only writer of holder identity.

create or replace function private.holder_portfolio_state(p_holder_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'holder_id', p_holder_id,
    'total_supplies', count(*),
    'active_supplies', count(*) filter (where s.status = 'active'),
    'other_supplies', count(*) filter (where s.status is distinct from 'active'),
    'mixed', count(distinct coalesce(m.portfolio_id::text, '')) > 1,
    'group_id', case
      when count(distinct coalesce(m.portfolio_id::text, '')) = 1
      then min(m.portfolio_id::text)
      else null
    end,
    'snapshot', md5(p_holder_id::text || '|' || coalesce(
      jsonb_agg(jsonb_build_array(s.id, s.status, m.portfolio_id) order by s.id)::text,
      '[]'
    ))
  )
  from public.supplies s
  left join private.supply_portfolio_members m on m.supply_id = s.id
  where s.holder_id = p_holder_id;
$function$;

revoke all on function private.holder_portfolio_state(uuid)
  from public, anon, authenticated;

create or replace function public.get_internal_holder_portfolio_context(p_holder_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_groups jsonb;
begin
  if auth.uid() is null or not private.is_internal_user() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if p_holder_id is null or not exists (
    select 1 from public.holders where id = p_holder_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'holder_not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'alias', coalesce(p.alias, '')
  ) order by p.name, p.id), '[]'::jsonb)
  into v_groups
  from private.supply_portfolios p;

  return private.holder_portfolio_state(p_holder_id)
    || jsonb_build_object('ok', true, 'groups', v_groups);
end;
$function$;

create or replace function public.admin_update_holder_profile_with_portfolio(
  p_holder_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_email text,
  p_phone text,
  p_bank_account text,
  p_portfolio_action text default 'keep',
  p_group_id uuid default null,
  p_new_name text default null,
  p_new_alias text default null,
  p_expected_portfolio_snapshot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_action text := coalesce(p_portfolio_action, '');
  v_name text := nullif(btrim(coalesce(p_new_name, '')), '');
  v_alias text := nullif(btrim(coalesce(p_new_alias, '')), '');
  v_group_id uuid := p_group_id;
  v_group_name text;
  v_state jsonb;
  v_profile jsonb;
  v_before jsonb;
  v_supply_ids uuid[];
  v_changed integer := 0;
  v_constraint text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles
    where id = v_actor and role = 'admin' and active is true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;
  if v_action not in ('keep', 'set', 'clear') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_portfolio_action');
  end if;
  if (v_action in ('keep', 'clear') and
      (p_group_id is not null or v_name is not null or v_alias is not null))
     or (v_action = 'set' and
       ((p_group_id is null and v_name is null)
        or (p_group_id is not null and (v_name is not null or v_alias is not null)))) then
    return jsonb_build_object('ok', false, 'reason', 'ambiguous_destination');
  end if;
  if (v_name is not null and char_length(v_name) > 160)
     or (v_alias is not null and char_length(v_alias) > 100) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_group_name_or_alias');
  end if;

  if v_action <> 'keep'
     and nullif(btrim(coalesce(p_expected_portfolio_snapshot, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'portfolio_snapshot_required');
  end if;

  -- Holding the parent FOR UPDATE blocks new FK references until completion.
  -- NOWAIT also avoids deadlock with the older holder-reassignment RPC, which
  -- locks an individual supply before its holder. Any busy record rejects the
  -- whole save and releases these locks without applying a partial profile.
  perform 1 from public.holders where id = p_holder_id for update nowait;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'holder_not_found');
  end if;
  if v_action <> 'keep' then
    perform 1 from public.supplies
    where holder_id = p_holder_id order by id for update nowait;
    perform 1 from private.supply_portfolio_members m
    join public.supplies s on s.id = m.supply_id
    where s.holder_id = p_holder_id order by m.supply_id for update of m nowait;

    v_state := private.holder_portfolio_state(p_holder_id);
    if v_state->>'snapshot' is distinct from p_expected_portfolio_snapshot then
      return jsonb_build_object('ok', false, 'reason', 'portfolio_context_changed');
    end if;
    if (v_state->>'total_supplies')::integer = 0 then
      return jsonb_build_object('ok', false, 'reason', 'holder_has_no_supplies');
    end if;

    if v_action = 'set' and v_group_id is not null then
      select p.name into v_group_name from private.supply_portfolios p
      where p.id = v_group_id for share nowait;
      if not found then
        return jsonb_build_object('ok', false, 'reason', 'group_not_found');
      end if;
    elsif v_action = 'set' and exists (
      select 1 from private.supply_portfolios where lower(btrim(name)) = lower(v_name)
    ) then
      return jsonb_build_object('ok', false, 'reason', 'group_name_exists');
    end if;

    -- Capture only grouping IDs. Names, tax IDs and private contact values are
    -- not copied into the bulk assignment audit.
    select array_agg(s.id order by s.id),
           jsonb_agg(jsonb_build_object(
             'supply_id', s.id, 'group_id', m.portfolio_id
           ) order by s.id)
    into v_supply_ids, v_before
    from public.supplies s
    left join private.supply_portfolio_members m on m.supply_id = s.id
    where s.holder_id = p_holder_id;
  end if;

  -- An exact normalized replay does not rewrite timestamps or create profile
  -- audits. This compares values only; every real difference is still passed
  -- to the existing validator, including all fiscal-identity rules.
  select jsonb_build_object(
    'ok', true, 'holder_id', h.id, 'legal_name', h.legal_name, 'tax_id', h.tax_id,
    'has_email', d.email is not null,
    'has_phone', d.phone is not null,
    'has_bank_account', d.bank_account is not null
  ) into v_profile
  from public.holders h
  left join private.holder_contact_details d on d.holder_id = h.id
  where h.id = p_holder_id
    and nullif(btrim(coalesce(h.legal_name, '')), '') is not distinct from nullif(btrim(coalesce(p_legal_name, '')), '')
    and nullif(btrim(coalesce(h.tax_id, '')), '') is not distinct from nullif(btrim(coalesce(p_tax_id, '')), '')
    and nullif(btrim(coalesce(d.email, '')), '') is not distinct from nullif(btrim(coalesce(p_email, '')), '')
    and nullif(btrim(coalesce(d.phone, '')), '') is not distinct from nullif(btrim(coalesce(p_phone, '')), '')
    and nullif(btrim(coalesce(d.bank_account, '')), '') is not distinct from nullif(btrim(coalesce(p_bank_account, '')), '');

  if v_profile is null then
    v_profile := public.admin_update_holder_profile(
      p_holder_id, p_legal_name, p_tax_id, p_email, p_phone, p_bank_account
    );
    if coalesce((v_profile->>'ok')::boolean, false) is not true then
      return v_profile;
    end if;
  end if;
  if v_action = 'keep' then
    return v_profile || private.holder_portfolio_state(p_holder_id)
      || jsonb_build_object('portfolio_action', 'keep', 'changed_supplies', 0);
  end if;

  if v_action = 'set' and v_name is not null then
    insert into private.supply_portfolios(name, alias, created_by)
    values(v_name, v_alias, v_actor) returning id, name into v_group_id, v_group_name;
  end if;

  if v_action = 'clear' then
    delete from private.supply_portfolio_members where supply_id = any(v_supply_ids);
    get diagnostics v_changed = row_count;
  else
    insert into private.supply_portfolio_members(supply_id, portfolio_id, changed_by)
    select unnest(v_supply_ids), v_group_id, v_actor
    on conflict(supply_id) do update
    set portfolio_id = excluded.portfolio_id,
        changed_at = now(),
        changed_by = excluded.changed_by
    where private.supply_portfolio_members.portfolio_id is distinct from excluded.portfolio_id;
    get diagnostics v_changed = row_count;
  end if;

  if v_changed > 0 then
    insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
    values(v_actor, 'holder_supply_portfolio_assigned', 'holder', p_holder_id,
      jsonb_build_object(
        'source', 'holder_profile_editor',
        'portfolio_action', v_action,
        'supply_ids', to_jsonb(v_supply_ids),
        'total_supplies', cardinality(v_supply_ids),
        'changed_supplies', v_changed,
        'before', v_before,
        'new_group_id', v_group_id
      )
    );
  end if;

  return v_profile || private.holder_portfolio_state(p_holder_id)
    || jsonb_build_object(
      'portfolio_action', v_action,
      'group_id', v_group_id,
      'group_name', coalesce(v_group_name, ''),
      'changed_supplies', v_changed
    );
exception
  when lock_not_available then
    return jsonb_build_object('ok', false, 'reason', 'holder_portfolio_busy');
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'supply_portfolios_name_unique' then
      -- An overlapping group creation must roll back the profile update too.
      return jsonb_build_object('ok', false, 'reason', 'group_name_exists');
    end if;
    raise;
end;
$function$;

revoke all on function public.get_internal_holder_portfolio_context(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_update_holder_profile_with_portfolio(uuid,text,text,text,text,text,text,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.get_internal_holder_portfolio_context(uuid) to authenticated;
grant execute on function public.admin_update_holder_profile_with_portfolio(uuid,text,text,text,text,text,text,uuid,text,text,text)
  to authenticated;
