'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const formats=require('../invoice-formats.js');
const iberdrola=require('../iberdrola-parser-v3.js');
const source=file=>fs.readFileSync(file,'utf8');

test('production loads the portable Iberdrola parser before every runtime consumer',()=>{
  const html=source('index.html');
  const parser=html.indexOf('iberdrola-parser-v3.js?v=');
  const app=html.indexOf('app.js?v=');
  const master=html.indexOf('supply-enricher-v2.js?v=');
  assert(parser>=0,'Iberdrola v3 parser script missing');
  assert(!html.includes('iberdrola-parser-hardening.js?v='),'legacy hardening must not run in production');
  assert(!html.includes('iberdrola-parser-v2.js?v='),'legacy v2 must not run in production');
  assert(app>parser,'main parser must load after Iberdrola v3');
  assert(master>parser,'master enricher must load after Iberdrola v3');
  assert(html.includes('auth-bootstrap.js?v='));
  assert(source('auth-bootstrap.js').includes('xtra-history.js?v='));
});

test('main parser routes Iberdrola before legacy formats and before FENIE OCR fallback',()=>{
  const app=source('app.js');
  const route=app.indexOf('const iberdrola=window.IBTIberdrolaParser');
  const legacy=app.indexOf('const formats=window.IBTInvoiceFormats',route);
  assert(route>=0&&legacy>route);
  const fileRoute=app.indexOf('if(window.IBTIberdrolaParser?.detect?.(original))return parseInvoice(original,file)');
  const ocr=app.indexOf('const fallback=window.IBTFenieOcrFallback',fileRoute);
  assert(fileRoute>=0&&ocr>fileRoute,'Iberdrola must never enter the FENIE OCR fallback');
  assert(app.includes("if(format==='fenie')return parseFenie(d,file)"));
  assert(app.includes("if(format==='endesa')return formats.parseEndesa(d,file"));
});

test('master and history consume the shared parser instead of duplicating Iberdrola billing rules',()=>{
  const master=source('supply-enricher-v2.js'),history=source('xtra-history.js');
  assert(master.includes('function parseIberdrolaSupply(pages,file)'));
  assert(master.includes('parser?.parse?.({pages,text},file'));
  assert(master.includes("format==='iberdrola'?parseIberdrolaSupply(pages,file)"));
  assert(master.includes("retailer:row.retailer||'IBERDROLA CLIENTES, S.A.U.'"));
  assert(history.includes('function extractIberdrola(d,file)'));
  assert(history.includes("if(iberdrola?.detect?.(d.text))return extractIberdrola(d,file)"));
  assert(history.includes("prepared=iberdrola?.detect?.(source.text)?{data:source,attempted:false,error:null}"));
  assert(history.includes("const validated=/Correcta/i.test(ui.status)&&ui.balance==='OK'"));
  assert(history.includes("retailer:row.retailer||'IBERDROLA CLIENTES, S.A.U.'"));
});

test('Iberdrola detector remains isolated from Endesa and FENIE detection',()=>{
  const ib='IBERDROLA CLIENTES, S.A.U. RESUMEN DE FACTURA TOTAL IMPORTE FACTURA Peaje de acceso a la red (ATR): 3.0TD';
  const en='Endesa Energía, S.A. Unipersonal Nº factura: P26CON000000001';
  const fe='FENIE ENERGIA Razón Social: DEMO Periodo Facturación: 01/01/2026 - 31/01/2026 Término de potencia';
  assert.equal(iberdrola.detect(ib),true);
  assert.equal(iberdrola.detect(en),false);
  assert.equal(iberdrola.detect(fe),false);
  assert.equal(formats.detect(en),'endesa');
  assert.equal(formats.detect(fe),'fenie');
  assert.equal(formats.detect(ib),'unknown','legacy detector must not be broadened to Iberdrola');
});

test('Iberdrola historical persistence stays fail closed behind the validated main row',()=>{
  const history=source('xtra-history.js');
  const start=history.indexOf('async function persistOne');
  const end=history.indexOf('async function renderSummary',start);
  const persist=history.slice(start,end);
  const crosscheck=persist.indexOf("const validated=/Correcta/i.test(ui.status)&&ui.balance==='OK'");
  const reject=persist.indexOf("if(!validated)return {skipped:true,reason:'crosscheck_failed'}");
  const write=persist.indexOf("supabase.rpc('upsert_xtra_energy_history'");
  assert(crosscheck>=0&&reject>crosscheck&&write>reject);
  assert(persist.includes('same(ui.kwh,x.kwh,.02)'));
  assert(persist.includes('same(ui.energy,x.energy)'));
  assert(persist.includes('same(ui.power,x.power)'));
  assert(persist.includes('same(ui.total,x.total)'));
});