'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const BASE='1668d5ea2f8059d17e08502d83c6395db361c4bf';
const source=file=>fs.readFileSync(file,'utf8');
const old=file=>execFileSync('git',['show',BASE+':'+file],{encoding:'utf8'});
const slice=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i);return s.slice(i,j);};
const readerSpec=[['app.js','pdfData','const find='],['xtra-history.js','readPdf','function extractFenie'],['supply-enricher-v2.js','inspect','async function inspectFiles']];
function reader(code,name,end,mode='ok'){
 let opened=0,closed=0,pages=0;
 const items=[{str:'CUPS: ES0000000000000000TEST',transform:[1,0,0,1,20,400]},{str:'Razón Social: CLIENTE SINTETICO',transform:[1,0,0,1,20,420]}];
 const pdfjsLib={GlobalWorkerOptions:{},getDocument(){opened++;
  const pdf={numPages:4,async getPage(){pages++;if(mode==='page')throw Error('page');return {async getTextContent(){if(mode==='text')throw Error('text');return {items};}};}};
  return {promise:mode==='load'?Promise.reject(Error('load')):Promise.resolve(pdf),async destroy(){await Promise.resolve();closed++;}};
 }};
 const context={pdfjsLib,window:{EnergyMaster:{learnInvoice:()=>({ok:true,enriched:true})}},document:{querySelector:()=>null},console,Uint8Array,setTimeout};
 vm.createContext(context);
 const prefix=code.slice(0,code.indexOf(end)).replace(/^import[^\n]*\n/gm,'');
 vm.runInContext(prefix+'\nglobalThis.read='+name+';',context);
 return {read:context.read,stats:()=>({opened,closed,pages})};
}
const file={name:'synthetic.pdf',arrayBuffer:async()=>new ArrayBuffer(8)};
for(const [path,name,end] of readerSpec){
 test(path+' closes all 341 document tasks and preserves reader output',async()=>{
  const baseline=reader(old(path),name,end),candidate=reader(source(path),name,end);
  for(let i=0;i<341;i++){
   const expected=await baseline.read(file),actual=await candidate.read(file);
   assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));
   assert.equal(candidate.stats().closed,i+1);
  }
  assert.equal(baseline.stats().closed,0,'The previous leak must be reproduced');
  assert.equal(candidate.stats().opened,341);assert.equal(candidate.stats().closed,341);
  assert.equal(candidate.stats().pages,341*(path==='app.js'?4:3));
 });
 for(const mode of ['load','page','text'])test(path+' releases resources after '+mode+' failure',async()=>{
  const r=reader(source(path),name,end,mode);
  await assert.rejects(()=>r.read(file),new RegExp(mode));
  assert.equal(r.stats().opened,1);assert.equal(r.stats().closed,1);
 });
}
test('Fenie main calculations and unrelated persistence/auth/export code remain byte-for-byte unchanged',()=>{
 assert.equal(slice(source('app.js'),'const find=','async function process'),slice(old('app.js'),'const find=','async function process'));
 assert.equal(slice(source('app.js'),'function lines(items)','async function pdfData'),slice(old('app.js'),'function lines(items)','async function pdfData'));
 assert.equal(slice(source('app.js'),'async function process','const XL='),slice(old('app.js'),'async function process','const XL='));
 assert.equal(source('app.js').slice(source('app.js').indexOf('const XL=')),old('app.js').slice(old('app.js').indexOf('const XL=')));
 assert.equal(slice(source('supply-enricher-v2.js'),'const norm','async function inspect(file)'),slice(old('supply-enricher-v2.js'),'const norm','async function inspect(file)'));
 for(const path of ['auth.js','auth.css','parser-audit.js','history-cost-chart.js','client-report-export.js'])assert.equal(source(path),old(path),path+' must not change');
});
test('Bulk loader tracks large folders without concurrent auxiliary PDF readers',()=>{
 const s=source('bulk-performance.js');
 for(const token of [
  "const isChange = this?.id === 'fileInput' && type === 'change' && src.includes('enqueue')",
  "const isDrop = this?.id === 'dropZone' && type === 'drop' && src.includes('enqueue')",
  "historyText = 'Histórico: esperando a que termine la lectura principal…'",
  "args[0] === 'Error leyendo'",
  "'xtra-history-updated'",
  'const duplicates = Math.max(0, processed - added - readErrors)',
  'Tiempo empleado:'
 ])assert(s.includes(token),token);
 assert(s.includes('if (slot === 1)'));
 assert(s.includes('deferredHistory = () => listener.call'));
});
test('Historical completeness persistence remains fail-closed, cross-checked and PDF-free',()=>{
 const s=source('xtra-history.js');
 const persist=slice(s,'async function persistOne','async function renderSummary');
 for(const token of ["/Correcta/i.test(ui.status)","ui.balance==='OK'","same(ui.kwh,x.kwh,.02)","same(ui.energy,x.energy)","same(ui.power,x.power)","same(ui.excess,x.excess)","same(ui.reactive,x.reactive)","same(ui.total,x.total)"])assert(persist.includes(token),token);
 assert(persist.indexOf('if(!validated)return')<persist.indexOf("supabase.rpc('upsert_xtra_energy_history'"));
 const payload=persist.slice(persist.indexOf('const payload={'),persist.indexOf("const {data,error}=await"));
 for(const forbidden of [/file\.name/,/arrayBuffer/,/getDocument/,/rawPages/,/pdfData/,/filename/i])assert(!forbidden.test(payload),String(forbidden));
 for(const required of ['issue_date:x.issueDate','source_holder_name:x.holderName','source_holder_tax_id:x.holderTaxId','source_supply_address:x.sourceSupplyAddress','access_contract_number:x.accessContract','contract_number:x.contract','contract_type:x.contractType','contract_end_date:x.contractEndDate','meter_number:x.meterNumber','completeness_assessment_status:x.assessment','source_completeness:x.completeness','energy_periods:x.energyPeriods','power_periods:x.powerPeriods','maximeters:x.maximeterRows','excess_periods:x.excessPeriods','reactive_periods:x.reactivePeriods','tax_lines:x.taxLines','distributor_rights:x.distributorRights','adjustments:x.adjustments'])assert(payload.includes(required),required);
 assert(s.includes("const COMPLETENESS_VERSION='fenie-2026.09.09.2'"));
 for(const state of ["'extracted'","'not_present'","'not_applicable'","'unreliable'","'needs_review'"])assert(s.includes(state),state);
 assert(!s.includes("adjustments.push(...rights.items)"));
 assert(s.includes("distributor_rights:rights.status"));
 assert(s.includes("reactiveApplicable?'unreliable':'not_applicable'"));
});
function eventsApi(){
 const context={Map,Number,Math,String,qty:(v,d)=>Number(v).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}),esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),dateES:v=>String(v).split('-').reverse().join('/'),supplyById:()=>({supply_name:'Suministro de prueba',cups:'CUPS SINTETICO'}),holderForSupply:()=>({legal_name:'Titular de prueba'})};
 vm.createContext(context);
 vm.runInContext(slice(source('history-ui.js'),'  function comparablePowers','  function rowDetail')+'\nglobalThis.events=detectedEvents;globalThis.markup=renderContractEvent;',context);
 return context;
}
const record=(date,powers,tariff='2.0TD')=>({id:date,supply_id:'test-supply',billing_start:date,billing_end:date,invoice_number:'TEST-'+date,tariff,invoice_power_periods:powers});
test('Observed power changes have before, after, delta, identity and source periods',()=>{
 const api=eventsApi();const data=[record('2026-01-01',[{period:1,contracted_kw:3.45},{period:2,contracted_kw:3.45}]),record('2026-02-01',[{period:1,contracted_kw:5.7},{period:2,contracted_kw:5.7}])];
 const events=api.events(data);assert.equal(events.length,1);assert.equal(events[0].changes.length,2);assert.equal(events[0].changes[0].delta,2.25);
 const html=api.markup(events[0]);for(const text of ['Antes','Después','Diferencia','+2,250 kW','Suministro de prueba','Titular de prueba','Registro anterior','Registro posterior','Inicio del periodo posterior'])assert(html.includes(text),text);
 assert(source('history-ui.js').includes('Estos cambios no son recomendaciones de ahorro'));
 assert(source('history-ui.js').includes('no confirma el día exacto'));
});
test('Missing, null and ambiguous power periods never become false zero or a change',()=>{
 const api=eventsApi();
 for(const powers of [[],[{period:1,contracted_kw:null}],[{period:2,contracted_kw:7}],[{period:1,contracted_kw:5},{period:1,contracted_kw:6}]])assert.equal(api.events([record('2026-01-01',[{period:1,contracted_kw:3.45}]),record('2026-02-01',powers)]).length,0);
 assert.equal(api.events([record('2026-01-01',[]),record('2026-02-01',[],'')]).length,0);
});
test('Comparable tariff changes remain visible',()=>{
 const events=eventsApi().events([record('2026-01-01',[],'2.0TD'),record('2026-02-01',[],'3.0TD')]);
 assert.equal(events.length,1);assert.equal(events[0].changes[0].before,'2.0TD');assert.equal(events[0].changes[0].after,'3.0TD');
});
