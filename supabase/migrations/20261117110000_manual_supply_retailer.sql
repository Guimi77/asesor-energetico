-- Comercializadora manual prevalente por CUPS, sin modificar las facturas historicas.
-- La fuente automatica queda desactivada para este suministro cuando se fija un valor manual.
alter table public.supplies
  add column if not exists manual_retailer text,
  add column if not exists manual_retailer_at timestamptz,
  add column if not exists manual_retailer_by uuid;

alter table public.supplies
  add constraint supplies_manual_retailer_not_blank
  check (manual_retailer is null or length(btrim(manual_retailer)) > 0);

create or replace function private.enforce_manual_supply_retailer()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $function$
begin
  -- All existing invoice/master import paths write only current_retailer.
  -- If manually fixed, keep that choice regardless of later automatic writes.
  if new.manual_retailer is not null then
    new.current_retailer := new.manual_retailer;
  elsif old.manual_retailer is not null and new.manual_retailer is not distinct from old.manual_retailer then
    new.current_retailer := old.manual_retailer;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_supplies_manual_retailer on public.supplies;
create trigger trg_supplies_manual_retailer
before update on public.supplies
for each row execute function private.enforce_manual_supply_retailer();

create or replace function public.set_supply_retailer_manual(p_cups text, p_retailer text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_cups_key text := left(upper(regexp_replace(coalesce(p_cups,''), '[^A-Za-z0-9]', '', 'g')), 20);
  v_retailer text := nullif(btrim(coalesce(p_retailer,'')), '');
  v_supply public.supplies%rowtype;
  v_previous text;
begin
  if v_user is null or not private.is_internal_user() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if length(v_cups_key) <> 20 or left(v_cups_key, 2) <> 'ES' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_cups');
  end if;
  if v_retailer is null or length(v_retailer) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_retailer');
  end if;

  select * into v_supply
  from public.supplies
  where left(cups_key, 20) = v_cups_key and status = 'active'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'supply_not_found');
  end if;

  v_previous := v_supply.current_retailer;
  update public.supplies
     set manual_retailer = v_retailer,
         current_retailer = v_retailer,
         manual_retailer_at = now(),
         manual_retailer_by = v_user,
         updated_at = now()
   where id = v_supply.id;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (v_user, 'supply_retailer_fixed_manually', 'supply', v_supply.id,
          jsonb_build_object('previous_retailer', v_previous, 'manual_retailer', v_retailer, 'cups', v_cups_key));

  return jsonb_build_object('ok', true, 'cups', v_cups_key, 'retailer', v_retailer, 'source', 'manual');
end;
$function$;

revoke all on function public.set_supply_retailer_manual(text,text) from public, anon;
grant execute on function public.set_supply_retailer_manual(text,text) to authenticated;
