'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const guard=require('../endesa-status-consistency.js');

const baseRow=overrides=>({
  sourceFormat:'endesa',unsupported:false,company:'CLIENTE A',cups:'ES0031500529816004AV0F',
  period:'30/04/2025 - 31/05/2025 (31 días)',tariff:'3.0TD',kwh:1422,energy:197.90,power:104.35,
  total:389.37,accounted:389.37,balanced:true,readOk:false,
  readMessage:'Falta o revisar: Potencia: detalle Endesa no cuadra con el resumen',
  periods:{P1:{consumption:0},P2:{consumption:466},P3:{consumption:337},P4:{consumption:0},P5:{consumption:0},P6:{consumption:619}},
  ...overrides
});

test('A coherent 3.0TD row is correct when only the detailed power breakdown is fragmented',()=>{
  const r=guard.normalize(baseRow({}));
  assert.equal(r.readOk,true);
  assert.equal(r.readMessage,'Lectura correcta');
});

test('Estimated readings can still be parsed correctly when billing evidence is coherent',()=>{
  const r=guard.normalize(baseRow({
    company:'CLIENTE B',cups:'ES0031500151907001DN0F',period:'11/05/2026 - 04/06/2026 (24 días)',
    kwh:2853.101,energy:525.89,power:52.14,total:655.31,accounted:655.31,
    periods:{P1:{consumption:178.319},P2:{consumption:762.808},P3:{consumption:485.423},P4:{consumption:0},P5:{consumption:0},P6:{consumption:1426.55}},
    readingStatus:'estimated'
  }));
  assert.equal(r.readOk,true);
});

test('A missing CUPS stays rejected',()=>{
  assert.equal(guard.normalize(baseRow({cups:''})).readOk,false);
});

test('An unresolved monetary charge stays rejected',()=>{
  assert.equal(guard.normalize(baseRow({readMessage:'Falta o revisar: reactiva sin importe monetario identificable'})).readOk,false);
});

test('A consumption-period mismatch stays rejected',()=>{
  assert.equal(guard.normalize(baseRow({periods:{P1:{consumption:1}}})).readOk,false);
});
