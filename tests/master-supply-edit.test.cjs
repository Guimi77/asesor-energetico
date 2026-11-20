'use strict';

// Exercise the real master model and form handlers with synthetic data only.
// SQL semantics are checked separately by master-supply-edit-postgres.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'master-v2.js'), 'utf8');
const storageKey = 'ibt-energy-master-v1';
const cups = 'ES0000000000000001AA';
const seed = () => ({
  cups, client: 'CLIENTE SINTETICO', company: 'TITULAR SINTETICO', holder: 'TITULAR SINTETICO',
  clientId: 'client-test', holderId: 'holder-test', supplyId: 'supply-test',
  clientTaxId: 'TESTCLIENT', holderTaxId: 'TESTHOLDER', type: 'EMPRESA',
  name: 'LOCAL DE PRUEBA', address: 'DIRECCION SINTETICA', city: 'LOCALIDAD SINTETICA',
  province: 'PROVINCIA SINTETICA', postalCode: '00000', tariff: '3.0TD', contract: 'TEST-CONTRACT',
  retailer: 'COMERCIALIZADORA SINTETICA', distributor: 'DISTRIBUIDORA SINTETICA',
  p1: 15, p2: 15, p3: 15, p4: 15, p5: 15, p6: 15, maxContractablePower: 20,
  portfolioId: '', portfolioName: '', portfolioAlias: '', status: 'ACTIVO',
  accessContract: 'EXTRA-TEST-CONTRACT', customNote: 'Conservar dato portable no incluido en la respuesta',
});

function harness({ rows = [seed()], storage = null, rejectSave = false, rejectAlias = false,
  legacyAliasResponse = false, role = 'admin' } = {}) {
  const saved = storage || new Map([[storageKey, JSON.stringify(rows)]]);
  const controls = new Map();
  const calls = [];
  const events = [];
  const central = new Map(rows.map(row => [row.cups, { ...row }]));
  const aliases = new Map(rows.filter(row => row.aliasSet === true || row.alias || row.supplyAlias)
    .map(row => [row.cups, row.alias ?? row.supplyAlias ?? '']));
  let reloadCount = 0;
  function centralRows() {
    return [...central.values()].map(({ alias, aliasSet, supplyAlias, ...row }) => ({
      ...row,
      alias: ['admin', 'staff'].includes(role) ? (aliases.get(row.cups) ?? '') : '',
      aliasSet: ['admin', 'staff'].includes(role) && aliases.has(row.cups),
    }));
  }
  function element(selector = '') {
    const classes = new Set();
    const node = {
      value: '', textContent: '', innerHTML: '', dataset: {}, hidden: false, disabled: false,
      classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name), toggle(name, on) { if (on ?? !classes.has(name)) classes.add(name); else classes.delete(name); } },
      addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {},
      replaceChildren() {}, add() {},
      reset() { for (const input of controls.values()) input.value = ''; },
      querySelectorAll(query) {
        if (query !== '.edit-supply-tree') return [];
        if (!node.editButtons) node.editButtons = [...node.innerHTML.matchAll(/class="secondary edit-supply-tree" data-cups="([^"]+)"/g)]
          .map(match => ({ dataset: { cups: match[1] }, onclick: null }));
        return node.editButtons;
      },
    };
    if (selector === '#companyGrid') {
      let html = '';
      Object.defineProperty(node, 'innerHTML', { get: () => html, set(value) { html = value; node.editButtons = null; } });
    }
    return node;
  }
  const document = {
    body: element(), activeElement: null,
    querySelector(selector) {
      if (selector === '#supplyName') return null; // Removed from the editor; stale accesses must fail.
      if (!controls.has(selector)) controls.set(selector, element(selector));
      return controls.get(selector);
    },
    querySelectorAll() { return []; }, addEventListener() {},
  };
  const window = {
    ibtCurrentProfile: { role },
    ibtSupabase: { async rpc(name, args) {
      calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
      if (name === 'save_master_supply_v2' && rejectSave) return { data: { ok: false, reason: 'owner_conflict' }, error: null };
      if (name === 'save_master_supply_v2') {
        const p = args.p_payload;
        const row = { ...(central.get(p.original_cups || p.cups) || {}), cups: p.cups,
          clientId: 'client-test', holderId: 'holder-test', supplyId: 'supply-test' };
        const fields = { client_name: 'client', client_tax_id: 'clientTaxId', holder_name: 'holder',
          client_type: 'type', supply_name: 'name', address: 'address', city: 'city', province: 'province',
          tariff: 'tariff', contract_number: 'contract', retailer: 'retailer' };
        for (const [input, field] of Object.entries(fields)) {
          if (Object.hasOwn(p, input)) row[field] = p[input] ?? '';
        }
        central.set(p.cups, row);
      }
      if (name === 'set_internal_aliases') {
        if (rejectAlias) return { data: { ok: false, reason: 'alias_write_rejected' }, error: null };
        if (args.p_supply_alias == null || (legacyAliasResponse && args.p_supply_alias === '')) aliases.delete(args.p_cups);
        else aliases.set(args.p_cups, args.p_supply_alias);
        return { data: legacyAliasResponse
          ? { ok: true, supply_id: 'supply-test' }
          : { ok: true, supply_id: 'supply-test', supply_alias_set: aliases.has(args.p_cups) }, error: null };
      }
      return { data: { ok: true, id: 'supply-test' }, error: null };
    } },
    CentralSupabaseMaster: { async reload() {
      reloadCount += 1;
      return window.EnergyMaster.replaceActiveFromCentral(centralRows());
    } },
    addEventListener() {}, dispatchEvent(event) { events.push(event); },
  };
  vm.runInNewContext(source, {
    window, document, console,
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
  }, { filename: 'master-v2.js' });
  return {
    window, saved, calls, events, centralRows,
    reload: () => window.CentralSupabaseMaster.reload(),
    reloadCount: () => reloadCount,
    control: selector => document.querySelector(selector),
    title() {
      const titles = [...document.querySelector('#companyGrid').innerHTML.matchAll(/class="holder-supply-row[^\"]*" data-cups="([^\"]+)"[^>]*><div><b>([^<]*)<\/b>/g)];
      const row = titles.find(match => match[1] === cups);
      assert.ok(row, 'the real client renderer must output the supply title');
      return row[2];
    },
    open() {
      const button = document.querySelector('#companyGrid').querySelectorAll('.edit-supply-tree').find(item => item.dataset.cups === cups);
      assert.ok(button?.onclick, 'the real render must wire the editor');
      button.onclick();
    },
    submit: () => document.querySelector('#clientForm').onsubmit({ preventDefault() {} }),
  };
}

