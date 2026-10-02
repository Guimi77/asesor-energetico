'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../history-client-export.js');
const client={id:'c',name:'Synthetic group'},holders=[{id:'h',client_id:'c',legal_name:'Company A'},{id:'h2',client_id:'c',legal_name:'Company B'},{id:'foreign',client_id:'other',legal_name:'Other client'}],supplies=[{id:'s',holder_id:'h',cups:'TEST-1'},{id:'s2',holder_id:'h2',cups:'TEST-2'},{id:'sx',holder_id:'foreign',cups:'NEVER-EXPORT'}];
const r=(id,patch={})=>({id,invoice_number:id,supply_id:'s',billing_start:'2026-01-01',billing_end:'2026-01-31',validation_status:'valid',consumption_kwh:100,total_eur:20,energy_cost_eur:10,...patch});
const input=records=>({client,holders,supplies,records});
test('Selection uses client, holder and CUPS scope, never the browser invoice table',()=>{const x=api.selection({...input([r('a'),r('b',{supply_id:'s2'}),r('c',{supply_id:'sx'})]),holderId:'h',supplyId:'s'});assert.equal(x.groups.length,1);assert.deepEqual(x.groups[0].records.map(r=>r.id),['a']);assert.equal(x.groups[0].supplies.size,1);});
test('External client rows are excluded even if present in the input',()=>{assert.deepEqual(api.selection(input([r('a'),r('c',{supply_id:'sx'})])).groups[0].records.map(r=>r.id),['a']);});
test('Date filters match historical overlap, keep whole billed periods, do not prorate',()=>{const x=api.selection({...input([r('a'),r('b',{billing_start:'2026-02-01',billing_end:'2026-02-28'})]),from:'2026-01-15',to:'2026-01-20'});assert.equal(x.groups[0].records.length,1);assert.equal(x.groups[0].records[0].total_eur,20);});
test('One-sided dates, invalid dates, reversed range and no records',()=>{assert.equal(api.selection({...input([r('a')]),to:'2026-02-01'}).groups.length,1);for(const x of [{from:'2026-02-30'},{from:'2026-02-01',to:'2026-01-01'},{from:'2027-01-01'}])assert.throws(()=>api.selection({...input([r('a')]),...x}));assert.throws(()=>api.selection(input([])));});
test('Invalid and unvalidated records fail explicitly instead of partial success',()=>{for(const patch of [{validation_status:'review'},{billing_end:null},{consumption_kwh:null},{total_eur:Infinity}])assert.throws(()=>api.selection(input([r('a'),r('b',patch)])));});
test('Duplicate ID is not counted twice, conflicting duplicate fails',()=>{assert.equal(api.selection(input([r('a'),r('a')])).groups[0].records.length,1);assert.throws(()=>api.selection(input([r('a'),r('a',{total_eur:99})])));});
test('Workbook groups by holder ID, not equal legal names',()=>{const x=api.selection({...input([r('a'),r('b',{supply_id:'s2'})]),holders:holders.map(h=>({...h,legal_name:'Same name'}))});assert.equal(x.groups.length,2);});
test('Years cannot be merged into one January',()=>{const m=api.monthly([r('a'),r('b',{billing_start:'2027-01-01',billing_end:'2027-01-31',total_eur:40})]);assert.equal(m.length,13);assert.equal(m[0].total,20);assert.equal(m[12].total,40);assert.notEqual(m[0].label,m[12].label);});
test('Monthly unit cost is weighted from exact numerical totals',()=>{const m=api.monthly([r('a'),r('b',{consumption_kwh:300,total_eur:120,energy_cost_eur:60})])[0];assert.equal(m.totalUnit,140/400);assert.equal(m.energyPrice,70/400);});
test('No data, zero consumption, zero price and credits remain distinct',()=>{const m=api.monthly([r('a',{consumption_kwh:0,total_eur:10,energy_cost_eur:0}),r('b',{billing_start:'2026-03-01',billing_end:'2026-03-31',total_eur:-5,energy_cost_eur:0})]);assert.equal(m[0].kwh,0);assert.equal(m[0].totalUnit,null);assert.equal(m[1].kwh,null);assert.equal(m[2].energyPrice,0);assert.equal(m[2].totalUnit,-.05);});
test('Missing energy values are not claimed to be zero cost',()=>{assert.equal(api.monthly([r('a',{energy_cost_eur:null})])[0].energyPrice,null);});
test('Compensated excesses stay visible in monthly data',()=>{
 const m=api.monthly([r('a',{compensation_eur:-4.42,invoice_compensation_periods:[
  {period:1,exported_kwh:47.99,unit_price_eur_kwh:.03,amount_eur:-1.44,vat_rate_pct:21},
  {period:2,exported_kwh:56.56,unit_price_eur_kwh:.03,amount_eur:-1.70,vat_rate_pct:21},
  {period:3,exported_kwh:42.53,unit_price_eur_kwh:.03,amount_eur:-1.28,vat_rate_pct:21}
 ]})])[0];
 assert.equal(m.hasCompensation,true);
 assert.equal(m.exportedKwh,147.08);
 assert.equal(m.compensation,-4.42);
});
test('Compensation detail gaps are not silently converted to zero exported kWh',()=>{
 const m=api.monthly([r('a',{compensation_eur:-4.42,invoice_compensation_periods:[]})])[0];
 assert.equal(m.hasCompensation,true);
 assert.equal(m.exportedKwh,null);
 assert.equal(m.compensation,-4.42);
});
test('Billed period descriptions preserve totals and distinguish unknown prices',()=>{const m=api.monthly([r('a',{invoice_energy_periods:[{period:1,consumption_kwh:50,energy_cost_eur:5},{period:2,consumption_kwh:50,energy_cost_eur:null}]})])[0];assert.match(m.periods,/P1: 50,00/);assert.match(m.periods,/0,100000/);assert.match(m.periods,/P2: 50,00.*precio no disponible/);assert(!m.periods.includes('P6'));});
test('Excel bimonthly single-CUPS series uses real invoice periods without fake months',()=>{
 const rows=[
  r('a',{billing_start:'2026-03-08',billing_end:'2026-05-10',billing_days:63,consumption_kwh:7328.21,total_eur:2074.69}),
  r('b',{billing_start:'2026-05-10',billing_end:'2026-07-09',billing_days:60,consumption_kwh:7943.74,total_eur:2333.42}),
  r('c',{billing_start:'2026-07-09',billing_end:'2026-09-07',billing_days:60,consumption_kwh:8602.59,total_eur:2508.44})
 ];
 const s=api.chartSeries(rows);assert.equal(s.mode,'period');assert.equal(s.cadence,'bimonthly');
 assert.deepEqual(s.points.map(x=>x.label),['08 mar - 10 may','10 may - 09 jul','09 jul - 07 sep']);
 assert.deepEqual(s.points.map(x=>x.kwh),[7328.21,7943.74,8602.59]);
});
test('Excel monthly single-CUPS series keeps the existing monthly behavior',()=>{const s=api.chartSeries([r('a'),r('b',{billing_start:'2026-02-01',billing_end:'2026-02-28'})]);assert.equal(s.mode,'monthly');assert.deepEqual(s.points.map(x=>x.key),['2026-01','2026-02']);});
test('Excel multi-CUPS summary remains monthly even when invoices are bimonthly',()=>{const s=api.chartSeries([r('a',{billing_start:'2026-01-01',billing_end:'2026-03-01',billing_days:59}),r('b',{supply_id:'s2',billing_start:'2026-01-02',billing_end:'2026-03-02',billing_days:59})]);assert.equal(s.mode,'monthly');assert.equal(s.points.at(-1).key,'2026-03');});
test('Excel source labels period-mode charts explicitly and keeps monthly mode intact',()=>{const fs=require('node:fs'),s=fs.readFileSync(__dirname+'/../history-client-export.js','utf8');assert(s.includes("byPeriod?'Consumo por periodo facturado':'Consumo mensual'"));assert(s.includes("axisHeader=series.mode==='period'?'PERIODO FACTURADO':'MES'"));assert(s.includes('Las gr\\u00e1ficas usan mes natural o periodo real seg\\u00fan la cadencia de facturaci\\u00f3n.'));});
test('Company report charts retain every stored month regardless of portfolio coverage',()=>{const months=api.monthly([r('jan-a'),r('feb-a',{billing_start:'2026-02-01',billing_end:'2026-02-28'}),r('feb-b',{supply_id:'s2',billing_start:'2026-02-01',billing_end:'2026-02-28',consumption_kwh:50,total_eur:10,energy_cost_eur:5})]);const view=api.reportCoverage(months,2);assert.equal(view.excluded,0);assert.equal(months[0].kwh,100);assert.equal(view.months[0].kwh,100);assert.equal(view.months[1].kwh,150);});
test('Input records and master are not mutated',()=>{const x=input([r('b'),r('a')]);const before=JSON.stringify(x);api.monthly(api.selection(x).groups[0].records);assert.equal(JSON.stringify(x),before);});
test('Stale session or changed filters cannot start a download',async()=>{await assert.rejects(api.exportSelection(input([r('a')]),{stillCurrent:()=>false}),/cambiado/);});
test('Export performs no PDF read, data fetching, master or persisted-data writes',()=>{const fs=require('node:fs'),s=fs.readFileSync(__dirname+'/../history-client-export.js','utf8');for(const pattern of [/getDocument\s*\(/,/\.rpc\s*\(/,/fetch\s*\(/,/localStorage/,/EnergyMaster/,/XLSX\.writeFile/,/setInterval\s*\(/,/MutationObserver/])assert(!pattern.test(s),String(pattern));});
test('History client Excel keeps total cost and adds conditional excess charts',()=>{const fs=require('node:fs'),s=fs.readFileSync(__dirname+'/../history-client-export.js','utf8');assert(s.includes("['totalUnit','Coste total \\u20ac/kWh','\\u20ac/kWh']"));assert(s.includes("['exportedKwh','Excedentes compensados','kWh']"));assert(s.includes("['compensation','Compensaci\\u00f3n econ\\u00f3mica','\\u20ac']"));assert(s.includes("'Excedentes compensados kWh','Compensaci\\u00f3n \\u20ac'"));assert(s.includes("price=key==='energyPrice'||key==='totalUnit'"));});
