'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {scanText}=require('../tools/scan-test-pii.js');
const {sanitizeText}=require('../tools/sanitize-parser-fixture.js');

test('bloquea identificadores y titular reales de una factura de prueba',()=>{
  const src=[
    'Titular del contrato: PERSONA REAL APELLIDO',
    'NIF: 47647341N',
    'Dirección de suministro: C/ REAL, 12',
    'CUPS: ES0031500164915001GV',
    'Nº DE CONTRATO: 957890618',
    'cliente@dominio-real.es'
  ].join('\n');
  const types=new Set(scanText(src,'fixture.test.cjs').map(x=>x.type));
  for(const expected of ['HOLDER','TAX_ID','ADDRESS','CUPS','DOCUMENT_ID','EMAIL']) assert.ok(types.has(expected),expected);
});

test('acepta una fixture inequívocamente sintética',()=>{
  const src=[
    'Titular del contrato: CLIENTE PRUEBA ALFA',
    'NIF: 00000001R',
    'Dirección de suministro: C/ EJEMPLO, 1',
    'CUPS: ES0000000000000001AA',
    'Nº DE CONTRATO: 600000001',
    'cliente.prueba@example.com'
  ].join('\n');
  assert.deepEqual(scanText(src,'synthetic.test.cjs'),[]);
});

test('el sanitizador convierte los identificadores de alta confianza a valores de prueba',()=>{
  const real=[
    'Titular del contrato: PERSONA REAL APELLIDO',
    'NIF: 47647341N',
    'Dirección de suministro: C/ REAL, 12',
    'CUPS: ES0031500164915001GV',
    'Nº DE CONTRATO: 957890618',
    'cliente@dominio-real.es'
  ].join('\n');
  const out=sanitizeText(real);
  assert.match(out,/CLIENTE PRUEBA ALFA/);
  assert.match(out,/00000001R/);
  assert.match(out,/C\/ EJEMPLO/);
  assert.match(out,/ES0000000000000000AA/);
  assert.match(out,/600000001/);
  assert.match(out,/@example\.com/);
  assert.deepEqual(scanText(out,'sanitized.test.cjs'),[]);
});
