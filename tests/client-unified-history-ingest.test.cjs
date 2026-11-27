'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'docs/sql-proposals/submit_client_energy_invoice_v1.sql'),'utf8');
const history=fs.readFileSync(path.join(root,'xtra-history.js'),'utf8');
const oldGuard=fs.readFileSync(path.join(root,'supabase/migrations/20261120131500_client_portal_readonly_ingest.sql'),'utf8');

test('Proposal remains review-only, without a production migration or bypass of old restrictions',()=>{
  assert.match(sql,/REVIEW-ONLY SQL PROPOSAL\. NOT A MIGRATION AND NOT DEPLOYED/);
  assert.match(oldGuard,/coalesce\(private\.is_internal_user\(\), false\)/);
  assert.doesNotMatch(sql,/create or replace function private\.can_ingest_energy_history_cups/i);
  assert.doesNotMatch(sql,/alter policy|create policy|drop policy|alter table .* disable row level security/i);
  assert.doesNotMatch(sql,/grant.*on function .*upsert_xtra_energy_history_v[23]/i);
});

test('Customer RPC uses explicit backend client and supply authorization',()=>{
  assert.match(sql,/create or replace function public\.submit_client_energy_invoice_v1\(p_payload jsonb\)/);
  assert.match(sql,/security definer/);
  assert.match(sql,/p\.id = v_user and p\.role = 'client' and p\.active = true/);
  assert.match(sql,/join public\.client_users cu on cu\.client_id = c\.id and cu\.user_id = v_user/);
  assert.match(sql,/left\(s\.cups_key,20\) = left\(v_cups,20\) and s\.status = 'active'/);
  assert.match(sql,/cups_not_assigned_to_account/);
  assert.match(sql,/holder_identity_mismatch/);
  assert.match(sql,/revoke all on function public\.submit_client_energy_invoice_v1\(jsonb\) from public, anon, authenticated/);
  assert.match(sql,/grant execute on function public\.submit_client_energy_invoice_v1\(jsonb\) to authenticated/);
});

test('Full 22-character CUPS is matched by the canonical first 20 without relaxing the assigned-user check',()=>{
  const patch=fs.readFileSync(path.join(root,'supabase/migrations/20261127075939_client_invoice_match_canonical_cups20.sql'),'utf8');
  assert.match(patch,/left\(s\.cups_key,20\) = left\(v_cups,20\)/);
  assert.match(patch,/raise exception 'Expected client CUPS lookup not found; refusing patch'/);
  assert.match(sql,/join public\.client_users cu on cu\.client_id = c\.id and cu\.user_id = v_user/);
});

test('SQL never updates invoices, supply/holder identities, or invokes privileged legacy writers',()=>{
  assert.doesNotMatch(sql,/\b(update|delete from|truncate)\s+public\.(?:invoices|supplies|holders|clients|invoice_)/i);
  assert.doesNotMatch(sql,/\bupsert_xtra_energy_history(?:_v2|_v3|_legacy)?\s*\(/i);
  assert.doesNotMatch(sql,/\bingest_xtra_energy_history_safe\s*\(/i);
  assert.match(sql,/insert into public\.invoices/);
  assert.match(sql,/insert into public\.audit_log/);
  assert.match(sql,/pg_advisory_xact_lock/);
});

test('Never silently overwrites duplicates or automatically supersedes other invoice numbers',()=>{
  assert.match(sql,/invoice_number=v_number for update/);
  assert.match(sql,/mode', 'existing_unchanged'/);
  assert.match(sql,/existing_invoice_differs/);
  assert.match(sql,/possible_refacturation_ambiguous/);
  assert.match(sql,/v_existing\.superseded_by is null/);
});

test('Database rechecks figures and requires structured P1-P6 evidence before insert',()=>{
  assert.match(sql,/invalid_validation/);
  assert.match(sql,/required_fields_missing/);
  assert.match(sql,/economic_validation_failed/);
  assert.match(sql,/abs\(v_total - v_sum\) > 0\.05/);
  assert.match(sql,/energy_periods_mismatch/);
  assert.match(sql,/abs\(v_energy_kwh-v_kwh\) > 0\.02/);
  assert.match(sql,/jsonb_to_recordset\(p_payload->'energy_periods'\)/);
});

test('New invoices and all associated detail share the same canonical history',()=>{
  for(const name of [
    'invoices','invoice_energy_periods','invoice_power_periods','invoice_maximeters',
    'invoice_excesses','invoice_reactive','invoice_compensation_periods','invoice_tax_lines',
    'invoice_distributor_rights','invoice_adjustments'
  ])assert.match(sql,new RegExp('insert into public\\.'+name+'\\b'),name);
  assert.match(sql,/client_invoice_inserted/);
  assert.match(sql,/single_shared_history/);
});

test('Only fully cross-checked browser input reaches customer write RPC; internal writer untouched',()=>{
  const start=history.indexOf('async function persistOne(');
  const end=history.indexOf('async function renderSummary',start);
  const persist=history.slice(start,end);
  assert.ok(start>=0&&end>start);
  const crossCheck=persist.indexOf('if(!validated)return');
  const clientCall=persist.indexOf("supabase.rpc('submit_client_energy_invoice_v1'");
  const internalCall=persist.indexOf("supabase.rpc('upsert_xtra_energy_history_v3'");
  assert.ok(crossCheck>0&&clientCall>crossCheck&&internalCall>clientCall);
  assert.match(persist,/if\(profile\.role==='client'\)/);
  assert.match(history,/\['existing_unchanged','superseded_input_ignored'\]\.includes\(r\.mode\)/);
  assert.match(history,/duplicates\+\+/);
  assert.match(history,/Histórico: \$\{done\}\/\$\{list\.length\} · ✓ \$\{saved\} guardadas/);
});
