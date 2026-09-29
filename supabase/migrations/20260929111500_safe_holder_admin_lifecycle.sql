-- Safe administrative lifecycle for legal holders.
-- Holder identity edits and supply reassignment are handled by the existing
-- dedicated RPCs. This function only archives/restores/deletes holder records
-- without changing clients, supplies or invoice evidence.

create or replace function public.admin_manage_holder_lifecycle(
  p_holder_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_holder public.holders%rowtype;
  v_client public.clients%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_supply_count integer := 0;
  v_active_supply_count integer := 0;
begin
  if v_user is null or not exists (
    select 1
    from public.profiles
    where id = v_user
      and role = 'admin'
      and active is true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;

  if p_holder_id is null or v_action not in ('archive', 'restore', 'delete') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_holder_lifecycle_request');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('holder-lifecycle|' || p_holder_id::text, 0));

  select *
  into v_holder
  from public.holders
  where id = p_holder_id
  for update;

  if v_holder.id is null then
    return jsonb_build_object('ok', false, 'reason', 'holder_not_found');
  end if;

  select count(*),
         count(*) filter (where status = 'active')
  into v_supply_count, v_active_supply_count
  from public.supplies
  where holder_id = p_holder_id;

  if v_action = 'archive' then
    if v_active_supply_count > 0 then
      return jsonb_build_object(
        'ok', false,
        'reason', 'holder_has_active_supplies',
        'supplies', v_supply_count,
        'active_supplies', v_active_supply_count
      );
    end if;

    if v_holder.status <> 'archived' then
      update public.holders
      set status = 'archived',
          updated_at = now()
      where id = p_holder_id;
    end if;

    insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
    values (
      v_user,
      'holder_archived',
      'holder',
      p_holder_id,
      jsonb_build_object(
        'legal_name', v_holder.legal_name,
        'tax_id', v_holder.tax_id,
        'client_id', v_holder.client_id,
        'supplies', v_supply_count,
        'active_supplies', v_active_supply_count
      )
    );

    return jsonb_build_object(
      'ok', true,
      'action', 'archive_holder',
      'holder_id', p_holder_id,
      'status', 'archived',
      'supplies', v_supply_count,
      'active_supplies', v_active_supply_count
    );
  end if;

  if v_action = 'restore' then
    select *
    into v_client
    from public.clients
    where id = v_holder.client_id
    for share;

    if v_client.id is null or v_client.status <> 'active' then
      return jsonb_build_object('ok', false, 'reason', 'target_client_not_active');
    end if;

    if v_holder.status <> 'active' then
      update public.holders
      set status = 'active',
          updated_at = now()
      where id = p_holder_id;
    end if;

    insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
    values (
      v_user,
      'holder_restored',
      'holder',
      p_holder_id,
      jsonb_build_object(
        'legal_name', v_holder.legal_name,
        'tax_id', v_holder.tax_id,
        'client_id', v_holder.client_id,
        'supplies', v_supply_count,
        'active_supplies', v_active_supply_count
      )
    );

    return jsonb_build_object(
      'ok', true,
      'action', 'restore_holder',
      'holder_id', p_holder_id,
      'status', 'active',
      'supplies', v_supply_count,
      'active_supplies', v_active_supply_count
    );
  end if;

  if v_holder.status <> 'archived' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'holder_must_be_archived',
      'supplies', v_supply_count,
      'active_supplies', v_active_supply_count
    );
  end if;

  if v_supply_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'holder_has_supplies',
      'supplies', v_supply_count,
      'active_supplies', v_active_supply_count
    );
  end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'holder_deleted',
    'holder',
    p_holder_id,
    jsonb_build_object(
      'legal_name', v_holder.legal_name,
      'tax_id', v_holder.tax_id,
      'client_id', v_holder.client_id,
      'supplies', 0,
      'active_supplies', 0
    )
  );

  delete from public.holders
  where id = p_holder_id;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete_holder',
    'holder_id', p_holder_id,
    'deleted', true,
    'supplies', 0,
    'active_supplies', 0
  );
end;
$$;

revoke all on function public.admin_manage_holder_lifecycle(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_manage_holder_lifecycle(uuid, text) to authenticated;
