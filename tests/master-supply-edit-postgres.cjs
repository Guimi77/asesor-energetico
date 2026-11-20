'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const connectionString = process.env.MASTER_SUPPLY_EDIT_TEST_DATABASE_URL;
if (!connectionString) throw new Error('MASTER_SUPPLY_EDIT_TEST_DATABASE_URL must name an isolated local test database.');
const target = new URL(connectionString);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/master_supply_edit_test') {
  throw new Error('Refusing to run synthetic schema tests outside localhost/master_supply_edit_test.');
}

const root = path.resolve(__dirname, '..');
const admin = '10000000-0000-4000-8000-000000000001';
const migration = 'supabase/migrations/20261119114837_explicit_empty_supply_and_holder_fields.sql';

(async () => {
  const db = new Client({ connectionString });
  await db.connect();
  try {
    const tables = await db.query("select count(*)::integer as count from information_schema.tables where table_schema in ('public','auth','private')");
    assert.equal(tables.rows[0].count, 0, 'test database must start empty');
    for (const filename of [
      'tests/holder-portfolio-fixture.sql',
      'tests/master-supply-edit-fixture.sql',
      'supabase/migrations/20260918123000_add_client_supply_aliases.sql',
      'supabase/migrations/20260929093000_safe_holder_reassignment.sql',
      'supabase/migrations/20260925094000_central_master_writes.sql',
      'supabase/migrations/20261001071500_persist_client_type.sql',
      'supabase/migrations/20261117113606_add_private_client_contact_details.sql',
      'supabase/migrations/20261117121000_holder_billing_profiles_inheritance.sql',
      'supabase/migrations/20261117110000_manual_supply_retailer.sql',
      'supabase/migrations/20261118113000_supply_portfolios.sql',
      'supabase/migrations/20261119104956_holder_commercial_portfolio_assignment.sql',
    ]) {
      await db.query(fs.readFileSync(path.join(root, filename), 'utf8'));
    }
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [admin]);

    // Prove that the old deployed writer fails the exact reported operation.
    // The probe rolls back every data/audit change before applying the fix.
    await assert.rejects(async () => {
      await db.query('begin');
      try {
        const row = (await db.query(`select s.id, s.cups, s.supply_name,
          c.name as client_name, c.tax_id as client_tax_id,
          h.legal_name as holder_name, h.tax_id as holder_tax_id
          from public.supplies s join public.holders h on h.id=s.holder_id
          join public.clients c on c.id=h.client_id order by s.id limit 1`)).rows[0];
        assert.ok(row.supply_name, 'baseline fixture must have a supply name');
        const payload = { mode: 'manual', original_cups: row.cups, cups: row.cups,
          client_name: row.client_name, client_tax_id: row.client_tax_id,
          holder_name: row.holder_name, holder_tax_id: row.holder_tax_id, supply_name: null };
        const result = (await db.query('select public.save_master_supply_v2($1::jsonb) as data', [JSON.stringify(payload)])).rows[0].data;
        assert.equal(result.ok, true, 'baseline operation must be accepted');
        const actual = (await db.query('select supply_name from public.supplies where id=$1', [row.id])).rows[0].supply_name;
        assert.equal(actual, null, 'explicit null supply name must clear');
      } finally {
        await db.query('rollback');
      }
    }, error => error.code === 'ERR_ASSERTION' && error.message.includes('explicit null supply name must clear'));
    console.log('PASS old writer reproduces the rejected clearing assertion');

    await db.query(fs.readFileSync(path.join(root, migration), 'utf8'));
    await db.query(fs.readFileSync(path.join(root, 'tests/master-supply-edit-regression.sql'), 'utf8'));
    console.log('PASS explicit clearing, partial updates, fill-only preservation, private contacts, authorization and history regression');

    // Reproduce the single-editor bug: the old alias writer removes an empty
    // alias row, so the legacy supply name becomes visible again after reload.
    await assert.rejects(async () => {
      await db.query('begin');
      try {
        const row = (await db.query('select id, cups from public.supplies order by id limit 1')).rows[0];
        const result = (await db.query('select public.set_internal_aliases($1,null,null,null,$2) as data', [row.cups, ''])).rows[0].data;
        assert.equal(result.ok, true, 'old alias writer accepts the operation');
        const explicit = await db.query("select 1 from private.supply_aliases where supply_id=$1 and alias=''", [row.id]);
        assert.equal(explicit.rowCount, 1, 'explicit empty alias must survive as a private override');
      } finally {
        await db.query('rollback');
      }
    }, error => error.code === 'ERR_ASSERTION' && error.message.includes('explicit empty alias must survive'));
    console.log('PASS old alias writer reproduces the lost explicit-empty override');

    const aliasMigrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
      .filter(filename => /^\d+_explicit_empty_supply_alias\.sql$/.test(filename)).sort();
    assert.ok(aliasMigrations.length, 'the reviewed versioned supply-alias migration must be present');
    for (const filename of aliasMigrations) {
      await db.query(fs.readFileSync(path.join(root, 'supabase', 'migrations', filename), 'utf8'));
    }
    await db.query(fs.readFileSync(path.join(root, 'tests/supply-alias-clear-regression.sql'), 'utf8'));
    console.log('PASS private alias absent/text/empty/reset states, reload/import persistence, authorization and preserved legacy names');
  } finally {
    await db.end();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
