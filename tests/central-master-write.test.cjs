'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const master = fs.readFileSync(path.join(root, 'master-v2.js'), 'utf8');
const pilot = fs.readFileSync(path.join(root, 'supabase-xtra-pilot.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'auth-bootstrap.js'), 'utf8');
const integratedUi = fs.readFileSync(path.join(root, 'client-archive-integrated.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260925094000_central_master_writes.sql'),
  'utf8'
);
const clientTypeMigration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20261001071500_persist_client_type.sql'),
  'utf8'
);
const cupsIdentityMigration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20261001104000_canonical_cups_identity.sql'),
  'utf8'
);

test('manual master saves reach Supabase before mutating the local cache', () => {
  const start = master.indexOf("$('#clientForm').onsubmit");
  assert.ok(start >= 0, 'client form submit handler must exist');

  const segment = master.slice(start, master.indexOf("const masterInput = $('#masterInput')", start));
  const centralCall = segment.indexOf('await persistCentralSupply');
  const centralGuard = segment.indexOf('if (!centralSave.ok)');
  const localSplice = segment.indexOf('supplies.splice');
  const localInsert = segment.indexOf('upsertSupply(data');

  assert.ok(centralCall >= 0, 'manual save must call the central writer');
  assert.ok(centralGuard > centralCall, 'central write failure must be checked');
  assert.ok(localSplice > centralGuard || localInsert > centralGuard, 'local mutation must happen only after central success');
  assert.match(segment, /Guardando en la base central/);
  assert.match(segment, /ibt-central-data-changed/);
});

test('workbook import persists each row centrally in fill-only mode before caching it', () => {
  const start = master.indexOf('masterInput.onchange');
  assert.ok(start >= 0, 'master import handler must exist');
  const segment = master.slice(start, master.indexOf("$('#cupsSearch').oninput", start));

  const centralCall = segment.indexOf("persistCentralSupply(supply, { mode: 'fill_only' })");
  const localCall = segment.indexOf('upsertSupply(supply');

  assert.ok(centralCall >= 0, 'import must call the central writer');
  assert.ok(localCall > centralCall, 'import must not mutate local cache before central persistence');
  assert.match(segment, /Maestro importado en Supabase/);
});

test('central writer is internal-only and uses the dedicated RPC', () => {
  assert.ok(master.includes("['admin', 'staff'].includes(role)"));
  assert.ok(master.includes("supabase.rpc('save_master_supply_v2'"));
  assert.ok(master.includes("client_type: norm(supply.type || supply.clientType) || null"));
  assert.ok(master.includes('centralWriteMessage'));
  assert.ok(!master.includes('Cambios guardados localmente; los alias centrales quedan pendientes'));
});

test('group clients never inherit a holder tax id as the client tax id', () => {
  assert.ok(master.includes("const sameLegalIdentity = key(supply.client) === key(supply.holder || supply.company);"));
  assert.ok(master.includes("supply.clientTaxId || (sameLegalIdentity ? (supply.holderTaxId || '') : '')"));
  assert.ok(!master.includes("supply.clientTaxId || supply.holderTaxId || ''"));
});

test('a centrally accepted import may repair stale local ownership before the next reload', () => {
  assert.ok(master.includes("upsertSupply(supply, { allowMove: true, fillOnly: true, preserveIdentity: false })"));
});

test('central sync treats Supabase membership as authoritative only when no legacy row is pending', () => {
  assert.ok(pilot.includes("if (!legacyPending && typeof master.replaceActiveFromCentral === 'function')"));
  assert.ok(pilot.includes('master.replaceActiveFromCentral(centralRows)'));
  assert.ok(pilot.includes("cacheAligned: !legacyPending && typeof master.replaceActiveFromCentral === 'function'"));
  assert.ok(pilot.includes('master.add(row, {'));
  assert.ok(pilot.includes('fillOnly: false'));
  assert.ok(pilot.includes('preserveIdentity: false'));
});