const metadata = ['name', 'address', 'city', 'province', 'postalCode', 'tariff', 'contract', 'retailer', 'distributor'];

test('central clearing replaces stale metadata, powers and grouping and survives cache reload', () => {
  const initial = { ...seed(), portfolioId: 'group-test', portfolioName: 'GRUPO SINTETICO', portfolioAlias: 'ALIAS SINTETICO' };
  const app = harness({ rows: [initial] });
  const blank = Object.fromEntries([...metadata, 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'maxContractablePower', 'portfolioId', 'portfolioName', 'portfolioAlias'].map(field => [field, '']));
  assert.equal(app.window.EnergyMaster.replaceActiveFromCentral([{ ...seed(), ...blank }]).ok, true);
  for (const field of Object.keys(blank)) assert.equal(app.window.EnergyMaster.find(cups)[field], '', field + ' must clear');
  const reloaded = harness({ storage: app.saved });
  for (const field of Object.keys(blank)) assert.equal(reloaded.window.EnergyMaster.find(cups)[field], '', field + ' must stay cleared after reload');
  assert.equal(reloaded.window.EnergyMaster.find(cups).accessContract, initial.accessContract);
});

test('authoritative partial rows clear present nulls and preserve omitted fields and real zero power', () => {
  const initial = seed();
  const app = harness();
  app.window.EnergyMaster.replaceActiveFromCentral([{ cups, name: null, p1: 0, maxContractablePower: null }]);
  const result = app.window.EnergyMaster.find(cups);
  assert.ok(result.name == null || result.name === '', 'explicit null name must not recover its old value');
  assert.equal(result.p1, 0);
  assert.equal(result.maxContractablePower, '');
  for (const field of ['client', 'holder', 'company', 'clientId', 'holderId', 'supplyId', 'address', 'city', 'p2', 'customNote']) {
    assert.equal(result[field], initial[field], field + ' was omitted, not cleared');
  }
});

