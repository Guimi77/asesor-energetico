'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase-xtra-pilot.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(__dirname, '..', 'auth-bootstrap.js'), 'utf8');

function cupsKey(value) {
  const compact = String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return compact.startsWith('ES') && compact.length >= 20 ? compact.slice(0, 20) : compact;
}

function buildHarness(role = 'admin', options = {}) {
  const calls = [];
  const added = [];
  const listeners = new Map();
  const dispatched = [];
  const status = { innerHTML: '', dataset: {} };

  const datasets = {
    clients: [
      { id: 'client-xtra', name: 'CLIENTE PRUEBA CENTRAL', tax_id: null, status: 'active' },
      { id: 'client-guillem', name: 'CLIENTE PRUEBA UNO', tax_id: '00000001R', status: 'active' },
      { id: 'client-maria', name: 'CLIENTE PRUEBA DOS', tax_id: '00000003A', status: 'active' },
      { id: 'client-albert', name: 'CLIENTE PRUEBA TRES', tax_id: '00000002W', status: 'active' },
    ],
    holders: [
      { id: 'holder-xtra-1', client_id: 'client-xtra', legal_name: 'EMPRESA PRUEBA UNO SL', tax_id: 'B00000001', status: 'active' },
      { id: 'holder-xtra-2', client_id: 'client-xtra', legal_name: 'EMPRESA PRUEBA DOS', tax_id: 'B00000002', status: 'active' },
      { id: 'holder-guillem', client_id: 'client-guillem', legal_name: 'CLIENTE PRUEBA UNO', tax_id: '00000001R', status: 'active' },
      { id: 'holder-maria', client_id: 'client-maria', legal_name: 'CLIENTE PRUEBA DOS', tax_id: '00000003A', status: 'active' },
      { id: 'holder-albert', client_id: 'client-albert', legal_name: 'CLIENTE PRUEBA TRES', tax_id: '00000002W', status: 'active' },
    ],
    supplies: [
      { id: 's-xtra-1', holder_id: 'holder-xtra-1', cups: 'ES0000000000000001AA', supply_name: 'XTRA 1', address: 'A', city: 'Palma', province: 'Illes Balears', postal_code: '07000', current_tariff: '3.0TD', current_contract_number: 'X1', current_retailer: 'FENIE', current_distributor: 'D1', status: 'active' },
      { id: 's-xtra-2', holder_id: 'holder-xtra-2', cups: 'ES0000000000000002AA', supply_name: 'XTRA 2', address: 'B', city: 'Palma', province: 'Illes Balears', postal_code: '07000', current_tariff: '3.0TD', current_contract_number: 'X2', current_retailer: 'FENIE', current_distributor: 'D1', status: 'active' },
      { id: 's-guillem', holder_id: 'holder-guillem', cups: 'ES0000000000000003AA0F', supply_name: 'Guillem', address: 'C', city: 'Palma', province: 'Illes Balears', postal_code: '07000', current_tariff: '2.0TD', current_contract_number: 'G1', current_retailer: 'ENDESA', current_distributor: 'D2', status: 'active' },
      { id: 's-maria', holder_id: 'holder-maria', cups: 'ES0000000000000004AA', supply_name: 'Maria', address: 'D', city: 'Esporles', province: 'Illes Balears', postal_code: '07190', current_tariff: '2.0TD', current_contract_number: 'M1', current_retailer: 'ENDESA', current_distributor: 'D2', status: 'active' },
    ],
  };

  const localRows = [
    {
      client: 'CLIENTE PRUEBA TRES', clientTaxId: '00000002W', company: 'CLIENTE PRUEBA TRES', holderTaxId: '00000002W', cups: 'ES0000000000000006AA',
      name: 'SUMINISTRO PRUEBA 15', address: 'SUMINISTRO PRUEBA 15, 07190 ESPORLES (BALEARS)', city: 'ESPORLES', province: 'BALEARS', postalCode: '07190',
      tariff: '2.0TD', contract: 'CO-0000-000002_0.0', retailer: 'FENIE ENERGIA', distributor: 'E-DISTRIBUCION REDES DIGITALES, S.L.U.',
      status: 'ACTIVO', source: 'Aprendido de factura',
    },
    {
      client: 'CLIENTE PRUEBA TRES', clientTaxId: '00000002W', company: 'CLIENTE PRUEBA TRES', holderTaxId: '00000002W', cups: 'ES0000000000000007AA',
      name: 'SUMINISTRO PRUEBA B', address: 'SUMINISTRO PRUEBA B, 07004 PALMA (BALEARS)', city: 'PALMA', province: 'BALEARS', postalCode: '07004',
      tariff: '2.0TD', contract: 'CO-0000-000003_0.0', retailer: 'FENIE ENERGIA', distributor: 'E-DISTRIBUCION REDES DIGITALES, S.L.U.',
      status: 'ACTIVO', source: 'Aprendido de factura',
    },
    {
      client: 'CLIENTE PRUEBA CUATRO', company: 'CLIENTE P. CUATRO', holderTaxId: '00000001R', cups: 'ES0000000000000008AA0A',
      name: 'SUMINISTRO PRUEBA C', address: 'E', city: 'Palma', province: 'Illes Balears', postalCode: '07000',
      tariff: '2.0TD', contract: 'G2', retailer: 'ENDESA', distributor: 'D2', status: 'ACTIVO', source: 'Aprendido de factura',
    },
    {
      client: 'CLIENTE PRUEBA DOS', clientTaxId: '00000003A', company: 'CLIENTE PRUEBA DOS', holderTaxId: '00000003A', cups: 'ES0000000000000005AA0G',
      name: 'SUMINISTRO PRUEBA D', address: 'F', city: 'Esporles', province: 'Illes Balears', postalCode: '07190',
      tariff: '2.0TD', contract: 'M2', retailer: 'ENDESA', distributor: 'D2', status: 'ACTIVO', source: 'Aprendido de factura',
    },
    {
      client: 'CLIENTE PRUEBA CENTRAL', company: 'EMPRESA PRUEBA TRES SL', holderTaxId: 'B00000001', cups: 'ES0000000000000000AA0A',
      name: 'SUMINISTRO PRUEBA E', address: 'G', city: 'Palma', province: 'Illes Balears', postalCode: '07000',
      tariff: '3.0TD', contract: 'X3', retailer: 'FENIE', distributor: 'D1', status: 'ACTIVO', source: 'Aprendido de factura',
    },
    ...(options.extraLocalRows || []),
  ];

  const excludedLocalKeys = new Set((options.excludeLocalCups || []).map(cupsKey));
  const effectiveLocalRows = localRows.filter((row) => !excludedLocalKeys.has(cupsKey(row.cups)));

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
        if (name === 'get_internal_aliases') return { data: { clients: {}, supplies: {} }, error: null };

        if (name === 'ensure_supply_from_master') {
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
        }

        if (name === 'ensure_master_hierarchy_from_local') {
          const payload = args.p_payload || {};
          if ((options.rpcFailCups || []).some((cups) => cupsKey(cups) === cupsKey(payload.cups))) {
            return { data: null, error: new Error('forced_rpc_failure') };
          }

          const existing = datasets.supplies.find((item) => cupsKey(item.cups) === cupsKey(payload.cups));
          if (existing) return { data: { ok: true, mode: 'existing', id: existing.id, cups: existing.cups }, error: null };

          let client = datasets.clients.find((item) =>
            (payload.client_tax_id && item.tax_id === payload.client_tax_id) ||
            item.name === payload.client_name
          );

          if (!client) {
            if (!payload.client_tax_id) return { data: { ok: false, reason: 'new_client_requires_tax_id' }, error: null };
            client = {
              id: `client-recovered-${datasets.clients.length}`,
              name: payload.client_name,
              tax_id: payload.client_tax_id,
              status: 'active',
            };
            datasets.clients.push(client);
          }

          let holder = datasets.holders.find((item) =>
            item.client_id === client.id &&
            ((payload.holder_tax_id && item.tax_id === payload.holder_tax_id) || item.legal_name === payload.holder_name)
          );

          if (!holder) {
            holder = {
              id: `holder-recovered-${datasets.holders.length}`,
              client_id: client.id,
              legal_name: payload.holder_name,
              tax_id: payload.holder_tax_id || null,
              status: 'active',
            };
            datasets.holders.push(holder);
          }

          const supply = {
            id: `recovered-${datasets.supplies.length}`,
            holder_id: holder.id,
            cups: payload.cups,
            supply_name: payload.supply_name,
            address: payload.address,
            city: payload.city,
            province: payload.province,
            postal_code: payload.postal_code,
            current_tariff: payload.tariff,
            current_contract_number: payload.contract_number,
            current_retailer: payload.retailer,
            current_distributor: payload.distributor,
            status: 'active',
          };
          datasets.supplies.push(supply);
          return {
            data: {
              ok: true,
              mode: 'inserted',
              id: supply.id,
              cups: supply.cups,
              client_id: client.id,
              holder_id: holder.id,
            },
            error: null,
          };
        }

        return { data: null, error: new Error('unexpected_rpc') };
      },
    },
    ibtCurrentProfile: { id: `user-${role}`, role },
    EnergyMaster: {
      __v2: true,
      all() { return effectiveLocalRows.map((row) => ({ ...row })); },
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
  assert.equal(added.length, 9);
  assert.deepEqual(new Set(added.map(({ item }) => item.client)), new Set([
    'CLIENTE PRUEBA CENTRAL',
    'CLIENTE PRUEBA UNO',
    'CLIENTE PRUEBA DOS',
    'CLIENTE PRUEBA TRES',
  ]));

  const expectedCounts = new Map([
    ['CLIENTE PRUEBA CENTRAL', 3],
    ['CLIENTE PRUEBA UNO', 2],
    ['CLIENTE PRUEBA DOS', 2],
    ['CLIENTE PRUEBA TRES', 2],
  ]);
  for (const [client, expected] of expectedCounts) {
    assert.equal(added.filter(({ item }) => item.client === client).length, expected, `${client} must preserve every distinct supply`);
  }

  const recoveryCalls = calls.filter((call) => call.op === 'rpc' && call.name === 'ensure_supply_from_master');
  assert.equal(recoveryCalls.length, 5, 'every missing eligible CUPS across all clients must be promoted');
  assert.deepEqual(new Set(recoveryCalls.map((call) => call.args.p_client_name)), new Set([
    'CLIENTE PRUEBA CENTRAL',
    'CLIENTE PRUEBA UNO',
    'CLIENTE PRUEBA DOS',
    'CLIENTE PRUEBA TRES',
  ]));
  assert.equal(datasets.holders.length, 5, 'reconciliation must never duplicate holders');
  assert.equal(datasets.supplies.length, 9, 'central master must contain all original and recovered supplies');

  assert.ok(calls.some((call) => call.table === 'clients' && call.op === 'eq' && call.column === 'status' && call.value === 'active'));
  assert.ok(calls.some((call) => call.table === 'holders' && call.op === 'in' && call.column === 'client_id'));
  assert.ok(calls.some((call) => call.table === 'supplies' && call.op === 'in' && call.column === 'holder_id'));
  assert.ok(!calls.some((call) => call.table === 'clients' && call.op === 'eq' && call.column === 'name'), 'sync must never be restricted to one named client');

  assert.equal(status.dataset.remoteStatus, 'ok');
  assert.match(status.innerHTML, /4 clientes/);
  assert.match(status.innerHTML, /9 CUPS activos leídos/);
  assert.match(status.innerHTML, /5 CUPS heredados recuperados en central/);
  assert.doesNotMatch(status.innerHTML, /sigue[n]? fuera de la base central/);

  const centralEvent = dispatched.find((event) => event.type === 'central-supabase-synced');
  assert.ok(centralEvent);
  assert.equal(centralEvent.detail.legacyPending, 0);
  assert.equal(centralEvent.detail.legacyIdentityUnresolved, 0);
});