test('database write RPC is additive, canonical and ambiguity-safe', () => {
  assert.match(migration, /create or replace function public\.save_master_supply\(p_payload jsonb\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /private\.is_internal_user\(\)/);
  assert.match(migration, /left\(v_cups, 20\)/);
  assert.match(migration, /v_mode not in \('manual', 'fill_only'\)/);
  assert.match(migration, /duplicate_cups/);
  assert.match(migration, /owner_conflict/);
  assert.match(migration, /holder_belongs_to_other_client/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /insert into public\.audit_log/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\./i);
  assert.doesNotMatch(migration, /set\s+status\s*=\s*'archived'/i);
});

test('fill-only owner conflicts are rejected before any new hierarchy can be inserted', () => {
  const guard = migration.indexOf("if v_existing.id is not null and v_mode = 'fill_only' then");
  const conflict = migration.indexOf("return jsonb_build_object('ok', false, 'reason', 'owner_conflict')", guard);
  const firstClientInsert = migration.indexOf('insert into public.clients', guard);
  const firstHolderInsert = migration.indexOf('insert into public.holders', guard);

  assert.ok(guard >= 0);
  assert.ok(conflict > guard);
  assert.ok(firstClientInsert > conflict);
  assert.ok(firstHolderInsert > conflict);
});

test('central cache alignment preserves a local archive before pruning', () => {
  assert.ok(master.includes('function replaceActiveFromCentral(rows = [])'));
  assert.ok(master.includes("archiveReason: 'central_cache_alignment'"));
  assert.ok(master.includes("localStorage.setItem(LEGACY_ARCHIVE_STORAGE"));
  assert.ok(master.includes("return { ok: false, reason: 'legacy_archive_failed', error }"));
  assert.ok(master.includes('mergeSupply(existing, incoming, { fillOnly: false, preserveIdentity: false })'));
});

test('browser cache markers force the central-authoritative code', () => {
  assert.match(index, /master-v2\.js\?v=0e550f822679/);
  assert.match(index, /client-archive-integrated\.js\?v=3f4a543e769e/);
  assert.match(index, /auth-bootstrap\.js\?v=794130541ce9/);
  assert.match(bootstrap, /supabase-xtra-pilot\.js\?v=3e94478bdba9/);
});


test('business group type is persisted instead of inferred from holder count', () => {
  assert.match(clientTypeMigration, /add column if not exists client_type text/);
  assert.match(clientTypeMigration, /create or replace function public\.save_master_supply_v2\(p_payload jsonb\)/i);
  assert.match(clientTypeMigration, /v_type not in \('PARTICULAR','EMPRESA','GRUPO','PENDIENTE'\)/);
  assert.match(clientTypeMigration, /v_result := public\.save_master_supply\(p_payload\)/);
  assert.match(clientTypeMigration, /'client_type_updated'/);
  assert.match(pilot, /select\('id,name,tax_id,status,client_type'\)/);
  assert.match(pilot, /const explicit = norm\(client\?\.client_type\)\.toUpperCase\(\)/);
  assert.doesNotMatch(pilot, /holderCount > 1/);
});

test('group creation keeps a dedicated add-holder path in the existing master form', () => {
  assert.match(master, /data-client-type="\$\{esc\(type\)\}"/);
  assert.match(master, /data-new-holder="1"/);
  assert.match(master, /\+ Nuevo titular \/ suministro/);
  assert.match(master, /openForm\(button\.dataset\.client, '', button\.dataset\.newHolder === '1'\)/);
  assert.match(master, /blankHolder \? '' : \(holder \|\| existing\.holder/);
});


test('business groups keep their top-level heading even when they have no alias', () => {
  assert.match(integratedUi, /isBusinessGroup = String\(card\.dataset\.clientType \|\| ''\)\.toUpperCase\(\) === 'GRUPO'/);
  assert.match(integratedUi, /const keepTopHeading = hasAlias \|\| isBusinessGroup/);
  assert.match(integratedUi, /business-group-client/);
  assert.match(integratedUi, /\+ Nuevo titular \/ suministro/);
  assert.match(integratedUi, /Añadir un nuevo titular y su primer suministro al grupo empresarial/);
});


test('CUPS identity ignores the optional trailing extension everywhere', () => {
  assert.match(master, /normalized\.slice\(0, 20\)/);
  assert.match(pilot, /compact\.slice\(0, 20\)/);
  assert.match(migration, /v_cups_key := left\(v_cups, 20\)/);
  assert.match(migration, /where left\(cups_key, 20\) = v_original_key/);
  assert.match(cupsIdentityMigration, /create or replace function public\.canonical_cups_identity\(p_cups text\)/i);
  assert.match(cupsIdentityMigration, /then left\(value,20\)/);
  assert.match(cupsIdentityMigration, /optional trailing CUPS extension characters such as 0F never differentiate supplies/i);
  assert.match(cupsIdentityMigration, /create unique index if not exists supplies_canonical_cups_identity_unique/i);
  assert.match(cupsIdentityMigration, /canonical_cups_identity_conflict/);
});
