-- Canonical CUPS identity uses the first 20 characters.
-- Supplies may retain 22-character full CUPS in the generated cups_key.
-- Adjust only the client insert-only RPC and leave existing RLS untouched.
do $migration$
declare
  v_src text;
  v_old text := 'where s.cups_key = left(v_cups,20) and s.status = ''active''';
  v_new text := 'where left(s.cups_key,20) = left(v_cups,20) and s.status = ''active''';
begin
  select p.prosrc into v_src
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='submit_client_energy_invoice_v1'
     and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';

  if v_src is null or position(v_old in v_src)=0 then
    raise exception 'Expected client CUPS lookup not found; refusing patch';
  end if;

  v_src := replace(v_src,v_old,v_new);

  execute format(
    'create or replace function public.submit_client_energy_invoice_v1(p_payload jsonb)
      returns jsonb language plpgsql security definer
      set search_path to ''public'', ''private'', ''auth'' as %L',
    v_src
  );
end;
$migration$;
