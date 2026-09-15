-- Fix multiclient history creation for new supplies.
-- public.supplies.cups_key is a generated column, so it must not be written explicitly.

create or replace function private.ensure_energy_history_supply(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path to 'public', 'private', 'auth'
as $function$
declare
  v_user uuid := auth.uid();
  v_supply uuid;
  v_holder uuid;
  v_client uuid;
  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_holder_name text := nullif(trim(coalesce(p_payload->>'source_holder_name','')), '');
  v_holder_tax text := nullif(trim(coalesce(p_payload->>'source_holder_tax_id','')), '');
  v_tax_key text := upper(regexp_replace(coalesce(p_payload->>'source_holder_tax_id',''), '[^A-Za-z0-9]', '', 'g'));
begin
  if v_user is null or not private.is_internal_user() then
    raise exception 'not_authorized';
  end if;

  if coalesce((p_payload->>'validated')::boolean, false) is not true then
    return null;
  end if;

  if length(v_cups) < 20 then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('energy-history-cups|' || left(v_cups,20), 0));

  select s.id into v_supply
  from public.supplies s
  where left(s.cups_key,20) = left(v_cups,20)
  limit 1;

  if v_supply is not null then
    return v_supply;
  end if;

  if v_holder_name is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('energy-history-holder|' || coalesce(nullif(v_tax_key,''), upper(v_holder_name)), 0)
  );

  if nullif(v_tax_key,'') is not null then
    select h.id, h.client_id into v_holder, v_client
    from public.holders h
    where upper(regexp_replace(coalesce(h.tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_tax_key
    order by h.created_at
    limit 1;
  end if;

  if v_holder is null then
    select h.id, h.client_id into v_holder, v_client
    from public.holders h
    where upper(trim(h.legal_name)) = upper(v_holder_name)
    order by h.created_at
    limit 1;
  end if;

  if v_holder is null then
    if nullif(v_tax_key,'') is not null then
      select c.id into v_client
      from public.clients c
      where upper(regexp_replace(coalesce(c.tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_tax_key
      order by c.created_at
      limit 1;
    end if;

    if v_client is null then
      select c.id into v_client
      from public.clients c
      where upper(trim(c.name)) = upper(v_holder_name)
      order by c.created_at
      limit 1;
    end if;

    if v_client is null then
      insert into public.clients(name, tax_id, notes, created_by)
      values (v_holder_name, v_holder_tax, 'Alta provisional desde factura validada', v_user)
      returning id into v_client;
    end if;

    insert into public.holders(client_id, legal_name, tax_id, notes, created_by)
    values (v_client, v_holder_name, v_holder_tax, 'Alta provisional desde factura validada', v_user)
    returning id into v_holder;
  end if;

  insert into public.supplies(
    holder_id, cups, address, current_tariff,
    current_contract_number, current_retailer, current_distributor,
    notes, created_by
  ) values (
    v_holder, v_cups, nullif(p_payload->>'source_supply_address',''), nullif(p_payload->>'tariff',''),
    nullif(p_payload->>'contract_number',''), nullif(p_payload->>'retailer',''), nullif(p_payload->>'distributor',''),
    'Alta provisional desde factura validada', v_user
  )
  on conflict (cups_key) do update set updated_at = now()
  returning id into v_supply;

  return v_supply;
end;
$function$;

revoke all on function private.ensure_energy_history_supply(jsonb) from public;
