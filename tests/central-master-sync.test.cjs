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

function buildHarness(role = 'admin', options = {}) {
  const calls = [];
  const added = [];
  const listeners = new Map();
  const dispatched = [];
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
      client: 'ALBERT VIDAL EGEA', clientTaxId: '44326236S', company: 'ALBERT VIDAL EGEA', holderTaxId: '44326236S', cups: 'ES0031500692096001ZH',
      name: 'SA PANSA 15', address: 'SA PANSA 15, 07190 ESPORLES (BALEARS)', city: 'ESPORLES', province: 'BALEARS', postalCode: '07190',
      tariff: '2.0TD', contract: 'CO-2024-052466_6.0', retailer: 'FENIE ENERGIA', distributor: 'E-DISTRIBUCION REDES DIGITALES, S.L.U.',
      status: 'ACTIVO', source: 'Aprendido de factura',
    },
    {
      client: 'ALBERT VIDAL EGEA', clientTaxId: '44326236S', company: 'ALBERT VIDAL EGEA', holderTaxId: '44326236S', cups: 'ES0031500105358003WR',
      name: 'GEORGE ORWELL', address: 'GEORGE ORWELL, 07004 PALMA (BALEARS)', city: 'PALMA', province: 'BALEARS', postalCode: '07004',
      tariff: '2.0TD', contract: 'CO-2024-045035_5.0', retailer: 'FENIE ENERGIA', distributor: 'E-DISTRIBUCION REDES DIGITALES, S.L.U.',
      status: 'ACTIVO', source: 'Aprendido de factura',
    },
    {
      client: 'GUILLEM MATEU', company: 'G. MATEU', holderTaxId: '43156090V', cups: 'ES0031500560405005QA0A',
      name: 'SEGUNDO GUILLEM', address: 'E', city: 'Palma', province: 'Illes Balears', postalCode: '07000',
      tariff: '2.0TD', contract: 'G2', retailer: 'ENDESA', distributor: 'D2', status: 'ACTIVO', source: 'Aprendido de factura',
    },
    {
      client: 'MARIA ANTONIA MOREY ESTEVA', clientTaxId: '00000000T', company: 'MARIA ANTONIA MOREY ESTEVA', holderTaxId: '00000000T', cups: 'ES0031500560405003PH0G',
      name: 'SEGUNDO MARIA', address: 'F', city: 'Esporles', province: 'Illes Balears', postalCode: '07190',
      tariff: '2.0TD', contract: 'M2', retailer: 'ENDESA', distributor: 'D2', status: 'ACTIVO', source: 'Aprendido de factura',
    },
    {
      client: 'GRUPO XTRA', company: 'CLICK RENT SL', holderTaxId: 'B00000001', cups: 'ES0031500000000003AA0A',
      name: 'XTRA HEREDADO', address: 'G', city: 'Palma', province: 'Illes Balears', postalCode: '07000',
      tariff: '3.0TD', contract: 'X3', retailer: 'FENIE', distributor: 'D1', status: 'ACTIVO', source: 'Aprendido de factura',
    },
    ...(options.extraLocalRows || []),
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
        if ((options.rpcFailCups || []).some((cups) => cupsKey(cups) === cupsKey(args.p_cups))) {
          return { data: null, error: new Error('forced_rpc_failure') };
        }
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
      add(item, optionsArg) {
        added.push({ item, options: optionsArg });
        return { ok: true, updated: false, enriched: true, supply: item };
      },
    },
    addEventListener(name, handler) { listeners.set(name, handler); },
    dispatchEvent(event) { dispatched.push(event); },
  };

  const context = {
    window,
    document: {
      readyState: 'loading',
      querySelector(selector) { return selector === '#masterStatus' ? status : null; },
    },
    CustomEvent: class CustomEvent { constructor(name, eventOptions = {}) { this.type = name; this.detail = eventOptions.detail; } },
    setTimeout(handler) { handler(); return 1; },
    console,
  };

  vm.runInNewContext(source, context, { filename: 'supabase-xtra-pilot.js' });
  return { window, calls, added, status, datasets, dispatched };
}

