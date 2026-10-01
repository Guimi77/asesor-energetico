const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminUi = fs.readFileSync(path.join(root, 'admin-data-management.js'), 'utf8');
const integratedUi = fs.readFileSync(path.join(root, 'client-archive-integrated.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const pilot = fs.readFileSync(path.join(root, 'supabase-xtra-pilot.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260915171900_archive_visibility_for_clients.sql'), 'utf8');
const holderMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260929093000_safe_holder_reassignment.sql'), 'utf8');
const holderLifecycleMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260929111500_safe_holder_admin_lifecycle.sql'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/admin-data-lifecycle/index.ts'), 'utf8');

test('admin lifecycle browser scripts parse', () => {
  assert.doesNotThrow(() => new Function(adminUi));
  assert.doesNotThrow(() => new Function(integratedUi));
});

test('destructive lifecycle actions are guarded and server-backed', () => {
  assert.match(adminUi, /admin-data-lifecycle/);
  assert.match(adminUi, /Escribe ELIMINAR para continuar/);
  assert.match(adminUi, /delete_user/);
  assert.match(adminUi, /delete_client/);
  assert.match(adminUi, /delete_supply/);
  assert.match(adminUi, /archive_client/);
  assert.match(adminUi, /archive_supply/);
  assert.match(adminUi, /archive_holder/);
  assert.match(adminUi, /restore_holder/);
  assert.match(adminUi, /delete_holder/);
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


test('holder administration exposes a separate searchable lifecycle panel', () => {
  assert.match(adminUi, /Administrar titulares/);
  assert.match(adminUi, /centralHolderSearch/);
  assert.match(adminUi, /showArchivedHolders/);
  assert.match(adminUi, /function holderCounts/);
  assert.match(adminUi, /function renderHolders/);
  assert.match(adminUi, /data-db-action="edit_holder"/);
  assert.match(adminUi, /data-db-action="archive_holder"/);
  assert.match(adminUi, /data-db-action="restore_holder"/);
  assert.match(adminUi, /data-db-action="delete_holder"/);
  assert.match(adminUi, /Tiene CUPS activos/);
  assert.match(adminUi, /Con suministros: no se puede borrar/);
});

test('holder lifecycle UI binds every rendered action button', () => {
  assert.match(adminUi, /\$\$\('\[data-db-action\]', root\)\.forEach/);
});

test('holder lifecycle RPC is admin-only, transactional and leaves client/supply/invoice identity untouched', () => {
  assert.match(holderLifecycleMigration, /admin_manage_holder_lifecycle/);
  assert.match(holderLifecycleMigration, /role = 'admin'/);
  assert.match(holderLifecycleMigration, /pg_advisory_xact_lock/);
  assert.match(holderLifecycleMigration, /count\(\*\) filter \(where status = 'active'\)/);
  assert.match(holderLifecycleMigration, /holder_has_active_supplies/);
  assert.match(holderLifecycleMigration, /holder_has_supplies/);
  assert.match(holderLifecycleMigration, /holder_must_be_archived/);
  assert.match(holderLifecycleMigration, /target_client_not_active/);
  assert.match(holderLifecycleMigration, /insert into public\.audit_log/s);
  assert.match(holderLifecycleMigration, /delete from public\.holders/s);
  assert.doesNotMatch(holderLifecycleMigration, /update public\.clients/i);
  assert.doesNotMatch(holderLifecycleMigration, /update public\.supplies/i);
  assert.doesNotMatch(holderLifecycleMigration, /update public\.invoices/i);
  assert.doesNotMatch(holderLifecycleMigration, /delete from public\.supplies/i);
  assert.doesNotMatch(holderLifecycleMigration, /delete from public\.invoices/i);
});

test('holder deletion requires archived state and zero supplies', () => {
  const archivedGate = holderLifecycleMigration.indexOf("v_holder.status <> 'archived'");
  const supplyGate = holderLifecycleMigration.indexOf('v_supply_count > 0');
  const holderDelete = holderLifecycleMigration.indexOf('delete from public.holders');
  assert.ok(archivedGate >= 0 && supplyGate > archivedGate && holderDelete > supplyGate);
});

test('holder restore requires its parent client to remain active', () => {
  assert.match(holderLifecycleMigration, /select \*\s+into v_client\s+from public\.clients/s);
  assert.match(holderLifecycleMigration, /v_client\.status <> 'active'/);
});

test('edge holder lifecycle is routed through the audited SQL function', () => {
  assert.match(edge, /\["archive_holder", "restore_holder", "delete_holder"\]\.includes\(action\)/);
  assert.match(edge, /userClient\.rpc\("admin_manage_holder_lifecycle"/);
  assert.match(edge, /p_holder_id: id/);
  assert.match(edge, /p_action: lifecycleAction/);
});

test('holder admin browser cache marker matches the new lifecycle UI', () => {
  assert.match(auth, /admin-data-management\.js\?v=0e1c3e21ccd0/);
});


test('client screen uses one unified alias-holder-supply hierarchy', () => {
  assert.match(integratedUi, /#centralClientsAdmin,#centralHoldersAdmin,#centralSuppliesAdmin\{display:none!important\}/);
  assert.match(integratedUi, /function prepareClientHierarchy/);
  assert.match(integratedUi, /folder\.open = true/);
  assert.match(integratedUi, /addSupply\.textContent = '\+ Nuevo suministro'/);
  assert.match(integratedUi, /const folders = \$\$\('\.holder-folder', card\)/);
  assert.match(integratedUi, /\$\$\('#centralHoldersList \.db-admin-row'\)/);
  assert.match(integratedUi, /\$\$\('#centralSuppliesList \.db-admin-row'\)/);
  assert.match(integratedUi, /\$\$\('#companyGrid \.holder-supply-row\[data-cups\]'\)\.forEach/);
  assert.match(integratedUi, /function integrateHolderActions/);
  assert.match(integratedUi, /integrated-holder-edit/);
  assert.match(integratedUi, /Editar titular/);
  assert.match(integratedUi, /function integrateHolderChangeControls/);
  assert.match(integratedUi, /card\.classList\.contains\('multi-client-group'\)/);
  assert.match(integratedUi, /ensureHolderActions\(folder\)/);
  assert.match(integratedUi, /apply_latest_invoice_holder/);
  assert.match(integratedUi, /sync_holder_name/);
  assert.doesNotMatch(integratedUi, /simple-client-folder>summary\{display:none!important\}/);
  assert.doesNotMatch(integratedUi, /\$\$\$\(/);
});

test('client hierarchy only shows an extra top heading when there is an alias/group', () => {
  assert.match(integratedUi, /has-client-alias/);
  assert.match(integratedUi, /no-client-alias/);
  assert.match(integratedUi, /if \(!card\.classList\.contains\('no-client-alias'\)\) return/);
  assert.match(integratedUi, /if \(title\) title\.style\.display = 'none'/);
  assert.match(integratedUi, /\.client-legal-name\{display:none!important\}/);
});


test('integrated client hierarchy is mutation-idempotent after admin login', () => {
  assert.match(integratedUi, /let schedulePending = false/);
  assert.match(integratedUi, /if \(!isAdmin\(\) \|\| schedulePending\) return/);
  assert.match(integratedUi, /if \(addSupply\.textContent !== '\+ Nuevo suministro'\)/);
  assert.match(integratedUi, /if \(notice\.textContent !== nextNotice\)/);
  assert.match(integratedUi, /dataset\.integratedClientName = clientName/);
  assert.match(integratedUi, /\$\$\('\.client-group-member', card\)\.forEach/);
  assert.match(integratedUi, /\$\$\('\.integrated-client-archive', card\)\.some/);

  assert.match(integratedUi, /\.some\(\(button\) => norm\(button\.dataset\.integratedClientName/);
  assert.match(integratedUi, /new MutationObserver\(\(\) => \{\s*if \(isAdmin\(\)\) schedule\(\)/s);
});
