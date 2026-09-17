'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../fenie-ocr-fallback.js');

const special=()=>({
  pages:[[],[
    'CUPS: ES0031500123456789AB0F',
    'Tarifa: 3.0TD',
    'Empresa Distribuidora: E-DISTRIBUCION REDES DIGITALES S.L.U.',
    'Maxímetro (kW) P1 P2 P3 P4 P5 P6',
    'Contrato Acceso: 123456789',
    'Dir. Suministro: CALLE DEMO 1',
    'Lectura 1.18.1 Consumo'
  ],['Detalle de lecturas']]
});

test('normal FENIE with readable first page never enters OCR fallback',()=>{
  const d=special();
  d.pages[0]=['FENIE ENERGIA','Razón Social: CLIENTE DEMO','Periodo Facturación: 01/07/2026 - 31/07/2026','TOTAL FACTURA 120,00 €'];
  assert.equal(api.shouldAttempt(d),false);
});

test('image-first-page FENIE with strong later-page evidence enters fallback',()=>{
  assert.equal(api.shouldAttempt(special()),true);
});

test('Endesa is explicitly excluded even if page one is sparse',()=>{
  const d=special();
  d.pages[1].push('Endesa Energía, S.A. Unipersonal','Nº factura: P26CON031576830');
  assert.equal(api.shouldAttempt(d),false);
});

test('unknown PDF with only CUPS and tariff is not guessed as FENIE',()=>{
  const d={pages:[[],['CUPS: ES0031500123456789AB0F','Tarifa: 3.0TD','Documento genérico']]};
  assert.equal(api.shouldAttempt(d),false);
});

test('OCR text only replaces first-page text and preserves later-page/raw data',()=>{
  const raw=[['raw-page-1'],['raw-page-2']],d=special();d.rawPages=raw;
  const out=api.mergeOcrText(d,'Razón Social: CLIENTE DEMO\nTOTAL FACTURA 120,00 €');
  assert.deepEqual(out.pages[0],['Razón Social: CLIENTE DEMO','TOTAL FACTURA 120,00 €']);
  assert.deepEqual(out.pages[1],d.pages[1]);
  assert.equal(out.rawPages,raw);
  assert.match(out.text,/CLIENTE DEMO/);
  assert.match(out.text,/Empresa Distribuidora/);
});

test('critical validation requires holder, CUPS, period, positive total and economic balance',()=>{
  const row={company:'CLIENTE DEMO',cups:'ES0031500123456789AB0F',period:'01/07/2026 - 31/07/2026 (30 días)',total:120,balanced:true};
  assert.equal(api.criticalRowOk(row),true);
  for(const patch of [
    {company:'Por identificar'},
    {cups:''},
    {period:'Por identificar'},
    {total:0},
    {balanced:false}
  ])assert.equal(api.criticalRowOk({...row,...patch}),false);
});

test('prepare calls OCR only for the guarded special case',async()=>{
  let calls=0;const file={name:'fenie-imagen.pdf'};
  const prepared=await api.prepare(file,special(),null,{ocr:async()=>{calls++;return 'FENIE ENERGIA\nRazón Social: CLIENTE DEMO\nPeriodo Facturación: 01/07/2026 - 31/07/2026\nTOTAL FACTURA 120,00 €';}});
  assert.equal(calls,1);assert.equal(prepared.attempted,true);assert.match(prepared.data.pages[0].join(' '),/CLIENTE DEMO/);

  const normal=special();normal.pages[0]=['FENIE ENERGIA','Razón Social: CLIENTE DEMO','Periodo Facturación: 01/07/2026 - 31/07/2026','TOTAL FACTURA 120,00 €'];
  const untouched=await api.prepare({name:'normal.pdf'},normal,null,{ocr:async()=>{calls++;return 'NO DEBE USARSE';}});
  assert.equal(untouched.attempted,false);assert.equal(calls,1);assert.equal(untouched.data,normal);
});

test('concurrent consumers share one OCR result for the same File object',async()=>{
  let calls=0;const file={name:'same.pdf'},d=special();
  const ocr=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return 'Razón Social: CLIENTE DEMO';};
  const [a,b]=await Promise.all([api.prepare(file,d,null,{ocr}),api.prepare(file,d,null,{ocr})]);
  assert.equal(calls,1);assert.equal(a.attempted,true);assert.equal(b.attempted,true);
});

test('OCR identity uses native later-page CUPS and tariff before parsing',()=>{
  const d=special();
  const out=api.mergeOcrText(d,'FENIE ENERGIA\nCUPS: ES0031500123456789ABOF\nTarifa: 2.0TD\nTOTAL FACTURA 120,00 €');
  const first=out.pages[0].join(' ');
  assert.match(first,/ES0031500123456789AB0F/);
  assert.doesNotMatch(first,/ES0031500123456789ABOF/);
  assert.match(first,/Tarifa: 3\.0TD/);
});
