'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261127150000_admin_purge_supply_v1.sql'),'utf8');
const ui=fs.readFileSync(path.join(root,'history-supply-purge.js'),'utf8');
const portfolio=fs.readFileSync(path.join(root,'client-archive-integrated.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('default RPC is preview-only and checks administrator from database',()=>{
 assert.match(sql,/p_execute boolean default false/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/active=true and role::text='admin'/);
 assert.match(sql,/raise exception 'not_authorized'/);
 assert.match(sql,/if not p_execute then/);
 assert.match(sql,/mode','preview'/);
 assert.match(sql,/grant execute on function public\.admin_purge_supply_v1.*to authenticated/);
 assert.match(sql,/revoke all on function public\.admin_purge_supply_v1.*from public,anon,authenticated/);
});
test('deletion requires exact CUPS, fresh preview and cascades details only inside target supply',()=>{
 assert.match(sql,/p_confirm_cups.*is distinct from v_supply\.cups/s);
 assert.match(sql,/p_expected_signature.*<>v_signature/);
 assert.match(sql,/delete from private\.history_change_reviews where supply_id=p_supply_id/);
 for(const table of ['incidents','recommendations','supply_events','invoices','supplies'])
  assert.match(sql,new RegExp('delete from public\\.'+table+' where (supply_id|id)=p_supply_id'));
 assert.match(sql,/delete from public\.holders where id=v_holder\.id/);
 assert.match(sql,/not exists\(select 1 from public\.supplies where holder_id=v_holder\.id\)/);
 assert.doesNotMatch(sql,/delete from public\.clients/i);
});
test('portfolio-only buttons use canonical supply IDs and administrator checks',()=>{
 assert.match(portfolio,/integratePurgeButtons\(\)/);
 assert.match(portfolio,/holder-supply-row\[data-history-supply-id\]/);
 assert.match(portfolio,/dataset\.historySupplyId/);
 assert.match(portfolio,/dataset\.id/);
 assert.match(portfolio,/isAdmin\(\)/);
 assert.match(portfolio,/IBTAdminPurge\.purgeSupply/);
 assert.match(portfolio,/IBTAdminPurge\.purgeClient/);
 assert.doesNotMatch(ui,/historyPurgeSupply/);
 assert.match(ui,/window\.ibtCurrentProfile\?\.role === 'admin'/);
 assert.match(ui,/window\.confirm\(/);
 assert.match(ui,/window\.prompt\(/);
 assert.match(ui,/typed!==confirmation/);
 assert.match(ui,/p_expected_signature:preview\.signature/);
 assert.match(ui,/p_execute:false/);
 assert.match(ui,/p_execute:true/);
 assert.match(index,/history-supply-purge\.js\?v=[a-f0-9]{12}/);
});
