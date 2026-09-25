'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=file=>fs.readFileSync(file,'utf8');

test('production loads Naturgy before its runtime consumers',()=>{
  const html=source('index.html');
  const parser=html.indexOf('naturgy-parser.js?v=');
  const app=html.indexOf('app.js?v=');
  const master=html.indexOf('supply-enricher-v2.js?v=');
  assert(parser>=0,'Naturgy parser script missing');
  assert(app>parser,'main parser must load after Naturgy');
  assert(master>parser,'master enricher must load after Naturgy');
});

test('main parser routes Naturgy outside the FENIE OCR fallback',()=>{
  const app=source('app.js');
  assert(app.includes('const naturgy=window.IBTNaturgyParser'));
  assert(app.includes('naturgy?.detect?.(d))return naturgy.parse'));
  assert(app.includes('window.IBTNaturgyParser?.detect?.(original)'));
  const direct=app.indexOf('window.IBTNaturgyParser?.detect?.(original)');
  const ocr=app.indexOf('const fallback=window.IBTFenieOcrFallback');
  assert(direct>=0&&ocr>direct);
});

test('master and history reuse the portable Naturgy parser',()=>{
  const master=source('supply-enricher-v2.js'),history=source('xtra-history.js');
  assert(master.includes('function parseNaturgySupply(data,file)'));
  assert(master.includes("format==='naturgy'?parseNaturgySupply(pdfData,file)"));
  assert(master.includes("retailer:row.retailer||'Naturgy Clientes, S.A.U.'"));
  assert(history.includes('function extractNaturgy(d,file)'));
  assert(history.includes('window.IBTNaturgyParser'));
  assert(history.includes("if(naturgy?.detect?.(d))return extractNaturgy(d,file)"));
  assert(history.includes("prepared=(iberdrola?.detect?.(source)||repsol?.detect?.(source)||naturgy?.detect?.(source))?{data:source,attempted:false,error:null}"));
});

test('Naturgy history remains behind the validated main-row crosscheck',()=>{
  const history=source('xtra-history.js');
  const start=history.indexOf('async function persistOne');
  const end=history.indexOf('async function renderSummary',start);
  const persist=history.slice(start,end);
  const crosscheck=persist.indexOf("const validated=/Correcta/i.test(ui.status)&&ui.balance==='OK'");
  const reject=persist.indexOf("if(!validated)return {skipped:true,reason:'crosscheck_failed'}");
  const write=persist.indexOf("supabase.rpc('upsert_xtra_energy_history'");
  assert(crosscheck>=0&&reject>crosscheck&&write>reject);
  for(const token of ['same(ui.kwh,x.kwh,.02)','same(ui.energy,x.energy)','same(ui.power,x.power)','same(ui.total,x.total)'])assert(persist.includes(token),token);
});
