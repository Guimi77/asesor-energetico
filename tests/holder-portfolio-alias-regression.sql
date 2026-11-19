-- Synthetic regression only. Roll back the test data so the existing
-- multi-session portfolio regression can continue from its original state.
begin;

insert into private.client_aliases(client_id, alias) values
  ('20000000-0000-4000-8000-000000000001', 'ORIGINAL SYNTHETIC ALIAS'),
  ('20000000-0000-4000-8000-000000000002', 'OTHER SYNTHETIC ALIAS');
insert into private.supply_aliases(supply_id, alias) values
  ('40000000-0000-4000-8000-000000000001', 'SYNTHETIC SUPPLY ALIAS');

create function pg_temp.holder_alias_full_state() returns jsonb
language sql as $$
  select jsonb_build_object(
    'holders', (select jsonb_agg(to_jsonb(t) order by id) from public.holders t),
    'contacts', (select jsonb_agg(to_jsonb(t) order by holder_id) from private.holder_contact_details t),
    'aliases', (select jsonb_agg(to_jsonb(t) order by client_id) from private.client_aliases t),
    'supply_aliases', (select jsonb_agg(to_jsonb(t) order by supply_id) from private.supply_aliases t),
    'groups', (select jsonb_agg(to_jsonb(t) order by id) from private.supply_portfolios t),
    'members', (select jsonb_agg(to_jsonb(t) order by supply_id) from private.supply_portfolio_members t),
    'audit', (select jsonb_agg(to_jsonb(t) order by id) from public.audit_log t)
  )
$$;

-- An injected storage error verifies rollback after profile and group writes.
create function pg_temp.reject_holder_alias_write() returns trigger
language plpgsql as $$ begin
  if new.alias = 'SYNTHETIC-REJECTED-ALIAS' then
    raise exception 'Synthetic alias write failure' using errcode = 'PZA01';
  end if;
  return new;
end $$;
create trigger synthetic_reject_holder_alias_write
before insert or update on private.client_aliases
for each row execute function pg_temp.reject_holder_alias_write();

select pg_temp.assert_true(not has_function_privilege('anon', 'public.admin_update_holder_profile_with_alias(uuid,text,text,text,text,text,text,text,uuid,text,uuid,text,text,text)', 'execute'), 'anonymous alias wrapper access is revoked');
select pg_temp.assert_true(has_function_privilege('authenticated', 'public.admin_update_holder_profile_with_alias(uuid,text,text,text,text,text,text,text,uuid,text,uuid,text,text,text)', 'execute'), 'authenticated users can reach the role-protected alias wrapper');

do $$
declare
  h constant uuid := '30000000-0000-4000-8000-000000000001';
  empty_h constant uuid := '30000000-0000-4000-8000-000000000003';
  c_id constant uuid := '20000000-0000-4000-8000-000000000001';
  other_c constant uuid := '20000000-0000-4000-8000-000000000002';
  g constant uuid := '60000000-0000-4000-8000-000000000002';
  r jsonb;
  context jsonb;
  before_state jsonb;
  before_holder jsonb;
  before_contacts jsonb;
  before_members jsonb;
  before_groups jsonb;
  actor text;
