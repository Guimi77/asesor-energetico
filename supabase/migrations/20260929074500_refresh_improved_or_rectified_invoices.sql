-- Refresh historical invoices from improved validated parser readings and
-- supersede rectified invoices with a demonstrably later issue date.
-- Existing persistence functions remain untouched; this wrapper adds policy on top.

create or replace function private.parser_version_is_newer(p_incoming text, p_existing text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $fn$
declare
  v_incoming integer[];
  v_existing integer[];
begin
  if p_incoming is null or trim(p_incoming) = '' then
    return false;
  end if;

  begin
    v_incoming := string_to_array(trim(p_incoming),'.')::integer[];
  exception when others then
    return false;
  end;

  if p_existing is null or trim(p_existing) = '' then
    return true;
  end if;

  begin
    v_existing := string_to_array(trim(p_existing),'.')::integer[];
  exception when others then
    return false;
  end;

  return v_incoming > v_existing;
end;
$fn$;

create or replace function private.completeness_rank(p_status text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $fn$
  select case lower(coalesce(p_status,''))
    when 'complete' then 2
    when 'needs_review' then 1
    else 0
  end;
$fn$;

create or replace function private.completeness_score(p_completeness jsonb)
returns integer
language sql
immutable
set search_path = pg_catalog
as $fn$
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
$fn$;

revoke all on function private.parser_version_is_newer(text,text) from public, anon, authenticated;
revoke all on function private.completeness_rank(text) from public, anon, authenticated;
revoke all on function private.completeness_score(jsonb) from public, anon, authenticated;

create or replace function public.upsert_xtra_energy_history_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $fn$
declare
  v_user uuid := auth.uid();
  v_supply uuid;
  v_client uuid;
  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_invoice_number text := nullif(trim(coalesce(p_payload->>'invoice_number','')), '');
  v_billing_start date;
  v_billing_end date;
  v_issue_date date;
  v_tariff text := nullif(upper(trim(coalesce(p_payload->>'tariff',''))), '');
  v_retailer text := nullif(upper(trim(coalesce(p_payload->>'retailer',''))), '');
  v_existing public.invoices%rowtype;
  v_rectified public.invoices%rowtype;
  v_result jsonb;
  v_new_invoice uuid;
  v_incoming_rank integer;
  v_existing_rank integer;
  v_incoming_score integer;
  v_existing_score integer;
  v_refresh_reason text;
  v_conflict_fields jsonb := '[]'::jsonb;
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
      return jsonb_build_object('ok', false, 'reason', 'cups_not_assigned_to_account', 'scope', 'client');
    end if;
  end if;

  begin v_billing_start := nullif(p_payload->>'billing_start','')::date; exception when others then v_billing_start := null; end;
  begin v_billing_end := nullif(p_payload->>'billing_end','')::date; exception when others then v_billing_end := null; end;
  begin v_issue_date := nullif(p_payload->>'issue_date','')::date; exception when others then v_issue_date := null; end;

  perform pg_advisory_xact_lock(hashtextextended(v_supply::text || '|' || v_invoice_number, 0));

  select * into v_existing
  from public.invoices
  where supply_id=v_supply and invoice_number=v_invoice_number
  for update;

  if found then
    v_result := public.ingest_xtra_energy_history_safe(p_payload);

    if coalesce((v_result->>'ok')::boolean,false) then
      return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
        'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
        'uploaded_by', v_user
      );
    end if;

    if v_result->>'reason' = 'existing_invoice_differs' then
      v_incoming_rank := private.completeness_rank(p_payload->>'completeness_assessment_status');
      v_existing_rank := private.completeness_rank(v_existing.completeness_assessment_status);
      v_incoming_score := private.completeness_score(p_payload->'source_completeness');
      v_existing_score := private.completeness_score(v_existing.source_completeness);
      v_conflict_fields := coalesce(v_result->'conflict_fields','[]'::jsonb);

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
              'conflict_fields',v_conflict_fields,
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
            'conflict_fields',v_conflict_fields,
            'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
            'uploaded_by',v_user
          );
        end if;
      end if;
    end if;

    return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
      'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
      'uploaded_by',v_user
    );
  end if;

  if v_billing_start is not null and v_billing_end is not null and v_issue_date is not null then
    select i.* into v_rectified
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
  end if;

  v_result := public.upsert_xtra_energy_history(p_payload);

  if v_rectified.id is not null
     and coalesce((v_result->>'ok')::boolean,false)
     and coalesce(v_result->>'mode','') = 'inserted' then
    begin
      v_new_invoice := (v_result->>'invoice_id')::uuid;
    exception when others then
      v_new_invoice := null;
    end;

    if v_new_invoice is not null then
      update public.invoices
      set superseded_by=v_new_invoice,
          superseded_at=now(),
          supersession_reason='same_supply_period_later_issue_date'
      where id=v_rectified.id and superseded_by is null;

      insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
      values (
        v_user,
        'invoice_superseded',
        'invoice',
        v_rectified.id,
        jsonb_build_object(
          'old_invoice_number',v_rectified.invoice_number,
          'new_invoice_number',v_invoice_number,
          'replacement_invoice_id',v_new_invoice,
          'billing_start',v_billing_start,
          'billing_end',v_billing_end,
          'old_issue_date',v_rectified.issue_date,
          'new_issue_date',v_issue_date,
          'reason','same_supply_period_later_issue_date'
        )
      );

      v_result := v_result || jsonb_build_object(
        'mode','inserted_refacturation',
        'superseded_invoice_id',v_rectified.id,
        'superseded_invoice_number',v_rectified.invoice_number,
        'supersession_reason','same_supply_period_later_issue_date'
      );
    end if;
  end if;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'scope', case when private.is_internal_user() then 'multi_client' else 'assigned_client' end,
    'uploaded_by',v_user
  );
end;
$fn$;

revoke all on function public.upsert_xtra_energy_history_v2(jsonb) from public, anon;
grant execute on function public.upsert_xtra_energy_history_v2(jsonb) to authenticated, service_role;
