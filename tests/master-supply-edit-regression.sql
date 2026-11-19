-- Real SQL regression for explicit clearing, not a JavaScript mock of SQL.
-- Loaded only by the guarded disposable PostgreSQL integration runner.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);

create temporary table master_edit_protected as
select
  (select jsonb_agg(to_jsonb(i) order by id) from public.invoices i) as invoices,
  (select jsonb_agg(to_jsonb(e) order by invoice_id, period) from public.invoice_energy_periods e) as periods,
  (select jsonb_agg(jsonb_build_object('id', s.id, 'holder_id', s.holder_id, 'cups', s.cups, 'status', s.status) order by s.id) from public.supplies s) as supply_identity,
  (select count(*) from public.clients) as clients,
  (select count(*) from public.holders) as holders,
  (select count(*) from public.supplies) as supplies;

do $$
declare
  sid uuid := '40000000-0000-4000-8000-000000000001';
  hid uuid := '30000000-0000-4000-8000-000000000001';
  cid uuid := '20000000-0000-4000-8000-000000000001';
  payload jsonb := jsonb_build_object(
    'mode', 'manual', 'client_type', 'EMPRESA',
    'client_name', 'CLIENTE DE PRUEBA UNO', 'client_tax_id', 'TESTCLIENT1',
    'holder_name', 'TITULAR DE PRUEBA UNO', 'holder_tax_id', 'TESTHOLDER1',
    'cups', 'ES0000000000000001AA0F', 'original_cups', 'ES0000000000000001AA0F'
  );
  blanks jsonb := jsonb_build_object(
    'supply_name', null, 'address', '', 'city', '   ', 'province', null,
    'postal_code', '', 'tariff', null, 'contract_number', '',
    'retailer', null, 'distributor', '   '
  );
  values_to_keep jsonb := jsonb_build_object(
    'supply_name', 'NOMBRE DE PRUEBA', 'address', 'DIRECCION DE PRUEBA',
    'city', 'LOCALIDAD DE PRUEBA', 'province', 'PROVINCIA DE PRUEBA',
    'postal_code', '00000', 'tariff', '3.0TD',
    'contract_number', 'CONTRATO-DE-PRUEBA', 'retailer', 'COMERCIALIZADORA DE PRUEBA',
    'distributor', 'DISTRIBUIDORA DE PRUEBA'
  );
  r jsonb;
  before_metadata jsonb;
  after_metadata jsonb;
  profiles jsonb;
  context jsonb;
  group_id uuid;
  audit_count bigint;
