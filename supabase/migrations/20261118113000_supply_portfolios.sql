-- Agrupacion comercial independiente de cliente/titular fiscal.
-- No cambia public.clients, public.holders, public.supplies ni public.invoices.
create table if not exists private.supply_portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  alias text check (alias is null or char_length(btrim(alias)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create unique index if not exists supply_portfolios_name_unique
  on private.supply_portfolios (lower(btrim(name)));

create table if not exists private.supply_portfolio_members (
  supply_id uuid primary key references public.supplies(id) on delete cascade,
  portfolio_id uuid not null references private.supply_portfolios(id) on delete restrict,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
create index if not exists supply_portfolio_members_portfolio_idx
  on private.supply_portfolio_members(portfolio_id);

-- Adaptar las agrupaciones empresariales ya existentes sin cambiar identidades.
-- Solo agrupar automaticamente clientes de tipo GRUPO con varios titulares;
-- los clientes de un solo titular siguen sin agrupacion comercial nueva.
insert into private.supply_portfolios(name)
select c.name
from public.clients c
join public.holders h on h.client_id=c.id and h.status='active'
where c.status='active' and c.client_type='GRUPO'
group by c.id,c.name
having count(distinct h.id)>1
on conflict do nothing;

insert into private.supply_portfolio_members(supply_id,portfolio_id)
select s.id,p.id
from public.clients c
join public.holders h on h.client_id=c.id and h.status='active'
join public.supplies s on s.holder_id=h.id and s.status='active'
join private.supply_portfolios p on lower(btrim(p.name))=lower(btrim(c.name))
where c.status='active' and c.client_type='GRUPO'
  and (select count(distinct hh.id) from public.holders hh
       where hh.client_id=c.id and hh.status='active')>1
on conflict do nothing;

revoke all on private.supply_portfolios from public, anon, authenticated;
revoke all on private.supply_portfolio_members from public, anon, authenticated;

create or replace function public.get_internal_supply_portfolios()
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_groups jsonb;
  v_members jsonb;
begin
  if auth.uid() is null or not private.is_internal_user() then
    return jsonb_build_object('ok',false,'reason','not_authorized');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'alias',coalesce(alias,'')) order by name), '[]'::jsonb)
    into v_groups from private.supply_portfolios;
  select coalesce(jsonb_object_agg(supply_id::text,portfolio_id::text),'{}'::jsonb)
    into v_members from private.supply_portfolio_members;
  return jsonb_build_object('ok',true,'groups',v_groups,'members',v_members);
end;
$$;

create or replace function public.set_internal_supply_portfolio(
  p_supply_id uuid,
  p_group_id uuid default null,
  p_new_name text default null,
  p_new_alias text default null
)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid := p_group_id;
  v_name text := nullif(btrim(coalesce(p_new_name,'')),'');
  v_alias text := nullif(btrim(coalesce(p_new_alias,'')),'');
  v_old_id uuid;
  v_group_name text;
begin
  if v_actor is null or not private.is_internal_user() then
    return jsonb_build_object('ok',false,'reason','not_authorized');
  end if;
  if p_supply_id is null or not exists(select 1 from public.supplies where id=p_supply_id and status='active') then
    return jsonb_build_object('ok',false,'reason','supply_not_found');
  end if;
  if p_group_id is not null and v_name is not null then
    return jsonb_build_object('ok',false,'reason','ambiguous_destination');
  end if;
  if v_name is not null and (char_length(v_name)>160 or (v_alias is not null and char_length(v_alias)>100)) then
    return jsonb_build_object('ok',false,'reason','invalid_group_name_or_alias');
  end if;
  if p_group_id is null and v_name is null and v_alias is not null then
    return jsonb_build_object('ok',false,'reason','alias_without_group');
  end if;

  perform 1 from public.supplies where id=p_supply_id for update;
  select portfolio_id into v_old_id from private.supply_portfolio_members where supply_id=p_supply_id for update;

  if v_name is not null then
    if exists(select 1 from private.supply_portfolios where lower(btrim(name))=lower(v_name)) then
      return jsonb_build_object('ok',false,'reason','group_name_exists');
    end if;
    insert into private.supply_portfolios(name,alias,created_by)
    values(v_name,v_alias,v_actor) returning id into v_group_id;
  elsif v_group_id is not null and not exists(select 1 from private.supply_portfolios where id=v_group_id) then
    return jsonb_build_object('ok',false,'reason','group_not_found');
  end if;

  if v_group_id is null then
    delete from private.supply_portfolio_members where supply_id=p_supply_id;
  else
    insert into private.supply_portfolio_members(supply_id,portfolio_id,changed_by)
    values(p_supply_id,v_group_id,v_actor)
    on conflict(supply_id) do update
      set portfolio_id=excluded.portfolio_id,
          changed_at=now(),changed_by=excluded.changed_by;
  end if;

  select name into v_group_name from private.supply_portfolios where id=v_group_id;
  if v_old_id is distinct from v_group_id then
    insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
    values(v_actor,'supply_portfolio_assigned','supply',p_supply_id,
           jsonb_build_object('previous_group_id',v_old_id,'new_group_id',v_group_id));
  end if;
  return jsonb_build_object('ok',true,'supply_id',p_supply_id,'group_id',v_group_id,'name',coalesce(v_group_name,''));
end;
$$;

create or replace function public.set_internal_supply_portfolio_alias(
  p_group_id uuid,
  p_alias text
)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_old text;
  v_new text := nullif(btrim(coalesce(p_alias,'')),'');
begin
  if v_actor is null or not private.is_internal_user() then
    return jsonb_build_object('ok',false,'reason','not_authorized');
  end if;
  if v_new is not null and char_length(v_new)>100 then
    return jsonb_build_object('ok',false,'reason','invalid_alias');
  end if;
  select alias into v_old from private.supply_portfolios where id=p_group_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','group_not_found'); end if;
  update private.supply_portfolios set alias=v_new,updated_at=now() where id=p_group_id;
  if v_old is distinct from v_new then
    insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
    values(v_actor,'supply_portfolio_alias_changed','supply_portfolio',p_group_id,
           jsonb_build_object('previous_alias',v_old,'new_alias',v_new));
  end if;
  return jsonb_build_object('ok',true,'group_id',p_group_id,'alias',coalesce(v_new,''));
end;
$$;

revoke all on function public.get_internal_supply_portfolios() from public, anon;
revoke all on function public.set_internal_supply_portfolio(uuid,uuid,text,text) from public, anon;
revoke all on function public.set_internal_supply_portfolio_alias(uuid,text) from public, anon;
grant execute on function public.get_internal_supply_portfolios() to authenticated;
grant execute on function public.set_internal_supply_portfolio(uuid,uuid,text,text) to authenticated;
grant execute on function public.set_internal_supply_portfolio_alias(uuid,text) to authenticated;
