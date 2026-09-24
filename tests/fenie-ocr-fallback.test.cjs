'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../fenie-ocr-fallback.js');

const special=()=>({
  pages:[[],[
    'CUPS: ES0000000000000001AA0F',
    'Tarifa: 3.0TD',
    'Empresa Distribuidora: E-DISTRIBUCION REDES DIGITALES S.L.U.',
    'Maxímetro (kW) P1 P2 P3 P4 P5 P6',
    'Contrato Acceso: 500000000009',
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
  d.pages[1].push('Endesa Energía, S.A. Unipersonal','Nº factura: P26CON000000010');
  assert.equal(api.shouldAttempt(d),false);
});

test('unknown PDF with only CUPS and tariff is not guessed as FENIE',()=>{
  const d={pages:[[],['CUPS: ES0000000000000001AA0F','Tarifa: 3.0TD','Documento genérico']]};
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
  const row={company:'CLIENTE DEMO',cups:'ES0000000000000001AA0F',period:'01/07/2026 - 31/07/2026 (30 días)',total:120,balanced:true};
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
  const out=api.mergeOcrText(d,'FENIE ENERGIA\nCUPS: ES0000000000000001AAOF\nTarifa: 2.0TD\nTOTAL FACTURA 120,00 €');
  const first=out.pages[0].join(' ');
  assert.match(first,/ES0000000000000001AA0F/);
  assert.doesNotMatch(first,/ES0000000000000001AAOF/);
  assert.match(first,/Tarifa: 3\.0TD/);
});

test('OCR excess repair restores one split period amount from the printed subtotal',()=>{
  const lines=[
    'Excesos de Potencia Exceso Precio Total 35,13 €',
    'P1: 0,00 €',
    'P2: 0,00 €',
    'P3: 20,96 €',
    'P4: 13,94 €',
    'P5: 0,00 €',
    'P6:',
    '0,23 €',
    'Energía reactiva'
  ];
  const repaired=api.repairExcessRows(lines);
  assert.match(repaired[6],/0,23 €/);
  assert.deepEqual(lines[6],'P6:','source OCR lines stay untouched');
});

test('OCR invoice number can be recovered from the supplier filename when OCR truncates it',()=>{
  const d=special();
  const out=api.mergeOcrText(
    d,
    'FENIE ENERGIA\nFactura Nº: 9\nCUPS: ES0000000000000001AA0F\nTarifa: 3.0TD\nTOTAL FACTURA 120,00 €',
    'FENIE ENERGIA SA FRA 2026000000001_ES0000000000000001AA.pdf'
  );
  assert.match(out.pages[0].join(' '),/Factura Nº: 2026000000001/);
  assert.doesNotMatch(out.pages[0].join(' '),/Factura Nº: 9\b/);
});
