'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const connectionString = process.env.HOLDER_PORTFOLIO_TEST_DATABASE_URL;
if (!connectionString) throw new Error('HOLDER_PORTFOLIO_TEST_DATABASE_URL must name an isolated local test database.');
const target = new URL(connectionString);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/holder_portfolio_test') {
  throw new Error('Refusing to run synthetic schema tests outside localhost/holder_portfolio_test.');
}

const root = path.resolve(__dirname, '..');
const holder = '30000000-0000-4000-8000-000000000001';
const supply = '40000000-0000-4000-8000-000000000001';
const group = '60000000-0000-4000-8000-000000000002';
const legalClient = '20000000-0000-4000-8000-000000000001';
const admin = '10000000-0000-4000-8000-000000000001';
const claim = (client, user = admin) => client.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
const context = async (client) => (await client.query('select public.get_internal_holder_portfolio_context($1) as data', [holder])).rows[0].data;
const save = async (client, snapshot, overrides = {}) => {
  const args = {
    name: 'TITULAR DE PRUEBA RENOMBRADO', email: 'profile@example.org',
    action: 'set', group, newName: null, newAlias: null, ...overrides,
  };
  const result = await client.query(
    'select public.admin_update_holder_profile_with_portfolio($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as data',
    [holder, args.name, 'TESTHOLDER1', args.email, '1234', 'SYNTHETIC-BANK', args.action, args.group, args.newName, args.newAlias, snapshot],
  );
  return result.rows[0].data;
};
const saveWithAlias = async (client, overrides = {}) => {
  const args = {
    holderId: holder, name: 'TITULAR DE PRUEBA RENOMBRADO', tax: 'TESTHOLDER1',
    email: 'profile@example.org', phone: '1234', bank: 'SYNTHETIC-BANK',
    alias: 'NEXT SYNTHETIC ALIAS', expectedAlias: 'ORIGINAL SYNTHETIC ALIAS',
    expectedClient: legalClient, action: 'keep', group: null,
    newName: null, newAlias: null, snapshot: null, ...overrides,
  };
  const result = await client.query(
    'select public.admin_update_holder_profile_with_alias($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as data',
    [args.holderId, args.name, args.tax, args.email, args.phone, args.bank,
      args.alias, args.expectedAlias, args.expectedClient, args.action,
      args.group, args.newName, args.newAlias, args.snapshot],
  );
  return result.rows[0].data;
};
const fullState = async (client) => (await client.query(`select jsonb_build_object(
  'holder', (select to_jsonb(h) from public.holders h where id=$1),
  'contacts', (select to_jsonb(d) from private.holder_contact_details d where holder_id=$1),
  'aliases', (select jsonb_agg(to_jsonb(a) order by client_id) from private.client_aliases a),
  'members', (select jsonb_agg(to_jsonb(m) order by supply_id) from private.supply_portfolio_members m),
  'audit', (select jsonb_agg(to_jsonb(a) order by id) from public.audit_log a)
) as data`, [holder])).rows[0].data;

