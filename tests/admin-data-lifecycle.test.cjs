const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminUi = fs.readFileSync(path.join(root, 'admin-data-management.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const pilot = fs.readFileSync(path.join(root, 'supabase-xtra-pilot.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260915171900_archive_visibility_for_clients.sql'), 'utf8');
const holderMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260929093000_safe_holder_reassignment.sql'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/admin-data-lifecycle/index.ts'), 'utf8');

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
});

test('local cache is cleared only after the server accepts the change', () => {
  const invokePos = adminUi.indexOf('await invoke(action, id)');
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


test('holder changes are detected only from latest valid non-superseded invoices', () => {
  assert.match(adminUi, /validation_status !== 'valid'/);
  assert.match(adminUi, /invoice\.superseded_by/);
  assert.match(adminUi, /source_holder_tax_id/);
  assert.match(adminUi, /apply_latest_invoice_holder/);
});

test('holder fiscal identity edits cannot silently become another legal identity', () => {
  assert.match(holderMigration, /tax_identity_change_requires_reassignment/);
  assert.match(holderMigration, /different non-empty tax id represents a different legal identity/i);
  assert.match(edge, /admin_update_holder_identity/);
});

test('validated holder reassignment is transactional and does not invent target identities', () => {
  assert.match(holderMigration, /admin_apply_latest_invoice_holder/);
  assert.match(holderMigration, /validation_status = 'valid'/);
  assert.match(holderMigration, /superseded_by is null/);
  assert.match(holderMigration, /target_holder_not_found/);
  assert.match(holderMigration, /update public\.supplies\s+set holder_id = v_target_holder\.id/s);
  assert.match(holderMigration, /insert into public\.supply_events/s);
  assert.match(holderMigration, /insert into public\.audit_log/s);
  assert.doesNotMatch(holderMigration, /insert into public\.clients/i);
  assert.doesNotMatch(holderMigration, /insert into public\.holders/i);
  assert.match(edge, /admin_apply_latest_invoice_holder/);
});