test('cleared aliases and contacts cannot return from legacy localStorage keys', () => {
  const app = harness({ rows: [{ ...seed(),
    supplyAlias: 'ALIAS LEGACY SINTETICO', clientEmail: 'legacy@example.org',
    clientPhone: '1234', clientBankAccount: 'SYNTHETIC-BANK',
  }] });
  const canonical = ['alias', 'supplyEmailOverride', 'supplyPhoneOverride', 'supplyBankAccountOverride'];
  app.window.EnergyMaster.replaceActiveFromCentral([{ ...seed(), ...Object.fromEntries(canonical.map(field => [field, ''])) }]);
  for (const field of canonical) assert.equal(app.window.EnergyMaster.find(cups)[field], '', field);
  const stored = JSON.parse(app.saved.get(storageKey))[0];
  for (const field of [...canonical, 'aliasSet', 'supplyAlias', 'clientEmail', 'clientPhone', 'clientBankAccount',
    'holderEmail', 'holderPhone', 'holderBankAccount', 'effectiveEmail', 'effectivePhone', 'effectiveBankAccount']) {
    assert.ok(!Object.hasOwn(stored, field), field + ' must not persist in browser storage');
  }
  const reloaded = harness({ storage: app.saved });
  for (const field of canonical) assert.equal(reloaded.window.EnergyMaster.find(cups)[field], '', field + ' must not recover from a legacy key');
});

test('fallback central add is authoritative without turning incomplete imports into erasures', () => {
  const app = harness();
  app.window.EnergyMaster.add({ cups, name: '', address: null, p1: '', p2: 0 }, { allowMove: true, authoritative: true });
  let row = app.window.EnergyMaster.find(cups);
  assert.equal(row.name, '');
  assert.ok(row.address == null || row.address === '');
  assert.equal(row.p1, '');
  assert.equal(row.p2, 0);
  assert.equal(row.city, seed().city);
  app.window.EnergyMaster.add({ cups, name: 'NOMBRE CONSERVADO', city: 'LOCALIDAD CONSERVADA' }, { allowMove: true });
  app.window.EnergyMaster.add({ cups, name: '', city: null, p2: '' }, { allowMove: true, fillOnly: true });
  app.window.EnergyMaster.learnInvoice({ cups, holder: 'OTRO TITULAR LEIDO', company: 'OTRO TITULAR LEIDO' });
  row = app.window.EnergyMaster.find(cups);
  assert.equal(row.name, 'NOMBRE CONSERVADO');
  assert.equal(row.city, 'LOCALIDAD CONSERVADA');
  assert.equal(row.p2, 0);
  assert.equal(row.holder, seed().holder, 'invoice enrichment must preserve legal identity');
});

test('manual editor sends explicit nulls for cleared optional fields and preserves untouched data', async () => {
  const app = harness();
  app.open();
  for (const id of ['supplyAddress', 'supplyCity', 'supplyProvince', 'supplyTariff', 'supplyContract']) app.control('#' + id).value = '';
  await app.submit();
  const write = app.calls.find(call => call.name === 'save_master_supply_v2');
  assert.ok(write);
  for (const field of ['address', 'city', 'province', 'tariff', 'contract_number']) assert.equal(write.args.p_payload[field], null, field);
  for (const field of ['address', 'city', 'province', 'tariff', 'contract']) assert.equal(app.window.EnergyMaster.find(cups)[field], '', field);
  assert.ok(!Object.hasOwn(write.args.p_payload, 'supply_name'), 'manual form no longer edits the imported name');
  assert.equal(app.window.EnergyMaster.find(cups).name, seed().name);
  assert.ok(!Object.hasOwn(write.args.p_payload, 'postal_code'), 'manual form does not edit postal code');
  assert.ok(!Object.hasOwn(write.args.p_payload, 'distributor'), 'manual form does not edit distributor');
  assert.equal(app.window.EnergyMaster.find(cups).postalCode, seed().postalCode);
  assert.equal(app.window.EnergyMaster.find(cups).distributor, seed().distributor);
  assert.equal(app.window.EnergyMaster.find(cups).customNote, seed().customNote);
  const powerWrite = app.calls.find(call => call.name === 'set_internal_supply_power_profile');
  for (const period of ['P3', 'P4', 'P5', 'P6']) {
    assert.equal(powerWrite.args.p_contracted_power_kw[period], 15, 'clearing the tariff must preserve ' + period);
    assert.equal(app.window.EnergyMaster.find(cups)[period.toLowerCase()], 15);
  }
  assert.ok(app.events.some(event => event.type === 'ibt-central-data-changed'));
});

