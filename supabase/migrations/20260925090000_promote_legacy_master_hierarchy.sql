-- Safely promote legacy browser-only master rows into the central Supabase hierarchy.
-- This is intentionally additive. It never deletes or archives existing records and
-- never rewrites an existing client/holder identity from legacy browser data.

create or replace function public.ensure_master_hierarchy_from_local(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();

  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_cups_key text;
  v_client_name text := nullif(trim(coalesce(p_payload->>'client_name','')), '');
  v_client_tax text := nullif(trim(coalesce(p_payload->>'client_tax_id','')), '');
  v_client_tax_key text := upper(regexp_replace(coalesce(p_payload->>'client_tax_id',''), '[^A-Za-z0-9]', '', 'g'));
  v_holder_name text := nullif(trim(coalesce(p_payload->>'holder_name','')), '');
  v_holder_tax text := nullif(trim(coalesce(p_payload->>'holder_tax_id','')), '');
  v_holder_tax_key text := upper(regexp_replace(coalesce(p_payload->>'holder_tax_id',''), '[^A-Za-z0-9]', '', 'g'));

  v_client_id uuid;
  v_holder_id uuid;
  v_supply public.supplies%rowtype;
  v_client_status public.record_status;
  v_holder_status public.record_status;
  v_count integer := 0;
  v_client_mode text := 'existing';
  v_holder_mode text := 'existing';
begin
  if v_user is null or not private.is_internal_user() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  v_cups_key := left(v_cups, 20);
  if length(v_cups_key) < 20 or left(v_cups_key, 2) <> 'ES' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_cups');
  end if;

  if v_client_name is null or upper(v_client_name) in ('SIN CLASIFICAR', 'PENDIENTE', 'POR IDENTIFICAR') then
    return jsonb_build_object('ok', false, 'reason', 'client_identity_insufficient');
  end if;

  if v_holder_name is null then
    v_holder_name := v_client_name;
  end if;

  -- For natural persons / one-company clients the holder tax id is also a useful
  -- client identifier. Do not borrow a holder tax id for a differently named group.
  if v_client_tax_key = ''
     and v_holder_tax_key <> ''
     and lower(v_client_name) = lower(v_holder_name) then
    v_client_tax := v_holder_tax;
    v_client_tax_key := v_holder_tax_key;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('master-local-cups|' || v_cups_key, 0));

  select * into v_supply
  from public.supplies
  where left(cups_key, 20) = v_cups_key
  order by created_at
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'mode', 'existing',
      'id', v_supply.id,
      'cups', v_supply.cups,
      'status', v_supply.status
    );
  end if;

  -- Resolve client by tax id first. Ambiguity is surfaced, never guessed.
  if v_client_tax_key <> '' then
    select count(*) into v_count
    from public.clients
    where upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_client_tax_key;

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'reason', 'client_tax_ambiguous');
    elsif v_count = 1 then
      select id, status into v_client_id, v_client_status
      from public.clients
      where upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_client_tax_key
      order by created_at
      limit 1;
    end if;
  end if;

  -- Fall back to exact case-insensitive client name.
  if v_client_id is null then
    select count(*) into v_count
    from public.clients
    where lower(trim(name)) = lower(v_client_name);

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'reason', 'client_name_ambiguous');
    elsif v_count = 1 then
      select id, status into v_client_id, v_client_status
      from public.clients
      where lower(trim(name)) = lower(v_client_name)
      order by created_at
      limit 1;
    end if;
  end if;

  if v_client_id is null then
    -- Legacy auto-promotion may create a completely new client only when a stable
    -- tax identity is available. Name-only rows stay pending for manual review.
    if v_client_tax_key = '' then
      return jsonb_build_object('ok', false, 'reason', 'new_client_requires_tax_id');
    end if;

    insert into public.clients(name, tax_id, status, notes, created_by)
    values (
      v_client_name,
      v_client_tax,
      'active',
      'Alta recuperada desde maestro local heredado',
      v_user
    )
    returning id, status into v_client_id, v_client_status;

    v_client_mode := 'inserted';
  elsif v_client_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'client_not_active', 'client_id', v_client_id);
  end if;

  -- Resolve holder inside the chosen client. Tax id wins when available.
  if v_holder_tax_key <> '' then
    select count(*) into v_count
    from public.holders
    where client_id = v_client_id
      and upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_holder_tax_key;

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'reason', 'holder_tax_ambiguous');
    elsif v_count = 1 then
      select id, status into v_holder_id, v_holder_status
      from public.holders
      where client_id = v_client_id
        and upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_holder_tax_key
      order by created_at
      limit 1;
    end if;
  end if;

  if v_holder_id is null then
    select count(*) into v_count
    from public.holders
    where client_id = v_client_id
      and lower(trim(legal_name)) = lower(v_holder_name);

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'reason', 'holder_name_ambiguous');
    elsif v_count = 1 then
      select id, status into v_holder_id, v_holder_status
      from public.holders
      where client_id = v_client_id
        and lower(trim(legal_name)) = lower(v_holder_name)
      order by created_at
      limit 1;
    end if;
  end if;

  if v_holder_id is null then
    insert into public.holders(client_id, legal_name, tax_id, status, notes, created_by)
    values (
      v_client_id,
      v_holder_name,
      v_holder_tax,
      'active',
      'Alta recuperada desde maestro local heredado',
      v_user
    )
    returning id, status into v_holder_id, v_holder_status;

    v_holder_mode := 'inserted';
  elsif v_holder_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'holder_not_active', 'holder_id', v_holder_id);
  end if;

  insert into public.supplies(
    holder_id,
    cups,
    supply_name,
    address,
    city,
    province,
    postal_code,
    current_tariff,
    current_contract_number,
    current_retailer,
    current_distributor,
    status,
    notes,
    created_by
  ) values (
    v_holder_id,
    v_cups,
    nullif(trim(coalesce(p_payload->>'supply_name','')), ''),
    nullif(trim(coalesce(p_payload->>'address','')), ''),
    nullif(trim(coalesce(p_payload->>'city','')), ''),
    nullif(trim(coalesce(p_payload->>'province','')), ''),
    nullif(trim(coalesce(p_payload->>'postal_code','')), ''),
    nullif(trim(coalesce(p_payload->>'tariff','')), ''),
    nullif(trim(coalesce(p_payload->>'contract_number','')), ''),
    nullif(trim(coalesce(p_payload->>'retailer','')), ''),
    nullif(trim(coalesce(p_payload->>'distributor','')), ''),
    'active',
    'Alta recuperada desde maestro local heredado',
    v_user
  )
  returning * into v_supply;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'legacy_master_promoted',
    'supply',
    v_supply.id,
    jsonb_build_object('client_mode', v_client_mode, 'holder_mode', v_holder_mode)
  );

  return jsonb_build_object(
    'ok', true,
    'mode', 'inserted',
    'id', v_supply.id,
    'cups', v_supply.cups,
    'status', v_supply.status,
    'client_id', v_client_id,
    'holder_id', v_holder_id,
    'client_mode', v_client_mode,
    'holder_mode', v_holder_mode
  );
exception
  when unique_violation then
    select * into v_supply
    from public.supplies
    where left(cups_key, 20) = v_cups_key
    order by created_at
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'mode', 'existing',
        'id', v_supply.id,
        'cups', v_supply.cups,
        'status', v_supply.status
      );
    end if;
    raise;
end;
$$;

revoke all on function public.ensure_master_hierarchy_from_local(jsonb) from public;
grant execute on function public.ensure_master_hierarchy_from_local(jsonb) to authenticated;