(async () => {
  const main = new Client({ connectionString });
  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  const connected = [];
  await main.connect();
  connected.push(main);
  try {
    const tables = await main.query("select count(*)::integer as count from information_schema.tables where table_schema in ('public','auth','private')");
    assert.equal(tables.rows[0].count, 0, 'test database must start empty');
    for (const filename of [
      'tests/holder-portfolio-fixture.sql',
      'supabase/migrations/20260918123000_add_client_supply_aliases.sql',
      'supabase/migrations/20260929093000_safe_holder_reassignment.sql',
      'supabase/migrations/20261117113606_add_private_client_contact_details.sql',
      'supabase/migrations/20261117121000_holder_billing_profiles_inheritance.sql',
      'supabase/migrations/20261118113000_supply_portfolios.sql',
      'supabase/migrations/20261119104956_holder_commercial_portfolio_assignment.sql',
      'supabase/migrations/20261119114837_explicit_empty_supply_and_holder_fields.sql',
      'supabase/migrations/20261119123942_holder_profile_client_alias.sql',
      'tests/holder-portfolio-regression.sql',
      'tests/holder-portfolio-alias-regression.sql',
    ]) {
      await main.query(fs.readFileSync(path.join(root, filename), 'utf8'));
      console.log('PASS', filename);
    }

    await first.connect();
    connected.push(first);
    await second.connect();
    connected.push(second);
    await claim(first);
    await claim(second);
    await first.query("set statement_timeout='8s'");
    await second.query("set statement_timeout='8s'");
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    const waitForLock = async () => {
      for (let attempt = 0; attempt < 60; attempt++) {
        const result = await main.query('select wait_event_type from pg_stat_activity where pid=$1', [secondPid]);
        if (result.rows[0]?.wait_event_type === 'Lock') return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Expected second transaction to wait on the protected row or unique index.');
    };

    // Actual API roles exercise GRANTs as well as the in-function role check.
    await second.query('set role anon');
    await assert.rejects(context(second), (error) => error.code === '42501');
    await assert.rejects(saveWithAlias(second), (error) => error.code === '42501');
    await second.query('reset role');
    await second.query('set role authenticated');
    await claim(second, '10000000-0000-4000-8000-000000000003');
    assert.equal((await context(second)).reason, 'not_authorized');
    assert.equal((await save(second, 'unused')).reason, 'admin_required');
    assert.equal((await saveWithAlias(second)).reason, 'admin_required');
    await claim(second);
    assert.equal((await context(second)).ok, true);
    await assert.rejects(second.query('select private.holder_portfolio_state($1)', [holder]), (error) => error.code === '42501');
    await assert.rejects(second.query('select alias from private.client_aliases'), (error) => error.code === '42501');
    await second.query('reset role');
    console.log('PASS actual anon/client/admin execution privileges');

    // Individual edits lock a supply first. The bulk RPC must fail quickly,
    // release its holder lock and never partially save the profile.
    let preview = await context(main);
    let before = await fullState(main);
    await first.query('begin');
    await first.query('select id from public.supplies where id=$1 for update', [supply]);
    let result = await save(second, preview.snapshot, { name: 'BUSY MUST NOT SAVE' });
    assert.equal(result.reason, 'holder_portfolio_busy');
    assert.deepEqual(await fullState(main), before);
    await first.query('rollback');
    console.log('PASS existing per-supply writer causes atomic busy rejection');

    // An already-inserting supply holds a FK key-share lock on the holder.
    // Its uncommitted existence must not slip past a supposedly complete save.
    await first.query('begin');
    await first.query("insert into public.supplies(id,holder_id,cups) values('40000000-0000-4000-8000-000000000090',$1,'TEST-IN-FLIGHT-SUPPLY')", [holder]);
    result = await save(second, preview.snapshot, { name: 'INSERTING MUST NOT SAVE' });
    assert.equal(result.reason, 'holder_portfolio_busy');
    assert.deepEqual(await fullState(main), before);
    await first.query('rollback');
    console.log('PASS in-flight new supply blocks bulk save without omission');

    // A committed insertion since preview invalidates the set snapshot.
    await first.query("insert into public.supplies(id,holder_id,cups) values('40000000-0000-4000-8000-000000000090',$1,'TEST-NEW-SUPPLY')", [holder]);
    result = await save(second, preview.snapshot, { name: 'STALE SUPPLY SET MUST NOT SAVE' });
    assert.equal(result.reason, 'portfolio_context_changed');
    assert.deepEqual(await fullState(main), before);
    await first.query("delete from public.supplies where id='40000000-0000-4000-8000-000000000090'");
    console.log('PASS committed new supply invalidates stale preview');

    // Once the bulk transaction owns the holder lock, a new FK reference waits
    // until it commits. All supplies present at that save are included.
    preview = await context(main);
    await first.query('begin');
    result = await save(first, preview.snapshot);
    assert.equal(result.ok, true);
    assert.equal(result.total_supplies, 3);
    const pendingInsert = second.query("insert into public.supplies(id,holder_id,cups) values('40000000-0000-4000-8000-000000000091',$1,'TEST-AFTER-BULK-SUPPLY')", [holder]);
    pendingInsert.catch(() => {});
    await waitForLock();
    await first.query('commit');
    await pendingInsert;
    assert.equal((await context(main)).total_supplies, 4);
    assert.equal((await save(main, result.snapshot)).reason, 'portfolio_context_changed');
    await first.query("delete from public.supplies where id='40000000-0000-4000-8000-000000000091'");
    console.log('PASS holder lock serializes supplies inserted during bulk save');

    // Another session may commit the same group name after the existence
    // check. The unique violation handler must roll back the preceding profile
    // update and both legacy audit records, not merely return ok:false.
    preview = await context(main);
    before = await fullState(main);
    await first.query('begin');
    await first.query("insert into private.supply_portfolios(name) values('CONCURRENT SYNTHETIC GROUP')");
    const pendingSave = save(second, preview.snapshot, { name: 'UNIQUE RACE MUST ROLL BACK', email: 'race@example.org', group: null, newName: 'CONCURRENT SYNTHETIC GROUP' });
    pendingSave.catch(() => {});
    await waitForLock();
    await first.query('commit');
    result = await pendingSave;
    assert.equal(result.reason, 'group_name_exists');
    assert.deepEqual(await fullState(main), before);
    assert.equal((await main.query("select count(*)::integer as count from private.supply_portfolios where name='CONCURRENT SYNTHETIC GROUP'")).rows[0].count, 1);
    console.log('PASS concurrent duplicate name rolls back profile, contacts and audit');

    await main.query("select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from public.supplies t)=(select supplies from protected_state),'concurrency tests preserve original supply records')");
    await main.query("select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from public.invoices t)=(select invoices from protected_state),'concurrency tests preserve historical invoices')");
    console.log('PASS holder portfolio SQL and multi-session concurrency regression');

    // The holder alias editor shares the existing client alias, including the
    // older supply editor writer, rather than maintaining a second alias.
    const legacyAlias = (client, alias) => client.query(
      "select public.set_internal_aliases(null,'CLIENTE DE PRUEBA UNO','TESTCLIENT1',$1,null)", [alias],
    );
    await legacyAlias(main, 'ORIGINAL SYNTHETIC ALIAS');
    before = await fullState(main);
    await first.query('begin');
    await first.query('select alias from private.client_aliases where client_id=$1 for update', [legalClient]);
    result = await saveWithAlias(second, { name: 'BUSY ALIAS MUST NOT SAVE' });
    assert.equal(result.reason, 'holder_profile_busy');
    assert.deepEqual(await fullState(main), before);
    await first.query('rollback');
    console.log('PASS locked existing alias rejects the entire holder edit');

    // A different holder of the same client must not edit the shared alias
    // concurrently through an otherwise independent holder lock.
    await first.query('begin');
    await first.query('select id from public.clients where id=$1 for no key update', [legalClient]);
    result = await saveWithAlias(second, {
      holderId: '30000000-0000-4000-8000-000000000003',
      name: 'TITULAR VACIO DE PRUEBA', tax: 'TESTEMPTY', email: null, phone: null, bank: null,
    });
    assert.equal(result.reason, 'holder_profile_busy');
    assert.deepEqual(await fullState(main), before);
    await first.query('rollback');
    console.log('PASS alias edits through different holders serialize on their client');

    await legacyAlias(first, 'CONCURRENT LEGACY ALIAS');
    before = await fullState(main);
    result = await saveWithAlias(second, { name: 'STALE ALIAS MUST NOT SAVE' });
    assert.equal(result.reason, 'client_alias_conflict');
    assert.deepEqual(await fullState(main), before);
    console.log('PASS legacy alias changes invalidate the editor expected value');

    // Coordinate a real first-alias race after validation and before INSERT.
    // NO KEY UPDATE permits the legacy writer's FK check; the conditional
    // upsert detects its committed value and rolls back profile/group changes.
    await main.query('delete from private.client_aliases where client_id=$1', [legalClient]);
    before = await fullState(main);
    preview = await context(main);
    await main.query(`create function pg_temp.pause_holder_alias_profile() returns trigger
      language plpgsql as $$ begin perform pg_advisory_xact_lock(82104937); return new; end $$;
      create trigger synthetic_pause_holder_alias_profile
      before insert or update on private.holder_contact_details
      for each row execute function pg_temp.pause_holder_alias_profile()`);
    await first.query('begin');
    await first.query('select pg_advisory_xact_lock(82104937)');
    const pendingAlias = saveWithAlias(second, {
      name: 'FIRST ALIAS RACE MUST ROLL BACK', email: 'alias-race@example.org',
      expectedAlias: null, action: 'clear', snapshot: preview.snapshot,
    });
    pendingAlias.catch(() => {});
    await waitForLock();
    await legacyAlias(first, 'CONCURRENT FIRST ALIAS');
    await first.query('commit');
    result = await pendingAlias;
    assert.equal(result.reason, 'client_alias_conflict');
    const afterAliasRace = await fullState(main);
    assert.deepEqual({ ...afterAliasRace, aliases: before.aliases }, before);
    assert.equal(afterAliasRace.aliases.find((row) => row.client_id === legalClient).alias, 'CONCURRENT FIRST ALIAS');
    await main.query('drop trigger synthetic_pause_holder_alias_profile on private.holder_contact_details');
    console.log('PASS concurrent first legacy alias causes atomic profile/group rollback without FK deadlock');

    await main.query("select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by id) from public.invoices t)=(select invoices from protected_state),'alias concurrency preserves historical invoices')");
    await main.query("select pg_temp.assert_true((select jsonb_agg(to_jsonb(t) order by invoice_id,period) from public.invoice_energy_periods t)=(select periods from protected_state),'alias concurrency preserves energy periods')");
    console.log('PASS holder alias SQL and multi-session concurrency regression');
  } finally {
    await Promise.allSettled(connected.filter((client) => client !== main).map((client) => client.query('rollback')));
    await Promise.allSettled(connected.map((client) => client.end()));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
