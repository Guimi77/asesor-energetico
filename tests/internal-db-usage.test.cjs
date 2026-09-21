'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'internal-db-usage.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260921142500_internal_database_usage.sql'),'utf8');

test('database usage RPC is protected by the server for internal roles only',()=>{
  assert.match(migration,/not private\.is_internal_user\(\)/);
  assert.match(migration,/raise exception 'not_authorized'/);
  assert.match(migration,/revoke all on function public\.get_internal_database_usage\(\) from public, anon/);
  assert.match(migration,/grant execute on function public\.get_internal_database_usage\(\) to authenticated, service_role/);
});

test('UI recognizes only admin and staff as internal roles',()=>{
  assert.match(ui,/new Set\(\['admin', 'staff'\]\)/);
  assert.doesNotMatch(ui,/INTERNAL_ROLES.*client/);
  assert.match(ui,/if \(!isInternal\(profile\)\) \{\s*hideCard\(\);\s*return;/);
  assert.match(ui,/supabase\.rpc\('get_internal_database_usage'\)/);
});

test('usage widget is loaded as a separate presentation component',()=>{
  assert.match(html,/internal-db-usage\.css\?v=/);
  assert.match(html,/internal-db-usage\.js\?v=/);
  assert.match(ui,/Solo admin \/ staff/);
  assert.match(ui,/Referencia visual: 500 MB/);
});
