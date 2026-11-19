-- Execute after the fixture and the real migrations listed in the runner.
insert into private.supply_portfolios(id, name, alias) values
  ('60000000-0000-4000-8000-000000000001', 'GRUPO DE PRUEBA A', 'Alias A'),
  ('60000000-0000-4000-8000-000000000002', 'GRUPO DE PRUEBA B', null);
insert into private.supply_portfolio_members(supply_id, portfolio_id) values
  ('40000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000001');

create temp table protected_state as select
  (select jsonb_agg(to_jsonb(t) order by id) from public.clients t) as clients,
  (select jsonb_agg(to_jsonb(t) order by id) from public.supplies t) as supplies,
  (select jsonb_agg(to_jsonb(t) order by id) from public.invoices t) as invoices,
  (select jsonb_agg(to_jsonb(t) order by invoice_id, period) from public.invoice_energy_periods t) as periods,
  (select to_jsonb(t) from private.supply_portfolio_members t where supply_id = '40000000-0000-4000-8000-000000000004') as other_member;

select pg_temp.assert_true(not has_function_privilege('anon', 'public.get_internal_holder_portfolio_context(uuid)', 'execute'), 'anonymous context access is revoked');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.admin_update_holder_profile_with_portfolio(uuid,text,text,text,text,text,text,uuid,text,text,text)', 'execute'), 'anonymous mutation access is revoked');
select pg_temp.assert_true(has_function_privilege('authenticated', 'public.admin_update_holder_profile_with_portfolio(uuid,text,text,text,text,text,text,uuid,text,text,text)', 'execute'), 'authenticated RPC entrypoint remains callable');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'private.holder_portfolio_state(uuid)', 'execute'), 'private helper is not an exposed bypass');

do $$
declare
  h constant uuid := '30000000-0000-4000-8000-000000000001';
  empty_h constant uuid := '30000000-0000-4000-8000-000000000003';
  g constant uuid := '60000000-0000-4000-8000-000000000002';
  c jsonb;
  r jsonb;
  before_holder jsonb;
  before_members jsonb;
  before_profile jsonb;
  before_audit bigint;
  new_group uuid;
  actor text;