begin
  -- null, empty string and whitespace express the same manual removal.
  r := public.save_master_supply_v2(payload || blanks);
  perform pg_temp.assert_true((r->>'ok')::boolean and r->>'mode' = 'updated', 'explicit blank metadata is an update');
  perform pg_temp.assert_true((select supply_name is null and address is null and city is null and province is null
    and postal_code is null and current_tariff is null and current_contract_number is null
    and current_retailer is null and current_distributor is null from public.supplies where id=sid),
    'manual explicit blanks clear all nine optional metadata fields');
  perform pg_temp.assert_true((select details->'cleared_fields' =
    '["address","city","contract_number","distributor","postal_code","province","retailer","supply_name","tariff"]'::jsonb
    from public.audit_log where entity_id=sid and action='master_supply_updated' order by id desc limit 1),
    'audit records the cleared field names');
  perform pg_temp.assert_true((select details->'cleared_previous_values'->>'supply_name'='SUMINISTRO DE PRUEBA'
    and details->'cleared_previous_values'->>'contract_number'='TEST-CONTRACT-1'
    from public.audit_log where entity_id=sid and action='master_supply_updated' order by id desc limit 1),
    'audit retains previous removed values for traceability');

  r := public.save_master_supply_v2(payload || blanks);
  perform pg_temp.assert_true((r->>'ok')::boolean and r->>'mode' = 'unchanged', 'repeated explicit clearing is idempotent');
  perform pg_temp.assert_true((select details->'cleared_fields' = '[]'::jsonb from public.audit_log
    where entity_id=sid and action='master_supply_unchanged' order by id desc limit 1), 'retry does not invent another removal');

  r := public.save_master_supply_v2(payload || values_to_keep);
  perform pg_temp.assert_true((r->>'ok')::boolean, 'manual values can be restored after clearing');
  select to_jsonb(s) - array['updated_at','supply_name'] into before_metadata from public.supplies s where id=sid;
  r := public.save_master_supply_v2(payload || jsonb_build_object('supply_name', null));
  select to_jsonb(s) - array['updated_at','supply_name'] into after_metadata from public.supplies s where id=sid;
  perform pg_temp.assert_true(before_metadata = after_metadata and (select supply_name is null from public.supplies where id=sid),
    'an omitted key preserves its value while an explicit null clears only its field');

  -- Legacy partial callers and imports still preserve fields they did not send.
  r := public.save_master_supply_v2(payload || values_to_keep);
  select to_jsonb(s) - 'updated_at' into before_metadata from public.supplies s where id=sid;
  r := public.save_master_supply_v2(payload);
  select to_jsonb(s) - 'updated_at' into after_metadata from public.supplies s where id=sid;
  perform pg_temp.assert_true(before_metadata = after_metadata and r->>'mode'='unchanged', 'manual partial payload preserves all omitted metadata');
  r := public.save_master_supply_v2(payload || blanks || jsonb_build_object('mode', 'fill_only'));
  select to_jsonb(s) - 'updated_at' into after_metadata from public.supplies s where id=sid;
  perform pg_temp.assert_true(before_metadata = after_metadata and r->>'mode'='unchanged', 'fill-only blanks cannot erase metadata');
  r := public.save_master_supply_v2(payload || jsonb_build_object('mode', 'fill_only', 'supply_name', 'MUST NOT REPLACE', 'city', 'MUST NOT REPLACE'));
  select to_jsonb(s) - 'updated_at' into after_metadata from public.supplies s where id=sid;
  perform pg_temp.assert_true(before_metadata = after_metadata, 'fill-only values cannot replace populated metadata');
  r := public.save_master_supply_v2(payload || jsonb_build_object('city', null));
  r := public.save_master_supply_v2(payload || jsonb_build_object('mode', 'fill_only', 'city', 'LOCALIDAD ENRIQUECIDA'));
  perform pg_temp.assert_true((r->>'ok')::boolean and r->>'mode'='enriched'
    and (select city='LOCALIDAD ENRIQUECIDA' and supply_name='NOMBRE DE PRUEBA' from public.supplies where id=sid),
    'fill-only still fills missing metadata after a manual removal');

  -- Existing fixed-retailer protection keeps its contract even with a null key.
  r := public.set_supply_retailer_manual('ES0000000000000001AA0F', 'COMERCIALIZADORA FIJADA');
  perform pg_temp.assert_true((r->>'ok')::boolean, 'synthetic fixed retailer can be set');
  r := public.save_master_supply_v2(payload || jsonb_build_object('retailer', null));
  perform pg_temp.assert_true((r->>'ok')::boolean and
    (select current_retailer='COMERCIALIZADORA FIJADA' and manual_retailer='COMERCIALIZADORA FIJADA' from public.supplies where id=sid),
    'manual retailer lock remains effective');

  -- All-empty holder profiles remain explicit instead of falling back to legacy.
  insert into private.client_contact_details(client_id,email,phone,bank_account)
    values(cid,'legacy@example.org','1234','SYNTHETIC-LEGACY-BANK');
  insert into private.supply_contact_overrides(supply_id,email,phone,bank_account)
    values(sid,'override@example.org','5678','SYNTHETIC-OVERRIDE-BANK');
  r := public.admin_update_holder_profile(hid,'TITULAR DE PRUEBA UNO','TESTHOLDER1','holder@example.org','9012','SYNTHETIC-HOLDER-BANK');
  perform pg_temp.assert_true((r->>'ok')::boolean, 'holder contact profile can be saved');
  r := public.admin_update_holder_profile(hid,'TITULAR DE PRUEBA UNO','TESTHOLDER1',null,'','  ');
  perform pg_temp.assert_true((r->>'ok')::boolean and (select count(*)=1 from private.holder_contact_details
    where holder_id=hid and email is null and phone is null and bank_account is null), 'clearing all contacts preserves an explicit empty profile');
  profiles := public.get_internal_billing_profiles();
  perform pg_temp.assert_true(profiles->'holders' ? hid::text
    and profiles->'holders'->(hid::text) = '{"email":null,"phone":null,"bank_account":null}'::jsonb,
    'billing read exposes the explicit blank holder profile');
  perform pg_temp.assert_true(profiles->'legacy_clients'->(cid::text)->>'email'='legacy@example.org',
    'legacy source remains available without replacing explicit empty holder data');
  perform pg_temp.assert_true(profiles->'supplies'->(sid::text)->>'email'='override@example.org',
    'clearing a holder profile preserves supply exceptions');
  r := public.admin_update_holder_profile(hid,'TITULAR DE PRUEBA UNO','TESTHOLDER1',null,null,null);
  perform pg_temp.assert_true((r->>'ok')::boolean and (select count(*)=1 from private.holder_contact_details where holder_id=hid),
    'repeated empty profile save neither deletes nor duplicates it');

  -- The bulk holder/group wrapper must not mistake a missing profile for an
  -- already-saved empty one and skip the explicit removal of legacy contacts.
  insert into private.client_contact_details(client_id,email,phone,bank_account)
    values('20000000-0000-4000-8000-000000000002','second-legacy@example.org','2468','SYNTHETIC-SECOND-BANK');
  context := public.get_internal_holder_portfolio_context('30000000-0000-4000-8000-000000000002');
  r := public.admin_update_holder_profile_with_portfolio(
    '30000000-0000-4000-8000-000000000002','TITULAR DE PRUEBA DOS','TESTHOLDER2',null,null,null,
    'set',null,'GRUPO DE PRUEBA CONTACTOS VACIOS',null,context->>'snapshot'
  );
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'changed_supplies')::integer=1,
    'grouping and explicit empty profile save together');
  profiles := public.get_internal_billing_profiles();
  perform pg_temp.assert_true(profiles->'holders'->'30000000-0000-4000-8000-000000000002'
      = '{"email":null,"phone":null,"bank_account":null}'::jsonb,
    'bulk wrapper creates an explicit empty profile instead of inheriting legacy contacts');
  group_id := (r->>'group_id')::uuid;
  context := public.get_internal_holder_portfolio_context('30000000-0000-4000-8000-000000000002');
  select count(*) into audit_count from public.audit_log;
  r := public.admin_update_holder_profile_with_portfolio(
    '30000000-0000-4000-8000-000000000002','TITULAR DE PRUEBA DOS','TESTHOLDER2',null,null,null,
    'set',group_id,null,null,context->>'snapshot'
  );
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'changed_supplies')::integer=0
    and (select count(*) from public.audit_log)=audit_count, 'explicit empty profile and same group replay remains a true no-op');
  r := public.admin_update_holder_profile_with_portfolio(
    '30000000-0000-4000-8000-000000000003','TITULAR VACIO DE PRUEBA','TESTEMPTY',null,null,null
  );
  perform pg_temp.assert_true((r->>'ok')::boolean and r->>'portfolio_action'='keep'
    and exists(select 1 from private.holder_contact_details
      where holder_id='30000000-0000-4000-8000-000000000003' and email is null and phone is null and bank_account is null),
    'keep grouping also materializes an explicit empty profile when it was missing');

  -- Role checks reject customer/inactive sessions before any data or audit write.
  select count(*) into audit_count from public.audit_log;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', false);
  r := public.save_master_supply_v2(payload || blanks);
  perform pg_temp.assert_true(r->>'reason'='not_authorized', 'customer cannot clear supply metadata');
  r := public.admin_update_holder_profile(hid,'TITULAR DE PRUEBA UNO','TESTHOLDER1',null,null,null);
  perform pg_temp.assert_true(r->>'reason'='admin_required', 'customer cannot clear holder profile');
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', false);
  r := public.save_master_supply_v2(payload || blanks);
  perform pg_temp.assert_true(r->>'reason'='not_authorized', 'inactive admin cannot clear metadata');
  perform pg_temp.assert_true((select count(*) from public.audit_log)=audit_count, 'rejected writes produce no mutation audit');
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
end;
$$;

