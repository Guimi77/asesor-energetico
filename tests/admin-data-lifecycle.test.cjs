const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminUi = fs.readFileSync(path.join(root, 'admin-data-management.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const pilot = fs.readFileSync(path.join(root, 'supabase-xtra-pilot.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260915171900_archive_visibility_for_clients.sql'), 'utf8');
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

test('latest validated invoice distinguishes legal-name updates from true holder changes', () => {
  assert.match(adminUi, /latestInvoiceBySupply/);
  assert.match(adminUi, /source_holder_name/);
  assert.match(adminUi, /source_holder_tax_id/);
  assert.match(adminUi, /validation_status !== 'valid'/);
  assert.match(adminUi, /invoice\.superseded_by/);
  assert.match(adminUi, /holderInvoiceRelation/);
  assert.match(adminUi, /kind: 'review'/);
  assert.match(adminUi, /holderTax === invoiceTax/);
  assert.match(adminUi, /kind: sameName \? 'coherent' : 'rename'/);
  assert.match(adminUi, /kind: 'holder_change'/);
  assert.match(adminUi, /Actualizar nombre desde última factura/);
  assert.match(adminUi, /sync_holder_identity/);
  assert.match(adminUi, /Aplicar nuevo titular de última factura/);
  assert.match(adminUi, /apply_latest_invoice_holder/);
  assert.doesNotMatch(adminUi, /matchingHolderForInvoice/);
});

test('holder lifecycle edge actions stay behind the existing admin gate', () => {
  assert.match(edgeLifecycle, /callerProfile\.role !== "admin"/);
  assert.match(edgeLifecycle, /action === "update_holder"/);
  assert.match(edgeLifecycle, /action === "apply_latest_invoice_holder"/);
  assert.match(edgeLifecycle, /\["archive_holder", "restore_holder", "delete_holder"\]/);
  assert.match(edgeLifecycle, /latest_holder_identity_missing/);
  assert.match(edgeLifecycle, /same_legal_identity/);
});

test('current-owner reassignment uses the latest validated invoice fiscal identity and preserves invoice evidence', () => {
  assert.match(edgeLifecycle, /from\("invoices"\)/);
  assert.match(edgeLifecycle, /validation_status", "valid"/);
  assert.match(edgeLifecycle, /source_holder_tax_id/);
  assert.match(edgeLifecycle, /currentTax === nextTax/);
  assert.match(edgeLifecycle, /userClient\.rpc\("save_master_supply"/);
  assert.match(edgeLifecycle, /client_tax_id: nextTaxRaw/);
  assert.match(edgeLifecycle, /holder_tax_id: nextTaxRaw/);
  assert.match(edgeLifecycle, /event_type: "holder_change"/);
  assert.match(edgeLifecycle, /before_value:/);
  assert.match(edgeLifecycle, /after_value:/);
  assert.doesNotMatch(edgeLifecycle, /from\("invoices"\)\.update/);
  assert.doesNotMatch(edgeLifecycle, /from\("invoices"\)\.delete/);
});

test('holder deletion is blocked while any supply still depends on the holder', () => {
  assert.match(edgeLifecycle, /holder_has_active_supplies/);
  assert.match(edgeLifecycle, /holder_has_supplies/);
  const dependencyCheck = edgeLifecycle.indexOf('dependencies.supplies > 0');
  const holderDelete = edgeLifecycle.indexOf('from("holders").delete()');
  assert.ok(dependencyCheck >= 0 && holderDelete > dependencyCheck);
});

test('holder edits reject duplicate identity and only mirror one-to-one client identities', () => {
  assert.match(edgeLifecycle, /holder_tax_conflict/);
  assert.match(edgeLifecycle, /holder_name_conflict/);
  assert.match(edgeLifecycle, /\(clientHolders \|\| \[\]\)\.length === 1/);
  assert.match(edgeLifecycle, /client_synced: clientSynced/);
});

test('browser cache marker forces holder lifecycle UI refresh', () => {
  assert.match(auth, /admin-data-management\.js\?v=20260925-holderlifecycle1/);
});

test('fiscal identity dominates name when deciding whether ownership changed', () => {
  const relationStart = adminUi.indexOf('function holderInvoiceRelation');
  const relationEnd = adminUi.indexOf('function invoiceEffectiveDate', relationStart);
  const relationSource = adminUi.slice(relationStart, relationEnd);
  assert.match(relationSource, /if \(!holderTax \|\| !invoiceTax\)/);
  assert.match(relationSource, /if \(holderTax === invoiceTax\)/);
  assert.match(relationSource, /kind: sameName \? 'coherent' : 'rename'/);
  assert.match(relationSource, /return \{ kind: 'holder_change'/);
  assert.ok(relationSource.indexOf('holderTax === invoiceTax') < relationSource.indexOf("kind: sameName ? 'coherent' : 'rename'"));
});

test('new holder can be created from latest invoice tax identity without pre-existing holder record', () => {
  assert.match(edgeLifecycle, /client_name: nextName/);
  assert.match(edgeLifecycle, /client_tax_id: nextTaxRaw/);
  assert.match(edgeLifecycle, /holder_name: nextName/);
  assert.match(edgeLifecycle, /holder_tax_id: nextTaxRaw/);
  assert.doesNotMatch(edgeLifecycle, /target_holder_id/);
});