begin
  -- Authentication and active-role authorization run inside the real RPCs.
  foreach actor in array array['', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004'] loop
    perform set_config('request.jwt.claim.sub', actor, false);
    r := public.get_internal_holder_portfolio_context(h);
    perform pg_temp.assert_true(r->>'reason' = 'not_authorized' and not (r ? 'groups'), 'external/inactive caller cannot inspect groups');
    r := public.admin_update_holder_profile_with_portfolio(h, 'UNAUTHORIZED', null, null, null, null);
    perform pg_temp.assert_true(r->>'reason' = 'admin_required', 'external/inactive caller cannot write holder');
  end loop;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
  perform pg_temp.assert_true((public.get_internal_holder_portfolio_context(h)->>'ok')::boolean, 'active staff may read internal context');
  r := public.admin_update_holder_profile_with_portfolio(h, 'STAFF MUST NOT WRITE', null, null, null, null);
  perform pg_temp.assert_true(r->>'reason' = 'admin_required', 'staff cannot edit complete holder profile');

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  c := public.get_internal_holder_portfolio_context(h);
  perform pg_temp.assert_true((c->>'total_supplies')::integer = 3 and (c->>'active_supplies')::integer = 1 and (c->>'other_supplies')::integer = 2, 'context counts active, inactive and archived supplies');
  perform pg_temp.assert_true((c->>'mixed')::boolean and c->>'group_id' is null, 'mixed existing groups including no group are explicit');
  perform pg_temp.assert_true(jsonb_array_length(c->'groups') = 2 and length(c->>'snapshot') = 32, 'context includes destinations and a state snapshot');
  select to_jsonb(t) into before_holder from public.holders t where id = h;
  select jsonb_agg(to_jsonb(t) order by supply_id) into before_members from private.supply_portfolio_members t;
  select count(*) into before_audit from public.audit_log;

  r := public.admin_update_holder_profile_with_portfolio(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'set', g);
  perform pg_temp.assert_true(r->>'reason' = 'portfolio_snapshot_required', 'snapshot is mandatory for bulk change');
  r := public.admin_update_holder_profile_with_portfolio(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'set', g, 'AMBIGUOUS', null, c->>'snapshot');
  perform pg_temp.assert_true(r->>'reason' = 'ambiguous_destination', 'existing and new destination cannot be combined');
  r := public.admin_update_holder_profile_with_portfolio(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'clear', g, null, null, c->>'snapshot');
  perform pg_temp.assert_true(r->>'reason' = 'ambiguous_destination', 'clear cannot conceal a destination');
  r := public.admin_update_holder_profile_with_portfolio(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'set', null, repeat('x',161), null, c->>'snapshot');
  perform pg_temp.assert_true(r->>'reason' = 'invalid_group_name_or_alias', 'long names are rejected');
  r := public.admin_update_holder_profile_with_portfolio(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'set', null, '  grupo de prueba a ', null, c->>'snapshot');
  perform pg_temp.assert_true(r->>'reason' = 'group_name_exists', 'existing name comparison trims and ignores case');
  r := public.admin_update_holder_profile_with_portfolio(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'set', '60000000-0000-4000-8000-000000000099', null, null, c->>'snapshot');
  perform pg_temp.assert_true(r->>'reason' = 'group_not_found', 'missing destination is rejected');
  r := public.admin_update_holder_profile_with_portfolio(h, 'MUST NOT SAVE', 'TESTHOLDER1', 'invalid email', null, null, 'set', null, 'MUST NOT CREATE', null, c->>'snapshot');
  perform pg_temp.assert_true(r->>'reason' = 'invalid_email' and not exists(select 1 from private.supply_portfolios where name = 'MUST NOT CREATE'), 'invalid profile never creates a group');
  r := public.admin_update_holder_profile_with_portfolio(h, 'MUST NOT SAVE', 'OTHERIDENTITY', null, null, null, 'set', g, null, null, c->>'snapshot');
  perform pg_temp.assert_true(r->>'reason' = 'tax_identity_change_requires_reassignment', 'existing fiscal identity validation is reused');
  perform pg_temp.assert_true((select to_jsonb(t) from public.holders t where id = h) = before_holder, 'all rejected changes leave profile identity intact');
  perform pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by supply_id) from private.supply_portfolio_members t) = before_members, 'all rejected changes leave memberships intact');
  perform pg_temp.assert_true((select count(*) from public.audit_log) = before_audit, 'rejected changes create no misleading audit success');

  -- One transaction saves valid profile fields and every current supply.
  r := public.admin_update_holder_profile_with_portfolio(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.invalid', '1234', 'SYNTHETIC-BANK', 'set', g, null, null, c->>'snapshot');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'total_supplies')::integer = 3 and (r->>'changed_supplies')::integer = 2, 'bulk save counts only memberships that actually changed');
  perform pg_temp.assert_true((select count(*) from private.supply_portfolio_members m join public.supplies s on s.id=m.supply_id where s.holder_id=h and m.portfolio_id=g) = 3, 'all statuses belong to destination');
  perform pg_temp.assert_true((select email from private.holder_contact_details where holder_id=h) = 'profile@example.invalid', 'profile fields saved in same transaction');
  perform pg_temp.assert_true((select client_id from public.holders where id=h) = '20000000-0000-4000-8000-000000000001', 'grouping never reparents legal holder');
  perform pg_temp.assert_true((select details->'supply_ids' from public.audit_log where action='holder_supply_portfolio_assigned' order by id desc limit 1) = '["40000000-0000-4000-8000-000000000001","40000000-0000-4000-8000-000000000002","40000000-0000-4000-8000-000000000003"]'::jsonb, 'audit records exact complete supply set');

  -- Repetition with a fresh preview must not change membership metadata.
  c := public.get_internal_holder_portfolio_context(h);
  perform pg_temp.assert_true(r->>'snapshot'=c->>'snapshot' and r->'mixed'=c->'mixed' and r->'group_id'=c->'group_id', 'save response observes post-write memberships and snapshot');
  perform pg_temp.assert_true(not (c->>'mixed')::boolean and c->>'group_id'=g::text, 'uniform destination is reported');
  select jsonb_agg(to_jsonb(t) order by supply_id) into before_members from private.supply_portfolio_members t;
  select to_jsonb(t) into before_holder from public.holders t where id=h;
  select to_jsonb(t) into before_profile from private.holder_contact_details t where holder_id=h;
  select count(*) into before_audit from public.audit_log;
  r := public.admin_update_holder_profile_with_portfolio(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.invalid', '1234', 'SYNTHETIC-BANK', 'set', g, null, null, c->>'snapshot');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'changed_supplies')::integer=0, 'same destination is idempotent');
  perform pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by supply_id) from private.supply_portfolio_members t)=before_members, 'idempotent grouping preserves timestamps and actors');
  perform pg_temp.assert_true((select count(*) from public.audit_log)=before_audit, 'identical profile and grouping add no duplicate audits');
  perform pg_temp.assert_true((select to_jsonb(t) from public.holders t where id=h)=before_holder and (select to_jsonb(t) from private.holder_contact_details t where holder_id=h)=before_profile, 'identical profile and grouping preserve all profile timestamps');
  r := public.admin_update_holder_profile_with_portfolio(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'edited@example.invalid', '1234', 'SYNTHETIC-BANK', 'set', g, null, null, c->>'snapshot');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'changed_supplies')::integer=0 and (select email from private.holder_contact_details where holder_id=h)='edited@example.invalid', 'real profile edit is saved even when destination is unchanged');

  -- A per-supply edit after opening the holder cannot be silently overwritten.
  perform public.set_internal_supply_portfolio('40000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001');
  r := public.admin_update_holder_profile_with_portfolio(h, 'STALE MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'set', g, null, null, c->>'snapshot');
  perform pg_temp.assert_true(r->>'reason'='portfolio_context_changed', 'individual change invalidates snapshot');
  perform pg_temp.assert_true((select legal_name from public.holders where id=h)='TITULAR DE PRUEBA RENOMBRADO', 'stale save never changes identity');
  perform pg_temp.assert_true((select email from private.holder_contact_details where holder_id=h)='edited@example.invalid', 'stale save never clears contact data');

  -- Keeping a mixed grouping saves only the profile; it never clears groups.
  select jsonb_agg(to_jsonb(t) order by supply_id) into before_members from private.supply_portfolio_members t;
  r := public.admin_update_holder_profile_with_portfolio(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.invalid', '1234', 'SYNTHETIC-BANK', 'keep');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'mixed')::boolean and (select jsonb_agg(to_jsonb(t) order by supply_id) from private.supply_portfolio_members t)=before_members, 'keep preserves mixed memberships');

  c := public.get_internal_holder_portfolio_context(h);
  r := public.admin_update_holder_profile_with_portfolio(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.invalid', '1234', 'SYNTHETIC-BANK', 'set', null, '  NUEVO GRUPO DE PRUEBA  ', '  Alias nuevo  ', c->>'snapshot');
  new_group := (r->>'group_id')::uuid;
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'changed_supplies')::integer=3, 'new group saves every supply atomically');
  perform pg_temp.assert_true((select name='NUEVO GRUPO DE PRUEBA' and alias='Alias nuevo' from private.supply_portfolios where id=new_group), 'new group labels are trimmed');
  c := public.get_internal_holder_portfolio_context(h);
  r := public.admin_update_holder_profile_with_portfolio(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.invalid', '1234', 'SYNTHETIC-BANK', 'clear', null, null, null, c->>'snapshot');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'changed_supplies')::integer=3 and r->>'group_id' is null, 'clear removes all holder memberships');
  c := public.get_internal_holder_portfolio_context(h);
  r := public.admin_update_holder_profile_with_portfolio(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.invalid', '1234', 'SYNTHETIC-BANK', 'clear', null, null, null, c->>'snapshot');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'changed_supplies')::integer=0, 'repeated clear is idempotent');

  c := public.get_internal_holder_portfolio_context(empty_h);
  perform pg_temp.assert_true((c->>'total_supplies')::integer=0 and not (c->>'mixed')::boolean, 'empty holder context is explicit');
  r := public.admin_update_holder_profile_with_portfolio(empty_h, 'EMPTY MUST NOT SAVE', 'TESTEMPTY', null, null, null, 'set', null, 'EMPTY MUST NOT CREATE', null, c->>'snapshot');
  perform pg_temp.assert_true(r->>'reason'='holder_has_no_supplies' and not exists(select 1 from private.supply_portfolios where name='EMPTY MUST NOT CREATE'), 'empty holder cannot create an unrepresented grouping');
  r := public.admin_update_holder_profile_with_portfolio(empty_h, 'TITULAR VACIO DE PRUEBA', 'TESTEMPTY', null, null, null, 'keep');
  perform pg_temp.assert_true((r->>'ok')::boolean, 'empty holder can still edit its profile');
end $$;

select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from public.clients t) = (select clients from protected_state), 'all legal clients unchanged');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from public.supplies t) = (select supplies from protected_state), 'all CUPS IDs, holders, lifecycle and contracts unchanged');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from public.invoices t) = (select invoices from protected_state), 'historical invoice identity and values unchanged');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by invoice_id, period) from public.invoice_energy_periods t) = (select periods from protected_state), 'energy period history unchanged');
select pg_temp.assert_true((select to_jsonb(t) from private.supply_portfolio_members t where supply_id = '40000000-0000-4000-8000-000000000004') = (select other_member from protected_state), 'another holder is never moved');
select pg_temp.assert_true(not exists(select 1 from public.audit_log where action='holder_supply_portfolio_assigned' and (details::text like '%example.invalid%' or details::text like '%SYNTHETIC-BANK%' or details::text like '%TESTHOLDER%')), 'group audit contains no copied fiscal/contact values');
