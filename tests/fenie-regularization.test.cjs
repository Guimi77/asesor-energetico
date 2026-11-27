'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fenie=require('../fenie-parser.js');

// Synthetic layout only. No real invoices, CUPS, clients or bank details.
function invoice(regLines,total){
  const E='€';
  const page=[
    'FENIE ENERGIA',
    'Razón Social: EMPRESA SINTETICA',
    'Nº Factura: TEST000001',
    'CUPS: ES0000000000000000AA',
    'Tarifa: 2.0TD',
    'Periodo Facturación: 01/09/2026 - 14/09/2026 (14 días)',
    'Término de energía',
    'P1: 100,00 kWh 0,100000 '+E+'/kWh 10,00 '+E,
    'P2: 50,00 kWh 0,100000 '+E+'/kWh 5,00 '+E,
    'Término de potencia',
    'P1: 0,050000 '+E+'/kW día x 5,000 kW x 14 días = 3,50 '+E,
    'P2: 0,010000 '+E+'/kW día x 5,000 kW x 14 días = 0,70 '+E,
    '4,20 '+E,
    'Excesos de Potencia',
    ...regLines,
    'Bono social',
    'TOTAL FACTURA: '+total+' '+E
  ];
  return {pages:[page],rawPages:[[],[]],text:page.join('\n')};
}
const chargeLines=[
  'Regularización Consumo Periodo 31/03/2026 al 31/08/2026 (154,0300 €). 154,03 €',
  'Regularización Reactiva Periodo 31/03/2026 al 31/08/2026 (39,2800 €). 39,28 €'
];
test('FENIE: regularizaciones positivas son cobros, conservan su periodo y concilian',()=>{
  const d=invoice(chargeLines,'212,51');
  const row=fenie.parse(d,{name:'synthetic-positive.pdf'});
  assert.equal(row.regularizationConsumption,154.03);
  assert.equal(row.regularizationReactive,39.28);
  assert.equal(row.other,193.31);
  assert.equal(row.accounted,212.51);
  assert.equal(row.diff,0);
  assert.equal(row.readOk,true);
  assert.deepEqual(row.regularizations.map(x=>[x.category,x.direction,x.amount_eur]),[
    ['consumption_regularization','charge',154.03],
    ['reactive_adjustment','charge',39.28]
  ]);
  assert.deepEqual(row.regularizations[0].affected_period,{start:'31/03/2026',end:'31/08/2026'});
  const model=fenie.parseNormalized(d,{name:'synthetic-positive.pdf'});
  assert.equal(model.costs.accountedEur,212.51);
  assert.equal(model.adjustments.length,2);
  assert.equal(model.regularizations.length,2);
  assert.equal(model.validation.completeness.consumption_regularization,'extracted');
  assert.equal(model.validation.completeness.reactive_regularization,'extracted');
});
test('FENIE: regularizaciones negativas son abonos en factura, no devoluciones bancarias',()=>{
  const d=invoice([
    'Regularización Consumo Periodo 31/03/2026 al 31/08/2026 (-154,0300 €). -154,03 €',
    'Regularización Reactiva Periodo 31/03/2026 al 31/08/2026 (-39,2800 €). -39,28 €'
  ],'-174,11');
  const row=fenie.parse(d,{name:'synthetic-negative.pdf'});
  assert.equal(row.regularizationConsumption,-154.03);
  assert.equal(row.regularizationReactive,-39.28);
  assert.equal(row.accounted,-174.11);
  assert.equal(row.diff,0);
  assert.equal(row.readOk,true);
  assert.deepEqual(row.regularizations.map(x=>x.direction),['credit','credit']);
});
test('FENIE: regularizaciones sin importe final fiable se rechazan, no se inventan',()=>{
  const d=invoice(['Regularización Consumo Periodo 31/03/2026 al 31/08/2026 (154,0300 €).'],'19,20');
  const row=fenie.parse(d,{name:'synthetic-ambiguous.pdf'});
  assert.equal(row.regularizations.length,0);
  assert.equal(row.balanced,false);
  assert.equal(row.readOk,false);
  assert.match(row.readMessage,/importe final no identificable/);
});
test('FENIE: regularizaciones sin periodo identificable se rechazan',()=>{
  const d=invoice(['Regularización Consumo 154,03 €'],'173,23');
  const row=fenie.parse(d,{name:'synthetic-no-period.pdf'});
  assert.equal(row.regularizations.length,0);
  assert.equal(row.readOk,false);
  assert.match(row.readMessage,/periodo afectado no identificable/);
});

test('FENIE: regularización con Periodo del y fechas con guiones se lee como abono',()=>{
  const d=invoice(['Regularización Consumo Periodo del 31-08-2026 al 30-09-2026 -0,05 €'],'19,15');
  const row=fenie.parse(d,{name:'synthetic-dash-dates.pdf'});
  assert.equal(row.regularizationConsumption,-0.05);
  assert.equal(row.accounted,19.15);
  assert.equal(row.total,19.15);
  assert.equal(row.diff,0);
  assert.equal(row.balanced,true);
  assert.equal(row.readOk,true);
  assert.deepEqual(row.regularizations[0].affected_period,{start:'31/08/2026',end:'30/09/2026'});
  assert.equal(row.regularizations[0].direction,'credit');
  const model=fenie.parseNormalized(d,{name:'synthetic-dash-dates.pdf'});
  assert.equal(model.adjustments[0].amount_eur,-0.05);
  assert.equal(model.adjustments[0].direction,'credit');
  assert.equal(model.validation.readOk,true);
});
