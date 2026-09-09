'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('xtra-history.js','utf8');
const beforePdf=source.slice(0,source.indexOf('async function readPdf')).replace(/^import[^\n]*\n/gm,'').replace(/^pdfjsLib\.GlobalWorkerOptions[^\n]*\n/gm,'');
const ctx={document:{querySelector:()=>null},Number,Math,String,RegExp};
vm.createContext(ctx);
vm.runInContext(beforePdf+'\nglobalThis.api={status,euros,excessRows,reactiveRows,taxRows,rightsDetail};',ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
test('Completeness states distinguish missing, not applicable and unreliable data',()=>{
 assert.equal(ctx.api.status('dato',false),'extracted');
 assert.equal(ctx.api.status('',false),'not_present');
 assert.equal(ctx.api.status('',true),'unreliable');
 for(const state of ['extracted','not_present','not_applicable','unreliable','needs_review'])assert(source.includes("'"+state+"'"));
});
test('Period excess detail keeps measured kW, unit price and exact amount',()=>{
 const rows=plain(ctx.api.excessRows(['P1: 2,50 x 3,20 = 8,00 €','P2: 0,00 x 3,20 = 0,00 €']));
 assert.deepEqual(rows,[{period:1,excess_kw:2.5,unit_price:3.2,amount_eur:8},{period:2,excess_kw:0,unit_price:3.2,amount_eur:0}]);
});
test('Reactive detail keeps source quantities, cos phi, unit price and amount',()=>{
 const rows=plain(ctx.api.reactiveRows(['P1: 120,00 kVArh 0,95 20,00 kVArh x 0,041554 € / kVArh = 0,83 €']));
 assert.deepEqual(rows,[{period:1,reactive_kvarh:120,consumption_kvarh:120,cos_phi:.95,excess_kvarh:20,unit_price_eur_kvarh:.041554,amount_eur:.83}]);
});
test('Multiple tax lines remain separate instead of being collapsed',()=>{
 const rows=plain(ctx.api.taxRows(['IVA Reducido 10,00 % s/ 100,00 = 10,00 €','IVA 21,00 % s/ 50,00 = 10,50 €']));
 assert.equal(rows.length,2);assert.equal(rows[0].rate_pct,10);assert.equal(rows[0].taxable_base_eur,100);assert.equal(rows[0].amount_eur,10);assert.equal(rows[1].rate_pct,21);assert.equal(rows[1].amount_eur,10.5);
});
test('Monetary extraction never mistakes unit prices for billed euros',()=>{
 const values=plain(ctx.api.euros('0,123456 €/kWh 0,20 €/kWh = 15,47 €'));
 assert.deepEqual(values,[15.47]);
});
test('Distributor rights keep explicit detail and surface any unknown residual',()=>{
 const one=plain(ctx.api.rightsDetail(['Derechos Actuación Equipos Distribuidora (R.D. 1048/2013, Art. 29). 9,04 €'],9.04));
 assert.equal(one.status,'extracted');assert.equal(one.items.length,1);assert.equal(one.items[0].amount_eur,9.04);
 const truncated=plain(ctx.api.rightsDetail(['Derechos de Verificación Distribuidora (R.D. 1048/2013, Art. 29). (8,01€).Derechos de Extensión Distribuidora (R.D.','1048/2013, Art. 25). (39,09€).Derechos Actuación Equipos Distribuidora (R.D. 1048/2013, Art. 29). (9,04€).Derechos de 91,43 €'],91.43));
 assert.equal(truncated.status,'needs_review');assert.equal(truncated.items.length,4);
 assert.equal(truncated.items.at(-1).concept,'Derecho distribuidora no identificado');assert.equal(truncated.items.at(-1).amount_eur,35.29);
 assert(!source.includes('adjustments.push(...rights.items)'));
 assert(source.includes('distributor_rights:rights.status'));
});
test('Structured payload carries completeness detail and never carries PDF bytes or filenames',()=>{
 const start=source.indexOf('const payload={'),end=source.indexOf("const {data,error}=await",start);assert(start>=0&&end>start);const payload=source.slice(start,end);
 for(const required of ['issue_date:x.issueDate','source_holder_name:x.holderName','source_holder_tax_id:x.holderTaxId','source_supply_address:x.sourceSupplyAddress','access_contract_number:x.accessContract','contract_number:x.contract','contract_type:x.contractType','contract_end_date:x.contractEndDate','meter_number:x.meterNumber','completeness_assessment_status:x.assessment','source_completeness:x.completeness','energy_periods:x.energyPeriods','power_periods:x.powerPeriods','maximeters:x.maximeterRows','excess_periods:x.excessPeriods','reactive_periods:x.reactivePeriods','tax_lines:x.taxLines','distributor_rights:x.distributorRights','adjustments:x.adjustments'])assert(payload.includes(required),required);
 for(const forbidden of [/file\.name/,/arrayBuffer/,/getDocument/,/rawPages/,/filename/i])assert(!forbidden.test(payload),String(forbidden));
});
test('Automatic history write cannot bypass the validated main parser row',()=>{
 const start=source.indexOf('async function persistOne'),end=source.indexOf('async function renderSummary',start);const persist=source.slice(start,end);assert(start>=0&&end>start);
 for(const check of ["/Correcta/i.test(ui.status)","ui.balance==='OK'","same(ui.kwh,x.kwh,.02)","same(ui.energy,x.energy)","same(ui.power,x.power)","same(ui.excess,x.excess)","same(ui.reactive,x.reactive)","same(ui.total,x.total)"])assert(persist.includes(check),check);
 assert(persist.indexOf('if(!validated)return')<persist.indexOf("supabase.rpc('upsert_xtra_energy_history'"));
});
test('2.0TD reactive absence is not fabricated as zero measured reactive detail',()=>{
 assert(source.includes("const reactiveApplicable=!/^2\\.0TD$/i.test(tariff);"));
 assert(source.includes("reactiveApplicable?'unreliable':'not_applicable'"));
});
