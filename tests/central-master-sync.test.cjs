'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase-xtra-pilot.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(__dirname, '..', 'auth-bootstrap.js'), 'utf8');

function cupsKey(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

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
      { id: 'client-albert', name: 'ALBERT VIDAL EGEA', tax_id: '44326236S', status: 'active' },
    ],
    holders: [
      { id: 'holder-xtra-1', client_id: 'client-xtra', legal_name: 'CLICK & RENT SL', tax_id: 'B00000001', status: 'active' },
      { id: 'holder-xtra-2', client_id: 'client-xtra', legal_name: 'CLICK BOXES', tax_id: 'B00000002', status: 'active' },
      { id: 'holder-guillem', client_id: 'client-guillem', legal_name: 'GUILLEM MATEU MOREY', tax_id: '43156090V', status: 'active' },
      { id: 'holder-maria', client_id: 'client-maria', legal_name: 'MARIA ANTONIA MOREY ESTEVA', tax_id: '00000000T', status: 'active' },
      { id: 'holder-albert', client_id: 'client-albert', legal_name: 'ALBERT VIDAL EGEA', tax_id: '44326236S', status: 'active' },
    ],
    supplies: [
      { id: 's-xtra-1', holder_id: 'holder-xtra-1', cups: 'ES000000000000000001', supply_name: 'XTRA 1', address: 'A', city: 'Palma', province: 'Illes Balears', postal_code: '07000', current_tariff: '3.0TD', current_contract_number: 'X1', current_retailer: 'FENIE', current_distributor: 'D1', status: 'active' },
      { id: 's-xtra-2', holder_id: 'holder-xtra-2', cups: 'ES000000000000000002', supply_name: 'XTRA 2', address: 'B', city: 'Palma', province: 'Illes Balears', postal_code: '07000', current_tariff: '3.0TD', current_contract_number: 'X2', current_retailer: 'FENIE', current_distributor: 'D1', status: 'active' },
      { id: 's-guillem', holder_id: 'holder-guillem', cups: 'ES0031500560405004PY0F', supply_name: 'Guillem', address: 'C', city: 'Palma', province: 'Illes Balears', postal_code: '07000', current_tariff: '2.0TD', current_contract_number: 'G1', current_retailer: 'ENDESA', current_distributor: 'D2', status: 'active' },
      { id: 's-maria', holder_id: 'holder-maria', cups: 'ES0031500560405002PG', supply_name: 'Maria', address: 'D', city: 'Esporles', province: 'Illes Balears', postal_code: '07190', current_tariff: '2.0TD', current_contract_number: 'M1', current_retailer: 'ENDESA', current_distributor: 'D2', status: 'active' },
      { id: 's-albert-nq', holder_id: 'holder-albert', cups: 'ES0031500164319001NQ', supply_name: 'SA PANSA 24', address: 'SA PANSA 24, 07190 ESPORLES (BALEARS)', city: 'ESPORLES', province: 'BALEARS', postal_code: '07190', current_tariff: '2.0TD', current_contract_number: 'CO-2023-056992_7.0', current_retailer: 'FENIE ENERGIA', current_distributor: 'E-DISTRIBUCION REDES DIGITALES, S.L.U.', status: 'active' },
    ],
  };

  const localRows = [
    {
      client: 'ALBERT VIDAL EGEA', company: 'ALBERT VIDAL EGEA', cups: 'ES0031500692096001ZH',
      name: 'SA PANSA 15', address: 'SA PANSA 15, 07190 ESPORLES (BALEARS)', city: 'ESPORLES', province: 'BALEARS', postalCode: '07190',
      tariff: '2.0TD', contract: 'CO-2024-052466_6.0', retailer: 'FENIE ENERGIA', distributor: 'E-DISTRIBUCION REDES DIGITALES, S.L.U.',
      status: 'ACTIVO', source: 'Aprendido de factura',
    },
    {
      client: 'ALBERT VIDAL EGEA', company: 'ALBERT VIDAL EGEA', cups: 'ES0031500105358003WR',
      name: 'GEORGE ORWELL', address: 'GEORGE ORWELL, 07004 PALMA (BALEARS)', city: 'PALMA', province: 'BALEARS', postalCode: '07004',
      tariff: '2.0TD', contract: 'CO-2024-045035_5.0', retailer: 'FENIE ENERGIA', distributor: 'E-DISTRIBUCION REDES DIGITALES, S.L.U.',
      status: 'ACTIVO', source: 'Aprendido de factura',
    },
  ];

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
      async rpc(name, args) {
        calls.push({ op: 'rpc', name, args });
        if (name !== 'ensure_supply_from_master') return { data: null, error: new Error('unexpected_rpc') };
        const existing = datasets.supplies.find((item) => cupsKey(item.cups) === cupsKey(args.p_cups));
        if (existing) return { data: { ok: true, mode: 'existing', id: existing.id, cups: existing.cups }, error: null };
        const client = datasets.clients.find((item) => item.name === args.p_client_name);
        const holder = datasets.holders.find((item) => item.client_id === client?.id && item.legal_name === args.p_holder_name);
        if (!client || !holder) return { data: { ok: false, reason: 'identity_not_found' }, error: null };
        const supply = {
          id: `recovered-${datasets.supplies.length}`,
          holder_id: holder.id,
          cups: args.p_cups,
          supply_name: args.p_supply_name,
          address: args.p_address,
          city: args.p_city,
          province: args.p_province,
          postal_code: args.p_postal_code,
          current_tariff: args.p_tariff,
          current_contract_number: args.p_contract_number,
          current_retailer: args.p_retailer,
          current_distributor: args.p_distributor,
          status: 'active',
        };
        datasets.supplies.push(supply);
        return { data: { ok: true, mode: 'inserted', id: supply.id, cups: supply.cups }, error: null };
      },
    },
    ibtCurrentProfile: { id: `user-${role}`, role },
    EnergyMaster: {
      __v2: true,
      all() { return localRows.map((row) => ({ ...row })); },
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
  return { window, calls, added, status, datasets };
}

