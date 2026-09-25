'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {scanText}=require('../tools/scan-test-pii.js');
const {sanitizeText}=require('../tools/sanitize-parser-fixture.js');

const join=(...parts)=>parts.join('');

function realLookingFixture(){
  return [
    join('Titular del con','trato: PERSONA ','REAL APELLIDO'),
    join('NI','F: 4764','7341N'),
    join('Dirección de sumi','nistro: C/ RE','AL, 12'),
    join('CU','PS: ES0031500','164915001GV'),
    join('Nº DE CON','TRATO: 957','890618'),
    join('cliente@dominio-','real.es')
  ].join('\n');
}

test('bloquea identificadores y titular con apariencia real sin guardar una fixture real en el propio test',()=>{
  const types=new Set(scanText(realLookingFixture(),'fixture.test.cjs').map(x=>x.type));
  for(const expected of ['HOLDER','TAX_ID','ADDRESS','CUPS','DOCUMENT_ID','EMAIL']) assert.ok(types.has(expected),expected);
});

test('acepta una fixture inequívocamente sintética',()=>{
  const src=[
    'Titular del contrato: CLIENTE PRUEBA ALFA',
    'NIF: 00000001R',
    'Dirección de suministro: C/ EJEMPLO, 1',
    'CUPS: ES0000000000000001AA',
    'Nº DE CONTRATO: 600000001',
    'Nº factura: P26CON000000001',
    'cliente.prueba@example.com'
  ].join('\n');
  assert.deepEqual(scanText(src,'synthetic.test.cjs'),[]);
});

test('tolera un NIF sintético cuando un layout fragmentado lo deja tras la etiqueta de titular',()=>{
  assert.deepEqual(scanText('Titular del contrato: 00000001R','fragmented.test.cjs'),[]);
});

test('el sanitizador convierte identificadores de alta confianza a valores de prueba',()=>{
  const out=sanitizeText(realLookingFixture());
  assert.match(out,/CLIENTE PRUEBA ALFA/);
  assert.match(out,/00000001R/);
  assert.match(out,/C\/ EJEMPLO/);
  assert.match(out,/ES0000000000000000AA/);
  assert.match(out,/600000001/);
  assert.match(out,/@example\.com/);
  assert.deepEqual(scanText(out,'sanitized.test.cjs'),[]);
});
