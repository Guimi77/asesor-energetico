-- Explicit blank metadata in a manual edit means clear; an omitted key means
-- preserve. Workbook/PDF fill-only writes keep their existing non-erasing rules.
-- An empty holder billing profile remains explicit so old client defaults cannot
-- resurrect cleared contact fields. No customer rows or invoice history change
-- while applying this migration.

CREATE OR REPLACE FUNCTION public.save_master_supply(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
  v_cleared_fields jsonb := '[]'::jsonb;
  v_cleared_previous_values jsonb := '{}'::jsonb;
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
          supply_name = case when p_payload ? 'supply_name' then nullif(trim(coalesce(p_payload->>'supply_name','')), '') else supply_name end,
          address = case when p_payload ? 'address' then nullif(trim(coalesce(p_payload->>'address','')), '') else address end,
          city = case when p_payload ? 'city' then nullif(trim(coalesce(p_payload->>'city','')), '') else city end,
          province = case when p_payload ? 'province' then nullif(trim(coalesce(p_payload->>'province','')), '') else province end,
          postal_code = case when p_payload ? 'postal_code' then nullif(trim(coalesce(p_payload->>'postal_code','')), '') else postal_code end,
          current_tariff = case when p_payload ? 'tariff' then nullif(trim(coalesce(p_payload->>'tariff','')), '') else current_tariff end,
          current_contract_number = case when p_payload ? 'contract_number' then nullif(trim(coalesce(p_payload->>'contract_number','')), '') else current_contract_number end,
          current_retailer = case when p_payload ? 'retailer' then nullif(trim(coalesce(p_payload->>'retailer','')), '') else current_retailer end,
          current_distributor = case when p_payload ? 'distributor' then nullif(trim(coalesce(p_payload->>'distributor','')), '') else current_distributor end,
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

    -- Keep the removed values in the private audit trail for traceable edits.
    if v_mode = 'manual' then
      select coalesce(jsonb_agg(f.field_name order by f.field_name), '[]'::jsonb),
             coalesce(jsonb_object_agg(f.field_name, f.before_value), '{}'::jsonb)
      into v_cleared_fields, v_cleared_previous_values
      from (values
        ('supply_name', v_existing.supply_name, v_target.supply_name),
        ('address', v_existing.address, v_target.address),
        ('city', v_existing.city, v_target.city),
        ('province', v_existing.province, v_target.province),
        ('postal_code', v_existing.postal_code, v_target.postal_code),
        ('tariff', v_existing.current_tariff, v_target.current_tariff),
        ('contract_number', v_existing.current_contract_number, v_target.current_contract_number),
        ('retailer', v_existing.current_retailer, v_target.current_retailer),
        ('distributor', v_existing.current_distributor, v_target.current_distributor)
      ) as f(field_name, before_value, after_value)
      where nullif(trim(coalesce(f.before_value, '')), '') is not null
        and f.after_value is null;
    end if;

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
      'holder_created', v_holder_created,
      'cleared_fields', v_cleared_fields,
      'cleared_previous_values', v_cleared_previous_values
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_holder_profile(p_holder_id uuid, p_legal_name text, p_tax_id text, p_email text, p_phone text, p_bank_account text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_email text := nullif(trim(coalesce(p_email,'')), '');
  v_phone text := nullif(trim(coalesce(p_phone,'')), '');
  v_bank text := nullif(trim(coalesce(p_bank_account,'')), '');
  v_identity jsonb;
begin
  if v_user is null or not exists (
    select 1
    from public.profiles
    where id=v_user and role='admin' and active is true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;

  if v_email is not null and (
    char_length(v_email) > 320
    or position('@' in v_email) <= 1
    or v_email ~ '[[:space:]]'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;
  if v_phone is not null and char_length(v_phone) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;
  if v_bank is not null and char_length(v_bank) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_bank_account');
  end if;

  v_identity := public.admin_update_holder_identity(
    p_holder_id,
    p_legal_name,
    nullif(trim(coalesce(p_tax_id,'')), '')
  );

  if coalesce((v_identity->>'ok')::boolean,false) is not true then
    return v_identity;
  end if;

  -- An explicit empty profile suppresses legacy client contact fallbacks.
  -- Deleting the row would make a later read restore previously cleared data.
  insert into private.holder_contact_details(
    holder_id,email,phone,bank_account,updated_at,updated_by
  )
  values (
    p_holder_id,v_email,v_phone,v_bank,now(),v_user
  )
  on conflict(holder_id) do update
  set email=excluded.email,
      phone=excluded.phone,
      bank_account=excluded.bank_account,
      updated_at=now(),
      updated_by=v_user;

  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
  values (
    v_user,
    'holder_contact_details_updated',
    'holder',
    p_holder_id,
    jsonb_build_object(
      'has_email', v_email is not null,
      'has_phone', v_phone is not null,
      'has_bank_account', v_bank is not null,
      'source', 'holder_profile_editor'
    )
  );

  return v_identity || jsonb_build_object(
    'has_email', v_email is not null,
    'has_phone', v_phone is not null,
    'has_bank_account', v_bank is not null
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_holder_profile_with_portfolio(p_holder_id uuid, p_legal_name text, p_tax_id text, p_email text, p_phone text, p_bank_account text, p_portfolio_action text DEFAULT 'keep'::text, p_group_id uuid DEFAULT NULL::uuid, p_new_name text DEFAULT NULL::text, p_new_alias text DEFAULT NULL::text, p_expected_portfolio_snapshot text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- Missing profiles may still inherit legacy client contacts; an explicit
    -- empty profile is a real change and must reach the profile writer.
    and d.holder_id is not null
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

revoke all on function public.save_master_supply(jsonb) from public, anon, authenticated;
grant execute on function public.save_master_supply(jsonb) to authenticated;
revoke all on function public.admin_update_holder_profile(uuid,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_update_holder_profile(uuid,text,text,text,text,text)
  to authenticated;
revoke all on function public.admin_update_holder_profile_with_portfolio(uuid,text,text,text,text,text,text,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_update_holder_profile_with_portfolio(uuid,text,text,text,text,text,text,uuid,text,text,text)
  to authenticated;
