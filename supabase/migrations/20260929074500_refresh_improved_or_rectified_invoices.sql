-- Refresh historical invoices when the current validated reading is demonstrably better,
-- and supersede rectified invoices when a later issue date identifies the replacement.
-- This policy is parser-agnostic: all parsers use the same historical persistence RPC.

create or replace function private.parser_version_is_newer(p_incoming text, p_existing text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_incoming integer[];
  v_existing integer[];
begin
  if p_incoming is null or p_incoming !~ '^[0-9]+([.][0-9]+)*
  v_incoming := string_to_array(p_incoming,'.')::integer[];
  v_existing := string_to_array(p_existing,'.')::integer[];
  return v_incoming > v_existing;
exception when others then
  return false;
end;
$$;

create or replace function private.completeness_rank(p_status text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(coalesce(p_status,''))
    when 'complete' then 2
    when 'needs_review' then 1
    else 0
  end;
$$;

create or replace function private.completeness_score(p_completeness jsonb)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(sum(
    case value
      when 'extracted' then 3
      when 'not_applicable' then 2
      when 'not_present' then 1
      else 0
    end
  ),0)::integer
  from jsonb_each_text(coalesce(p_completeness,'{}'::jsonb))
  where key <> 'version';
$$;

revoke all on function private.parser_version_is_newer(text,text) from public, anon, authenticated;
revoke all on function private.completeness_rank(text) from public, anon, authenticated;
revoke all on function private.completeness_score(jsonb) from public, anon, authenticated;

create or replace function public.ingest_xtra_energy_history_safe(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'auth'
as $function$
declare
  v_user uuid := auth.uid();
  v_supply uuid;
  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_invoice_number text := nullif(trim(coalesce(p_payload->>'invoice_number','')), '');
  v_billing_start date;
  v_billing_end date;
  v_issue_date date;
  v_existing public.invoices%rowtype;
  v_conflicts text[] := array[]::text[];
  v_result jsonb;
  v_incoming_rank integer;
  v_existing_rank integer;
  v_incoming_score integer;
  v_existing_score integer;
  v_refresh_reason text;
begin
  if v_user is null or not private.can_ingest_energy_history_cups(v_cups) then
    raise exception 'not_authorized';
  end if;

  if coalesce((p_payload->>'validated')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_validated');
  end if;

  if v_invoice_number is null or lower(v_invoice_number) = 'por identificar' then
    return jsonb_build_object('ok', false, 'reason', 'invoice_number_missing');
  end if;

  select s.id into v_supply
  from public.supplies s
  join public.holders h on h.id = s.holder_id
  join public.clients c on c.id = h.client_id
  where left(s.cups_key,20) = left(v_cups,20)
  limit 1;

  if v_supply is null then
    return jsonb_build_object('ok', false, 'reason', 'cups_not_in_xtra');
  end if;

  begin v_billing_start := nullif(p_payload->>'billing_start','')::date; exception when others then v_billing_start := null; end;
  begin v_billing_end := nullif(p_payload->>'billing_end','')::date; exception when others then v_billing_end := null; end;
  begin v_issue_date := nullif(p_payload->>'issue_date','')::date; exception when others then v_issue_date := null; end;

  perform pg_advisory_xact_lock(hashtextextended(v_supply::text || '|' || v_invoice_number, 0));

  select * into v_existing
  from public.invoices
  where supply_id = v_supply and invoice_number = v_invoice_number
  for update;

  if found then
    if v_existing.billing_start is distinct from v_billing_start then v_conflicts := array_append(v_conflicts,'billing_start'); end if;
    if v_existing.billing_end is distinct from v_billing_end then v_conflicts := array_append(v_conflicts,'billing_end'); end if;
    if abs(coalesce(v_existing.consumption_kwh,0) - coalesce(nullif(p_payload->>'consumption_kwh','')::numeric,0)) > 0.02 then v_conflicts := array_append(v_conflicts,'consumption_kwh'); end if;
    if abs(coalesce(v_existing.energy_cost_eur,0) - coalesce(nullif(p_payload->>'energy_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'energy_cost_eur'); end if;
    if abs(coalesce(v_existing.power_cost_eur,0) - coalesce(nullif(p_payload->>'power_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'power_cost_eur'); end if;
    if abs(coalesce(v_existing.excess_cost_eur,0) - coalesce(nullif(p_payload->>'excess_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'excess_cost_eur'); end if;
    if abs(coalesce(v_existing.reactive_cost_eur,0) - coalesce(nullif(p_payload->>'reactive_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'reactive_cost_eur'); end if;
    if abs(coalesce(v_existing.compensation_eur,0) - coalesce(nullif(p_payload->>'compensation_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'compensation_eur'); end if;
    if abs(coalesce(v_existing.social_bonus_eur,0) - coalesce(nullif(p_payload->>'social_bonus_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'social_bonus_eur'); end if;
    if abs(coalesce(v_existing.meter_rental_eur,0) - coalesce(nullif(p_payload->>'meter_rental_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'meter_rental_eur'); end if;
    if abs(coalesce(v_existing.distributor_charges_eur,0) - coalesce(nullif(p_payload->>'distributor_charges_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'distributor_charges_eur'); end if;
    if abs(coalesce(v_existing.electricity_tax_eur,0) - coalesce(nullif(p_payload->>'electricity_tax_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'electricity_tax_eur'); end if;
    if abs(coalesce(v_existing.vat_eur,0) - coalesce(nullif(p_payload->>'vat_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'vat_eur'); end if;
    if abs(coalesce(v_existing.igic_eur,0) - coalesce(nullif(p_payload->>'igic_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'igic_eur'); end if;
    if abs(coalesce(v_existing.other_cost_eur,0) - coalesce(nullif(p_payload->>'other_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'other_cost_eur'); end if;
    if abs(coalesce(v_existing.total_eur,0) - coalesce(nullif(p_payload->>'total_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'total_eur'); end if;

    v_incoming_rank := private.completeness_rank(p_payload->>'completeness_assessment_status');
    v_existing_rank := private.completeness_rank(v_existing.completeness_assessment_status);
    v_incoming_score := private.completeness_score(p_payload->'source_completeness');
    v_existing_score := private.completeness_score(v_existing.source_completeness);

    if v_incoming_rank > v_existing_rank
       or (v_incoming_rank = v_existing_rank and v_incoming_score > v_existing_score) then
      v_refresh_reason := 'better_completeness';
    elsif v_issue_date is not null
       and (v_existing.issue_date is null or v_issue_date > v_existing.issue_date)
       and v_incoming_rank >= v_existing_rank then
      v_refresh_reason := 'newer_issue_date';
    elsif private.parser_version_is_newer(p_payload->>'parser_version',v_existing.parser_version)
       and v_incoming_rank >= v_existing_rank then
      v_refresh_reason := 'newer_parser';
    end if;

    if v_refresh_reason is not null then
      v_result := public.upsert_xtra_energy_history_legacy(p_payload);
      if coalesce((v_result->>'ok')::boolean,false) then
        insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
        values (
          v_user,
          'invoice_refreshed',
          'invoice',
          v_existing.id,
          jsonb_build_object(
            'reason',v_refresh_reason,
            'invoice_number',v_invoice_number,
            'conflict_fields',to_jsonb(v_conflicts),
            'old_parser_version',v_existing.parser_version,
            'new_parser_version',p_payload->>'parser_version',
            'old_issue_date',v_existing.issue_date,
            'new_issue_date',v_issue_date,
            'old_completeness',v_existing.completeness_assessment_status,
            'new_completeness',p_payload->>'completeness_assessment_status',
            'old_total_eur',v_existing.total_eur,
            'new_total_eur',nullif(p_payload->>'total_eur','')::numeric
          )
        );
        return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
          'mode','existing_refreshed',
          'refresh_reason',v_refresh_reason,
          'conflict_fields',to_jsonb(v_conflicts)
        );
      end if;
      return v_result;
    end if;

    if cardinality(v_conflicts) > 0 then
      return jsonb_build_object(
        'ok', false,
        'mode','existing_conflict',
        'reason','existing_invoice_differs',
        'invoice_id',v_existing.id,
        'supply_id',v_supply,
        'conflict_fields',to_jsonb(v_conflicts),
        'completeness',v_existing.completeness_assessment_status
      );
    end if;

    return jsonb_build_object(
      'ok',true,
      'mode','existing_unchanged',
      'invoice_id',v_existing.id,
      'supply_id',v_supply,
      'completeness',v_existing.completeness_assessment_status
    );
  end if;

  v_result := public.upsert_xtra_energy_history_legacy(p_payload);
  if coalesce((v_result->>'ok')::boolean,false) then
    v_result := v_result || jsonb_build_object('mode','inserted');
  end if;
  return v_result;
end;
$function$;

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
  v_retailer text := nullif(upper(trim(coalesce(p_payload->>'retailer',''))), '');
  v_existing public.invoices%rowtype;
  v_existing_date date;
  v_new_date date;
  v_result jsonb;
  v_new_invoice uuid;
  v_same_day_cmp integer := 0;
  v_supersession_reason text;
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

  if exists(select 1 from public.invoices where supply_id=v_supply and invoice_number=v_invoice_number) then
    v_result := public.ingest_xtra_energy_history_safe(p_payload);
    return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
      'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
      'uploaded_by', v_user
    );
  end if;

  if v_billing_start is not null and v_billing_end is not null and v_consumption is not null then
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
      and private.invoice_profile_matches_payload(i.id,p_payload,i.consumption_kwh,v_consumption)
    order by private.invoice_effective_date(i.issue_date,i.invoice_number) desc nulls last, i.created_at desc
    limit 1
    for update;

    if v_existing.id is not null then
      v_supersession_reason := 'same_supply_period_consumption_profile_later_invoice';
    end if;
  end if;

  if v_existing.id is null
     and v_billing_start is not null
     and v_billing_end is not null
     and v_issue_date is not null then
    select i.* into v_existing
    from public.invoices i
    where i.supply_id=v_supply
      and i.superseded_by is null
      and i.validation_status='valid'
      and i.invoice_number<>v_invoice_number
      and i.billing_start=v_billing_start
      and i.billing_end=v_billing_end
      and i.issue_date is not null
      and v_issue_date > i.issue_date
      and (v_tariff is null or i.tariff is null or upper(trim(i.tariff))=v_tariff)
      and (v_retailer is null or i.retailer is null or upper(trim(i.retailer))=v_retailer)
    order by i.issue_date desc, i.created_at desc
    limit 1
    for update;

    if v_existing.id is not null then
      v_supersession_reason := 'same_supply_period_later_issue_date';
    end if;
  end if;

  if v_existing.id is not null then
    v_existing_date := private.invoice_effective_date(v_existing.issue_date,v_existing.invoice_number);
    v_new_date := private.invoice_effective_date(v_issue_date,v_invoice_number);

    if v_supersession_reason <> 'same_supply_period_later_issue_date' then
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
  end if;

  v_result := public.ingest_xtra_energy_history_safe(p_payload);

  if v_existing.id is not null and coalesce((v_result->>'ok')::boolean,false) then
    begin v_new_invoice := (v_result->>'invoice_id')::uuid; exception when others then v_new_invoice := null; end;
    if v_new_invoice is not null then
      update public.invoices
      set superseded_by=v_new_invoice,
          superseded_at=now(),
          supersession_reason=coalesce(v_supersession_reason,'same_supply_period_consumption_profile_later_invoice')
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
          'old_issue_date',v_existing.issue_date,
          'new_issue_date',v_issue_date,
          'consumption_kwh',v_consumption,
          'reason',coalesce(v_supersession_reason,'same_supply_period_consumption_profile_later_invoice')
        )
      );

      v_result := v_result || jsonb_build_object(
        'mode','inserted_refacturation',
        'superseded_invoice_id',v_existing.id,
        'superseded_invoice_number',v_existing.invoice_number,
        'supersession_reason',coalesce(v_supersession_reason,'same_supply_period_consumption_profile_later_invoice')
      );
    end if;
  end if;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
    'uploaded_by', v_user
  );
end;
$$;

revoke all on function public.ingest_xtra_energy_history_safe(jsonb) from public, anon;
grant execute on function public.ingest_xtra_energy_history_safe(jsonb) to authenticated, service_role;
revoke all on function public.upsert_xtra_energy_history(jsonb) from public, anon;
grant execute on function public.upsert_xtra_energy_history(jsonb) to authenticated, service_role;
 then
    return false;
  end if;
  if p_existing is null or trim(p_existing) = '' then
    return true;
  end if;
  if p_existing !~ '^[0-9]+([.][0-9]+)*
  v_incoming := string_to_array(p_incoming,'.')::integer[];
  v_existing := string_to_array(p_existing,'.')::integer[];
  return v_incoming > v_existing;
exception when others then
  return false;
end;
$$;

create or replace function private.completeness_rank(p_status text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(coalesce(p_status,''))
    when 'complete' then 2
    when 'needs_review' then 1
    else 0
  end;
$$;

create or replace function private.completeness_score(p_completeness jsonb)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(sum(
    case value
      when 'extracted' then 3
      when 'not_applicable' then 2
      when 'not_present' then 1
      else 0
    end
  ),0)::integer
  from jsonb_each_text(coalesce(p_completeness,'{}'::jsonb))
  where key <> 'version';
$$;

revoke all on function private.parser_version_is_newer(text,text) from public, anon, authenticated;
revoke all on function private.completeness_rank(text) from public, anon, authenticated;
revoke all on function private.completeness_score(jsonb) from public, anon, authenticated;

create or replace function public.ingest_xtra_energy_history_safe(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'auth'
as $function$
declare
  v_user uuid := auth.uid();
  v_supply uuid;
  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_invoice_number text := nullif(trim(coalesce(p_payload->>'invoice_number','')), '');
  v_billing_start date;
  v_billing_end date;
  v_issue_date date;
  v_existing public.invoices%rowtype;
  v_conflicts text[] := array[]::text[];
  v_result jsonb;
  v_incoming_rank integer;
  v_existing_rank integer;
  v_incoming_score integer;
  v_existing_score integer;
  v_refresh_reason text;
begin
  if v_user is null or not private.can_ingest_energy_history_cups(v_cups) then
    raise exception 'not_authorized';
  end if;

  if coalesce((p_payload->>'validated')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_validated');
  end if;

  if v_invoice_number is null or lower(v_invoice_number) = 'por identificar' then
    return jsonb_build_object('ok', false, 'reason', 'invoice_number_missing');
  end if;

  select s.id into v_supply
  from public.supplies s
  join public.holders h on h.id = s.holder_id
  join public.clients c on c.id = h.client_id
  where left(s.cups_key,20) = left(v_cups,20)
  limit 1;

  if v_supply is null then
    return jsonb_build_object('ok', false, 'reason', 'cups_not_in_xtra');
  end if;

  begin v_billing_start := nullif(p_payload->>'billing_start','')::date; exception when others then v_billing_start := null; end;
  begin v_billing_end := nullif(p_payload->>'billing_end','')::date; exception when others then v_billing_end := null; end;
  begin v_issue_date := nullif(p_payload->>'issue_date','')::date; exception when others then v_issue_date := null; end;

  perform pg_advisory_xact_lock(hashtextextended(v_supply::text || '|' || v_invoice_number, 0));

  select * into v_existing
  from public.invoices
  where supply_id = v_supply and invoice_number = v_invoice_number
  for update;

  if found then
    if v_existing.billing_start is distinct from v_billing_start then v_conflicts := array_append(v_conflicts,'billing_start'); end if;
    if v_existing.billing_end is distinct from v_billing_end then v_conflicts := array_append(v_conflicts,'billing_end'); end if;
    if abs(coalesce(v_existing.consumption_kwh,0) - coalesce(nullif(p_payload->>'consumption_kwh','')::numeric,0)) > 0.02 then v_conflicts := array_append(v_conflicts,'consumption_kwh'); end if;
    if abs(coalesce(v_existing.energy_cost_eur,0) - coalesce(nullif(p_payload->>'energy_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'energy_cost_eur'); end if;
    if abs(coalesce(v_existing.power_cost_eur,0) - coalesce(nullif(p_payload->>'power_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'power_cost_eur'); end if;
    if abs(coalesce(v_existing.excess_cost_eur,0) - coalesce(nullif(p_payload->>'excess_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'excess_cost_eur'); end if;
    if abs(coalesce(v_existing.reactive_cost_eur,0) - coalesce(nullif(p_payload->>'reactive_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'reactive_cost_eur'); end if;
    if abs(coalesce(v_existing.compensation_eur,0) - coalesce(nullif(p_payload->>'compensation_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'compensation_eur'); end if;
    if abs(coalesce(v_existing.social_bonus_eur,0) - coalesce(nullif(p_payload->>'social_bonus_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'social_bonus_eur'); end if;
    if abs(coalesce(v_existing.meter_rental_eur,0) - coalesce(nullif(p_payload->>'meter_rental_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'meter_rental_eur'); end if;
    if abs(coalesce(v_existing.distributor_charges_eur,0) - coalesce(nullif(p_payload->>'distributor_charges_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'distributor_charges_eur'); end if;
    if abs(coalesce(v_existing.electricity_tax_eur,0) - coalesce(nullif(p_payload->>'electricity_tax_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'electricity_tax_eur'); end if;
    if abs(coalesce(v_existing.vat_eur,0) - coalesce(nullif(p_payload->>'vat_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'vat_eur'); end if;
    if abs(coalesce(v_existing.igic_eur,0) - coalesce(nullif(p_payload->>'igic_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'igic_eur'); end if;
    if abs(coalesce(v_existing.other_cost_eur,0) - coalesce(nullif(p_payload->>'other_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'other_cost_eur'); end if;
    if abs(coalesce(v_existing.total_eur,0) - coalesce(nullif(p_payload->>'total_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'total_eur'); end if;

    v_incoming_rank := private.completeness_rank(p_payload->>'completeness_assessment_status');
    v_existing_rank := private.completeness_rank(v_existing.completeness_assessment_status);
    v_incoming_score := private.completeness_score(p_payload->'source_completeness');
    v_existing_score := private.completeness_score(v_existing.source_completeness);

    if v_incoming_rank > v_existing_rank
       or (v_incoming_rank = v_existing_rank and v_incoming_score > v_existing_score) then
      v_refresh_reason := 'better_completeness';
    elsif v_issue_date is not null
       and (v_existing.issue_date is null or v_issue_date > v_existing.issue_date)
       and v_incoming_rank >= v_existing_rank then
      v_refresh_reason := 'newer_issue_date';
    elsif private.parser_version_is_newer(p_payload->>'parser_version',v_existing.parser_version)
       and v_incoming_rank >= v_existing_rank then
      v_refresh_reason := 'newer_parser';
    end if;

    if v_refresh_reason is not null then
      v_result := public.upsert_xtra_energy_history_legacy(p_payload);
      if coalesce((v_result->>'ok')::boolean,false) then
        insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
        values (
          v_user,
          'invoice_refreshed',
          'invoice',
          v_existing.id,
          jsonb_build_object(
            'reason',v_refresh_reason,
            'invoice_number',v_invoice_number,
            'conflict_fields',to_jsonb(v_conflicts),
            'old_parser_version',v_existing.parser_version,
            'new_parser_version',p_payload->>'parser_version',
            'old_issue_date',v_existing.issue_date,
            'new_issue_date',v_issue_date,
            'old_completeness',v_existing.completeness_assessment_status,
            'new_completeness',p_payload->>'completeness_assessment_status',
            'old_total_eur',v_existing.total_eur,
            'new_total_eur',nullif(p_payload->>'total_eur','')::numeric
          )
        );
      end if;
      return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
        'mode','existing_refreshed',
        'refresh_reason',v_refresh_reason,
        'conflict_fields',to_jsonb(v_conflicts)
      );
    end if;

    if cardinality(v_conflicts) > 0 then
      return jsonb_build_object(
        'ok', false,
        'mode','existing_conflict',
        'reason','existing_invoice_differs',
        'invoice_id',v_existing.id,
        'supply_id',v_supply,
        'conflict_fields',to_jsonb(v_conflicts),
        'completeness',v_existing.completeness_assessment_status
      );
    end if;

    return jsonb_build_object(
      'ok',true,
      'mode','existing_unchanged',
      'invoice_id',v_existing.id,
      'supply_id',v_supply,
      'completeness',v_existing.completeness_assessment_status
    );
  end if;

  v_result := public.upsert_xtra_energy_history_legacy(p_payload);
  if coalesce((v_result->>'ok')::boolean,false) then
    v_result := v_result || jsonb_build_object('mode','inserted');
  end if;
  return v_result;
end;
$function$;

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
  v_retailer text := nullif(upper(trim(coalesce(p_payload->>'retailer',''))), '');
  v_existing public.invoices%rowtype;
  v_existing_date date;
  v_new_date date;
  v_result jsonb;
  v_new_invoice uuid;
  v_same_day_cmp integer := 0;
  v_supersession_reason text;
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

  if exists(select 1 from public.invoices where supply_id=v_supply and invoice_number=v_invoice_number) then
    v_result := public.ingest_xtra_energy_history_safe(p_payload);
    return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
      'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
      'uploaded_by', v_user
    );
  end if;

  if v_billing_start is not null and v_billing_end is not null and v_consumption is not null then
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
      and private.invoice_profile_matches_payload(i.id,p_payload,i.consumption_kwh,v_consumption)
    order by private.invoice_effective_date(i.issue_date,i.invoice_number) desc nulls last, i.created_at desc
    limit 1
    for update;

    if v_existing.id is not null then
      v_supersession_reason := 'same_supply_period_consumption_profile_later_invoice';
    end if;
  end if;

  if v_existing.id is null
     and v_billing_start is not null
     and v_billing_end is not null
     and v_issue_date is not null then
    select i.* into v_existing
    from public.invoices i
    where i.supply_id=v_supply
      and i.superseded_by is null
      and i.validation_status='valid'
      and i.invoice_number<>v_invoice_number
      and i.billing_start=v_billing_start
      and i.billing_end=v_billing_end
      and i.issue_date is not null
      and v_issue_date > i.issue_date
      and (v_tariff is null or i.tariff is null or upper(trim(i.tariff))=v_tariff)
      and (v_retailer is null or i.retailer is null or upper(trim(i.retailer))=v_retailer)
    order by i.issue_date desc, i.created_at desc
    limit 1
    for update;

    if v_existing.id is not null then
      v_supersession_reason := 'same_supply_period_later_issue_date';
    end if;
  end if;

  if v_existing.id is not null then
    v_existing_date := private.invoice_effective_date(v_existing.issue_date,v_existing.invoice_number);
    v_new_date := private.invoice_effective_date(v_issue_date,v_invoice_number);

    if v_supersession_reason <> 'same_supply_period_later_issue_date' then
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
  end if;

  v_result := public.ingest_xtra_energy_history_safe(p_payload);

  if v_existing.id is not null and coalesce((v_result->>'ok')::boolean,false) then
    begin v_new_invoice := (v_result->>'invoice_id')::uuid; exception when others then v_new_invoice := null; end;
    if v_new_invoice is not null then
      update public.invoices
      set superseded_by=v_new_invoice,
          superseded_at=now(),
          supersession_reason=coalesce(v_supersession_reason,'same_supply_period_consumption_profile_later_invoice')
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
          'old_issue_date',v_existing.issue_date,
          'new_issue_date',v_issue_date,
          'consumption_kwh',v_consumption,
          'reason',coalesce(v_supersession_reason,'same_supply_period_consumption_profile_later_invoice')
        )
      );

      v_result := v_result || jsonb_build_object(
        'mode','inserted_refacturation',
        'superseded_invoice_id',v_existing.id,
        'superseded_invoice_number',v_existing.invoice_number,
        'supersession_reason',coalesce(v_supersession_reason,'same_supply_period_consumption_profile_later_invoice')
      );
    end if;
  end if;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
    'uploaded_by', v_user
  );
end;
$$;

revoke all on function public.ingest_xtra_energy_history_safe(jsonb) from public, anon;
grant execute on function public.ingest_xtra_energy_history_safe(jsonb) to authenticated, service_role;
revoke all on function public.upsert_xtra_energy_history(jsonb) from public, anon;
grant execute on function public.upsert_xtra_energy_history(jsonb) to authenticated, service_role;
 then
    return false;
  end if;
  v_incoming := string_to_array(p_incoming,'.')::integer[];
  v_existing := string_to_array(p_existing,'.')::integer[];
  return v_incoming > v_existing;
exception when others then
  return false;
end;
$$;

create or replace function private.completeness_rank(p_status text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(coalesce(p_status,''))
    when 'complete' then 2
    when 'needs_review' then 1
    else 0
  end;
$$;

create or replace function private.completeness_score(p_completeness jsonb)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(sum(
    case value
      when 'extracted' then 3
      when 'not_applicable' then 2
      when 'not_present' then 1
      else 0
    end
  ),0)::integer
  from jsonb_each_text(coalesce(p_completeness,'{}'::jsonb))
  where key <> 'version';
$$;

revoke all on function private.parser_version_is_newer(text,text) from public, anon, authenticated;
revoke all on function private.completeness_rank(text) from public, anon, authenticated;
revoke all on function private.completeness_score(jsonb) from public, anon, authenticated;

create or replace function public.ingest_xtra_energy_history_safe(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'auth'
as $function$
declare
  v_user uuid := auth.uid();
  v_supply uuid;
  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_invoice_number text := nullif(trim(coalesce(p_payload->>'invoice_number','')), '');
  v_billing_start date;
  v_billing_end date;
  v_issue_date date;
  v_existing public.invoices%rowtype;
  v_conflicts text[] := array[]::text[];
  v_result jsonb;
  v_incoming_rank integer;
  v_existing_rank integer;
  v_incoming_score integer;
  v_existing_score integer;
  v_refresh_reason text;
begin
  if v_user is null or not private.can_ingest_energy_history_cups(v_cups) then
    raise exception 'not_authorized';
  end if;

  if coalesce((p_payload->>'validated')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_validated');
  end if;

  if v_invoice_number is null or lower(v_invoice_number) = 'por identificar' then
    return jsonb_build_object('ok', false, 'reason', 'invoice_number_missing');
  end if;

  select s.id into v_supply
  from public.supplies s
  join public.holders h on h.id = s.holder_id
  join public.clients c on c.id = h.client_id
  where left(s.cups_key,20) = left(v_cups,20)
  limit 1;

  if v_supply is null then
    return jsonb_build_object('ok', false, 'reason', 'cups_not_in_xtra');
  end if;

  begin v_billing_start := nullif(p_payload->>'billing_start','')::date; exception when others then v_billing_start := null; end;
  begin v_billing_end := nullif(p_payload->>'billing_end','')::date; exception when others then v_billing_end := null; end;
  begin v_issue_date := nullif(p_payload->>'issue_date','')::date; exception when others then v_issue_date := null; end;

  perform pg_advisory_xact_lock(hashtextextended(v_supply::text || '|' || v_invoice_number, 0));

  select * into v_existing
  from public.invoices
  where supply_id = v_supply and invoice_number = v_invoice_number
  for update;

  if found then
    if v_existing.billing_start is distinct from v_billing_start then v_conflicts := array_append(v_conflicts,'billing_start'); end if;
    if v_existing.billing_end is distinct from v_billing_end then v_conflicts := array_append(v_conflicts,'billing_end'); end if;
    if abs(coalesce(v_existing.consumption_kwh,0) - coalesce(nullif(p_payload->>'consumption_kwh','')::numeric,0)) > 0.02 then v_conflicts := array_append(v_conflicts,'consumption_kwh'); end if;
    if abs(coalesce(v_existing.energy_cost_eur,0) - coalesce(nullif(p_payload->>'energy_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'energy_cost_eur'); end if;
    if abs(coalesce(v_existing.power_cost_eur,0) - coalesce(nullif(p_payload->>'power_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'power_cost_eur'); end if;
    if abs(coalesce(v_existing.excess_cost_eur,0) - coalesce(nullif(p_payload->>'excess_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'excess_cost_eur'); end if;
    if abs(coalesce(v_existing.reactive_cost_eur,0) - coalesce(nullif(p_payload->>'reactive_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'reactive_cost_eur'); end if;
    if abs(coalesce(v_existing.compensation_eur,0) - coalesce(nullif(p_payload->>'compensation_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'compensation_eur'); end if;
    if abs(coalesce(v_existing.social_bonus_eur,0) - coalesce(nullif(p_payload->>'social_bonus_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'social_bonus_eur'); end if;
    if abs(coalesce(v_existing.meter_rental_eur,0) - coalesce(nullif(p_payload->>'meter_rental_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'meter_rental_eur'); end if;
    if abs(coalesce(v_existing.distributor_charges_eur,0) - coalesce(nullif(p_payload->>'distributor_charges_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'distributor_charges_eur'); end if;
    if abs(coalesce(v_existing.electricity_tax_eur,0) - coalesce(nullif(p_payload->>'electricity_tax_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'electricity_tax_eur'); end if;
    if abs(coalesce(v_existing.vat_eur,0) - coalesce(nullif(p_payload->>'vat_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'vat_eur'); end if;
    if abs(coalesce(v_existing.igic_eur,0) - coalesce(nullif(p_payload->>'igic_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'igic_eur'); end if;
    if abs(coalesce(v_existing.other_cost_eur,0) - coalesce(nullif(p_payload->>'other_cost_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'other_cost_eur'); end if;
    if abs(coalesce(v_existing.total_eur,0) - coalesce(nullif(p_payload->>'total_eur','')::numeric,0)) > 0.01 then v_conflicts := array_append(v_conflicts,'total_eur'); end if;

    v_incoming_rank := private.completeness_rank(p_payload->>'completeness_assessment_status');
    v_existing_rank := private.completeness_rank(v_existing.completeness_assessment_status);
    v_incoming_score := private.completeness_score(p_payload->'source_completeness');
    v_existing_score := private.completeness_score(v_existing.source_completeness);

    if v_incoming_rank > v_existing_rank
       or (v_incoming_rank = v_existing_rank and v_incoming_score > v_existing_score) then
      v_refresh_reason := 'better_completeness';
    elsif v_issue_date is not null
       and (v_existing.issue_date is null or v_issue_date > v_existing.issue_date)
       and v_incoming_rank >= v_existing_rank then
      v_refresh_reason := 'newer_issue_date';
    elsif private.parser_version_is_newer(p_payload->>'parser_version',v_existing.parser_version)
       and v_incoming_rank >= v_existing_rank then
      v_refresh_reason := 'newer_parser';
    end if;

    if v_refresh_reason is not null then
      v_result := public.upsert_xtra_energy_history_legacy(p_payload);
      if coalesce((v_result->>'ok')::boolean,false) then
        insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
        values (
          v_user,
          'invoice_refreshed',
          'invoice',
          v_existing.id,
          jsonb_build_object(
            'reason',v_refresh_reason,
            'invoice_number',v_invoice_number,
            'conflict_fields',to_jsonb(v_conflicts),
            'old_parser_version',v_existing.parser_version,
            'new_parser_version',p_payload->>'parser_version',
            'old_issue_date',v_existing.issue_date,
            'new_issue_date',v_issue_date,
            'old_completeness',v_existing.completeness_assessment_status,
            'new_completeness',p_payload->>'completeness_assessment_status',
            'old_total_eur',v_existing.total_eur,
            'new_total_eur',nullif(p_payload->>'total_eur','')::numeric
          )
        );
      end if;
      return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
        'mode','existing_refreshed',
        'refresh_reason',v_refresh_reason,
        'conflict_fields',to_jsonb(v_conflicts)
      );
    end if;

    if cardinality(v_conflicts) > 0 then
      return jsonb_build_object(
        'ok', false,
        'mode','existing_conflict',
        'reason','existing_invoice_differs',
        'invoice_id',v_existing.id,
        'supply_id',v_supply,
        'conflict_fields',to_jsonb(v_conflicts),
        'completeness',v_existing.completeness_assessment_status
      );
    end if;

    return jsonb_build_object(
      'ok',true,
      'mode','existing_unchanged',
      'invoice_id',v_existing.id,
      'supply_id',v_supply,
      'completeness',v_existing.completeness_assessment_status
    );
  end if;

  v_result := public.upsert_xtra_energy_history_legacy(p_payload);
  if coalesce((v_result->>'ok')::boolean,false) then
    v_result := v_result || jsonb_build_object('mode','inserted');
  end if;
  return v_result;
end;
$function$;

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
  v_retailer text := nullif(upper(trim(coalesce(p_payload->>'retailer',''))), '');
  v_existing public.invoices%rowtype;
  v_existing_date date;
  v_new_date date;
  v_result jsonb;
  v_new_invoice uuid;
  v_same_day_cmp integer := 0;
  v_supersession_reason text;
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

  if exists(select 1 from public.invoices where supply_id=v_supply and invoice_number=v_invoice_number) then
    v_result := public.ingest_xtra_energy_history_safe(p_payload);
    return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
      'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
      'uploaded_by', v_user
    );
  end if;

  if v_billing_start is not null and v_billing_end is not null and v_consumption is not null then
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
      and private.invoice_profile_matches_payload(i.id,p_payload,i.consumption_kwh,v_consumption)
    order by private.invoice_effective_date(i.issue_date,i.invoice_number) desc nulls last, i.created_at desc
    limit 1
    for update;

    if v_existing.id is not null then
      v_supersession_reason := 'same_supply_period_consumption_profile_later_invoice';
    end if;
  end if;

  if v_existing.id is null
     and v_billing_start is not null
     and v_billing_end is not null
     and v_issue_date is not null then
    select i.* into v_existing
    from public.invoices i
    where i.supply_id=v_supply
      and i.superseded_by is null
      and i.validation_status='valid'
      and i.invoice_number<>v_invoice_number
      and i.billing_start=v_billing_start
      and i.billing_end=v_billing_end
      and i.issue_date is not null
      and v_issue_date > i.issue_date
      and (v_tariff is null or i.tariff is null or upper(trim(i.tariff))=v_tariff)
      and (v_retailer is null or i.retailer is null or upper(trim(i.retailer))=v_retailer)
    order by i.issue_date desc, i.created_at desc
    limit 1
    for update;

    if v_existing.id is not null then
      v_supersession_reason := 'same_supply_period_later_issue_date';
    end if;
  end if;

  if v_existing.id is not null then
    v_existing_date := private.invoice_effective_date(v_existing.issue_date,v_existing.invoice_number);
    v_new_date := private.invoice_effective_date(v_issue_date,v_invoice_number);

    if v_supersession_reason <> 'same_supply_period_later_issue_date' then
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
  end if;

  v_result := public.ingest_xtra_energy_history_safe(p_payload);

  if v_existing.id is not null and coalesce((v_result->>'ok')::boolean,false) then
    begin v_new_invoice := (v_result->>'invoice_id')::uuid; exception when others then v_new_invoice := null; end;
    if v_new_invoice is not null then
      update public.invoices
      set superseded_by=v_new_invoice,
          superseded_at=now(),
          supersession_reason=coalesce(v_supersession_reason,'same_supply_period_consumption_profile_later_invoice')
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
          'old_issue_date',v_existing.issue_date,
          'new_issue_date',v_issue_date,
          'consumption_kwh',v_consumption,
          'reason',coalesce(v_supersession_reason,'same_supply_period_consumption_profile_later_invoice')
        )
      );

      v_result := v_result || jsonb_build_object(
        'mode','inserted_refacturation',
        'superseded_invoice_id',v_existing.id,
        'superseded_invoice_number',v_existing.invoice_number,
        'supersession_reason',coalesce(v_supersession_reason,'same_supply_period_consumption_profile_later_invoice')
      );
    end if;
  end if;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
    'uploaded_by', v_user
  );
end;
$$;

revoke all on function public.ingest_xtra_energy_history_safe(jsonb) from public, anon;
grant execute on function public.ingest_xtra_energy_history_safe(jsonb) to authenticated, service_role;
revoke all on function public.upsert_xtra_energy_history(jsonb) from public, anon;
grant execute on function public.upsert_xtra_energy_history(jsonb) to authenticated, service_role;
