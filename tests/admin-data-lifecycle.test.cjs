const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminUi = fs.readFileSync(path.join(root, 'admin-data-management.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const pilot = fs.readFileSync(path.join(root, 'supabase-xtra-pilot.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260915171900_archive_visibility_for_clients.sql'), 'utf8');

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
