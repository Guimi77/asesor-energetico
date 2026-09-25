create table if not exists private.client_aliases (
  client_id uuid primary key references public.clients(id) on delete cascade,
  alias text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists private.supply_aliases (
  supply_id uuid primary key references public.supplies(id) on delete cascade,
  alias text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create or replace function public.get_internal_aliases()
returns jsonb
language plpgsql
security definer
set search_path to 'private', 'public', 'pg_temp'
as $function$
declare
  v_clients jsonb := '{}'::jsonb;
  v_supplies jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not private.is_internal_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(client_id::text, alias), '{}'::jsonb) into v_clients from private.client_aliases;
  select coalesce(jsonb_object_agg(supply_id::text, alias), '{}'::jsonb) into v_supplies from private.supply_aliases;
  return jsonb_build_object('clients', v_clients, 'supplies', v_supplies);
end;
$function$;

revoke all on function public.get_internal_aliases() from public, anon;
grant execute on function public.get_internal_aliases() to authenticated;

create or replace function public.set_internal_aliases(
  p_cups text, p_client_name text, p_client_tax_id text, p_client_alias text, p_supply_alias text
)
returns jsonb
language plpgsql
security definer
set search_path to 'private', 'public', 'pg_temp'
as $function$
declare
  v_supply_id uuid;
  v_holder_id uuid;
  v_client_id uuid;
  v_cups_key text;
  v_client_alias text := nullif(trim(coalesce(p_client_alias,'')), '');
  v_supply_alias text := nullif(trim(coalesce(p_supply_alias,'')), '');
begin
  if auth.uid() is null or not private.is_internal_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_cups_key := regexp_replace(upper(coalesce(p_cups,'')), '[^A-Z0-9]', '', 'g');
  if v_cups_key <> '' then
    select s.id, s.holder_id into v_supply_id, v_holder_id
    from public.supplies s
    where regexp_replace(upper(coalesce(s.cups_key, s.cups, '')), '[^A-Z0-9]', '', 'g') = v_cups_key
       or regexp_replace(upper(coalesce(s.cups, '')), '[^A-Z0-9]', '', 'g') = v_cups_key
    limit 1;
  end if;
  if v_holder_id is not null then
    select h.client_id into v_client_id from public.holders h where h.id = v_holder_id;
  end if;
  if v_client_id is null and nullif(trim(coalesce(p_client_tax_id,'')), '') is not null then
    select c.id into v_client_id from public.clients c
    where regexp_replace(upper(coalesce(c.tax_id,'')), '[^A-Z0-9]', '', 'g')
        = regexp_replace(upper(coalesce(p_client_tax_id,'')), '[^A-Z0-9]', '', 'g')
    limit 1;
  end if;
  if v_client_id is null and nullif(trim(coalesce(p_client_name,'')), '') is not null then
    select c.id into v_client_id from public.clients c
    where lower(trim(c.name)) = lower(trim(p_client_name)) limit 1;
  end if;
  if v_client_id is not null then
    if v_client_alias is null then delete from private.client_aliases where client_id=v_client_id;
    else insert into private.client_aliases(client_id,alias,updated_at,updated_by)
      values(v_client_id,v_client_alias,now(),auth.uid())
      on conflict(client_id) do update set alias=excluded.alias,updated_at=now(),updated_by=auth.uid();
    end if;
  end if;
  if v_supply_id is not null then
    if v_supply_alias is null then delete from private.supply_aliases where supply_id=v_supply_id;
    else insert into private.supply_aliases(supply_id,alias,updated_at,updated_by)
      values(v_supply_id,v_supply_alias,now(),auth.uid())
      on conflict(supply_id) do update set alias=excluded.alias,updated_at=now(),updated_by=auth.uid();
    end if;
  end if;
  return jsonb_build_object('ok',true,'client_id',v_client_id,'supply_id',v_supply_id);
end;
$function$;

revoke all on function public.set_internal_aliases(text,text,text,text,text) from public, anon;
grant execute on function public.set_internal_aliases(text,text,text,text,text) to authenticated;

alter table public.clients drop column if exists alias;
alter table public.supplies drop column if exists alias;