select pg_temp.assert_true(not has_function_privilege('anon','public.save_master_supply(jsonb)','execute'), 'anon cannot execute the master writer');
select pg_temp.assert_true(has_function_privilege('authenticated','public.save_master_supply(jsonb)','execute'), 'authenticated callers keep access subject to the internal-user guard');
select pg_temp.assert_true(not has_function_privilege('anon','public.admin_update_holder_profile(uuid,text,text,text,text,text)','execute'), 'anon cannot execute the holder profile writer');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(i) order by id) from public.invoices i)=(select invoices from master_edit_protected), 'edits preserve all historical invoices');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(e) order by invoice_id,period) from public.invoice_energy_periods e)=(select periods from master_edit_protected), 'edits preserve all historical period data');
select pg_temp.assert_true((select jsonb_agg(jsonb_build_object('id', s.id, 'holder_id', s.holder_id, 'cups', s.cups, 'status', s.status) order by s.id) from public.supplies s)=(select supply_identity from master_edit_protected), 'metadata edits preserve supply identity and ownership');
select pg_temp.assert_true((select count(*) from public.clients)=(select clients from master_edit_protected)
  and (select count(*) from public.holders)=(select holders from master_edit_protected)
  and (select count(*) from public.supplies)=(select supplies from master_edit_protected), 'metadata edits never duplicate the hierarchy');
