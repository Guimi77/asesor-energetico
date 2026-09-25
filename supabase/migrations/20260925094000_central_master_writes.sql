-- Central write path for the energy master.
-- Supabase becomes authoritative for manual edits and workbook imports.
-- Additive/non-destructive: no deletes or archives, and blanks never erase existing data.

create or replace function public.save_master_supply(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_mode text := lower(trim(coalesce(p_payload->>'mode', 'manual')));

  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_cups_key text;
  v_original_cups text := upper(regexp_replace(coalesce(p_payload->>'original_cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_original_key text;

  v_client_name text := nullif(trim(coalesce(p_payload->>'client_name','')), '');
  v_client_tax text := nullif(trim(coalesce(p_payload->>'client_tax_id','')), '');
  v_client_tax_key text := upper(regexp_replace(coalesce(p_payload->>'client_tax_id',''), '[^A-Za-z0-9]', '', 'g'));

  v_holder_name text := nullif(trim(coalesce(p_payload->>'holder_name','')), '');
  v_holder_tax text := nullif(trim(coalesce(p_payload->>'holder_tax_id','')), '');
  v_holder_tax_key text := upper(regexp_replace(coalesce(p_payload->>'holder_tax_id',''), '[^A-Za-z0-9]', '', 'g'));

  v_client_id uuid;
  v_holder_id uuid;
  v_existing public.supplies%rowtype;
  v_target public.supplies%rowtype;
  v_existing_holder public.holders%rowtype;
  v_existing_client public.clients%rowtype;

  v_count integer := 0;
  v_client_created boolean := false;
  v_holder_created boolean := false;
  v_changed boolean := false;
  v_action text := 'unchanged';
begin
  if v_user is null or not private.is_internal_user() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if v_mode not in ('manual', 'fill_only') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_mode');
  end if;

  v_cups_key := left(v_cups, 20);
  if length(v_cups_key) < 20 or left(v_cups_key, 2) <> 'ES' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_cups');
  end if;

  if v_client_name is null then
    return jsonb_build_object('ok', false, 'reason', 'client_name_required');
  end if;

  if v_holder_name is null then
    v_holder_name := v_client_name;
  end if;

  v_original_key := case
    when length(v_original_cups) >= 20 and left(v_original_cups, 2) = 'ES' then left(v_original_cups, 20)
    else v_cups_key
  end;

  -- Serialise writes to the old and new canonical CUPS identities.
  perform pg_advisory_xact_lock(hashtextextended('master-write-cups|' || least(v_original_key, v_cups_key), 0));
  if v_original_key <> v_cups_key then
    perform pg_advisory_xact_lock(hashtextextended('master-write-cups|' || greatest(v_original_key, v_cups_key), 0));
  end if;

  select * into v_existing
  from public.supplies
  where left(cups_key, 20) = v_original_key
  order by created_at
  limit 1
  for update;

  -- Never allow a changed CUPS to collide with another canonical supply.
  select * into v_target
  from public.supplies
  where left(cups_key, 20) = v_cups_key
    and (v_existing.id is null or id <> v_existing.id)
  order by created_at
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_cups', 'existing_id', v_target.id);
  end if;

  -- For fill-only imports of an existing CUPS, validate against the current
  -- owner before creating anything. A conflicting row must never leave behind
  -- an orphan client or holder as a side effect.
  if v_existing.id is not null and v_mode = 'fill_only' then
    select h.* into v_existing_holder
    from public.holders h
    where h.id = v_existing.holder_id;

    select c.* into v_existing_client
    from public.clients c
    where c.id = v_existing_holder.client_id;

    if v_existing_holder.id is null or v_existing_client.id is null then
      return jsonb_build_object('ok', false, 'reason', 'owner_conflict');
    end if;

    if v_client_tax_key <> '' then
      if upper(regexp_replace(coalesce(v_existing_client.tax_id,''), '[^A-Za-z0-9]', '', 'g')) <> ''
         and upper(regexp_replace(coalesce(v_existing_client.tax_id,''), '[^A-Za-z0-9]', '', 'g')) <> v_client_tax_key then
        return jsonb_build_object('ok', false, 'reason', 'owner_conflict');
      end if;
      if upper(regexp_replace(coalesce(v_existing_client.tax_id,''), '[^A-Za-z0-9]', '', 'g')) = ''
         and lower(trim(v_existing_client.name)) <> lower(v_client_name) then
        return jsonb_build_object('ok', false, 'reason', 'owner_conflict');
      end if;
    elsif lower(trim(v_existing_client.name)) <> lower(v_client_name) then
      return jsonb_build_object('ok', false, 'reason', 'owner_conflict');
    end if;

    if v_holder_tax_key <> '' then
      if upper(regexp_replace(coalesce(v_existing_holder.tax_id,''), '[^A-Za-z0-9]', '', 'g')) <> ''
         and upper(regexp_replace(coalesce(v_existing_holder.tax_id,''), '[^A-Za-z0-9]', '', 'g')) <> v_holder_tax_key then
        return jsonb_build_object('ok', false, 'reason', 'owner_conflict');
      end if;
      if upper(regexp_replace(coalesce(v_existing_holder.tax_id,''), '[^A-Za-z0-9]', '', 'g')) = ''
         and lower(trim(v_existing_holder.legal_name)) <> lower(v_holder_name) then
        return jsonb_build_object('ok', false, 'reason', 'owner_conflict');
      end if;
    elsif lower(trim(v_existing_holder.legal_name)) <> lower(v_holder_name) then
      return jsonb_build_object('ok', false, 'reason', 'owner_conflict');
    end if;

    v_client_id := v_existing_client.id;
    v_holder_id := v_existing_holder.id;

    update public.clients
    set tax_id = case
          when nullif(trim(coalesce(tax_id,'')), '') is null and v_client_tax is not null then v_client_tax
          else tax_id
        end,
        updated_at = now()
    where id = v_client_id;

    update public.holders
    set tax_id = case
          when nullif(trim(coalesce(tax_id,'')), '') is null and v_holder_tax is not null then v_holder_tax
          else tax_id
        end,
        updated_at = now()
    where id = v_holder_id;
  else

  -- Resolve client by tax id first, then exact name. Ambiguity is surfaced.
  if v_client_tax_key <> '' then
    select count(*) into v_count
    from public.clients
    where upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_client_tax_key;

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'reason', 'client_tax_ambiguous');
    elsif v_count = 1 then
      select id into v_client_id
      from public.clients
      where upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_client_tax_key
      order by created_at
      limit 1;
    end if;
  end if;

  if v_client_id is null then
    select count(*) into v_count
    from public.clients
    where lower(trim(name)) = lower(v_client_name);

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'reason', 'client_name_ambiguous');
    elsif v_count = 1 then
      select id into v_client_id
      from public.clients
      where lower(trim(name)) = lower(v_client_name)
      order by created_at
      limit 1;
    end if;
  end if;

  if v_client_id is null then
    insert into public.clients(name, tax_id, status, notes, created_by)
    values (
      v_client_name,
      v_client_tax,
      'active',
      case when v_mode = 'fill_only' then 'Alta desde importación de maestro' else 'Alta desde editor de maestro' end,
      v_user
    )
    returning id into v_client_id;
    v_client_created := true;
  else
    -- Fill a missing tax id but never overwrite an existing one from this supply editor.
    update public.clients
    set tax_id = case
          when nullif(trim(coalesce(tax_id,'')), '') is null and v_client_tax is not null then v_client_tax
          else tax_id
        end,
        updated_at = now()
    where id = v_client_id;
  end if;

  -- A holder tax id already used under another client is not duplicated silently.
  if v_holder_tax_key <> '' then
    select count(*) into v_count
    from public.holders
    where upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_holder_tax_key
      and client_id <> v_client_id;

    if v_count > 0 then
      return jsonb_build_object('ok', false, 'reason', 'holder_belongs_to_other_client');
    end if;
  end if;

  if v_holder_tax_key <> '' then
    select count(*) into v_count
    from public.holders
    where client_id = v_client_id
      and upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_holder_tax_key;

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'reason', 'holder_tax_ambiguous');
    elsif v_count = 1 then
      select id into v_holder_id
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
      select id into v_holder_id
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
      case when v_mode = 'fill_only' then 'Alta desde importación de maestro' else 'Alta desde editor de maestro' end,
      v_user
    )
    returning id into v_holder_id;
    v_holder_created := true;
  else
    update public.holders
    set tax_id = case
          when nullif(trim(coalesce(tax_id,'')), '') is null and v_holder_tax is not null then v_holder_tax
          else tax_id
        end,
        updated_at = now()
    where id = v_holder_id;
  end if;

  end if;

  if v_existing.id is not null then
    select h.* into v_existing_holder
    from public.holders h
    where h.id = v_existing.holder_id;

    select c.* into v_existing_client
    from public.clients c
    where c.id = v_existing_holder.client_id;

    if v_mode = 'fill_only' and (
      v_existing.holder_id <> v_holder_id
      or v_existing_client.id <> v_client_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'reason', 'owner_conflict',
        'existing_client_id', v_existing_client.id,
        'existing_holder_id', v_existing_holder.id
      );
    end if;

    if v_mode = 'fill_only' then
      update public.supplies
      set supply_name = case when nullif(trim(coalesce(supply_name,'')), '') is null then nullif(trim(coalesce(p_payload->>'supply_name','')), '') else supply_name end,
          address = case when nullif(trim(coalesce(address,'')), '') is null then nullif(trim(coalesce(p_payload->>'address','')), '') else address end,
          city = case when nullif(trim(coalesce(city,'')), '') is null then nullif(trim(coalesce(p_payload->>'city','')), '') else city end,
          province = case when nullif(trim(coalesce(province,'')), '') is null then nullif(trim(coalesce(p_payload->>'province','')), '') else province end,
          postal_code = case when nullif(trim(coalesce(postal_code,'')), '') is null then nullif(trim(coalesce(p_payload->>'postal_code','')), '') else postal_code end,
          current_tariff = case when nullif(trim(coalesce(current_tariff,'')), '') is null then nullif(trim(coalesce(p_payload->>'tariff','')), '') else current_tariff end,
          current_contract_number = case when nullif(trim(coalesce(current_contract_number,'')), '') is null then nullif(trim(coalesce(p_payload->>'contract_number','')), '') else current_contract_number end,
          current_retailer = case when nullif(trim(coalesce(current_retailer,'')), '') is null then nullif(trim(coalesce(p_payload->>'retailer','')), '') else current_retailer end,
          current_distributor = case when nullif(trim(coalesce(current_distributor,'')), '') is null then nullif(trim(coalesce(p_payload->>'distributor','')), '') else current_distributor end,
          updated_at = now()
      where id = v_existing.id
      returning * into v_target;
    else
      update public.supplies
      set holder_id = v_holder_id,
          cups = v_cups,
          supply_name = coalesce(nullif(trim(coalesce(p_payload->>'supply_name','')), ''), supply_name),
          address = coalesce(nullif(trim(coalesce(p_payload->>'address','')), ''), address),
          city = coalesce(nullif(trim(coalesce(p_payload->>'city','')), ''), city),
          province = coalesce(nullif(trim(coalesce(p_payload->>'province','')), ''), province),
          postal_code = coalesce(nullif(trim(coalesce(p_payload->>'postal_code','')), ''), postal_code),
          current_tariff = coalesce(nullif(trim(coalesce(p_payload->>'tariff','')), ''), current_tariff),
          current_contract_number = coalesce(nullif(trim(coalesce(p_payload->>'contract_number','')), ''), current_contract_number),
          current_retailer = coalesce(nullif(trim(coalesce(p_payload->>'retailer','')), ''), current_retailer),
          current_distributor = coalesce(nullif(trim(coalesce(p_payload->>'distributor','')), ''), current_distributor),
          updated_at = now()
      where id = v_existing.id
      returning * into v_target;
    end if;

    v_changed := row(
      v_existing.holder_id, v_existing.cups, v_existing.supply_name, v_existing.address,
      v_existing.city, v_existing.province, v_existing.postal_code, v_existing.current_tariff,
      v_existing.current_contract_number, v_existing.current_retailer, v_existing.current_distributor
    ) is distinct from row(
      v_target.holder_id, v_target.cups, v_target.supply_name, v_target.address,
      v_target.city, v_target.province, v_target.postal_code, v_target.current_tariff,
      v_target.current_contract_number, v_target.current_retailer, v_target.current_distributor
    );

    v_action := case
      when not v_changed then 'unchanged'
      when v_mode = 'fill_only' then 'enriched'
      else 'updated'
    end;
  else
    insert into public.supplies(
      holder_id, cups, supply_name, address, city, province, postal_code,
      current_tariff, current_contract_number, current_retailer, current_distributor,
      status, notes, created_by
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
      case when v_mode = 'fill_only' then 'Alta desde importación de maestro' else 'Alta desde editor de maestro' end,
      v_user
    )
    returning * into v_target;

    v_action := 'inserted';
  end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'master_supply_' || v_action,
    'supply',
    v_target.id,
    jsonb_build_object(
      'mode', v_mode,
      'client_created', v_client_created,
      'holder_created', v_holder_created
    )
  );

  return jsonb_build_object(
    'ok', true,
    'mode', v_action,
    'id', v_target.id,
    'cups', v_target.cups,
    'client_id', v_client_id,
    'holder_id', v_holder_id,
    'client_created', v_client_created,
    'holder_created', v_holder_created
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_or_conflicting_identity');
end;
$$;

revoke all on function public.save_master_supply(jsonb) from public;
grant execute on function public.save_master_supply(jsonb) to authenticated;
