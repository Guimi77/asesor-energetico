-- Internal-only database usage summary for the energy advisor.
-- The frontend may request it, but the database remains the authority: only
-- authenticated admin/staff profiles can receive capacity and row counts.

create or replace function public.get_internal_database_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_database_bytes bigint;
  v_public_schema_bytes bigint;
  v_clients bigint;
  v_holders bigint;
  v_supplies bigint;
  v_invoices bigint;
begin
  if auth.uid() is null or not private.is_internal_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select pg_database_size(current_database()) into v_database_bytes;

  select coalesce(sum(pg_total_relation_size(c.oid)), 0)
  into v_public_schema_bytes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r';

  select count(*) into v_clients from public.clients;
  select count(*) into v_holders from public.holders;
  select count(*) into v_supplies from public.supplies;
  select count(*) into v_invoices from public.invoices;

  return jsonb_build_object(
    'database_bytes', v_database_bytes,
    'public_schema_bytes', v_public_schema_bytes,
    'clients', v_clients,
    'holders', v_holders,
    'supplies', v_supplies,
    'invoices', v_invoices,
    'measured_at', now()
  );
end;
$function$;

revoke all on function public.get_internal_database_usage() from public, anon;
grant execute on function public.get_internal_database_usage() to authenticated, service_role;
