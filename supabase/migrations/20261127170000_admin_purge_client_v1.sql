-- Administrator-only complete client deletion, including all holders and supplies.
-- Applying this migration DOES NOT delete any data.
create or replace function public.admin_purge_client_v1(
  p_client_id uuid,
  p_execute boolean default false,
  p_confirm_name text default null,
  p_expected_signature text default null
) returns jsonb
language plpgsql security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_client public.clients%rowtype;
  v_supply record;
  v_preview jsonb;
  v_result jsonb;
  v_cups jsonb := '[]'::jsonb;
  v_signature_parts text := '';
  v_signature text;
  v_holder_count integer;
  v_supply_count integer := 0;
  v_invoice_count integer := 0;
  v_detail_count integer := 0;
  v_linked_users integer := 0;
  v_deleted_invoices integer := 0;
  v_deleted_supplies integer := 0;
  v_remaining integer;
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles
      where id=auth.uid() and active=true and role::text='admin'
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if p_client_id is null then
    return jsonb_build_object('ok',false,'reason','client_required');
  end if;
  select * into v_client from public.clients where id=p_client_id for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','client_not_found');
  end if;
  -- Lock holders before gathering supply details; a client never shares
  -- holder rows with another client.
  perform 1 from public.holders where client_id=p_client_id order by id for update;
  select count(*) into v_holder_count from public.holders where client_id=p_client_id;
  select count(*) into v_linked_users from public.client_users where client_id=p_client_id;

  for v_supply in
    select s.id,s.cups from public.supplies s
      join public.holders h on h.id=s.holder_id
      where h.client_id=p_client_id order by s.id for update of s
  loop
    v_preview:=public.admin_purge_supply_v1(v_supply.id,false,null,null);
    if not coalesce((v_preview->>'ok')::boolean,false) then
      raise exception 'supply_preview_failed: %',coalesce(v_preview->>'reason','unknown');
    end if;
    v_supply_count:=v_supply_count+1;
    v_invoice_count:=v_invoice_count+(v_preview->>'invoice_count')::integer;
    v_detail_count:=v_detail_count+(v_preview->>'detail_count')::integer;
    v_cups:=v_cups || jsonb_build_array(
      jsonb_build_object('supply_id',v_supply.id,'cups',v_supply.cups,
        'invoice_count',(v_preview->>'invoice_count')::integer)
    );
    v_signature_parts:=v_signature_parts || '|' || v_supply.id::text ||
      ':' || (v_preview->>'signature');
  end loop;
  v_signature:=md5(concat_ws('|',v_client.id,v_client.name,v_client.updated_at,
    v_holder_count,v_linked_users,v_supply_count,v_signature_parts));

  if not p_execute then
    return jsonb_build_object(
      'ok',true,'mode','preview','client_id',v_client.id,
      'client',v_client.name,'holder_count',v_holder_count,
      'supply_count',v_supply_count,'invoice_count',v_invoice_count,
      'detail_count',v_detail_count,'client_user_links',v_linked_users,
      'supplies',v_cups,'signature',v_signature
    );
  end if;

  if p_confirm_name is distinct from v_client.name or
    coalesce(p_expected_signature,'')<>v_signature then
    return jsonb_build_object('ok',false,'reason','confirmation_or_preview_stale');
  end if;
  -- The same transaction is rolled back if any single deletion fails.
  for v_supply in
    select s.id from public.supplies s
      join public.holders h on h.id=s.holder_id
      where h.client_id=p_client_id order by s.id
  loop
    v_preview:=public.admin_purge_supply_v1(v_supply.id,false,null,null);
    v_result:=public.admin_purge_supply_v1(
      v_supply.id,true,v_preview->>'cups',v_preview->>'signature'
    );
    if not coalesce((v_result->>'ok')::boolean,false) or
       coalesce(v_result->>'mode','')<>'deleted' then
      raise exception 'supply_deletion_failed';
    end if;
    v_deleted_supplies:=v_deleted_supplies+1;
    v_deleted_invoices:=v_deleted_invoices+(v_result->>'invoice_count')::integer;
  end loop;
  if v_deleted_supplies<>v_supply_count or v_deleted_invoices<>v_invoice_count then
    raise exception 'deleted_count_mismatch';
  end if;
  delete from public.holders where client_id=p_client_id
    and not exists(select 1 from public.supplies where holder_id=public.holders.id);
  select count(*) into v_remaining from public.holders where client_id=p_client_id;
  if v_remaining<>0 then raise exception 'holders_still_linked'; end if;
  delete from public.clients where id=p_client_id;
  get diagnostics v_remaining=row_count;
  if v_remaining<>1 then raise exception 'client_delete_unconfirmed'; end if;

  return jsonb_build_object('ok',true,'mode','deleted',
    'client_deleted',true,'supply_count',v_deleted_supplies,
    'invoice_count',v_deleted_invoices,'holder_count',v_holder_count,
    'client_user_links_removed',v_linked_users);
end;
$function$;
revoke all on function public.admin_purge_client_v1(uuid,boolean,text,text)
  from public,anon,authenticated;
grant execute on function public.admin_purge_client_v1(uuid,boolean,text,text)
  to authenticated;