test('an automatic retailer can be cleared but a manually fixed retailer requires an explicit value', async () => {
  const automatic = harness();
  automatic.open();
  automatic.control('#supplyRetailer').value = '';
  await automatic.submit();
  assert.equal(automatic.calls.find(call => call.name === 'save_master_supply_v2').args.p_payload.retailer, null);
  assert.equal(automatic.window.EnergyMaster.find(cups).retailer, '');
  const fixed = harness({ rows: [{ ...seed(), manualRetailer: seed().retailer }] });
  fixed.open();
  fixed.control('#supplyRetailer').value = '';
  await fixed.submit();
  assert.equal(fixed.calls.length, 0);
  assert.equal(fixed.window.EnergyMaster.find(cups).retailer, seed().retailer);
  assert.match(fixed.control('#clientFormMsg').textContent, /manual.*vac[ií]a/i);
});

test('manual edits omit unavailable noneditable name, postal code and distributor instead of clearing them', async () => {
  const partial = seed();
  delete partial.name;
  delete partial.postalCode;
  delete partial.distributor;
  const app = harness({ rows: [partial] });
  app.open();
  app.control('#supplyAlias').value = 'ALIAS EDITADO';
  await app.submit();
  const payload = app.calls.find(call => call.name === 'save_master_supply_v2').args.p_payload;
  assert.ok(!Object.hasOwn(payload, 'postal_code'), 'unavailable noneditable postal code is omitted');
  assert.ok(!Object.hasOwn(payload, 'distributor'), 'unavailable noneditable distributor is omitted');
  assert.ok(!Object.hasOwn(payload, 'supply_name'), 'unavailable imported name must not clear the central value');
  assert.equal(app.calls.find(call => call.name === 'set_internal_aliases').args.p_supply_alias, 'ALIAS EDITADO');
});

test('editing and clearing the private alias preserves the imported name', async () => {
  for (const alias of ['ALIAS NUEVO', '']) {
    const app = harness({ rows: [{ ...seed(), alias: 'ALIAS ANTERIOR' }] });
    app.open();
    assert.equal(app.control('#supplyName'), null);
    assert.equal(app.control('#supplyAlias').value, 'ALIAS ANTERIOR');
    app.control('#supplyAlias').value = alias;
    await app.submit();
    const payload = app.calls.find(call => call.name === 'save_master_supply_v2').args.p_payload;
    assert.ok(!Object.hasOwn(payload, 'supply_name'), 'alias edits must not overwrite the imported name');
    assert.equal(app.calls.find(call => call.name === 'set_internal_aliases').args.p_supply_alias, alias,
      'an empty string is an explicit empty alias, not a request to restore the legacy fallback');
    assert.equal(app.window.EnergyMaster.find(cups).name, seed().name);
    assert.equal(app.window.EnergyMaster.find(cups).alias, alias);
    assert.equal(app.window.EnergyMaster.find(cups).aliasSet, true);
    const stored = JSON.parse(app.saved.get(storageKey))[0];
    assert.equal(stored.name, seed().name);
    assert.ok(!Object.hasOwn(stored, 'alias'), 'private alias stays out of localStorage');
    assert.ok(!Object.hasOwn(stored, 'aliasSet'), 'private alias override state stays out of localStorage');
  }
});

