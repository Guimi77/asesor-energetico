alter table public.supplies
  add column if not exists contracted_power_kw jsonb not null default '{}'::jsonb,
  add column if not exists max_contractable_power_kw numeric(12,3),
  add column if not exists power_profile_source text,
  add column if not exists power_profile_updated_at timestamptz,
  add column if not exists power_profile_updated_by uuid references auth.users(id);

alter table public.supplies
  drop constraint if exists supplies_contracted_power_kw_object,
  add constraint supplies_contracted_power_kw_object
    check (jsonb_typeof(contracted_power_kw) = 'object');

alter table public.supplies
  drop constraint if exists supplies_max_contractable_power_kw_nonnegative,
  add constraint supplies_max_contractable_power_kw_nonnegative
    check (max_contractable_power_kw is null or max_contractable_power_kw >= 0);

create or replace function public.set_internal_supply_power_profile(
  p_cups text,
  p_contracted_power_kw jsonb,
  p_max_contractable_power_kw numeric,
  p_mode text default 'manual',
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_mode text := lower(trim(coalesce(p_mode,'manual')));
  v_source text := nullif(trim(coalesce(p_source,'')), '');
  v_cups_key text := left(upper(regexp_replace(coalesce(p_cups,''), '[^A-Za-z0-9]', '', 'g')),20);
  v_power jsonb := coalesce(p_contracted_power_kw,'{}'::jsonb);
  v_supply public.supplies%rowtype;
  v_merged jsonb;
  v_key text;
  v_value jsonb;
  v_number numeric;
  v_max numeric := p_max_contractable_power_kw;
begin
  if v_user is null or not private.is_internal_user() then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  if v_mode not in ('manual','fill_only') then
    return jsonb_build_object('ok',false,'reason','invalid_mode');
  end if;

  if length(v_cups_key) < 20 or left(v_cups_key,2) <> 'ES' then
    return jsonb_build_object('ok',false,'reason','invalid_cups');
  end if;

  if jsonb_typeof(v_power) <> 'object' then
    return jsonb_build_object('ok',false,'reason','invalid_contracted_power');
  end if;

  for v_key,v_value in select key,value from jsonb_each(v_power)
  loop
    if v_key !~ '^P[1-6]$' or jsonb_typeof(v_value) <> 'number' then
      return jsonb_build_object('ok',false,'reason','invalid_contracted_power');
    end if;
    v_number := (v_value::text)::numeric;
    if v_number < 0 then
      return jsonb_build_object('ok',false,'reason','invalid_contracted_power');
    end if;
  end loop;

  if v_max is not null and v_max < 0 then
    return jsonb_build_object('ok',false,'reason','invalid_max_contractable_power');
  end if;

  select *
  into v_supply
  from public.supplies
  where left(cups_key,20)=v_cups_key
  order by created_at
  limit 1
  for update;

  if v_supply.id is null then
    return jsonb_build_object('ok',false,'reason','supply_not_found');
  end if;

  v_merged := case
    when v_mode='fill_only' then v_power || coalesce(v_supply.contracted_power_kw,'{}'::jsonb)
    else v_power
  end;

  if v_mode='fill_only' and v_max is null then
    v_max := v_supply.max_contractable_power_kw;
  end if;

  if v_max is not null and exists(
    select 1
    from jsonb_each(v_merged) e
    where jsonb_typeof(e.value)='number'
      and (e.value::text)::numeric > v_max
  ) then
    return jsonb_build_object('ok',false,'reason','contracted_exceeds_max_contractable');
  end if;

  update public.supplies
  set contracted_power_kw=v_merged,
      max_contractable_power_kw=v_max,
      power_profile_source=coalesce(v_source,case when v_mode='fill_only' then 'fill_only' else 'manual' end),
      power_profile_updated_at=now(),
      power_profile_updated_by=v_user,
      updated_at=now()
  where id=v_supply.id;

  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
  values(
    v_user,
    'supply_power_profile_updated',
    'supply',
    v_supply.id,
    jsonb_build_object(
      'mode',v_mode,
      'source',coalesce(v_source,''),
      'contracted_power_kw',v_merged,
      'max_contractable_power_kw',v_max
    )
  );

  return jsonb_build_object(
    'ok',true,
    'supply_id',v_supply.id,
    'contracted_power_kw',v_merged,
    'max_contractable_power_kw',v_max
  );
end;
$function$;

revoke all on function public.set_internal_supply_power_profile(text,jsonb,numeric,text,text)
  from public, anon, authenticated;
grant execute on function public.set_internal_supply_power_profile(text,jsonb,numeric,text,text)
  to authenticated;