test('CUPS extensions share the same canonical supply identity', async () => {
  const { window, calls, datasets, dispatched } = buildHarness('admin', {
    extraLocalRows: [{
      client: 'CLIENTE PRUEBA DOS',
      clientTaxId: '00000003A',
      company: 'CLIENTE PRUEBA DOS',
      holderTaxId: '00000003A',
      cups: 'ES0000000000000004AA0Z',
      status: 'ACTIVO',
      source: 'Aprendido de factura',
    }],
  });

  await window.CentralSupabaseMaster.reload();

  const extensionCalls = calls.filter((call) =>
    call.op === 'rpc' &&
    (
      (call.args?.p_cups && cupsKey(call.args.p_cups) === cupsKey('ES0000000000000004AA')) ||
      (call.args?.p_payload?.cups && cupsKey(call.args.p_payload.cups) === cupsKey('ES0000000000000004AA'))
    )
  );
  assert.equal(extensionCalls.length, 0, 'a suffix variant of an existing CUPS must not be promoted as a new supply');
  assert.equal(datasets.supplies.filter((item) => cupsKey(item.cups) === cupsKey('ES0000000000000004AA')).length, 1);

  const centralEvent = dispatched.find((event) => event.type === 'central-supabase-synced');
  assert.ok(centralEvent);
  assert.equal(centralEvent.detail.legacyPending, 0);
});

