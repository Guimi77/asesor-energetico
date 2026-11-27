-- REVIEW-ONLY SQL PROPOSAL. NOT A MIGRATION AND NOT DEPLOYED.
-- Promote with the Supabase CLI into a migration only after synthetic SQL
-- integration tests and security review. Existing internal ingestion/RLS unchanged.
-- Single shared history (public.invoices); customer entry is INSERT-ONLY.
create or replace function public.submit_client_energy_invoice_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'auth'
as $fn$
declare
  v_user uuid := auth.uid();
  v_supply uuid;
  v_cups text := upper(regexp_replace(coalesce(p_payload->>'cups',''), '[^A-Za-z0-9]', '', 'g'));
  v_number text := nullif(btrim(p_payload->>'invoice_number'), '');
  v_start date;
  v_end date;
  v_total numeric;
  v_kwh numeric;
  v_accounted numeric;
  v_sum numeric;
  v_energy_kwh numeric;
  v_invoice uuid;
  v_existing public.invoices%rowtype;
  v_holder_tax text;
  v_source_tax text := upper(regexp_replace(coalesce(p_payload->>'source_holder_tax_id',''), '[^A-Za-z0-9]', '', 'g'));
  v_key text;
  v_mode text;
begin
  -- A browser may forge validated:true. Authenticate and check every scope in SQL.
  if v_user is null or not exists (
    select 1 from public.profiles p
    where p.id = v_user and p.role = 'client' and p.active = true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'client_session_required');
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or length(p_payload::text) > 120000
     or coalesce((p_payload->>'validated')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'reason', 'invalid_validation');
  end if;
  if length(v_cups) not in (20,22) or left(v_cups,2) <> 'ES'
     or v_number is null or length(v_number) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_invoice_identity');
  end if;

  -- Do not create a supply/holder/client or accept invoices for unrelated CUPS.
  select s.id, h.tax_id into v_supply, v_holder_tax
  from public.supplies s
  join public.holders h on h.id = s.holder_id and h.status = 'active'
  join public.clients c on c.id = h.client_id and c.status = 'active'
  join public.client_users cu on cu.client_id = c.id and cu.user_id = v_user
  where left(s.cups_key,20) = left(v_cups,20) and s.status = 'active'
  limit 1;

  if v_supply is null then
    return jsonb_build_object('ok', false, 'reason', 'cups_not_assigned_to_account');
  end if;
  if v_source_tax <> '' and coalesce(v_holder_tax,'') <> ''
     and v_source_tax <> upper(regexp_replace(v_holder_tax, '[^A-Za-z0-9]', '', 'g')) then
    return jsonb_build_object('ok', false, 'reason', 'holder_identity_mismatch');
  end if;

  if v_number is null or p_payload->>'billing_start' is null
     or p_payload->>'billing_end' is null
     or p_payload->>'consumption_kwh' is null
     or p_payload->>'total_eur' is null
     or p_payload->>'energy_cost_eur' is null
     or p_payload->>'power_cost_eur' is null
     or p_payload->>'accounted_eur' is null
     or p_payload->>'difference_eur' is null then
    return jsonb_build_object('ok', false, 'reason', 'required_fields_missing');
  end if;

  -- Missing and null financial concepts must never be silently treated as real zero.
  for v_key in select unnest(array[
    'consumption_kwh','energy_cost_eur','power_cost_eur','excess_cost_eur',
    'reactive_cost_eur','compensation_eur','social_bonus_eur',
    'meter_rental_eur','distributor_charges_eur','electricity_tax_eur',
    'vat_eur','igic_eur','other_cost_eur','total_eur','accounted_eur','difference_eur'
  ]) loop
    if not (p_payload ? v_key) or jsonb_typeof(p_payload->v_key) <> 'number' then
      return jsonb_build_object('ok',false,'reason','required_fields_missing','field',v_key);
    end if;
  end loop;

  -- Invalid dates/numbers raise and roll back the whole RPC: fail closed.
  v_start := (p_payload->>'billing_start')::date;
  v_end := (p_payload->>'billing_end')::date;
  v_kwh := (p_payload->>'consumption_kwh')::numeric;
  v_total := (p_payload->>'total_eur')::numeric;
  v_accounted := (p_payload->>'accounted_eur')::numeric;
  if v_start is null or v_end is null or v_start > v_end
     or v_end - v_start > 370 or v_kwh < 0
     or v_total::text in ('NaN','Infinity','-Infinity')
     or v_kwh::text in ('NaN','Infinity','-Infinity')
     or v_accounted::text in ('NaN','Infinity','-Infinity') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_billing_values');
  end if;

  v_sum := (p_payload->>'energy_cost_eur')::numeric
          + (p_payload->>'power_cost_eur')::numeric
          + coalesce((p_payload->>'excess_cost_eur')::numeric,0)
          + coalesce((p_payload->>'reactive_cost_eur')::numeric,0)
          + coalesce((p_payload->>'compensation_eur')::numeric,0)
          + coalesce((p_payload->>'social_bonus_eur')::numeric,0)
          + coalesce((p_payload->>'meter_rental_eur')::numeric,0)
          + coalesce((p_payload->>'distributor_charges_eur')::numeric,0)
          + coalesce((p_payload->>'electricity_tax_eur')::numeric,0)
          + coalesce((p_payload->>'vat_eur')::numeric,0)
          + coalesce((p_payload->>'igic_eur')::numeric,0)
          + coalesce((p_payload->>'other_cost_eur')::numeric,0);
  -- Some supported legacy extractors (notably FENIE) include the
  -- social bonus and meter rental inside "other_cost_eur" as well as exposing
  -- those two concepts individually. Accept either documented normalization
  -- convention, without altering the stored source values.
  if v_sum::text in ('NaN','Infinity','-Infinity')
     or (abs(v_total - v_sum) > 0.05
         and abs(v_total - (v_sum -
             (p_payload->>'social_bonus_eur')::numeric -
             (p_payload->>'meter_rental_eur')::numeric)) > 0.05)
     or abs(v_accounted - v_total) > 0.05
     or abs((p_payload->>'difference_eur')::numeric) > 0.05 then
    return jsonb_build_object('ok', false, 'reason', 'economic_validation_failed');
  end if;

  for v_key in select unnest(array[
    'energy_periods', 'power_periods', 'maximeters', 'excess_periods',
    'reactive_periods', 'compensation_periods', 'tax_lines',
    'distributor_rights', 'adjustments'
  ]) loop
    if p_payload ? v_key and jsonb_typeof(p_payload->v_key) <> 'array' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_detail', 'field', v_key);
    end if;
  end loop;

  if jsonb_array_length(coalesce(p_payload->'energy_periods','[]'::jsonb)) < 1
     or jsonb_array_length(coalesce(p_payload->'energy_periods','[]'::jsonb)) > 6
     or jsonb_array_length(coalesce(p_payload->'power_periods','[]'::jsonb)) > 6 then
    return jsonb_build_object('ok', false, 'reason', 'period_details_missing');
  end if;
  if (p_payload->>'power_cost_eur')::numeric <> 0
     and jsonb_array_length(coalesce(p_payload->'power_periods','[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'period_details_missing');
  end if;
  select sum(e.consumption_kwh) into v_energy_kwh
  from jsonb_to_recordset(p_payload->'energy_periods')
    as e(period smallint, consumption_kwh numeric);
  if v_energy_kwh is null or abs(v_energy_kwh-v_kwh) > 0.02 then
    return jsonb_build_object('ok', false, 'reason', 'energy_periods_mismatch');
  end if;

  -- Same-supply uploads are serialized. Never UPDATE existing invoices or
  -- master identities on the customer path, including rectifications.
  perform pg_advisory_xact_lock(hashtextextended('client-ingest|' || v_supply::text,0));
  select * into v_existing from public.invoices
    where supply_id=v_supply and invoice_number=v_number for update;
  if found then
    if v_existing.billing_start = v_start and v_existing.billing_end = v_end
       and abs(v_existing.consumption_kwh-v_kwh) <= 0.02
       and abs(v_existing.total_eur-v_total) <= 0.01
       and abs(v_existing.energy_cost_eur-(p_payload->>'energy_cost_eur')::numeric) <= 0.01
       and abs(v_existing.power_cost_eur-(p_payload->>'power_cost_eur')::numeric) <= 0.01
       and abs(v_existing.excess_cost_eur-(p_payload->>'excess_cost_eur')::numeric) <= 0.01
       and abs(v_existing.reactive_cost_eur-(p_payload->>'reactive_cost_eur')::numeric) <= 0.01
       and abs(v_existing.compensation_eur-(p_payload->>'compensation_eur')::numeric) <= 0.01
       and abs(v_existing.social_bonus_eur-(p_payload->>'social_bonus_eur')::numeric) <= 0.01
       and abs(v_existing.meter_rental_eur-(p_payload->>'meter_rental_eur')::numeric) <= 0.01
       and abs(v_existing.distributor_charges_eur-(p_payload->>'distributor_charges_eur')::numeric) <= 0.01
       and abs(v_existing.electricity_tax_eur-(p_payload->>'electricity_tax_eur')::numeric) <= 0.01
       and abs(v_existing.vat_eur-(p_payload->>'vat_eur')::numeric) <= 0.01
       and abs(v_existing.igic_eur-(p_payload->>'igic_eur')::numeric) <= 0.01
       and abs(v_existing.other_cost_eur-(p_payload->>'other_cost_eur')::numeric) <= 0.01
       and (v_existing.issue_date is not distinct from nullif(p_payload->>'issue_date','')::date)
       and v_existing.superseded_by is null then
      return jsonb_build_object('ok', true, 'mode', 'existing_unchanged', 'invoice_id', v_existing.id);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'existing_invoice_differs');
  end if;
  if exists (
    select 1 from public.invoices i
    where i.supply_id=v_supply and i.superseded_by is null
      and i.billing_start=v_start and i.billing_end=v_end
      and i.invoice_number<>v_number
  ) then
    return jsonb_build_object('ok', false, 'reason', 'possible_refacturation_ambiguous');
  end if;

  insert into public.invoices (
    supply_id, invoice_number, billing_start, billing_end, issue_date, billing_days,
    tariff, retailer, distributor,
    source_holder_name, source_holder_tax_id, source_supply_address,
    access_contract_number, contract_number, contract_type, contract_end_date, meter_number,
    consumption_kwh, energy_cost_eur, power_cost_eur, excess_cost_eur, reactive_cost_eur,
    compensation_eur, social_bonus_eur, meter_rental_eur, distributor_charges_eur,
    electricity_tax_eur, vat_eur, igic_eur, other_cost_eur,
    total_eur, accounted_eur, difference_eur, average_total_eur_kwh,
    parser_version, validation_status, validation_message,
    completeness_assessment_status, source_completeness, reading_status, reading_source_label, created_by
  ) values (
    v_supply, v_number, v_start, v_end, nullif(p_payload->>'issue_date','')::date,
    nullif(p_payload->>'billing_days','')::integer,
    nullif(p_payload->>'tariff',''), nullif(p_payload->>'retailer',''), nullif(p_payload->>'distributor',''),
    nullif(p_payload->>'source_holder_name',''), nullif(p_payload->>'source_holder_tax_id',''),
    nullif(p_payload->>'source_supply_address',''),
    nullif(p_payload->>'access_contract_number',''), nullif(p_payload->>'contract_number',''),
    nullif(p_payload->>'contract_type',''), nullif(p_payload->>'contract_end_date','')::date,
    nullif(p_payload->>'meter_number',''), v_kwh,
    (p_payload->>'energy_cost_eur')::numeric,(p_payload->>'power_cost_eur')::numeric,
    coalesce((p_payload->>'excess_cost_eur')::numeric,0),
    coalesce((p_payload->>'reactive_cost_eur')::numeric,0),
    coalesce((p_payload->>'compensation_eur')::numeric,0),
    coalesce((p_payload->>'social_bonus_eur')::numeric,0),
    coalesce((p_payload->>'meter_rental_eur')::numeric,0),
    coalesce((p_payload->>'distributor_charges_eur')::numeric,0),
    coalesce((p_payload->>'electricity_tax_eur')::numeric,0),
    coalesce((p_payload->>'vat_eur')::numeric,0),coalesce((p_payload->>'igic_eur')::numeric,0),
    coalesce((p_payload->>'other_cost_eur')::numeric,0),
    v_total,v_accounted,(p_payload->>'difference_eur')::numeric,
    case when v_kwh > 0 then v_total/v_kwh else null end,
    left(nullif(p_payload->>'parser_version',''),80),
    'valid'::public.validation_status,
    'Validación local y controles estructurales; aportada por el cliente',
    case when p_payload->>'completeness_assessment_status' = 'complete' then 'complete' else 'needs_review' end,
    coalesce(p_payload->'source_completeness','{}'::jsonb),
    case when p_payload->>'reading_status' in ('actual','estimated','no_distributor_reading')
      then p_payload->>'reading_status' else 'unknown' end,
    nullif(p_payload->>'reading_source_label',''), v_user
  ) returning id into v_invoice;

  insert into public.invoice_energy_periods (
    invoice_id,period,consumption_kwh,energy_cost_eur,unit_price_eur_kwh,
    toll_price_eur_kwh,charges_price_eur_kwh,retailer_price_eur_kwh)
  select v_invoice, e.period,e.consumption_kwh,e.energy_cost_eur,e.unit_price_eur_kwh,
         e.toll_price_eur_kwh,e.charges_price_eur_kwh,e.retailer_price_eur_kwh
  from jsonb_to_recordset(p_payload->'energy_periods')
  as e(period smallint,consumption_kwh numeric,energy_cost_eur numeric,unit_price_eur_kwh numeric,
       toll_price_eur_kwh numeric,charges_price_eur_kwh numeric,retailer_price_eur_kwh numeric);

  insert into public.invoice_power_periods (
    invoice_id,period,contracted_kw,billed_power_eur,unit_price_eur_kw_day,
    toll_price_eur_kw_day,charges_price_eur_kw_day,retailer_price_eur_kw_day)
  select v_invoice,e.period,e.contracted_kw,e.billed_power_eur,e.unit_price_eur_kw_day,
         e.toll_price_eur_kw_day,e.charges_price_eur_kw_day,e.retailer_price_eur_kw_day
  from jsonb_to_recordset(coalesce(p_payload->'power_periods','[]'::jsonb))
  as e(period smallint,contracted_kw numeric,billed_power_eur numeric,unit_price_eur_kw_day numeric,
       toll_price_eur_kw_day numeric,charges_price_eur_kw_day numeric,retailer_price_eur_kw_day numeric);

  insert into public.invoice_maximeters(invoice_id,period,maximeter_kw,reliable,source)
  select v_invoice,e.period,e.maximeter_kw,coalesce(e.reliable,false),e.source
  from jsonb_to_recordset(coalesce(p_payload->'maximeters','[]'::jsonb))
  as e(period smallint,maximeter_kw numeric,reliable boolean,source text);

  insert into public.invoice_excesses(invoice_id,period,excess_kw,amount_eur,unit_price)
  select v_invoice,e.period,e.excess_kw,e.amount_eur,e.unit_price
  from jsonb_to_recordset(coalesce(p_payload->'excess_periods','[]'::jsonb))
  as e(period smallint,excess_kw numeric,amount_eur numeric,unit_price numeric);
  if coalesce(jsonb_array_length(coalesce(p_payload->'excess_periods','[]'::jsonb)),0)=0
    and coalesce((p_payload->>'excess_cost_eur')::numeric,0)<>0 then
    insert into public.invoice_excesses(invoice_id,amount_eur)
    values (v_invoice,(p_payload->>'excess_cost_eur')::numeric);
  end if;

  insert into public.invoice_reactive(
    invoice_id,period,reactive_kvarh,amount_eur,consumption_kvarh,cos_phi,excess_kvarh,unit_price_eur_kvarh)
  select v_invoice,e.period,e.reactive_kvarh,e.amount_eur,
         e.consumption_kvarh,e.cos_phi,e.excess_kvarh,e.unit_price_eur_kvarh
  from jsonb_to_recordset(coalesce(p_payload->'reactive_periods','[]'::jsonb))
  as e(period smallint,reactive_kvarh numeric,amount_eur numeric,consumption_kvarh numeric,
       cos_phi numeric,excess_kvarh numeric,unit_price_eur_kvarh numeric);
  if coalesce(jsonb_array_length(coalesce(p_payload->'reactive_periods','[]'::jsonb)),0)=0
    and coalesce((p_payload->>'reactive_cost_eur')::numeric,0)<>0 then
    insert into public.invoice_reactive(invoice_id,amount_eur)
    values (v_invoice,(p_payload->>'reactive_cost_eur')::numeric);
  end if;

  insert into public.invoice_compensation_periods(
    invoice_id,period,exported_kwh,unit_price_eur_kwh,amount_eur,vat_rate_pct)
  select v_invoice,e.period,e.exported_kwh,e.unit_price_eur_kwh,e.amount_eur,e.vat_rate_pct
  from jsonb_to_recordset(coalesce(p_payload->'compensation_periods','[]'::jsonb))
  as e(period smallint,exported_kwh numeric,unit_price_eur_kwh numeric,amount_eur numeric,vat_rate_pct numeric);

  insert into public.invoice_tax_lines(invoice_id,tax_type,label,rate_pct,taxable_base_eur,amount_eur)
  select v_invoice,coalesce(nullif(e.tax_type,''),'OTHER'),
         e.label,e.rate_pct,e.taxable_base_eur,e.amount_eur
  from jsonb_to_recordset(coalesce(p_payload->'tax_lines','[]'::jsonb))
  as e(tax_type text,label text,rate_pct numeric,taxable_base_eur numeric,amount_eur numeric);

  insert into public.invoice_distributor_rights(invoice_id,concept,amount_eur,legal_reference,source_text)
  select v_invoice,e.concept,e.amount_eur,e.legal_reference,e.source_text
  from jsonb_to_recordset(coalesce(p_payload->'distributor_rights','[]'::jsonb))
  as e(concept text,amount_eur numeric,legal_reference text,source_text text);

  insert into public.invoice_adjustments(invoice_id,concept,amount_eur,category,source_text)
  select v_invoice,e.concept,e.amount_eur,e.category,e.source_text
  from jsonb_to_recordset(coalesce(p_payload->'adjustments','[]'::jsonb))
  as e(concept text,amount_eur numeric,category text,source_text text)
  where e.amount_eur <> 0;

  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
  values (v_user,'client_invoice_inserted','invoice',v_invoice,
    jsonb_build_object('supply_id',v_supply,'parser_version',p_payload->>'parser_version',
                       'source','client_portal','model','single_shared_history'));

  return jsonb_build_object('ok',true,'mode','inserted','invoice_id',v_invoice,'scope','assigned_client');
end;
$fn$;

-- Leave all old ingestion functions, helper guards and table RLS untouched.
revoke all on function public.submit_client_energy_invoice_v1(jsonb) from public, anon, authenticated;
grant execute on function public.submit_client_energy_invoice_v1(jsonb) to authenticated;