test('admin reconciles every eligible legacy CUPS across every active client without duplicating holders', async () => {
  const { window, calls, added, status, datasets, dispatched } = buildHarness('admin');
  await window.CentralSupabaseMaster.reload();

  assert.equal(window.CentralSupabaseMaster.scope, 'all-active-clients');
  assert.equal(window.CentralSupabaseMaster.mode, 'central-master-global-reconciliation-with-audit');
  assert.equal(added.length, 10);
  assert.deepEqual(new Set(added.map(({ item }) => item.client)), new Set([
    'GRUPO XTRA',
    'GUILLEM MATEU MOREY',
    'MARIA ANTONIA MOREY ESTEVA',
    'ALBERT VIDAL EGEA',
  ]));

  const expectedCounts = new Map([
    ['GRUPO XTRA', 3],
    ['GUILLEM MATEU MOREY', 2],
    ['MARIA ANTONIA MOREY ESTEVA', 2],
    ['ALBERT VIDAL EGEA', 3],
  ]);
  for (const [client, expected] of expectedCounts) {
    assert.equal(added.filter(({ item }) => item.client === client).length, expected, `${client} must preserve every distinct supply`);
  }

  const recoveryCalls = calls.filter((call) => call.op === 'rpc' && call.name === 'ensure_supply_from_master');
  assert.equal(recoveryCalls.length, 5, 'every missing eligible CUPS across all clients must be promoted');
  assert.deepEqual(new Set(recoveryCalls.map((call) => call.args.p_client_name)), new Set([
    'GRUPO XTRA',
    'GUILLEM MATEU MOREY',
    'MARIA ANTONIA MOREY ESTEVA',
    'ALBERT VIDAL EGEA',
  ]));
  assert.equal(datasets.holders.length, 5, 'reconciliation must never duplicate holders');
  assert.equal(datasets.supplies.length, 10, 'central master must contain all original and recovered supplies');

  assert.ok(calls.some((call) => call.table === 'clients' && call.op === 'eq' && call.column === 'status' && call.value === 'active'));
  assert.ok(calls.some((call) => call.table === 'holders' && call.op === 'in' && call.column === 'client_id'));
  assert.ok(calls.some((call) => call.table === 'supplies' && call.op === 'in' && call.column === 'holder_id'));
  assert.ok(!calls.some((call) => call.table === 'clients' && call.op === 'eq' && call.column === 'name'), 'sync must never be restricted to one named client');

  assert.equal(status.dataset.remoteStatus, 'ok');
  assert.match(status.innerHTML, /4 clientes/);
  assert.match(status.innerHTML, /10 CUPS activos leídos/);
  assert.match(status.innerHTML, /5 CUPS heredados recuperados en central/);
  assert.doesNotMatch(status.innerHTML, /sigue[n]? fuera de la base central/);

  const centralEvent = dispatched.find((event) => event.type === 'central-supabase-synced');
  assert.ok(centralEvent);
  assert.equal(centralEvent.detail.legacyPending, 0);
  assert.equal(centralEvent.detail.legacyIdentityUnresolved, 0);
});

test('a legacy CUPS that cannot be reconciled is surfaced as an error instead of being silently omitted', async () => {
  const pendingCups = 'ES0031500999999999ZZ0Z';
  const { window, status, dispatched } = buildHarness('admin', {
    extraLocalRows: [{
      client: 'CLIENTE DESCONOCIDO',
      company: 'TITULAR DESCONOCIDO',
      cups: pendingCups,
      status: 'ACTIVO',
      source: 'Aprendido de factura',
    }],
  });

  await window.CentralSupabaseMaster.reload();

  assert.equal(status.dataset.remoteStatus, 'error');
  assert.match(status.innerHTML, /ATENCIÓN: 1 CUPS heredado sigue fuera de la base central/);
  const centralEvent = dispatched.find((event) => event.type === 'central-supabase-synced');
  assert.ok(centralEvent);
  assert.equal(centralEvent.detail.legacyPending, 1);
  assert.equal(centralEvent.detail.legacyIdentityUnresolved, 1);
  assert.deepEqual(Array.from(centralEvent.detail.legacyPendingKeys), [cupsKey(pendingCups)]);
});

test('RPC failures cannot masquerade as a successful reconciliation', async () => {
  const failedCups = 'ES0031500692096001ZH';
  const { window, status, dispatched } = buildHarness('admin', { rpcFailCups: [failedCups] });
  await window.CentralSupabaseMaster.reload();

  assert.equal(status.dataset.remoteStatus, 'error');
  assert.match(status.innerHTML, /ATENCIÓN: 1 CUPS heredado sigue fuera de la base central/);
  const centralEvent = dispatched.find((event) => event.type === 'central-supabase-synced');
  assert.ok(centralEvent);
  assert.equal(centralEvent.detail.legacyMigrationFailed, 1);
  assert.equal(centralEvent.detail.legacyPending, 1);
  assert.ok(centralEvent.detail.legacyPendingKeys.includes(cupsKey(failedCups)));
});

test('client accounts do not read or reconcile the internal central master', async () => {
  const { window, calls, added } = buildHarness('client');
  await window.CentralSupabaseMaster.reload();
  assert.equal(calls.length, 0);
  assert.equal(added.length, 0);
});

test('bootstrap forces browsers to fetch the global reconciliation audit version', () => {
  assert.match(bootstrap, /supabase-xtra-pilot\.js\?v=20260916-central3/);
  assert.doesNotMatch(bootstrap, /supabase-xtra-pilot\.js\?v=20260916-central2/);
  assert.match(source, /ensure_supply_from_master/);
  assert.match(source, /legacyPendingKeys/);
  assert.match(source, /scope: 'all-active-clients'/);
  assert.match(source, /window\.CentralSupabaseMaster/);
});
