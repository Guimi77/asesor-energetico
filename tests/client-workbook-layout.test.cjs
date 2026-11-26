'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../client-workbook-layout.js');

test('Uses street and number but strips flat, district and postal details',()=>{
  assert.equal(api.streetAndNumber('CALLE PRUEBA FRANCA 2, 07009 PALMA'), 'Prueba Franca 2');
  assert.equal(api.streetAndNumber('Carrer de Testeu 3 3 BAJO 5, PALMA'), "de Testeu 3");
  assert.equal(api.streetAndNumber('AVENIDA DE PRUEBA 56, BAJO, 07002'), 'De Prueba 56');
  assert.equal(api.streetAndNumber('CL GREMI DE TEST 52 BAJO'), 'Gremi de Test 52');
  assert.equal(api.streetAndNumber('CN PRUEBA 1001 7 ESC A 2-2'), 'Cn Prueba 1001');
});

test('Long, illegal and duplicate street labels stay unique and Excel compatible',()=>{
  const used=new Set();
  assert.equal(api.supplySheetName({address:'CALLE PRUEBA FRANCA 2',cups:'TEST-1'},used), 'Prueba Franca 2');
  assert.equal(api.supplySheetName({address:'CALLE PRUEBA FRANCA 2',cups:'TEST-2'},used), 'Prueba Franca 2 (2)');
  const long=api.supplySheetName({address:'CARRER DE PRUEBA INDUSTRIAL INFINITA 123'},used);
  assert.ok(long.length<=31);
  assert.ok(!/[\\/\\[\\]:*?]/.test(long));
  assert.ok(api.supplySheetName({name:'RESUMEN TOTAL',cups:'TEST-3'},used)!=='RESUMEN TOTAL');
  assert.ok(api.supplySheetName({cups:'SYNTH-098765'},used).startsWith('CUPS '));
});

test('Summary is physically first, supply sheets follow, technical tabs come last',()=>{
  const all=['SUMINISTROS','PERIODOS','DETALLE P1-P6','Testeu 3','Prueba Franca 2','RESUMEN TOTAL','RECOMENDACIONES'];
  const worksheets=all.map(name=>({name,orderNo:0}));
  const wb={
    worksheets,
    getWorksheet(name){return worksheets.find(w=>w.name===name);}
  };
  const names=api.arrange(wb,['Testeu 3','Prueba Franca 2']);
  assert.deepEqual(names,['RESUMEN TOTAL','Testeu 3','Prueba Franca 2','SUMINISTROS','PERIODOS','DETALLE P1-P6','RECOMENDACIONES']);
  assert.deepEqual([...worksheets].sort((a,b)=>a.orderNo-b.orderNo).map(w=>w.name),names);
  assert.equal(wb.views[0].activeTab,0);
});
