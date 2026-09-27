'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const pricing=require('../pricing-model.js');

test('detecta tarifa fija solo con evidencia explícita',()=>{
  const r=pricing.classify('Producto Tarifa Fija 24H. Energía 0,145000 €/kWh.');
  assert.equal(r.model,'fixed');
  assert.equal(r.detection,'explicit');
  assert.equal(r.confidence,1);
  assert.ok(r.evidence.length>=1);
});

test('detecta producto estable como fijo',()=>{
  const r=pricing.classify({product:'Tarifa Estable Plus Baleares',text:'Contrato de suministro eléctrico'});
  assert.equal(r.model,'fixed');
  assert.equal(r.detection,'explicit');
});

test('detecta indexado explícito a OMIE',()=>{
  const r=pricing.classify('Modalidad de precio indexado a OMIE más margen de comercialización.');
  assert.equal(r.model,'indexed');
  assert.equal(r.detection,'explicit');
  assert.equal(r.confidence,1);
});

test('infiere indexado cuando existe fórmula de mercado más gestión',()=>{
  const r=pricing.classify('Coste energía: OMIE + pérdidas + coste de gestión.');
  assert.equal(r.model,'indexed');
  assert.equal(r.detection,'inferred');
  assert.equal(r.confidence,0.85);
});

test('detecta modalidad híbrida solo cuando se expresa como tal',()=>{
  const r=pricing.classify('Producto con parte fija y parte indexada durante el periodo contratado.');
  assert.equal(r.model,'hybrid');
  assert.equal(r.detection,'explicit');
});

test('mercado libre no significa indexado',()=>{
  const r=pricing.classify('Contrato en mercado libre. Consumo electricidad 185 kWh x 0,144972 €/kWh.');
  assert.equal(r.model,'unknown');
  assert.equal(r.detection,'unknown');
});

test('un precio unitario aislado no se considera prueba de tarifa fija',()=>{
  const r=pricing.classify('Consumo electricidad 430 kWh x 0,145681 €/kWh 62,65 €.');
  assert.equal(r.model,'unknown');
});

test('evidencias explícitas contradictorias fallan de forma segura',()=>{
  const r=pricing.classify('Tarifa fija. Condiciones adicionales: tarifa indexada.');
  assert.equal(r.model,'unknown');
  assert.equal(r.reason,'conflicting_evidence');
});

test('permite clasificación manual trazable para futura revisión staff',()=>{
  const r=pricing.classify({manualModel:'indexada',text:'Texto insuficiente'});
  assert.equal(r.model,'indexed');
  assert.equal(r.detection,'manual');
  assert.equal(r.confidence,1);
});

test('sin evidencia suficiente devuelve unknown y nunca inventa',()=>{
  const r=pricing.classify('Factura de electricidad. Total 100,00 €.');
  assert.deepEqual(
    {model:r.model,detection:r.detection,confidence:r.confidence,reason:r.reason},
    {model:'unknown',detection:'unknown',confidence:0,reason:'insufficient_evidence'}
  );
});
