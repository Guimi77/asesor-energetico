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
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260925094000_central_master_writes.sql'),
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
  assert.match(master, /['admin', 'staff'].includes(role)/);
  assert.match(master, /supabase.rpc('save_master_supply'/);
  assert.match(master, /centralWriteMessage/);
  assert.doesNotMatch(master, /Cambios guardados localmente; los alias centrales quedan pendientes/);
});

test('central sync treats Supabase values as authoritative for cached rows', () => {
  const marker = "source: 'Supabase · Base central'";
  const start = pilot.indexOf(marker);
  assert.ok(start >= 0, 'central source marker must exist');
  const options = pilot.slice(start, start + 700);
  assert.match(options, /allowMove:\s*true/);
  assert.match(options, /fillOnly:\s*false/);
  assert.match(options, /preserveIdentity:\s*false/);
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

test('browser cache markers force the new central-write code', () => {
  assert.match(index, /master-v2\.js\?v=20260925-centralwrite1/);
  assert.match(bootstrap, /supabase-xtra-pilot\.js\?v=20260925-central5/);
});
