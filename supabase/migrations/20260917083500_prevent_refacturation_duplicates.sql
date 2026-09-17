-- Prevent a corrected/reissued invoice for the same physical billing period
-- from being counted twice. The older invoice is preserved for audit but is
-- hidden from normal authenticated SELECTs once superseded.

alter table public.invoices
  add column if not exists superseded_by uuid references public.invoices(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists supersession_reason text;

create index if not exists idx_invoices_current_supply_period
  on public.invoices(supply_id,billing_start,billing_end)
  where superseded_by is null;

-- Existing access policies are permissive. This restrictive policy keeps
-- superseded rows out of every normal authenticated query without forcing all
-- history/analysis screens to remember a client-side filter.
drop policy if exists invoices_current_only on public.invoices;
create policy invoices_current_only
  on public.invoices
  as restrictive
  for select
  to authenticated
  using (superseded_by is null);

create or replace function private.invoice_effective_date(p_issue_date date, p_invoice_number text)
returns date
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_raw text := regexp_replace(coalesce(p_invoice_number,''), '[^0-9]', '', 'g');
  v_date date;
begin
  if p_issue_date is not null then
    return p_issue_date;
  end if;
  if v_raw ~ '^20[0-9]{6}' then
    begin
      v_date := to_date(left(v_raw,8),'YYYYMMDD');
      if to_char(v_date,'YYYYMMDD') = left(v_raw,8) then
        return v_date;
      end if;
    exception when others then
      return null;
    end;
  end if;
  return null;
end;
$$;

create or replace function public.upsert_xtra_energy_history(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_user uuid := auth.uid();
  v_supply uuid;
  v_client uuid;
  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_invoice_number text := nullif(trim(coalesce(p_payload->>'invoice_number','')), '');
  v_billing_start date;
  v_billing_end date;
  v_issue_date date;
  v_consumption numeric;
  v_tariff text := nullif(upper(trim(coalesce(p_payload->>'tariff',''))), '');
  v_period_count integer := jsonb_array_length(coalesce(p_payload->'energy_periods','[]'::jsonb));
  v_existing public.invoices%rowtype;
  v_existing_date date;
  v_new_date date;
  v_result jsonb;
  v_new_invoice uuid;
  v_same_day_cmp integer := 0;
begin
  if v_user is null then
    raise exception 'not_authorized';
  end if;

  if coalesce((p_payload->>'validated')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_validated');
  end if;

  if v_invoice_number is null or lower(v_invoice_number) = 'por identificar' then
    return jsonb_build_object('ok', false, 'reason', 'invoice_number_missing');
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

  begin v_billing_start := nullif(p_payload->>'billing_start','')::date; exception when others then v_billing_start := null; end;
  begin v_billing_end := nullif(p_payload->>'billing_end','')::date; exception when others then v_billing_end := null; end;
  begin v_issue_date := nullif(p_payload->>'issue_date','')::date; exception when others then v_issue_date := null; end;
  begin v_consumption := nullif(p_payload->>'consumption_kwh','')::numeric; exception when others then v_consumption := null; end;

  -- Exact same invoice number keeps the previous safe idempotent/conflict path.
  if exists(select 1 from public.invoices where supply_id=v_supply and invoice_number=v_invoice_number) then
    v_result := public.ingest_xtra_energy_history_safe(p_payload);
    return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
      'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
      'uploaded_by', v_user
    );
  end if;

  -- Only attempt automatic supersession with a complete physical identity:
  -- same CUPS/supply, exact dates, same total kWh and same per-period kWh.
  if v_billing_start is not null and v_billing_end is not null and v_consumption is not null and v_period_count > 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_supply::text || '|' || v_billing_start::text || '|' || v_billing_end::text, 0));

    select i.* into v_existing
    from public.invoices i
    where i.supply_id=v_supply
      and i.superseded_by is null
      and i.validation_status='valid'
      and i.invoice_number<>v_invoice_number
      and i.billing_start=v_billing_start
      and i.billing_end=v_billing_end
      and abs(coalesce(i.consumption_kwh,0)-v_consumption)<=0.02
      and (v_tariff is null or i.tariff is null or upper(trim(i.tariff))=v_tariff)
      and (select count(*) from public.invoice_energy_periods ep where ep.invoice_id=i.id)=v_period_count
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_payload->'energy_periods','[]'::jsonb)) item
        where not exists (
          select 1 from public.invoice_energy_periods ep
          where ep.invoice_id=i.id
            and ep.period = case when coalesce(item->>'period','') ~ '^[1-6]$' then (item->>'period')::smallint else -1 end
            and abs(coalesce(ep.consumption_kwh,0)-coalesce(nullif(item->>'consumption_kwh','')::numeric,0))<=0.02
        )
      )
    order by private.invoice_effective_date(i.issue_date,i.invoice_number) desc nulls last, i.created_at desc
    limit 1
    for update;
  end if;

  if v_existing.id is not null then
    v_existing_date := private.invoice_effective_date(v_existing.issue_date,v_existing.invoice_number);
    v_new_date := private.invoice_effective_date(v_issue_date,v_invoice_number);

    if v_existing_date is not null and v_new_date is not null and v_existing_date=v_new_date
       and v_existing.invoice_number ~ '^[0-9]+$' and v_invoice_number ~ '^[0-9]+$'
       and length(v_existing.invoice_number)=length(v_invoice_number) then
      v_same_day_cmp := case when v_invoice_number>v_existing.invoice_number then 1 when v_invoice_number<v_existing.invoice_number then -1 else 0 end;
    end if;

    if v_new_date is null or v_existing_date is null or (v_new_date=v_existing_date and v_same_day_cmp=0) then
      return jsonb_build_object(
        'ok', false,
        'reason', 'possible_refacturation_ambiguous',
        'existing_invoice_id', v_existing.id,
        'existing_invoice_number', v_existing.invoice_number,
        'incoming_invoice_number', v_invoice_number,
        'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
        'uploaded_by', v_user
      );
    end if;

    if v_new_date < v_existing_date or (v_new_date=v_existing_date and v_same_day_cmp<0) then
      return jsonb_build_object(
        'ok', true,
        'mode', 'superseded_input_ignored',
        'invoice_id', v_existing.id,
        'current_invoice_number', v_existing.invoice_number,
        'ignored_invoice_number', v_invoice_number,
        'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
        'uploaded_by', v_user
      );
    end if;
  end if;

  v_result := public.ingest_xtra_energy_history_safe(p_payload);

  if v_existing.id is not null and coalesce((v_result->>'ok')::boolean,false) then
    begin v_new_invoice := (v_result->>'invoice_id')::uuid; exception when others then v_new_invoice := null; end;
    if v_new_invoice is not null then
      update public.invoices
      set superseded_by=v_new_invoice,
          superseded_at=now(),
          supersession_reason='same_supply_period_consumption_profile_later_invoice'
      where id=v_existing.id and superseded_by is null;

      insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
      values (
        v_user,
        'invoice_superseded',
        'invoice',
        v_existing.id,
        jsonb_build_object(
          'old_invoice_number',v_existing.invoice_number,
          'new_invoice_number',v_invoice_number,
          'replacement_invoice_id',v_new_invoice,
          'billing_start',v_billing_start,
          'billing_end',v_billing_end,
          'consumption_kwh',v_consumption,
          'reason','same_supply_period_consumption_profile_later_invoice'
        )
      );

      v_result := v_result || jsonb_build_object(
        'mode','inserted_refacturation',
        'superseded_invoice_id',v_existing.id,
        'superseded_invoice_number',v_existing.invoice_number
      );
    end if;
  end if;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
    'uploaded_by', v_user
  );
end;
$$;