begin
  before_state := pg_temp.holder_alias_full_state();
  foreach actor in array array['', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004'] loop
    perform set_config('request.jwt.claim.sub', actor, false);
    r := public.admin_update_holder_profile_with_alias(h, 'UNAUTHORIZED', null, null, null, null, 'UNAUTHORIZED ALIAS', null, c_id);
    perform pg_temp.assert_true(r->>'reason' = 'admin_required' and not (r ? 'client_alias'), 'unauthenticated, staff, external and inactive callers cannot change or read aliases through the wrapper');
  end loop;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  r := public.admin_update_holder_profile_with_alias('30000000-0000-4000-8000-000000000099', 'MISSING', null, null, null, null, 'MISSING', null, c_id);
  perform pg_temp.assert_true(r->>'reason' = 'holder_not_found', 'unknown holder is rejected');
  r := public.admin_update_holder_profile_with_alias(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'MUST NOT SAVE', 'ORIGINAL SYNTHETIC ALIAS', null);
  perform pg_temp.assert_true(r->>'reason' = 'holder_client_changed', 'expected client identity is mandatory');
  r := public.admin_update_holder_profile_with_alias(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'MUST NOT SAVE', 'ORIGINAL SYNTHETIC ALIAS', other_c);
  perform pg_temp.assert_true(r->>'reason' = 'holder_client_changed', 'another client UUID cannot target its alias');
  r := public.admin_update_holder_profile_with_alias(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'MUST NOT SAVE', 'STALE ALIAS', c_id);
  perform pg_temp.assert_true(r->>'reason' = 'client_alias_conflict', 'stale alias cannot overwrite a third value');
  r := public.admin_update_holder_profile_with_alias(h, 'MUST NOT SAVE', 'TESTHOLDER1', 'invalid email', null, null, 'MUST NOT SAVE', 'ORIGINAL SYNTHETIC ALIAS', c_id);
  perform pg_temp.assert_true(r->>'reason' = 'invalid_email', 'existing contact validation is reused');
  r := public.admin_update_holder_profile_with_alias(h, 'MUST NOT SAVE', 'DIFFERENT-TAX', null, null, null, 'MUST NOT SAVE', 'ORIGINAL SYNTHETIC ALIAS', c_id);
  perform pg_temp.assert_true(r->>'reason' = 'tax_identity_change_requires_reassignment', 'existing identity protection is reused');
  r := public.admin_update_holder_profile_with_alias(h, 'MUST NOT SAVE', 'TESTHOLDER1', null, null, null, 'MUST NOT SAVE', 'ORIGINAL SYNTHETIC ALIAS', c_id, 'set', g, null, null, 'stale-snapshot');
  perform pg_temp.assert_true(r->>'reason' = 'portfolio_context_changed', 'existing portfolio snapshot is enforced before any alias change');
  perform pg_temp.assert_true(pg_temp.holder_alias_full_state() = before_state, 'all validation failures preserve profile, aliases, groups and audit');

  select to_jsonb(t) into before_holder from public.holders t where id = h;
  select to_jsonb(t) into before_contacts from private.holder_contact_details t where holder_id = h;
  select jsonb_agg(to_jsonb(t) order by supply_id) into before_members from private.supply_portfolio_members t;
  r := public.admin_update_holder_profile_with_alias(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.org', '1234', 'SYNTHETIC-BANK', '  NEW SYNTHETIC ALIAS  ', 'ORIGINAL SYNTHETIC ALIAS', c_id);
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'alias_changed')::boolean and r->>'client_alias' = 'NEW SYNTHETIC ALIAS' and r->>'client_id' = c_id::text, 'alias-only save returns the normalized alias and its legal client');
  perform pg_temp.assert_true(public.get_internal_aliases()->'clients'->>c_id::text = 'NEW SYNTHETIC ALIAS', 'existing alias reader returns the edited value');
  perform pg_temp.assert_true((select a.alias from public.holders x join private.client_aliases a on a.client_id=x.client_id where x.id=empty_h) = 'NEW SYNTHETIC ALIAS', 'other holders of the same client use the same existing client alias');
  perform pg_temp.assert_true((select to_jsonb(t) from public.holders t where id=h) = before_holder and (select to_jsonb(t) from private.holder_contact_details t where holder_id=h) = before_contacts, 'alias-only editing preserves unchanged holder profile metadata');
  perform pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by supply_id) from private.supply_portfolio_members t) = before_members, 'alias-only editing keeps mixed portfolio membership');
  before_state := pg_temp.holder_alias_full_state();
  r := public.admin_update_holder_profile_with_alias(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.org', '1234', 'SYNTHETIC-BANK', 'NEW SYNTHETIC ALIAS', 'ORIGINAL SYNTHETIC ALIAS', c_id);
  perform pg_temp.assert_true((r->>'ok')::boolean and not (r->>'alias_changed')::boolean and pg_temp.holder_alias_full_state() = before_state, 'exact retry is idempotent even when its old expected alias differs from the destination');

  r := public.admin_update_holder_profile_with_alias(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.org', '1234', 'SYNTHETIC-BANK', '   ', 'NEW SYNTHETIC ALIAS', c_id);
  perform pg_temp.assert_true((r->>'ok')::boolean and r->>'client_alias' = '' and not exists(select 1 from private.client_aliases where client_id=c_id), 'blank alias explicitly removes the private row');
  perform pg_temp.assert_true(not ((public.get_internal_aliases()->'clients') ? c_id::text), 'read after clear cannot restore the old alias');
  before_state := pg_temp.holder_alias_full_state();
  r := public.admin_update_holder_profile_with_alias(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.org', '1234', 'SYNTHETIC-BANK', null, 'NEW SYNTHETIC ALIAS', c_id);
  perform pg_temp.assert_true((r->>'ok')::boolean and not (r->>'alias_changed')::boolean and pg_temp.holder_alias_full_state() = before_state, 'null clear replay adds no duplicate audit or timestamp writes');
  r := public.admin_update_holder_profile_with_alias(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'profile@example.org', '1234', 'SYNTHETIC-BANK', repeat('S',180), null, c_id);
  perform pg_temp.assert_true((r->>'ok')::boolean and char_length(r->>'client_alias') = 180, 'existing unbounded text alias contract is preserved without truncation');

  r := public.admin_update_holder_profile_with_alias(empty_h, 'TITULAR VACIO DE PRUEBA', 'TESTEMPTY', null, null, null, 'EMPTY HOLDER CLIENT ALIAS', repeat('S',180), c_id);
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'total_supplies')::integer = 0, 'client alias editing does not require inventing a representative CUPS');
  update public.holders set client_id = other_c where id = empty_h;
  before_state := pg_temp.holder_alias_full_state();
  r := public.admin_update_holder_profile_with_alias(empty_h, 'MUST NOT SAVE', 'TESTEMPTY', null, null, null, 'WRONG CLIENT ALIAS', 'EMPTY HOLDER CLIENT ALIAS', c_id);
  perform pg_temp.assert_true(r->>'reason' = 'holder_client_changed' and pg_temp.holder_alias_full_state() = before_state, 'reassigned holder cannot edit the old or new client through a stale form');
  update public.holders set client_id = c_id where id = empty_h;

  context := public.get_internal_holder_portfolio_context(h);
  select jsonb_agg(to_jsonb(t) order by id) into before_groups from private.supply_portfolios t;
  r := public.admin_update_holder_profile_with_alias(h, 'TITULAR DE PRUEBA RENOMBRADO', 'TESTHOLDER1', 'combined@example.org', '1234', 'SYNTHETIC-BANK', 'COMBINED SYNTHETIC ALIAS', 'EMPTY HOLDER CLIENT ALIAS', c_id, 'set', g, null, null, context->>'snapshot');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'total_supplies')::integer = 3 and (r->>'changed_supplies')::integer = 3, 'combined save applies the alias, profile and every current holder supply');
  perform pg_temp.assert_true((select email from private.holder_contact_details where holder_id=h) = 'combined@example.org' and (select alias from private.client_aliases where client_id=c_id) = 'COMBINED SYNTHETIC ALIAS', 'profile and alias committed together');
  perform pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from private.supply_portfolios t) = before_groups, 'existing group aliases and names remain unchanged');
  perform pg_temp.assert_true((select alias from private.supply_aliases where supply_id='40000000-0000-4000-8000-000000000001') = 'SYNTHETIC SUPPLY ALIAS' and (select alias from private.client_aliases where client_id=other_c) = 'OTHER SYNTHETIC ALIAS', 'supply aliases and unrelated client aliases remain unchanged');

  context := public.get_internal_holder_portfolio_context(h);
  before_state := pg_temp.holder_alias_full_state();
  begin
    perform public.admin_update_holder_profile_with_alias(h, 'STORAGE FAILURE MUST ROLL BACK', 'TESTHOLDER1', 'rollback@example.org', null, null, 'SYNTHETIC-REJECTED-ALIAS', 'COMBINED SYNTHETIC ALIAS', c_id, 'clear', null, null, null, context->>'snapshot');
    raise exception 'Expected synthetic storage failure';
  exception when sqlstate 'PZA01' then null;
  end;
  perform pg_temp.assert_true(pg_temp.holder_alias_full_state() = before_state, 'alias storage error rolls back profile, group, contacts and all success audits');
  perform pg_temp.assert_true(not exists(
    select 1 from public.audit_log where action='client_alias_updated_from_holder'
      and details - array['source','holder_id','client_id','had_alias','has_alias'] <> '{}'::jsonb
  ), 'alias audit stores presence and IDs rather than private label values');
end $$;

select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from public.clients t) = (select clients from protected_state), 'alias edits preserve legal client records');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from public.supplies t) = (select supplies from protected_state), 'alias edits preserve all supply IDs and identities');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from public.invoices t) = (select invoices from protected_state), 'alias edits preserve invoice history');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by invoice_id, period) from public.invoice_energy_periods t) = (select periods from protected_state), 'alias edits preserve energy period history');
select pg_temp.assert_true((select to_jsonb(t) from private.supply_portfolio_members t where supply_id = '40000000-0000-4000-8000-000000000004') = (select other_member from protected_state), 'alias editor never reassigns another holder supplies');

rollback;