test('a tax-identified legacy client and holder missing from Supabase are promoted without losing the CUPS', async () => {
  const recoveredCups = 'ES0000000000000009AA';
  const { window, calls, added, status, datasets, dispatched } = buildHarness('admin', {
    extraLocalRows: [{
      client: 'CLIENTE PRUEBA NUEVO',
      clientTaxId: '00000004G',
      company: 'CLIENTE PRUEBA NUEVO',
      holderTaxId: '00000004G',
      cups: recoveredCups,
      name: 'SUMINISTRO PRUEBA NUEVO',
      address: 'H',
      city: 'Palma',
      province: 'Illes Balears',
      postalCode: '07000',
      tariff: '2.0TD',
      contract: 'N1',
      retailer: 'ENDESA',
      distributor: 'D2',
      status: 'ACTIVO',
      source: 'Aprendido de factura',
    }],
  });

  await window.CentralSupabaseMaster.reload();

  const hierarchyCall = calls.find((call) =>
    call.op === 'rpc' &&
    call.name === 'ensure_master_hierarchy_from_local' &&
    cupsKey(call.args?.p_payload?.cups) === cupsKey(recoveredCups)
  );
  assert.ok(hierarchyCall, 'missing client/holder must use the safe hierarchy promotion RPC');

  assert.ok(datasets.clients.some((item) => item.name === 'CLIENTE PRUEBA NUEVO' && item.tax_id === '00000004G'));
  const recoveredClient = datasets.clients.find((item) => item.name === 'CLIENTE PRUEBA NUEVO');
  assert.ok(datasets.holders.some((item) => item.client_id === recoveredClient.id && item.legal_name === 'CLIENTE PRUEBA NUEVO'));
  assert.ok(datasets.supplies.some((item) => cupsKey(item.cups) === cupsKey(recoveredCups)));
  assert.ok(added.some(({ item }) => cupsKey(item.cups) === cupsKey(recoveredCups)), 'reloaded central hierarchy must repopulate the local cache');

  assert.equal(status.dataset.remoteStatus, 'ok');
  assert.doesNotMatch(status.innerHTML, /sigue[n]? fuera de la base central/);

  const centralEvent = dispatched.find((event) => event.type === 'central-supabase-synced');
  assert.ok(centralEvent);
  assert.equal(centralEvent.detail.legacyPending, 0);
  assert.equal(centralEvent.detail.legacyIdentityUnresolved, 0);
});

test('a legacy CUPS that cannot be reconciled is surfaced as an error instead of being silently omitted', async () => {
  const pendingCups = 'ES0000000000000009AA0Z';
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
  const failedCups = 'ES0000000000000006AA';
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
  assert.match(bootstrap, /supabase-xtra-pilot\.js\?v=20260925-central5/);
  assert.doesNotMatch(bootstrap, /supabase-xtra-pilot\.js\?v=20260925-central4/);
  assert.match(source, /ensure_supply_from_master/);
  assert.match(source, /ensure_master_hierarchy_from_local/);
  assert.match(source, /legacyPendingKeys/);
  assert.match(source, /scope: 'all-active-clients'/);
  assert.match(source, /window\.CentralSupabaseMaster/);
});
