const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminUi = fs.readFileSync(path.join(root, 'admin-data-management.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const pilot = fs.readFileSync(path.join(root, 'supabase-xtra-pilot.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260915171900_archive_visibility_for_clients.sql'), 'utf8');
const holderMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260925123000_holder_lifecycle_management.sql'), 'utf8');
const edgeLifecycle = fs.readFileSync(path.join(root, 'supabase/functions/admin-data-lifecycle/index.ts'), 'utf8');

test('admin lifecycle browser script parses', () => {
  assert.doesNotThrow(() => new Function(adminUi));
});

test('destructive lifecycle actions are guarded and server-backed', () => {
  assert.match(adminUi, /admin-data-lifecycle/);
  assert.match(adminUi, /Escribe ELIMINAR para continuar/);
  assert.match(adminUi, /delete_user/);
  assert.match(adminUi, /delete_client/);
  assert.match(adminUi, /delete_supply/);
  assert.match(adminUi, /archive_client/);
  assert.match(adminUi, /archive_supply/);
  assert.match(adminUi, /delete_holder/);
  assert.match(adminUi, /archive_holder/);
  assert.match(adminUi, /restore_holder/);
});

test('local cache is cleared only after the server accepts the change', () => {
  const invokePos = adminUi.indexOf('await invoke(action, id, extra)');
  const clearPos = adminUi.indexOf('localMasterRemoveCups(clientCups)');
  assert.ok(invokePos >= 0 && clearPos > invokePos);
});

test('archived clients are excluded from new user assignments', () => {
  assert.match(auth, /from\('clients'\).*?eq\('status','active'\)/s);
});

test('pilot cache reads active central records and refreshes after lifecycle changes', () => {
  const activeFilters = pilot.match(/\.eq\('status', 'active'\)/g) || [];
  assert.ok(activeFilters.length >= 3);
  assert.match(pilot, /ibt-central-data-changed/);
});

test('client-facing RLS hides archived records while internal users retain access', () => {
  assert.match(migration, /c\.status = 'active'/);
  assert.match(migration, /s\.status = 'active'/);
  assert.match(migration, /private\.is_internal_user\(\)/);
  assert.match(migration, /create policy supplies_select/);
});


test('holder administration can edit, archive and safely remove holders', () => {
  assert.match(adminUi, /Administrar titulares/);
  assert.match(adminUi, /data-db-action="edit_holder"/);
  assert.match(adminUi, /data-db-action="archive_holder"/);
  assert.match(adminUi, /data-db-action="restore_holder"/);
  assert.match(adminUi, /data-db-action="delete_holder"/);
  assert.match(adminUi, /holder_has_active_supplies/);
  assert.match(adminUi, /holder_has_supplies/);
  assert.match(adminUi, /\$\$\('\[data-db-action\]', root\)\.forEach/);
});

test('latest validated invoice holder can reveal a stale current owner without rewriting history', () => {
  assert.match(adminUi, /latestInvoiceBySupply/);
  assert.match(adminUi, /source_holder_name/);
  assert.match(adminUi, /source_holder_tax_id/);
  assert.match(adminUi, /validation_status !== 'valid'/);
  assert.match(adminUi, /invoice\.superseded_by/);
  assert.match(adminUi, /Aplicar titular de última factura/);
  assert.match(adminUi, /reassign_supply_holder/);
});

test('holder lifecycle edge actions stay behind the existing admin gate and use transactional RPCs', () => {
  assert.match(edgeLifecycle, /callerProfile\.role !== "admin"/);
  assert.match(edgeLifecycle, /admin_update_holder/);
  assert.match(edgeLifecycle, /admin_reassign_supply_holder/);
  assert.match(edgeLifecycle, /admin_holder_lifecycle/);
  assert.match(edgeLifecycle, /invalid_target_holder/);
});

test('holder lifecycle migration preserves invoice evidence and records current-owner changes', () => {
  assert.match(holderMigration, /create or replace function public\.admin_update_holder/);
  assert.match(holderMigration, /create or replace function public\.admin_reassign_supply_holder/);
  assert.match(holderMigration, /create or replace function public\.admin_holder_lifecycle/);
  assert.match(holderMigration, /update public\.supplies[\s\S]*set holder_id = p_target_holder_id/);
  assert.match(holderMigration, /insert into public\.supply_events/);
  assert.match(holderMigration, /insert into public\.audit_log/);
  assert.doesNotMatch(holderMigration, /update\s+public\.invoices/i);
  assert.doesNotMatch(holderMigration, /delete\s+from\s+public\.invoices/i);
});

test('holder deletion is blocked while any supply still depends on the holder', () => {
  assert.match(holderMigration, /holder_has_active_supplies/);
  assert.match(holderMigration, /holder_has_supplies/);
  const supplyCount = holderMigration.indexOf('select count(*) into v_supply_count');
  const holderDelete = holderMigration.indexOf('delete from public.holders');
  assert.ok(supplyCount >= 0 && holderDelete > supplyCount);
});

test('holder admin RPCs are not executable by browser roles', () => {
  assert.match(holderMigration, /revoke all on function public\.admin_update_holder\(uuid,text,text,uuid\) from public, anon, authenticated/);
  assert.match(holderMigration, /revoke all on function public\.admin_reassign_supply_holder\(uuid,uuid,uuid\) from public, anon, authenticated/);
  assert.match(holderMigration, /revoke all on function public\.admin_holder_lifecycle\(text,uuid,uuid\) from public, anon, authenticated/);
  assert.match(holderMigration, /grant execute on function public\.admin_update_holder\(uuid,text,text,uuid\) to service_role/);
});

test('browser cache marker forces holder lifecycle UI refresh', () => {
  assert.match(auth, /admin-data-management\.js\?v=20260925-holderlifecycle1/);
});
