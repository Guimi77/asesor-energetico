-- Transactional holder lifecycle for the central energy master.
-- Admin-only via the service-role Edge Function. Historical invoice source
-- fields are never rewritten when the current holder changes.

create or replace function public.admin_update_holder(
  p_holder_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_holder public.holders%rowtype;
  v_client public.clients%rowtype;
  v_name text := nullif(trim(coalesce(p_legal_name, '')), '');
  v_tax text := nullif(trim(coalesce(p_tax_id, '')), '');
  v_tax_key text := upper(regexp_replace(coalesce(p_tax_id, ''), '[^A-Za-z0-9]', '', 'g'));
  v_old_tax_key text;
  v_client_tax_key text;
  v_other_count integer := 0;
  v_client_holder_count integer := 0;
  v_sync_client boolean := false;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor and role = 'admin' and active = true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;

  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_holder_name');
  end if;

  select * into v_holder
  from public.holders
  where id = p_holder_id
  for update;

  if v_holder.id is null then
    return jsonb_build_object('ok', false, 'reason', 'holder_not_found');
  end if;

  if v_tax_key <> '' then
    select count(*) into v_other_count
    from public.holders
    where id <> p_holder_id
      and upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) = v_tax_key;
    if v_other_count > 0 then
      return jsonb_build_object('ok', false, 'reason', 'holder_tax_conflict');
    end if;
  end if;

  select count(*) into v_other_count
  from public.holders
  where id <> p_holder_id
    and client_id = v_holder.client_id
    and lower(trim(legal_name)) = lower(v_name);
  if v_other_count > 0 then
    return jsonb_build_object('ok', false, 'reason', 'holder_name_conflict');
  end if;

  select * into v_client
  from public.clients
  where id = v_holder.client_id
  for update;

  select count(*) into v_client_holder_count
  from public.holders
  where client_id = v_holder.client_id;

  v_old_tax_key := upper(regexp_replace(coalesce(v_holder.tax_id,''), '[^A-Za-z0-9]', '', 'g'));
  v_client_tax_key := upper(regexp_replace(coalesce(v_client.tax_id,''), '[^A-Za-z0-9]', '', 'g'));

  v_sync_client :=
    v_client.id is not null
    and v_client_holder_count = 1
    and lower(trim(v_client.name)) = lower(trim(v_holder.legal_name))
    and (
      v_old_tax_key = ''
      or v_client_tax_key = ''
      or v_old_tax_key = v_client_tax_key
    );

  update public.holders
  set legal_name = v_name,
      tax_id = v_tax,
      updated_at = now()
  where id = p_holder_id;

  if v_sync_client then
    update public.clients
    set name = v_name,
        tax_id = v_tax,
        updated_at = now()
    where id = v_holder.client_id;
  end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (
    p_actor,
    'holder_updated',
    'holder',
    p_holder_id,
    jsonb_build_object(
      'before', jsonb_build_object('legal_name', v_holder.legal_name, 'tax_id', v_holder.tax_id),
      'after', jsonb_build_object('legal_name', v_name, 'tax_id', v_tax),
      'client_synced', v_sync_client
    )
  );

  return jsonb_build_object(
    'ok', true,
    'holder_id', p_holder_id,
    'client_id', v_holder.client_id,
    'client_synced', v_sync_client
  );
end;
$$;

