'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260915123000_allow_client_uploads_to_assigned_energy_history.sql'),'utf8');
const portal=fs.readFileSync(path.join(root,'client-upload-access.js'),'utf8');
const bootstrap=fs.readFileSync(path.join(root,'auth-bootstrap.js'),'utf8');
const history=fs.readFileSync(path.join(root,'xtra-history.js'),'utf8');

test('client history writer is scoped to explicitly assigned active client accounts',()=>{
  assert.match(migration,/private\.can_ingest_energy_history_cups/);
  assert.match(migration,/join public\.client_users cu on cu\.client_id = h\.client_id/);
  assert.match(migration,/cu\.user_id = auth\.uid\(\)/);
  assert.match(migration,/p\.active = true/);
  assert.match(migration,/p\.role = 'client'/);
  assert.match(migration,/private\.can_access_client\(v_client\)/);
  assert.match(migration,/cups_not_assigned_to_account/);
});

test('client upload path cannot bootstrap a new supply identity',()=>{
  const internalBranch=migration.indexOf('if private.is_internal_user() then');
  const ensureCall=migration.indexOf('private.ensure_energy_history_supply(p_payload)',internalBranch);
  const clientBranch=migration.indexOf('else',ensureCall);
  assert.ok(internalBranch>=0&&ensureCall>internalBranch&&clientBranch>ensureCall);
  const clientSection=migration.slice(clientBranch,migration.indexOf('v_result := public.ingest_xtra_energy_history_safe',clientBranch));
  assert.doesNotMatch(clientSection,/ensure_energy_history_supply/);
  assert.match(clientSection,/where left\(s\.cups_key,20\)=left\(v_cups,20\)/);
});

test('implementation-only writer and anonymous reading enrichment stay closed',()=>{
  assert.match(migration,/revoke all on function public\.upsert_xtra_energy_history_legacy\(jsonb\) from public, anon, authenticated/);
  assert.match(migration,/revoke all on function public\.enrich_xtra_invoice_reading_status\(jsonb\) from public, anon/);
});

test('client portal exposes only invoice upload in addition to RLS-scoped history',()=>{
  assert.match(portal,/data-view=\\"facturas\\"/);
  assert.match(portal,/link\?\.classList\.remove\('hidden'\)/);
  assert.match(portal,/Mis facturas/);
  assert.match(portal,/Solo se guardarán datos estructurados validados de CUPS/);
  assert.doesNotMatch(portal,/data-view=\\"clientes\\"/);
  assert.doesNotMatch(portal,/data-view=\\"cups\\"/);
  assert.doesNotMatch(portal,/data-view=\\"users\\"/);
});

test('portal control is loaded and uploads use the guarded central history RPC',()=>{
  assert.match(bootstrap,/client-upload-access\.js\?v=20260915-1/);
  assert.match(history,/rpc\('upsert_xtra_energy_history'/);
});
