'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase-xtra-pilot.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(__dirname, '..', 'auth-bootstrap.js'), 'utf8');

function buildHarness(role = 'admin') {
  const calls = [];
  const added = [];
  const listeners = new Map();
  const status = { innerHTML: '', dataset: {} };

  const datasets = {
    clients: [
      { id: 'client-xtra', name: 'GRUPO XTRA', tax_id: null, status: 'active' },
      { id: 'client-guillem', name: 'GUILLEM MATEU MOREY', tax_id: '43156090V', status: 'active' },
      { id: 'client-maria', name: 'MARIA ANTONIA MOREY ESTEVA', tax_id: '00000000T', status: 'active' },
    ],
    holders: [
      { id: 'holder-xtra-1', client_id: 'client-xtra', legal_name: 'CLICK & RENT SL', tax_id: 'B00000001', status: 'active' },
      { id: 'holder-xtra-2', client_id: 'client-xtra', legal_name: 'CLICK BOXES', tax_id: 'B00000002', status: 'active' },
      { id: 'holder-guillem', client_id: 'client-guillem', legal_name: 'GUILLEM MATEU MOREY', tax_id: '43156090V', status: 'active' },
      { id: 'holder-maria', client_id: 'client-maria', legal_name: 'MARIA ANTONIA MOREY ESTEVA', tax_id: '00000000T', status: 'active' },
    ],
    supplies: [
      { id: 's-xtra-1', holder_id: 'holder-xtra-1', cups: 'ES000000000000000001', supply_name: 'XTRA 1', address: 'A', city: 'Palma', province: 'Illes Balears', postal_code: '07000', current_tariff: '3.0TD', current_contract_number: 'X1', current_retailer: 'FENIE', current_distributor: 'D1', status: 'active' },
      { id: 's-xtra-2', holder_id: 'holder-xtra-2', cups: 'ES000000000000000002', supply_name: 'XTRA 2', address: 'B', city: 'Palma', province: 'Illes Balears', postal_code: '07000', current_tariff: '3.0TD', current_contract_number: 'X2', current_retailer: 'FENIE', current_distributor: 'D1', status: 'active' },
      { id: 's-guillem', holder_id: 'holder-guillem', cups: 'ES0031500560405004PY0F', supply_name: 'Guillem', address: 'C', city: 'Palma', province: 'Illes Balears', postal_code: '07000', current_tariff: '2.0TD', current_contract_number: 'G1', current_retailer: 'ENDESA', current_distributor: 'D2', status: 'active' },
      { id: 's-maria', holder_id: 'holder-maria', cups: 'ES0031500560405002PG', supply_name: 'Maria', address: 'D', city: 'Esporles', province: 'Illes Balears', postal_code: '07190', current_tariff: '2.0TD', current_contract_number: 'M1', current_retailer: 'ENDESA', current_distributor: 'D2', status: 'active' },
    ],
  };

  function query(table) {
    const chain = {
      select(columns) { calls.push({ table, op: 'select', value: columns }); return chain; },
      eq(column, value) { calls.push({ table, op: 'eq', column, value }); return chain; },
      in(column, value) { calls.push({ table, op: 'in', column, value }); return chain; },
      order(column) { calls.push({ table, op: 'order', column }); return chain; },
      then(resolve, reject) { return Promise.resolve({ data: datasets[table] || [], error: null }).then(resolve, reject); },
    };
    return chain;
  }

  const window = {
    ibtSupabase: {
      from(table) { calls.push({ table, op: 'from' }); return query(table); },
    },
    ibtCurrentProfile: { id: `user-${role}`, role },
    EnergyMaster: {
      __v2: true,
      add(item, options) {
        added.push({ item, options });
        return { ok: true, updated: false, enriched: true, supply: item };
      },
    },
    addEventListener(name, handler) { listeners.set(name, handler); },
    dispatchEvent() {},
  };

  const context = {
    window,
    document: {
      readyState: 'loading',
      querySelector(selector) { return selector === '#masterStatus' ? status : null; },
    },
    CustomEvent: class CustomEvent { constructor(name, options = {}) { this.type = name; this.detail = options.detail; } },
    setTimeout(handler) { handler(); return 1; },
    console,
  };

  vm.runInNewContext(source, context, { filename: 'supabase-xtra-pilot.js' });
  return { window, calls, added, status };
}

test('admin syncs every active client, holder and CUPS from the central Supabase master', async () => {
  const { window, calls, added, status } = buildHarness('admin');
  await window.CentralSupabaseMaster.reload();

  assert.equal(window.CentralSupabaseMaster.scope, 'all-active-clients');
  assert.equal(added.length, 4);
  assert.deepEqual(new Set(added.map(({ item }) => item.client)), new Set([
    'GRUPO XTRA',
    'GUILLEM MATEU MOREY',
    'MARIA ANTONIA MOREY ESTEVA',
  ]));

  const guillem = added.find(({ item }) => item.client === 'GUILLEM MATEU MOREY');
  assert.ok(guillem, 'GUILLEM must be present in the admin master');
  assert.equal(guillem.item.cups, 'ES0031500560405004PY0F');
  assert.equal(guillem.item.type, 'PARTICULAR');

  const xtra = added.find(({ item }) => item.client === 'GRUPO XTRA');
  assert.equal(xtra.item.type, 'GRUPO');

  assert.ok(calls.some((call) => call.table === 'clients' && call.op === 'eq' && call.column === 'status' && call.value === 'active'));
  assert.ok(calls.some((call) => call.table === 'holders' && call.op === 'in' && call.column === 'client_id'));
  assert.ok(calls.some((call) => call.table === 'supplies' && call.op === 'in' && call.column === 'holder_id'));
  assert.ok(!calls.some((call) => call.table === 'clients' && call.op === 'eq' && call.column === 'name'), 'sync must not be restricted to GRUPO XTRA');

  assert.match(status.innerHTML, /Base central · Supabase/);
  assert.match(status.innerHTML, /3 clientes/);
  assert.match(status.innerHTML, /4 CUPS activos leídos/);
});

test('client accounts do not load the internal central master', async () => {
  const { window, calls, added } = buildHarness('client');
  await window.CentralSupabaseMaster.reload();
  assert.equal(calls.length, 0);
  assert.equal(added.length, 0);
});

test('bootstrap forces browsers to fetch the new central-master script version', () => {
  assert.match(bootstrap, /supabase-xtra-pilot\.js\?v=20260916-central1/);
  assert.doesNotMatch(bootstrap, /supabase-xtra-pilot\.js\?v=20260908-1/);
  assert.match(source, /window\.CentralSupabaseMaster/);
  assert.match(source, /window\.XtraSupabasePilot/);
});
