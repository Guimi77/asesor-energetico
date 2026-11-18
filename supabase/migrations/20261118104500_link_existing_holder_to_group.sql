-- Link an existing holder to a business group without altering its supplies or invoices.
-- Moving a holder changes its portfolio parent, not its legal identity.
create or replace function public.link_existing_holder_to_group(
  p_holder_id uuid,
  p_target_client_id uuid,
  p_expected_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_holder public.holders%rowtype;
  v_target public.clients%rowtype;
  v_duplicate_id uuid;
  v_supply_count integer;
begin
  if v_actor is null or not private.is_internal_user() then
    return jsonb_build_object('ok',false,'reason','not_authorized');
  end if;

  if p_holder_id is null or p_target_client_id is null or p_expected_client_id is null then
    return jsonb_build_object('ok',false,'reason','identity_required');
  end if;

  select * into v_holder from public.holders
  where id = p_holder_id and status = 'active' for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','holder_not_found');
  end if;

  if v_holder.client_id is distinct from p_expected_client_id then
    return jsonb_build_object('ok',false,'reason','holder_client_changed');
  end if;

  select * into v_target from public.clients
  where id = p_target_client_id and status = 'active' and client_type = 'GRUPO'
  for share;
  if not found then
    return jsonb_build_object('ok',false,'reason','target_group_not_found');
  end if;

  if v_target.id = v_holder.client_id then
    return jsonb_build_object('ok',true,'mode','already_linked','holder_id',v_holder.id,'group_id',v_target.id);
  end if;

  -- Never merge two holders that share a fiscal or legal identity.
  select h.id into v_duplicate_id
  from public.holders h
  where h.client_id = v_target.id and h.id <> v_holder.id
    and h.status = 'active'
    and (
      (nullif(btrim(coalesce(v_holder.tax_id,'')),'') is not null
       and upper(regexp_replace(coalesce(h.tax_id,''),'[^A-Za-z0-9]','','g')) =
           upper(regexp_replace(v_holder.tax_id,'[^A-Za-z0-9]','','g')))
      or lower(btrim(h.legal_name)) = lower(btrim(v_holder.legal_name))
    )
  limit 1;

  if v_duplicate_id is not null then
    return jsonb_build_object('ok',false,'reason','holder_already_exists_in_group');
  end if;

  select count(*) into v_supply_count from public.supplies where holder_id = v_holder.id;

  update public.holders
     set client_id = v_target.id, updated_at = now()
   where id = v_holder.id;

  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
  values (
    v_actor,'holder_linked_to_group','holder',v_holder.id,
    jsonb_build_object(
      'previous_client_id',v_holder.client_id,
      'group_client_id',v_target.id,
      'supply_count',v_supply_count,
      'holder_name',v_holder.legal_name
    )
  );

  return jsonb_build_object(
    'ok',true,'mode','linked','holder_id',v_holder.id,
    'previous_client_id',v_holder.client_id,'group_id',v_target.id,
    'supply_count',v_supply_count
  );
end;
$function$;

revoke all on function public.link_existing_holder_to_group(uuid,uuid,uuid) from public,anon;
grant execute on function public.link_existing_holder_to_group(uuid,uuid,uuid) to authenticated;
