'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const api=require('../reading-status.js');

test('Telegestion Distribuidora is a source label, not proof of an actual reading',()=>{
  const x=api.classify('Contador Nº 304199336 Telegestión Distribuidora Consumo: 0,00 0,00 0,00');
  assert.equal(x.status,'unknown');
  assert.equal(x.sourceLabel,'Telegestión Distribuidora');
});

test('Explicit estimated distributor reading is classified as estimated',()=>{
  const x=api.classify('012082116 Estimada Distribuidora Lectura Actual');
  assert.equal(x.status,'estimated');
  assert.equal(x.sourceLabel,'Estimada Distribuidora');
});

test('Explicit actual reading can be classified without inferring it from consumption',()=>{
  assert.equal(api.classify('Lectura real de la distribuidora').status,'actual');
  assert.equal(api.classify('Real Distribuidora').status,'actual');
});

test('Explicit missing distributor reading is kept separate from zero consumption',()=>{
  assert.equal(api.classify('No se dispone de lectura de la distribuidora').status,'no_distributor_reading');
  assert.equal(api.classify('La distribuidora no ha facilitado la lectura').status,'no_distributor_reading');
});

test('Ambiguous invoice text fails closed as unknown',()=>{
  const x=api.classify('Lecturas desde 01/06/2026 a 30/06/2026 Consumo 0,00 kWh');
  assert.deepEqual(x,{status:'unknown',sourceLabel:null});
});

test('Reading enrichment stays on the existing validated history path',()=>{
  const source=fs.readFileSync('xtra-history.js','utf8');
  assert.match(source,/IBTReadingStatus\?\.classify/);
  assert.match(source,/enrich_xtra_invoice_reading_status/);
  assert.match(source,/upsert_xtra_energy_history/);
  assert.equal((source.match(/getDocument\s*\(/g)||[]).length,1);
});
