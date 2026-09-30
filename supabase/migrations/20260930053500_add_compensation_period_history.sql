-- Preserve structured self-consumption compensation detail by period.
-- This is separate from power excesses: exported energy kWh must never be stored in invoice_excesses.excess_kw.

create table if not exists public.invoice_compensation_periods (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  period smallint not null check (period between 1 and 6),
  exported_kwh numeric not null check (exported_kwh >= 0),
  unit_price_eur_kwh numeric not null check (unit_price_eur_kwh >= 0),
  amount_eur numeric not null check (amount_eur <= 0),
  vat_rate_pct numeric check (vat_rate_pct is null or (vat_rate_pct >= 0 and vat_rate_pct <= 100)),
  created_at timestamptz not null default now(),
  unique(invoice_id, period)
);

comment on table public.invoice_compensation_periods is
  'Structured compensation for exported self-consumption energy. Kept separate from power excesses.';

alter table public.invoice_compensation_periods enable row level security;

drop policy if exists compensation_periods_select on public.invoice_compensation_periods;
create policy compensation_periods_select
  on public.invoice_compensation_periods
  for select
  to authenticated
  using (private.can_access_client(private.client_id_for_invoice(invoice_id)));

drop policy if exists compensation_periods_internal_insert on public.invoice_compensation_periods;
create policy compensation_periods_internal_insert
  on public.invoice_compensation_periods
  for insert
  to authenticated
  with check (private.is_internal_user());

drop policy if exists compensation_periods_internal_update on public.invoice_compensation_periods;
create policy compensation_periods_internal_update
  on public.invoice_compensation_periods
  for update
  to authenticated
  using (private.is_internal_user())
  with check (private.is_internal_user());

drop policy if exists compensation_periods_internal_delete on public.invoice_compensation_periods;
create policy compensation_periods_internal_delete
  on public.invoice_compensation_periods
  for delete
  to authenticated
  using (private.is_internal_user());

create or replace function private.sync_invoice_compensation_periods(
  p_invoice_id uuid,
  p_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, private, auth
as $fn$
declare
  v_items jsonb;
  v_item jsonb;
  v_invoice_total numeric;
  v_payload_total numeric;
  v_exported_total numeric;
  v_payload_exported numeric;
  v_count integer;
  v_distinct integer;
begin
  if not (p_payload ? 'compensation_periods') then
    return 0;
  end if;

  v_items := coalesce(p_payload->'compensation_periods','[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'compensation_periods_must_be_array';
  end if;

  select compensation_eur into v_invoice_total
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_items) item
    where coalesce(item->>'period','') !~ '^[1-6]$'
       or coalesce(item->>'exported_kwh','') !~ '^[0-9]+([.][0-9]+)?$'
       or coalesce(item->>'unit_price_eur_kwh','') !~ '^[0-9]+([.][0-9]+)?$'
       or coalesce(item->>'amount_eur','') !~ '^-?[0-9]+([.][0-9]+)?$'
       or (item->>'exported_kwh')::numeric < 0
       or (item->>'unit_price_eur_kwh')::numeric < 0
       or (item->>'amount_eur')::numeric > 0
       or (
         nullif(item->>'vat_rate_pct','') is not null
         and (
           item->>'vat_rate_pct' !~ '^[0-9]+([.][0-9]+)?$'
           or (item->>'vat_rate_pct')::numeric < 0
           or (item->>'vat_rate_pct')::numeric > 100
         )
       )
  ) then
    raise exception 'invalid_compensation_period_detail';
  end if;

  select count(*), count(distinct (item->>'period')::integer),
         coalesce(sum((item->>'amount_eur')::numeric),0),
         coalesce(sum((item->>'exported_kwh')::numeric),0)
    into v_count, v_distinct, v_payload_total, v_exported_total
  from jsonb_array_elements(v_items) item;

  if v_count <> v_distinct then
    raise exception 'duplicate_compensation_period';
  end if;

  if v_count > 0 and abs(coalesce(v_invoice_total,0)-v_payload_total) > 0.03 then
    raise exception 'compensation_period_total_mismatch';
  end if;

  if nullif(p_payload->>'exported_kwh','') is not null then
    begin
      v_payload_exported := (p_payload->>'exported_kwh')::numeric;
    exception when others then
      raise exception 'invalid_exported_kwh_total';
    end;
    if v_payload_exported < 0 or abs(v_payload_exported-v_exported_total) > 0.02 then
      raise exception 'exported_kwh_total_mismatch';
    end if;
  end if;

  delete from public.invoice_compensation_periods where invoice_id = p_invoice_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    insert into public.invoice_compensation_periods(
      invoice_id, period, exported_kwh, unit_price_eur_kwh, amount_eur, vat_rate_pct
    ) values (
      p_invoice_id,
      (v_item->>'period')::smallint,
      (v_item->>'exported_kwh')::numeric,
      (v_item->>'unit_price_eur_kwh')::numeric,
      (v_item->>'amount_eur')::numeric,
      nullif(v_item->>'vat_rate_pct','')::numeric
    );
  end loop;

  return v_count;
end;
$fn$;

revoke all on function private.sync_invoice_compensation_periods(uuid,jsonb)
  from public, anon, authenticated;

create or replace function public.upsert_xtra_energy_history_v3(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $fn$
declare
  v_result jsonb;
  v_invoice uuid;
  v_saved integer := 0;
begin
  v_result := public.upsert_xtra_energy_history_v2(p_payload);

  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  if coalesce(v_result->>'mode','') = 'superseded_input_ignored' then
    return v_result;
  end if;

  if p_payload ? 'compensation_periods' then
    begin
      v_invoice := nullif(v_result->>'invoice_id','')::uuid;
    exception when others then
      v_invoice := null;
    end;

    if v_invoice is null then
      raise exception 'compensation_detail_invoice_id_missing';
    end if;

    v_saved := private.sync_invoice_compensation_periods(v_invoice,p_payload);
    v_result := v_result || jsonb_build_object('compensation_periods_saved',v_saved);
  end if;

  return v_result;
end;
$fn$;

revoke all on function public.upsert_xtra_energy_history_v3(jsonb) from public, anon;
grant execute on function public.upsert_xtra_energy_history_v3(jsonb) to authenticated, service_role;
