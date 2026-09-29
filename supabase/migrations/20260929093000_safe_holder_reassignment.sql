-- Safe holder lifecycle helpers.
-- A validated invoice may prove that a CUPS has a new legal holder, but the
-- change must never invent a client/holder relationship or rewrite history.

create or replace function public.admin_update_holder_identity(
  p_holder_id uuid,
  p_legal_name text,
  p_tax_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_holder public.holders%rowtype;
  v_name text := nullif(trim(coalesce(p_legal_name, '')), '');
  v_tax text := nullif(trim(coalesce(p_tax_id, '')), '');
  v_old_tax_key text;
  v_new_tax_key text;
  v_conflict uuid;
begin
  if v_user is null or not exists (
    select 1 from public.profiles
    where id = v_user and role = 'admin' and active is true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;

  if p_holder_id is null or v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_holder_identity');
  end if;

  select * into v_holder
  from public.holders
  where id = p_holder_id
  for update;

  if v_holder.id is null then
    return jsonb_build_object('ok', false, 'reason', 'holder_not_found');
  end if;

  v_old_tax_key := upper(regexp_replace(coalesce(v_holder.tax_id, ''), '[^A-Za-z0-9]', '', 'g'));
  v_new_tax_key := upper(regexp_replace(coalesce(v_tax, ''), '[^A-Za-z0-9]', '', 'g'));

  -- A different non-empty tax id represents a different legal identity.
  -- Renaming may correct the legal name, and a missing tax id may be filled,
  -- but an existing tax identity is never mutated into another one.
  if v_old_tax_key <> '' and v_new_tax_key <> '' and v_old_tax_key <> v_new_tax_key then
    return jsonb_build_object('ok', false, 'reason', 'tax_identity_change_requires_reassignment');
  end if;

  if v_new_tax_key <> '' then
    select id into v_conflict
    from public.holders
    where id <> p_holder_id
      and upper(regexp_replace(coalesce(tax_id, ''), '[^A-Za-z0-9]', '', 'g')) = v_new_tax_key
    limit 1;

    if v_conflict is not null then
      return jsonb_build_object('ok', false, 'reason', 'holder_tax_conflict', 'holder_id', v_conflict);
    end if;
  end if;

  if exists (
    select 1 from public.holders
    where id <> p_holder_id
      and client_id = v_holder.client_id
      and lower(trim(legal_name)) = lower(v_name)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'holder_name_conflict');
  end if;

  update public.holders
  set legal_name = v_name,
      tax_id = case
        when v_old_tax_key = '' and v_new_tax_key <> '' then v_tax
        when v_old_tax_key <> '' then tax_id
        else null
      end,
      updated_at = now()
  where id = p_holder_id;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'holder_identity_updated',
    'holder',
    p_holder_id,
    jsonb_build_object(
      'before', jsonb_build_object('legal_name', v_holder.legal_name, 'tax_id', v_holder.tax_id),
      'after', jsonb_build_object('legal_name', v_name, 'tax_id',
        case when v_old_tax_key = '' and v_new_tax_key <> '' then v_tax else v_holder.tax_id end)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'holder_id', p_holder_id,
    'legal_name', v_name,
    'tax_id', case when v_old_tax_key = '' and v_new_tax_key <> '' then v_tax else v_holder.tax_id end
  );
end;
$$;

revoke all on function public.admin_update_holder_identity(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_holder_identity(uuid, text, text) to authenticated;


create or replace function public.admin_apply_latest_invoice_holder(p_supply_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_supply public.supplies%rowtype;
  v_old_holder public.holders%rowtype;
  v_old_client public.clients%rowtype;
  v_latest public.invoices%rowtype;
  v_target_holder public.holders%rowtype;
  v_target_client public.clients%rowtype;
  v_current_tax_key text;
  v_next_tax_key text;
  v_target_count integer := 0;
  v_old_active_count integer := 0;
  v_event_date date;
begin
  if v_user is null or not exists (
    select 1 from public.profiles
    where id = v_user and role = 'admin' and active is true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;

  if p_supply_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_supply_id');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('holder-change|' || p_supply_id::text, 0));

  select * into v_supply
  from public.supplies
  where id = p_supply_id
  for update;

  if v_supply.id is null then
    return jsonb_build_object('ok', false, 'reason', 'supply_not_found');
  end if;

  select * into v_old_holder
  from public.holders
  where id = v_supply.holder_id
  for update;

  if v_old_holder.id is null then
    return jsonb_build_object('ok', false, 'reason', 'current_holder_not_found');
  end if;

  select * into v_old_client
  from public.clients
  where id = v_old_holder.client_id;

  select i.* into v_latest
  from public.invoices i
  where i.supply_id = p_supply_id
    and i.validation_status = 'valid'
    and i.superseded_by is null
    and nullif(trim(coalesce(i.source_holder_name, '')), '') is not null
  order by
    coalesce(i.issue_date, i.billing_end, i.billing_start, i.created_at::date) desc,
    i.created_at desc
  limit 1;

  if v_latest.id is null then
    return jsonb_build_object('ok', false, 'reason', 'latest_valid_invoice_not_found');
  end if;

  v_current_tax_key := upper(regexp_replace(coalesce(v_old_holder.tax_id, ''), '[^A-Za-z0-9]', '', 'g'));
  v_next_tax_key := upper(regexp_replace(coalesce(v_latest.source_holder_tax_id, ''), '[^A-Za-z0-9]', '', 'g'));

  if v_current_tax_key = '' then
    return jsonb_build_object('ok', false, 'reason', 'current_holder_tax_missing');
  end if;

  if v_next_tax_key = '' or nullif(trim(coalesce(v_latest.source_holder_name, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'latest_holder_identity_missing');
  end if;

  if v_current_tax_key = v_next_tax_key then
    return jsonb_build_object(
      'ok', false,
      'reason', 'same_legal_identity',
      'holder_id', v_old_holder.id,
      'latest_invoice_id', v_latest.id
    );
  end if;

  -- Never invent a client relationship from an invoice. The new fiscal
  -- identity must already exist exactly once in the central master.
  select count(*) into v_target_count
  from public.holders h
  where upper(regexp_replace(coalesce(h.tax_id, ''), '[^A-Za-z0-9]', '', 'g')) = v_next_tax_key;

  if v_target_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'target_holder_not_found',
      'latest_invoice_id', v_latest.id,
      'source_holder_name', v_latest.source_holder_name
    );
  elsif v_target_count > 1 then
    return jsonb_build_object('ok', false, 'reason', 'target_holder_ambiguous');
  end if;

  select * into v_target_holder
  from public.holders h
  where upper(regexp_replace(coalesce(h.tax_id, ''), '[^A-Za-z0-9]', '', 'g')) = v_next_tax_key
  limit 1
  for update;

  select * into v_target_client
  from public.clients
  where id = v_target_holder.client_id;

  if v_target_holder.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'target_holder_not_active');
  end if;

  if v_target_client.id is null or v_target_client.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'target_client_not_active');
  end if;

  update public.supplies
  set holder_id = v_target_holder.id,
      updated_at = now()
  where id = p_supply_id;

  v_event_date := coalesce(
    v_latest.billing_start,
    v_latest.issue_date,
    v_latest.billing_end,
    current_date
  );

  insert into public.supply_events(
    supply_id, event_date, event_type, title, description,
    before_value, after_value, created_by
  ) values (
    p_supply_id,
    v_event_date,
    'holder_change',
    'Cambio de titular',
    'Cambio de titular aplicado desde la última factura validada por identificación fiscal distinta.',
    jsonb_build_object(
      'holder_id', v_old_holder.id,
      'client_id', v_old_holder.client_id,
      'legal_name', v_old_holder.legal_name,
      'tax_id', v_old_holder.tax_id
    ),
    jsonb_build_object(
      'holder_id', v_target_holder.id,
      'client_id', v_target_holder.client_id,
      'legal_name', v_target_holder.legal_name,
      'tax_id', v_target_holder.tax_id,
      'source_invoice_id', v_latest.id
    ),
    v_user
  );

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'supply_holder_reassigned',
    'supply',
    p_supply_id,
    jsonb_build_object(
      'source_invoice_id', v_latest.id,
      'old_holder_id', v_old_holder.id,
      'old_client_id', v_old_holder.client_id,
      'new_holder_id', v_target_holder.id,
      'new_client_id', v_target_holder.client_id
    )
  );

  select count(*) into v_old_active_count
  from public.supplies
  where holder_id = v_old_holder.id
    and status = 'active';

  return jsonb_build_object(
    'ok', true,
    'mode', 'reassigned_from_latest_valid_invoice',
    'supply_id', p_supply_id,
    'source_invoice_id', v_latest.id,
    'old_holder_id', v_old_holder.id,
    'old_client_id', v_old_holder.client_id,
    'new_holder_id', v_target_holder.id,
    'new_client_id', v_target_holder.client_id,
    'old_holder_active_supplies', v_old_active_count
  );
end;
$$;

revoke all on function public.admin_apply_latest_invoice_holder(uuid) from public, anon, authenticated;
grant execute on function public.admin_apply_latest_invoice_holder(uuid) to authenticated;
