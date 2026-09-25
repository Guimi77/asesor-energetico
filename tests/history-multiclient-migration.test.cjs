'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260915_generalize_energy_history_clients.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

test('multi-client history migration preserves known CUPS identity', () => {
  assert.match(sql, /Never move an already known CUPS/);
  assert.match(sql, /where left\(s\.cups_key,20\) = left\(v_cups,20\)/);
  assert.doesNotMatch(sql, /update\s+public\.holders\s+set\s+client_id/i);
  assert.doesNotMatch(sql, /update\s+public\.supplies\s+set\s+holder_id/i);
});

test('new CUPS can create provisional client, holder and supply only from validated identity', () => {
  assert.match(sql, /p_payload->>'validated'/);
  assert.match(sql, /source_holder_name/);
  assert.match(sql, /source_holder_tax_id/);
  assert.match(sql, /insert into public\.clients/);
  assert.match(sql, /insert into public\.holders/);
  assert.match(sql, /insert into public\.supplies/);
  assert.match(sql, /Alta provisional desde factura validada/);
});

test('pilot-only XTRA filters are patched fail-closed in both history writers', () => {
  assert.match(sql, /Expected XTRA filter not found in ingest_xtra_energy_history_safe/);
  assert.match(sql, /Expected XTRA filter not found in upsert_xtra_energy_history_legacy/);
  assert.match(sql, /v_src := replace\(v_src, v_old, v_new\)/);
});

test('current frontend RPC name remains compatible while scope becomes multi-client', () => {
  assert.match(sql, /create or replace function public\.upsert_xtra_energy_history\(p_payload jsonb\)/);
  assert.match(sql, /private\.ensure_energy_history_supply\(p_payload\)/);
  assert.match(sql, /public\.ingest_xtra_energy_history_safe\(p_payload\)/);
  assert.match(sql, /jsonb_build_object\('scope', 'multi_client'\)/);
});

test('history write remains restricted to internal authenticated users', () => {
  assert.match(sql, /private\.is_internal_user\(\)/);
  assert.match(sql, /revoke all on function public\.upsert_xtra_energy_history\(jsonb\) from public, anon/);
  assert.match(sql, /grant execute on function public\.upsert_xtra_energy_history\(jsonb\) to authenticated, service_role/);
});
