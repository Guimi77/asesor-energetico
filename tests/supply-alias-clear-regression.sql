-- Real PostgreSQL regression for the single editable supply alias.
-- Synthetic data only; run through master-supply-edit-postgres.cjs.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);

create temporary table supply_alias_protected as
select
  (select jsonb_agg(to_jsonb(i) order by id) from public.invoices i) as invoices,
  (select jsonb_agg(to_jsonb(e) order by invoice_id, period) from public.invoice_energy_periods e) as periods,
  (select jsonb_agg(to_jsonb(s) - 'updated_at' order by id) from public.supplies s) as supplies;

do $$
declare
  sid uuid := '40000000-0000-4000-8000-000000000001';
  other_sid uuid := '40000000-0000-4000-8000-000000000004';
  cid uuid := '20000000-0000-4000-8000-000000000001';
  admin_id uuid := '10000000-0000-4000-8000-000000000001';
  staff_id uuid := '10000000-0000-4000-8000-000000000002';
  actor text;
  r jsonb;
  aliases jsonb;
  payload jsonb;
  old_name text;
  before_private jsonb;
  rejected boolean;
begin
  select supply_name into old_name from public.supplies where id=sid;
  perform pg_temp.assert_true(old_name is not null and old_name <> '', 'legacy supply name is present in the fixture');

  aliases := public.get_internal_aliases();
  perform pg_temp.assert_true(not (aliases->'supplies' ? sid::text), 'an unset alias has no key');

  r := public.set_internal_aliases('ES0000000000000004AA0F', null, null, null, 'OTRO ALIAS SINTETICO');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'supply_alias_set')::boolean,
    'a separate supply alias can be set');

  -- CUPS identity resolution and the response fields from the deployed RPC remain intact.
  r := public.set_internal_aliases(' es0000000000000001aa0f ', null, null, '  CLIENTE ALIAS SINTETICO  ', '  ALIAS SINTETICO  ');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'client_id')::uuid=cid and (r->>'supply_id')::uuid=sid,
    'normalized CUPS resolves the same supply and client');
  perform pg_temp.assert_true(r->>'client_alias'='CLIENTE ALIAS SINTETICO' and r->>'supply_alias'='ALIAS SINTETICO'
    and (r->>'supply_alias_set')::boolean, 'existing response fields remain and aliases are trimmed');
  perform pg_temp.assert_true((select alias='ALIAS SINTETICO' and updated_by=admin_id from private.supply_aliases where supply_id=sid),
    'a nonempty alias is stored privately');

  r := public.set_internal_aliases('ES0000000000000001AA0F', null, null, 'CLIENTE ALIAS SINTETICO', 'ALIAS RENOMBRADO');
  perform pg_temp.assert_true(r->>'supply_alias'='ALIAS RENOMBRADO'
    and (select count(*)=1 from private.supply_aliases where supply_id=sid),
    'renaming updates the same private alias record');

  -- An explicit empty string is a durable override, not a missing alias.
  r := public.set_internal_aliases('ES0000000000000001AA0F', null, null, 'CLIENTE ALIAS SINTETICO', '');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'supply_alias_set')::boolean and r->>'supply_alias'='',
    'empty alias returns an explicit saved-state acknowledgement');
  perform pg_temp.assert_true((select count(*)=1 from private.supply_aliases where supply_id=sid and alias=''),
    'empty alias remains a private record');
  aliases := public.get_internal_aliases();
  perform pg_temp.assert_true(aliases->'supplies' ? sid::text and aliases->'supplies'->>(sid::text)='',
    'reload distinguishes the empty alias key from an absent key');
  perform pg_temp.assert_true((select supply_name=old_name from public.supplies where id=sid),
    'clearing the display alias preserves the original supply name');
  perform pg_temp.assert_true(aliases->'supplies'->>(other_sid::text)='OTRO ALIAS SINTETICO',
    'clearing one alias does not remove unrelated aliases');

  r := public.set_internal_aliases('ES0000000000000001AA0F', null, null, 'CLIENTE ALIAS SINTETICO', '   ');
  perform pg_temp.assert_true(r->>'supply_alias'='' and (r->>'supply_alias_set')::boolean
    and (select count(*)=1 from private.supply_aliases where supply_id=sid and alias=''),
    'whitespace and repeated clearing normalize to one durable empty override');

  -- A subsequent master import cannot remove the override or rewrite the legacy name.
  select jsonb_build_object('mode','fill_only','cups',s.cups,
    'client_name',c.name,'client_tax_id',c.tax_id,
    'holder_name',h.legal_name,'holder_tax_id',h.tax_id,
    'supply_name','IMPORT MUST NOT REPLACE EXISTING NAME')
  into payload
  from public.supplies s join public.holders h on h.id=s.holder_id
  join public.clients c on c.id=h.client_id where s.id=sid;
  r := public.save_master_supply_v2(payload);
  perform pg_temp.assert_true((r->>'ok')::boolean, 'fill-only import remains supported');
  aliases := public.get_internal_aliases();
  perform pg_temp.assert_true(aliases->'supplies' ? sid::text and aliases->'supplies'->>(sid::text)=''
    and (select supply_name=old_name from public.supplies where id=sid),
    'import and reload preserve the explicit empty alias and the historical source name');

  -- NULL keeps the old reset contract for callers that deliberately remove an override.
  r := public.set_internal_aliases('ES0000000000000001AA0F', null, null, 'CLIENTE ALIAS SINTETICO', null);
  perform pg_temp.assert_true((r->>'ok')::boolean and r->'supply_alias'='null'::jsonb
    and r->'supply_alias_set'='false'::jsonb,
    'legacy NULL reset reports that no override is set');
  aliases := public.get_internal_aliases();
  perform pg_temp.assert_true(not (aliases->'supplies' ? sid::text)
    and not exists(select 1 from private.supply_aliases where supply_id=sid), 'NULL deletes only the selected override');

  -- Staff retains write access, and client-alias empty handling is intentionally unchanged.
  perform set_config('request.jwt.claim.sub', staff_id::text, false);
  r := public.set_internal_aliases('ES0000000000000001AA0F', null, null, '', '');
  perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'supply_alias_set')::boolean
    and (select alias='' and updated_by=staff_id from private.supply_aliases where supply_id=sid),
    'active staff can save an explicit empty supply alias');
  perform pg_temp.assert_true(not exists(select 1 from private.client_aliases where client_id=cid),
    'empty client alias retains its existing delete semantics');
  perform set_config('request.jwt.claim.sub', admin_id::text, false);

  r := public.set_internal_aliases('ES0000000000000009AA0F', null, null, null, '');
  perform pg_temp.assert_true(r->'supply_id'='null'::jsonb and r->'supply_alias_set'='false'::jsonb,
    'an unresolved supply cannot acknowledge an explicit alias save');

  select jsonb_build_object(
    'clients',coalesce((select jsonb_agg(to_jsonb(a) order by client_id) from private.client_aliases a),'[]'::jsonb),
    'supplies',coalesce((select jsonb_agg(to_jsonb(a) order by supply_id) from private.supply_aliases a),'[]'::jsonb)
  ) into before_private;

  foreach actor in array array[
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    ''
  ] loop
    perform set_config('request.jwt.claim.sub', actor, false);
    rejected := false;
    begin
      perform public.set_internal_aliases('ES0000000000000001AA0F', null, null, 'MUST NOT WRITE', 'MUST NOT WRITE');
    exception when insufficient_privilege then
      rejected := true;
    end;
    perform pg_temp.assert_true(rejected, 'customer, inactive admin and missing sessions cannot write private aliases');
    rejected := false;
    begin
      perform public.get_internal_aliases();
    exception when insufficient_privilege then
      rejected := true;
    end;
    perform pg_temp.assert_true(rejected, 'customer, inactive admin and missing sessions cannot read private aliases');
  end loop;
  perform set_config('request.jwt.claim.sub', admin_id::text, false);
  perform pg_temp.assert_true(before_private=jsonb_build_object(
    'clients',coalesce((select jsonb_agg(to_jsonb(a) order by client_id) from private.client_aliases a),'[]'::jsonb),
    'supplies',coalesce((select jsonb_agg(to_jsonb(a) order by supply_id) from private.supply_aliases a),'[]'::jsonb)
  ), 'rejected operations do not change private alias rows or timestamps');
end;
$$;

select pg_temp.assert_true(not has_function_privilege('anon','public.set_internal_aliases(text,text,text,text,text)','execute'),
  'anon cannot execute the alias writer');
select pg_temp.assert_true(has_function_privilege('authenticated','public.set_internal_aliases(text,text,text,text,text)','execute'),
  'authenticated callers retain access subject to the internal-user guard');
select pg_temp.assert_true(not has_function_privilege('anon','public.get_internal_aliases()','execute'),
  'anon cannot execute the private alias reader');
select pg_temp.assert_true(not has_table_privilege('authenticated','private.supply_aliases','select')
  and not has_table_privilege('authenticated','private.supply_aliases','insert'),
  'alias rows stay behind the guarded RPCs');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(s) - 'updated_at' order by id) from public.supplies s)
  =(select supplies from supply_alias_protected), 'alias changes never modify supply identity or source metadata');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(i) order by id) from public.invoices i)
  =(select invoices from supply_alias_protected), 'alias changes preserve all historical invoices');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(e) order by invoice_id,period) from public.invoice_energy_periods e)
  =(select periods from supply_alias_protected), 'alias changes preserve historical energy detail');
