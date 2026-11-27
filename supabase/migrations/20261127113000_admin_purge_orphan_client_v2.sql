-- Extend supply purge so an empty client is removed in the same transaction.
-- No data is deleted when this migration is applied.
create or replace function public.admin_purge_supply_and_client_v2(
  p_supply_id uuid,
  p_execute boolean default false,
  p_confirm_cups text default null,
  p_expected_signature text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_client public.clients%rowtype;
  v_holder_id uuid;
  v_client_id uuid;
  v_other_holders integer;
  v_linked_users integer;
  v_preview jsonb;
  v_signature text;
  v_old_signature text;
  v_result jsonb;
  v_client_deleted boolean := false;
  v_count integer;
begin
  -- Check authorization before exposing private client metadata.
  if auth.uid() is null or not exists(
    select 1 from public.profiles
    where id=auth.uid() and active=true and role::text='admin'
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if p_supply_id is null then
    return jsonb_build_object('ok',false,'reason','supply_required');
  end if;

  select h.client_id,h.id into v_client_id,v_holder_id
  from public.supplies s join public.holders h on h.id=s.holder_id
  where s.id=p_supply_id;
  if not found then
    return jsonb_build_object('ok',false,'reason','supply_not_found');
  end if;
  select * into v_client from public.clients where id=v_client_id for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','client_not_found');
  end if;
  select count(*) into v_other_holders
    from public.holders where client_id=v_client_id and id<>v_holder_id;
  select count(*) into v_linked_users
    from public.client_users where client_id=v_client_id;

  -- Reuse the established guarded purge implementation for all supply details.
  v_preview:=public.admin_purge_supply_v1(p_supply_id,false,null,null);
  if not coalesce((v_preview->>'ok')::boolean,false) then return v_preview; end if;
  v_old_signature:=v_preview->>'signature';
  v_signature:=md5(concat_ws('|',v_old_signature,v_client.id,v_client.updated_at,
    v_client.name,v_other_holders,v_linked_users));

  if not p_execute then
    return v_preview || jsonb_build_object(
      'client',v_client.name,'client_id',v_client.id,
      'client_will_be_deleted',
        (v_preview->>'holder_will_be_deleted')::boolean and v_other_holders=0,
      'other_client_holders',v_other_holders,
      'client_user_links_to_remove',
        case when (v_preview->>'holder_will_be_deleted')::boolean and v_other_holders=0
          then v_linked_users else 0 end,
      'signature',v_signature
    );
  end if;

  if p_confirm_cups is distinct from v_preview->>'cups'
    or coalesce(p_expected_signature,'')<>v_signature then
    return jsonb_build_object('ok',false,'reason','confirmation_or_preview_stale');
  end if;

  v_result:=public.admin_purge_supply_v1(
    p_supply_id,true,p_confirm_cups,v_old_signature
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

  -- No client may be deleted while it still has any holder, including archived
  -- holders. Deleting client_users only unlinks access; auth.users is untouched.
  if (v_result->>'holder_deleted')::boolean and v_other_holders=0 then
    delete from public.clients
      where id=v_client.id
        and not exists(select 1 from public.holders where client_id=v_client.id);
    get diagnostics v_count = row_count;
    v_client_deleted := v_count=1;
  end if;

  return v_result || jsonb_build_object(
    'client_deleted',v_client_deleted,
    'client_user_links_removed',case when v_client_deleted then v_linked_users else 0 end
  );
end;
$function$;
revoke all on function public.admin_purge_supply_and_client_v2(uuid,boolean,text,text)
from public, anon, authenticated;
grant execute on function public.admin_purge_supply_and_client_v2(uuid,boolean,text,text)
to authenticated;
