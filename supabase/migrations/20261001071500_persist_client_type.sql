-- Persist the conceptual client type so business groups survive reloads and
-- remain distinct from legal holders. Existing data is backfilled
-- conservatively: explicit "GRUPO" names stay groups, natural-person tax IDs
-- become particulars and everything else remains an empresa.

alter table public.clients
  add column if not exists client_type text;

update public.clients
set client_type = case
  when upper(coalesce(name,'')) ~ '(^|[^A-Z])GRUPO([^A-Z]|$)' then 'GRUPO'
  when upper(regexp_replace(coalesce(tax_id,''), '[^A-Za-z0-9]', '', 'g')) ~ '^[0-9]{8}[A-Z]$' then 'PARTICULAR'
  else 'EMPRESA'
end
where client_type is null
   or upper(client_type) not in ('PARTICULAR','EMPRESA','GRUPO','PENDIENTE');

alter table public.clients
  alter column client_type set default 'EMPRESA';

update public.clients
set client_type = 'EMPRESA'
where client_type is null;

alter table public.clients
  alter column client_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_client_type_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_client_type_check
      check (client_type in ('PARTICULAR','EMPRESA','GRUPO','PENDIENTE'));
  end if;
end;
$$;

create or replace function public.save_master_supply_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_type text := upper(trim(coalesce(p_payload->>'client_type','')));
  v_mode text := lower(trim(coalesce(p_payload->>'mode','manual')));
  v_result jsonb;
  v_client_id uuid;
  v_previous_type text;
begin
  if v_type <> '' and v_type not in ('PARTICULAR','EMPRESA','GRUPO','PENDIENTE') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_client_type');
  end if;

  v_result := public.save_master_supply(p_payload);

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

  if v_type <> '' and v_mode = 'manual' then
    v_client_id := nullif(v_result->>'client_id','')::uuid;

    if v_client_id is null then
      raise exception 'master_write_missing_client_id';
    end if;

    select client_type into v_previous_type
    from public.clients
    where id = v_client_id
    for update;

    if v_previous_type is distinct from v_type then
      update public.clients
      set client_type = v_type,
          updated_at = now()
      where id = v_client_id;

      insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
      values (
        auth.uid(),
        'client_type_updated',
        'client',
        v_client_id,
        jsonb_build_object(
          'previous_type', v_previous_type,
          'client_type', v_type,
          'source', 'master_editor'
        )
      );
    end if;
  end if;

  return v_result || jsonb_build_object(
    'client_type',
    coalesce(
      nullif(v_type,''),
      (select client_type from public.clients where id = nullif(v_result->>'client_id','')::uuid)
    )
  );
end;
$$;

revoke all on function public.save_master_supply_v2(jsonb) from public, anon;
grant execute on function public.save_master_supply_v2(jsonb) to authenticated;