test('admin syncs every active client and preserves multiple CUPS under the same Albert holder', async () => {
  const { window, calls, added, status, datasets } = buildHarness('admin');
  await window.CentralSupabaseMaster.reload();

  assert.equal(window.CentralSupabaseMaster.scope, 'all-active-clients');
  assert.equal(added.length, 7);
  assert.deepEqual(new Set(added.map(({ item }) => item.client)), new Set([
    'GRUPO XTRA',
    'GUILLEM MATEU MOREY',
    'MARIA ANTONIA MOREY ESTEVA',
    'ALBERT VIDAL EGEA',
  ]));

  const guillem = added.find(({ item }) => item.client === 'GUILLEM MATEU MOREY');
  assert.ok(guillem, 'GUILLEM must be present in the admin master');
  assert.equal(guillem.item.cups, 'ES0031500560405004PY0F');
  assert.equal(guillem.item.type, 'PARTICULAR');

  const albert = added.filter(({ item }) => item.client === 'ALBERT VIDAL EGEA');
  assert.equal(albert.length, 3, 'Albert must keep all three distinct supplies under one holder');
  assert.deepEqual(new Set(albert.map(({ item }) => item.cups)), new Set([
    'ES0031500164319001NQ',
    'ES0031500692096001ZH',
    'ES0031500105358003WR',
  ]));
  assert.equal(datasets.holders.filter((holder) => holder.client_id === 'client-albert').length, 1, 'reconciliation must not duplicate the Albert holder');

  const recoveryCalls = calls.filter((call) => call.op === 'rpc' && call.name === 'ensure_supply_from_master');
  assert.equal(recoveryCalls.length, 2, 'the two legacy Albert CUPS must be promoted to the central master');
  assert.ok(recoveryCalls.every((call) => call.args.p_client_name === 'ALBERT VIDAL EGEA' && call.args.p_holder_name === 'ALBERT VIDAL EGEA'));

  const xtra = added.find(({ item }) => item.client === 'GRUPO XTRA');
  assert.equal(xtra.item.type, 'GRUPO');

  assert.ok(calls.some((call) => call.table === 'clients' && call.op === 'eq' && call.column === 'status' && call.value === 'active'));
  assert.ok(calls.some((call) => call.table === 'holders' && call.op === 'in' && call.column === 'client_id'));
  assert.ok(calls.some((call) => call.table === 'supplies' && call.op === 'in' && call.column === 'holder_id'));
  assert.ok(!calls.some((call) => call.table === 'clients' && call.op === 'eq' && call.column === 'name'), 'sync must not be restricted to GRUPO XTRA');

  assert.match(status.innerHTML, /Base central · Supabase/);
  assert.match(status.innerHTML, /4 clientes/);
  assert.match(status.innerHTML, /7 CUPS activos leídos/);
  assert.match(status.innerHTML, /2 CUPS heredados recuperados en central/);
});

test('client accounts do not read or reconcile the internal central master', async () => {
  const { window, calls, added } = buildHarness('client');
  await window.CentralSupabaseMaster.reload();
  assert.equal(calls.length, 0);
  assert.equal(added.length, 0);
});

test('bootstrap forces browsers to fetch the multi-supply reconciliation version', () => {
  assert.match(bootstrap, /supabase-xtra-pilot\.js\?v=20260916-central2/);
  assert.doesNotMatch(bootstrap, /supabase-xtra-pilot\.js\?v=20260916-central1/);
  assert.match(source, /ensure_supply_from_master/);
  assert.match(source, /window\.CentralSupabaseMaster/);
  assert.match(source, /window\.XtraSupabasePilot/);
});
