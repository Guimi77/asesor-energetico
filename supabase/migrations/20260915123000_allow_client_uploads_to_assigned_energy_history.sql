-- Allow active client accounts to ingest validated invoices only for supplies
-- belonging to client records explicitly assigned to their user.
-- Internal staff keep the existing ability to create new client/holder/supply identities.

create or replace function private.can_ingest_energy_history_cups(p_cups text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'auth'
as $function$
  select coalesce(
    private.is_internal_user()
    or exists (
      select 1
      from public.supplies s
      join public.holders h on h.id = s.holder_id
      join public.client_users cu on cu.client_id = h.client_id
      join public.profiles p on p.id = cu.user_id
      where cu.user_id = auth.uid()
        and p.active = true
        and p.role = 'client'
        and left(s.cups_key,20) = left(
          upper(regexp_replace(coalesce(p_cups,''), '[^A-Za-z0-9]', '', 'g')),
          20
        )
    ),
    false
  );
$function$;

revoke all on function private.can_ingest_energy_history_cups(text) from public;

-- The legacy writer and safe writer remain protected APIs. Patch their
-- authorization check so nested calls from the public RPC can write only an
-- assigned CUPS for client accounts. Existing internal behaviour is unchanged.
do $migration$
declare
  v_src text;
  v_old text := 'if v_user is null or not private.is_internal_user() then
    raise exception ''not_authorized'';
  end if;';
  v_new text := 'if v_user is null or not private.can_ingest_energy_history_cups(v_cups) then
    raise exception ''not_authorized'';
  end if;';
  v_old_filter text := 'where upper(c.name) = ''GRUPO XTRA''
    and left(s.cups_key,20) = left(v_cups,20)';
  v_new_filter text := 'where left(s.cups_key,20) = left(v_cups,20)';
begin
  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='ingest_xtra_energy_history_safe'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
  if v_src is null or position(v_old in v_src)=0 then
    raise exception 'Expected auth guard not found in ingest_xtra_energy_history_safe';
  end if;
  v_src := replace(v_src,v_old,v_new);
  execute format(
    'create or replace function public.ingest_xtra_energy_history_safe(p_payload jsonb) returns jsonb language plpgsql security definer set search_path to ''public'', ''private'', ''auth'' as %L',
    v_src
  );

  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='upsert_xtra_energy_history_legacy'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
  if v_src is null or position(v_old in v_src)=0 then
    raise exception 'Expected auth guard not found in upsert_xtra_energy_history_legacy';
  end if;
  v_src := replace(v_src,v_old,v_new);
  execute format(
    'create or replace function public.upsert_xtra_energy_history_legacy(p_payload jsonb) returns jsonb language plpgsql security definer set search_path to ''public'', ''private'', ''auth'' as %L',
    v_src
  );

  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='enrich_xtra_invoice_reading_status'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
  if v_src is null or position(v_old in v_src)=0 then
    raise exception 'Expected auth guard not found in enrich_xtra_invoice_reading_status';
  end if;
  if position(v_old_filter in v_src)=0 then
    raise exception 'Expected XTRA filter not found in enrich_xtra_invoice_reading_status';
  end if;
  v_src := replace(v_src,v_old,v_new);
  v_src := replace(v_src,v_old_filter,v_new_filter);
  execute format(
    'create or replace function public.enrich_xtra_invoice_reading_status(p_payload jsonb) returns jsonb language plpgsql security definer set search_path to ''public'', ''private'', ''auth'' as %L',
    v_src
  );
end;
$migration$;

-- Public RPC used by the browser. Internal users may still bootstrap a new
-- supply. Client accounts may only target an already existing assigned CUPS.
create or replace function public.upsert_xtra_energy_history(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'auth'
as $function$
declare
  v_user uuid := auth.uid();
  v_supply uuid;
  v_client uuid;
  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'not_authorized';
  end if;

  if coalesce((p_payload->>'validated')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_validated');
  end if;

  if private.is_internal_user() then
    v_supply := private.ensure_energy_history_supply(p_payload);
    if v_supply is null then
      return jsonb_build_object('ok', false, 'reason', 'supply_identity_missing');
    end if;
  else
    select s.id, h.client_id into v_supply, v_client
    from public.supplies s
    join public.holders h on h.id=s.holder_id
    where left(s.cups_key,20)=left(v_cups,20)
    limit 1;

    if v_supply is null
       or v_client is null
       or not private.can_access_client(v_client)
       or not private.can_ingest_energy_history_cups(v_cups) then
      return jsonb_build_object(
        'ok', false,
        'reason', 'cups_not_assigned_to_account',
        'scope', 'client'
      );
    end if;
  end if;

  v_result := public.ingest_xtra_energy_history_safe(p_payload);
  return coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object(
      'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
      'uploaded_by', v_user
    );
end;
$function$;

revoke all on function public.upsert_xtra_energy_history(jsonb) from public, anon;
grant execute on function public.upsert_xtra_energy_history(jsonb) to authenticated, service_role;

-- Reading-quality enrichment follows the same assigned-CUPS rule. Anonymous
-- execution is unnecessary and is explicitly removed.
revoke all on function public.enrich_xtra_invoice_reading_status(jsonb) from public, anon;
grant execute on function public.enrich_xtra_invoice_reading_status(jsonb) to authenticated, service_role;

-- Keep the implementation-only legacy writer unavailable to browser users.
revoke all on function public.upsert_xtra_energy_history_legacy(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_xtra_energy_history_legacy(jsonb) to service_role;
