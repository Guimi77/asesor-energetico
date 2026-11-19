'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const master=fs.readFileSync(path.join(root,'master-v2.js'),'utf8');
const pilot=fs.readFileSync(path.join(root,'supabase-xtra-pilot.js'),'utf8');
const enricher=fs.readFileSync(path.join(root,'supply-enricher-v2.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20261117125021_supply_power_profile_fields.sql'),'utf8');

test('database stores periodized contracted power plus one max contractable value',()=>{
  assert.match(migration,/add column if not exists contracted_power_kw jsonb not null default '\{\}'::jsonb/i);
  assert.match(migration,/add column if not exists max_contractable_power_kw numeric\(12,3\)/i);
  assert.match(migration,/jsonb_typeof\(contracted_power_kw\) = 'object'/i);
  assert.match(migration,/max_contractable_power_kw is null or max_contractable_power_kw >= 0/i);
});

test('power profile RPC is internal-only and fail-closed',()=>{
  assert.match(migration,/create or replace function public\.set_internal_supply_power_profile/i);
  assert.match(migration,/private\.is_internal_user\(\)/);
  assert.match(migration,/v_key !~ '\^P\[1-6\]\$'/);
  assert.match(migration,/contracted_exceeds_max_contractable/);
  assert.match(migration,/revoke all on function public\.set_internal_supply_power_profile/i);
  assert.match(migration,/grant execute on function public\.set_internal_supply_power_profile/i);
});

test('2.0 and 3.0/6.x power fields are represented without collapsing periods',()=>{
  for(let p=1;p<=6;p++) assert.match(index,new RegExp(`id="supplyPowerP${p}"`));
  assert.match(master,/p1: kwValue\(\$\('#supplyPowerP1'\)\.value\)/);
  assert.match(master,/p2: kwValue\(\$\('#supplyPowerP2'\)\.value\)/);
  for(let p=3;p<=6;p++) assert.match(master,new RegExp(`p${p}: visiblePowerPeriods >= ${p} \\? kwValue\\(\\$\\('#supplyPowerP${p}'\\)\\.value\\) : ''`));
  assert.match(master,/powerPeriodCount = \(tariff = ''\) => \/\^2\\\.0TD\$\/i\.test\(norm\(tariff\)\) \? 2 : 6/);
  assert.match(master,/Tarifa con seis periodos de potencia: P1-P6/);
  assert.match(master,/Tarifa 2\.0TD: potencia contratada P1 y P2/);
});

test('manual supply save persists power centrally before local cache mutation',()=>{
  const start=master.indexOf("$('#clientForm').onsubmit");
  const end=master.indexOf("const masterInput = $('#masterInput')",start);
  const segment=master.slice(start,end);
  const central=segment.indexOf('await persistCentralSupply');
  const power=segment.indexOf('await persistPowerProfile');
  const local=segment.indexOf('upsertSupply');
  assert.ok(central>=0);
  assert.ok(power>central);
  assert.ok(local>power);
  assert.match(segment,/contracted_exceeds_max_contractable/);
});

test('imports and validated invoices fill missing contracted power instead of overwriting it',()=>{
  assert.match(master,/persistPowerProfile\(supply\.cups, supply, \{ mode: 'fill_only', source: 'import' \}\)/);
  assert.match(enricher,/master\.persistPowerProfile\(data\.cups, data, \{ mode: 'fill_only', source: 'invoice' \}\)/);
  assert.match(migration,/when v_mode='fill_only' then v_power \|\| coalesce\(v_supply\.contracted_power_kw,'\{\}'::jsonb\)/);
});

test('central sync rehydrates power profile into the portable master model',()=>{
  assert.match(pilot,/contracted_power_kw,max_contractable_power_kw,power_profile_source/);
  for(let p=1;p<=6;p++) assert.match(pilot,new RegExp(`p${p}: supply\\.contracted_power_kw\\?\\.P${p} \\?\\? ''`));
  assert.match(pilot,/maxContractablePower: supply\.max_contractable_power_kw \?\? ''/);
  assert.match(pilot,/powerProfileSource: supply\.power_profile_source \|\| ''/);
});

test('maximum contractable power is never invented from an invoice',()=>{
  const inspect=enricher.slice(enricher.indexOf('async function inspect'),enricher.indexOf('async function inspectFiles'));
  assert.match(inspect,/persistPowerProfile\(data\.cups, data, \{ mode: 'fill_only', source: 'invoice' \}\)/);
  assert.doesNotMatch(enricher,/maxContractablePower\s*:\s*row\./);
});
