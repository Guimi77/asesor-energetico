'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261127160000_admin_purge_orphan_client_v2.sql'),'utf8');
const ui=fs.readFileSync(path.join(root,'history-supply-purge.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('client deletion is guarded by administrator and explicit execute=false preview',()=>{
  assert.match(sql,/p_execute boolean default false/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/role::text='admin'/);
  assert.match(sql,/raise exception 'not_authorized'/);
  assert.match(sql,/if not p_execute then/);
  assert.match(sql,/p_expected_signature/);
  assert.match(sql,/confirmation_or_preview_stale/);
  assert.match(sql,/from public\.holders where client_id=v_client_id and id<>v_holder_id/);
});
test('client can be deleted only after supply and last holder are deleted',()=>{
  assert.match(sql,/v_result:=public\.admin_purge_supply_v1\(/);
  assert.match(sql,/if \(v_result->>'holder_deleted'\)::boolean and v_other_holders=0 then/);
  assert.match(sql,/delete from public\.clients/);
  assert.match(sql,/not exists\(select 1 from public\.holders where client_id=v_client\.id\)/);
  assert.doesNotMatch(sql,/delete from auth\.users/);
  assert.match(sql,/v_client_deleted := v_count=1/);
});
test('UI previews and clearly confirms client deletion as well as CUPS',()=>{
  assert.match(ui,/db\.rpc\('admin_purge_supply_and_client_v2'/);
  assert.match(ui,/preview\.client_will_be_deleted/);
  assert.match(ui,/preview\.client_user_links_to_remove/);
  assert.match(ui,/preview\.client/);
  assert.match(ui,/typed !== preview\.cups/);
  assert.match(ui,/window\.confirm\(/);
  assert.match(ui,/p_expected_signature:preview\.signature/);
  assert.match(ui,/result\.client_deleted/);
  assert.match(index,/history-supply-purge\.js\?v=[a-f0-9]{12}/);
});
