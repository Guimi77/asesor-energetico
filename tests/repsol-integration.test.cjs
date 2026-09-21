'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=file=>fs.readFileSync(file,'utf8');

test('producción carga Repsol antes de app, maestro e histórico',()=>{
 const html=source('index.html');
 const parser=html.indexOf('repsol-parser.js?v='),app=html.indexOf('app.js?v='),master=html.indexOf('supply-enricher-v2.js?v=');
 assert(parser>=0);assert(app>parser);assert(master>parser);
});
test('app enruta Repsol antes del detector legacy y fuera del OCR FENIE',()=>{
 const app=source('app.js');
 const route=app.indexOf('const repsol=window.IBTRepsolParser');
 const legacy=app.indexOf('const formats=window.IBTInvoiceFormats',route);
 assert(route>=0&&legacy>route);
 assert(app.includes('window.IBTRepsolParser?.detect?.(original)'));
});
test('maestro e histórico reutilizan el parser portable Repsol',()=>{
 const master=source('supply-enricher-v2.js'),history=source('xtra-history.js');
 assert(master.includes('function parseRepsolSupply(data,file)'));
 assert(master.includes("format==='repsol'?parseRepsolSupply(pdfData,file)"));
 assert(history.includes('function extractRepsol(d,file)'));
 assert(history.includes('repsol?.detect?.(d))return extractRepsol(d,file)'));
 assert(history.includes('repsol?.detect?.(source)'));
});
test('Repsol mantiene histórico fail-closed detrás del cruce con fila principal',()=>{
 const history=source('xtra-history.js');
 const start=history.indexOf('async function persistOne');
 const end=history.indexOf('async function renderSummary',start);
 const block=history.slice(start,end);
 assert(block.includes("if(!x.powerReliable)return {skipped:true,reason:'power_detail_unreliable'}"));
 assert(block.includes("if(!validated)return {skipped:true,reason:'crosscheck_failed'}"));
 assert(block.indexOf("crosscheck_failed")<block.indexOf("supabase.rpc('upsert_xtra_energy_history'"));
});