create or replace function public.admin_reassign_supply_holder(
  p_supply_id uuid,
  p_target_holder_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_supply public.supplies%rowtype;
  v_old_holder public.holders%rowtype;
  v_new_holder public.holders%rowtype;
  v_new_client public.clients%rowtype;
  v_old_active integer := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor and role = 'admin' and active = true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;

  if p_target_holder_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_target_holder');
  end if;

  select * into v_supply
  from public.supplies
  where id = p_supply_id
  for update;

  if v_supply.id is null then
    return jsonb_build_object('ok', false, 'reason', 'supply_not_found');
  end if;

  select * into v_old_holder
  from public.holders
  where id = v_supply.holder_id;

  select * into v_new_holder
  from public.holders
  where id = p_target_holder_id;

  if v_new_holder.id is null then
    return jsonb_build_object('ok', false, 'reason', 'target_holder_not_found');
  end if;

  if v_new_holder.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'target_holder_not_active');
  end if;

  select * into v_new_client
  from public.clients
  where id = v_new_holder.client_id;

  if v_new_client.id is null or v_new_client.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'target_client_not_active');
  end if;

  if v_supply.holder_id = p_target_holder_id then
    return jsonb_build_object('ok', true, 'mode', 'unchanged', 'supply_id', p_supply_id);
  end if;

  update public.supplies
  set holder_id = p_target_holder_id,
      updated_at = now()
  where id = p_supply_id;

  insert into public.supply_events(
    supply_id, event_date, event_type, title, description,
    before_value, after_value, created_by
  ) values (
    p_supply_id,
    current_date,
    'holder_change',
    'Cambio de titular',
    'Titular actual del CUPS reasignado desde la gestión administrativa.',
    jsonb_build_object(
      'holder_id', v_old_holder.id,
      'client_id', v_old_holder.client_id,
      'legal_name', v_old_holder.legal_name,
      'tax_id', v_old_holder.tax_id
    ),
    jsonb_build_object(
      'holder_id', v_new_holder.id,
      'client_id', v_new_holder.client_id,
      'legal_name', v_new_holder.legal_name,
      'tax_id', v_new_holder.tax_id
    ),
    p_actor
  );

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (
    p_actor,
    'supply_holder_reassigned',
    'supply',
    p_supply_id,
    jsonb_build_object(
      'cups', v_supply.cups,
      'old_holder_id', v_old_holder.id,
      'new_holder_id', v_new_holder.id,
      'old_client_id', v_old_holder.client_id,
      'new_client_id', v_new_holder.client_id
    )
  );

  select count(*) into v_old_active
  from public.supplies
  where holder_id = v_old_holder.id
    and status = 'active';

  return jsonb_build_object(
    'ok', true,
    'mode', 'reassigned',
    'supply_id', p_supply_id,
    'old_holder_id', v_old_holder.id,
    'new_holder_id', v_new_holder.id,
    'old_holder_active_supplies', v_old_active
  );
end;
$$;

create or replace function public.admin_holder_lifecycle(
  p_action text,
  p_holder_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_holder public.holders%rowtype;
  v_client public.clients%rowtype;
  v_supply_count integer := 0;
  v_active_count integer := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor and role = 'admin' and active = true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;

  select * into v_holder
  from public.holders
  where id = p_holder_id
  for update;

  if v_holder.id is null then
    return jsonb_build_object('ok', false, 'reason', 'holder_not_found');
  end if;

  select count(*) into v_supply_count
  from public.supplies
  where holder_id = p_holder_id;

  select count(*) into v_active_count
  from public.supplies
  where holder_id = p_holder_id and status = 'active';

  if p_action = 'archive_holder' then
    if v_active_count > 0 then
      return jsonb_build_object(
        'ok', false,
        'reason', 'holder_has_active_supplies',
        'dependencies', jsonb_build_object('active_supplies', v_active_count, 'supplies', v_supply_count)
      );
    end if;

    update public.holders
    set status = 'archived', updated_at = now()
    where id = p_holder_id;

  elsif p_action = 'restore_holder' then
    select * into v_client from public.clients where id = v_holder.client_id;
    if v_client.id is null or v_client.status <> 'active' then
      return jsonb_build_object('ok', false, 'reason', 'target_client_not_active');
    end if;

    update public.holders
    set status = 'active', updated_at = now()
    where id = p_holder_id;

  elsif p_action = 'delete_holder' then
    if v_supply_count > 0 then
      return jsonb_build_object(
        'ok', false,
        'reason', 'holder_has_supplies',
        'dependencies', jsonb_build_object('supplies', v_supply_count, 'active_supplies', v_active_count)
      );
    end if;

    delete from public.holders where id = p_holder_id;

  else
    return jsonb_build_object('ok', false, 'reason', 'unknown_holder_action');
  end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (
    p_actor,
    p_action,
    'holder',
    p_holder_id,
    jsonb_build_object(
      'legal_name', v_holder.legal_name,
      'client_id', v_holder.client_id,
      'supplies', v_supply_count,
      'active_supplies', v_active_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'holder_id', p_holder_id,
    'supplies', v_supply_count,
    'active_supplies', v_active_count
  );
end;
$$;

revoke all on function public.admin_update_holder(uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_reassign_supply_holder(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_holder_lifecycle(text,uuid,uuid) from public, anon, authenticated;

grant execute on function public.admin_update_holder(uuid,text,text,uuid) to service_role;
grant execute on function public.admin_reassign_supply_holder(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_holder_lifecycle(text,uuid,uuid) to service_role;