test('a displayed legacy name can be edited and cleared through Alias across central reloads and imports', async () => {
  for (const address of ['', 'DIRECCION SINTETICA']) {
    const initial = { ...seed(), name: 'NOMBRE ANTIGUO SINTETICO', address };
    const app = harness({ rows: [initial] });
    assert.match(app.title(), /NOMBRE ANTIGUO SINTETICO/);
    app.open();
    assert.equal(app.control('#supplyAlias').value, initial.name, 'the displayed legacy name must be manageable in the only name field');

    app.control('#supplyAlias').value = 'ALIAS NUEVO SINTETICO';
    await app.submit();
    assert.match(app.title(), /ALIAS NUEVO SINTETICO/);
    assert.doesNotMatch(app.title(), /NOMBRE ANTIGUO SINTETICO/, 'old name must not reappear as an alias suffix without an address');
    app.open();
    assert.equal(app.control('#supplyAlias').value, 'ALIAS NUEVO SINTETICO');
    app.control('#supplyAlias').value = '';
    await app.submit();
    const aliasWrites = app.calls.filter(call => call.name === 'set_internal_aliases');
    assert.equal(aliasWrites.at(-1).args.p_supply_alias, '', 'explicit empty is retained centrally');

    function assertCleared(current) {
      assert.doesNotMatch(current.title(), /NOMBRE ANTIGUO|ALIAS NUEVO|NOMBRE DE FACTURA|NOMBRE IMPORTADO/);
      if (address) assert.equal(current.title(), address);
      else assert.ok(current.title().includes(cups), 'a nameless supply remains identifiable by its CUPS');
      current.open();
      assert.equal(current.control('#supplyAlias').value, '', 'reopening must not refill a deliberately cleared alias');
      assert.equal(current.window.EnergyMaster.find(cups).aliasSet, true);
      assert.equal(current.window.EnergyMaster.find(cups).name, initial.name, 'source metadata remains intact');
    }
    assertCleared(app);
    await app.reload();
    assertCleared(app);

    const restarted = harness({ rows: app.centralRows(), storage: app.saved });
    await restarted.reload();
    assertCleared(restarted);
    restarted.window.EnergyMaster.add({ cups, name: 'NOMBRE IMPORTADO', city: 'NUEVA LOCALIDAD SINTETICA' },
      { allowMove: true, fillOnly: true });
    restarted.window.EnergyMaster.learnInvoice({ cups, supplyName: 'NOMBRE DE FACTURA',
      holder: initial.holder, company: initial.company });
    restarted.window.EnergyMaster.refresh();
    assertCleared(restarted);
  }
});

test('an explicit empty alias with no source name survives later name enrichment', () => {
  const app = harness({ rows: [{ ...seed(), name: '', address: '', alias: '', aliasSet: true }] });
  app.window.EnergyMaster.add({ cups, name: 'NOMBRE IMPORTADO' }, { allowMove: true, fillOnly: true });
  assert.equal(app.window.EnergyMaster.find(cups).name, 'NOMBRE IMPORTADO', 'source enrichment still works');
  assert.equal(app.window.EnergyMaster.find(cups).aliasSet, true, 'an import without alias state cannot reset an explicit empty override');
  assert.ok(app.title().includes(cups));
  assert.doesNotMatch(app.title(), /NOMBRE IMPORTADO/);
  app.open();
  assert.equal(app.control('#supplyAlias').value, '');
});

test('private alias text and its empty override do not affect the client-visible source name', async () => {
  for (const alias of ['ALIAS INTERNO PRIVADO', '']) {
    const app = harness({ role: 'client', rows: [{ ...seed(), alias, aliasSet: true }] });
    assert.equal(app.title(), seed().name);
    assert.doesNotMatch(app.control('#companyGrid').innerHTML, /ALIAS INTERNO PRIVADO/);
    await app.reload();
    assert.equal(app.title(), seed().name);
    assert.doesNotMatch(app.control('#companyGrid').innerHTML, /ALIAS INTERNO PRIVADO/);
    const stored = JSON.parse(app.saved.get(storageKey))[0];
    assert.ok(!Object.hasOwn(stored, 'alias'));
    assert.ok(!Object.hasOwn(stored, 'aliasSet'));
  }
});

test('a rejected alias write keeps the editor open and the previous displayed name', async () => {
  const app = harness({ rejectAlias: true, rows: [{ ...seed(), alias: 'ALIAS CENTRAL ANTERIOR', aliasSet: true }] });
  const previousTitle = app.title();
  app.open();
  app.control('#supplyAlias').value = '';
  await app.submit();
  assert.ok(app.calls.some(call => call.name === 'save_master_supply_v2'));
  assert.ok(app.calls.some(call => call.name === 'set_internal_aliases'));
  assert.equal(app.title(), previousTitle, 'a rejected alias must not change the visible label');
  assert.equal(app.window.EnergyMaster.find(cups).alias, 'ALIAS CENTRAL ANTERIOR');
  assert.equal(app.control('#clientEditor').classList.contains('hidden'), false);
  assert.equal(app.control('#supplyAlias').value, '', 'keep the attempted value available for retry');
  assert.match(app.control('#clientFormMsg').textContent, /alias/i);
  assert.ok(app.reloadCount() > 0, 'reload the authoritative state after the partial save');
  assert.ok(!app.events.some(event => event.type === 'ibt-central-data-changed'), 'do not announce completed edit when alias failed');
});

test('an old backend acknowledgement cannot falsely confirm an explicit empty alias', async () => {
  const app = harness({ legacyAliasResponse: true });
  app.open();
  assert.equal(app.control('#supplyAlias').value, seed().name);
  app.control('#supplyAlias').value = '';
  await app.submit();
  assert.equal(app.calls.find(call => call.name === 'set_internal_aliases').args.p_supply_alias, '');
  assert.equal(app.title(), seed().name, 'legacy reset must not be represented as a confirmed empty override');
  assert.notEqual(app.window.EnergyMaster.find(cups).aliasSet, true);
  assert.equal(app.control('#clientEditor').classList.contains('hidden'), false);
  assert.match(app.control('#clientFormMsg').textContent, /alias/i);
  assert.ok(app.reloadCount() > 0);
  assert.ok(!app.events.some(event => event.type === 'ibt-central-data-changed'));
});

test('a new supply can be saved with only the private alias', async () => {
  const app = harness({ rows: [] });
  app.control('#newClient').onclick();
  app.control('#clientName').value = 'CLIENTE SINTETICO';
  app.control('#holderName').value = 'TITULAR SINTETICO';
  app.control('#clientType').value = 'EMPRESA';
  app.control('#clientCups').value = cups;
  app.control('#supplyAlias').value = 'ALIAS DE ALTA';
  await app.submit();
  const payload = app.calls.find(call => call.name === 'save_master_supply_v2').args.p_payload;
  assert.ok(!Object.hasOwn(payload, 'supply_name'));
  assert.equal(app.calls.find(call => call.name === 'set_internal_aliases').args.p_supply_alias, 'ALIAS DE ALTA');
  assert.equal(app.window.EnergyMaster.find(cups).alias, 'ALIAS DE ALTA');
  assert.equal(app.window.EnergyMaster.find(cups).aliasSet, true);
  assert.equal(app.title(), 'ALIAS DE ALTA');
  await app.reload();
  app.open();
  assert.equal(app.control('#supplyAlias').value, 'ALIAS DE ALTA');
  assert.equal(app.title(), 'ALIAS DE ALTA');
});

test('editing a supply cannot silently erase or replace an existing client tax identity', async () => {
  for (const attempted of ['', 'OTHER-SYNTHETIC-ID']) {
    const app = harness();
    app.open();
    app.control('#clientTaxId').value = attempted;
    await app.submit();
    assert.equal(app.calls.length, 0, 'identity changes must be rejected before any write');
    assert.equal(app.window.EnergyMaster.find(cups).clientTaxId, seed().clientTaxId);
    assert.match(app.control('#clientFormMsg').textContent, /NIF|CIF|titular/i);
  }
});

test('editing a supply cannot silently erase or rename its existing legal holder', async () => {
  for (const attempted of ['', 'OTRO TITULAR SINTETICO']) {
    const app = harness();
    app.open();
    app.control('#holderName').value = attempted;
    await app.submit();
    assert.equal(app.calls.length, 0, 'holder edits must be rejected before any write');
    assert.equal(app.window.EnergyMaster.find(cups).holder, seed().holder);
    assert.match(app.control('#clientFormMsg').textContent, /Editar titular/i);
  }
});

test('rejected manual write leaves both cache and current supply intact', async () => {
  const app = harness({ rejectSave: true });
  const before = app.saved.get(storageKey);
  app.open();
  app.control('#supplyAlias').value = 'ALIAS RECHAZADO';
  await app.submit();
  assert.equal(app.window.EnergyMaster.find(cups).name, seed().name);
  assert.equal(app.saved.get(storageKey), before);
  assert.match(app.control('#clientFormMsg').textContent, /otro cliente\/titular/);
  assert.equal(app.calls.length, 1, 'no secondary writes after rejection');
  assert.ok(!app.events.some(event => event.type === 'ibt-central-data-changed'));
});
