'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const formats=require('../invoice-formats.js');
const sourceValidation=require('../endesa-source-validation.js');
const fix=require('../endesa-power-period-fix.js');
const api=fix.patch(sourceValidation.patch(formats,{}));
const doc=(p1,p2)=>({pages:[p1,p2],text:[...p1,...p2].join('\n')});

test('2.0TD power lines split by price dates are aggregated by power period, never by array position',()=>{
  const p1=[
    'Endesa Energía, S.A. Unipersonal.',
    'Nº factura: P26CON003522686',
    'Periodo de facturación: del 19/12/2025 a 05/01/2026 (17 días)',
    'Potencia 13,12 €','Energía 96,57 €','Otros 0,70 €','Impuestos 29,98 €','Total 140,37 €','Consumo Total 936,362 kWh'
  ];
  const p2=[
    'Titular del contrato: GUILLEM MATEU MOREY','NIF: 43156090V',
    'Dirección de suministro: DE LA PAU FTE LLORENÇ VILL 29 1, 07190 ESPORLES, LES BALEARS',
    'Potencias contratadas: punta-llano 5,600 kW; valle 5,600 kW',
    'CUPS: ES0031500560405004PY0F','Peaje de transporte y distribución: 2.0TD',
    'Pot. Punta-Llano 5,600 kW x 0,103919 Eur/kW x 12 días 6,98 €',
    'Pot. Punta-Llano 5,600 kW x 0,109221 Eur/kW x 5 días 3,06 €',
    'Pot. Valle 5,600 kW x 0,032048 Eur/kW x 12 días 2,15 €',
    'Pot. Valle 5,600 kW x 0,033088 Eur/kW x 5 días 0,93 €',
    'Impuesto electricidad ( 109,94 Eur X 5,1126963 %) 5,62 €','IVA normal 21 % s/ 116,01 24,36 €',
    'Lectura Lectura','real real','Energía kWh',
    'Punta 19.930,58 20.116,11 1,00 0,00 185,53','Llano 12.697,37 12.866,10 1,00 0,00 168,73','Valle 18.770,14 19.352,24 1,00 0,00 582,10',
    'Facturación del Consumo 650,940 kWh x 0,101309 Eur/kWh 65,95 €',
    'Facturación del Consumo 285,422 kWh x 0,107286 Eur/kWh 30,62 €'
  ];
  const r=api.parseEndesa(doc(p1,p2),{name:'P26CON003522686.pdf'});
  assert.equal(r.power,13.12);
  assert.equal(r.excess,0);
  assert.equal(r.maximeters?Object.keys(r.maximeters).filter(k=>/^P/.test(k)).length:0,0);
  assert.equal(r.powerDetail.reliable,true);
  assert.deepEqual(r.powerDetail.entries.map(e=>[e.period,e.amount]),[[1,10.04],[2,3.08]]);
  assert.equal(r.powerDetail.entries.reduce((s,e)=>s+e.amount,0),13.12);
  assert.equal(r.periods.P1.cost,null,'No se inventa un coste P1 cuando la factura solo desglosa consumo por fechas');
  assert.equal(r.energyDetail.status,'not_present');
});

test('2.0TD Endesa label P3 is normalized to the second contracted power period',()=>{
  assert.equal(fix.periodFromSource('Pot. P3 5,600 kW x 0,090214 Eur/kW x 31 días 15,66 €','2.0TD'),2);
});

test('Endesa energy detail fills P1-P3 costs and weighted prices only when kWh and subtotal reconcile',()=>{
  const periods={P1:{consumption:230.47,cost:null,price:null},P2:{consumption:225.39,cost:null,price:null},P3:{consumption:472.57,cost:null,price:null}};
  const lines=[
    'Consum Punta 134,045 kWh x 0,207309 Eur/kWh 27,79 €',
    'Consum Punta 96,425 kWh x 0,208556 Eur/kWh 20,11 €',
    'Consum Pla 119,548 kWh x 0,127850 Eur/kWh 15,28 €',
    'Consum Pla 105,847 kWh x 0,129097 Eur/kWh 13,66 €',
    'Consum Vall 313,789 kWh x 0,092405 Eur/kWh 29,00 €',
    'Consum Vall 158,774 kWh x 0,093652 Eur/kWh 14,87 €'
  ].map(formats.canonicalEndesaLine);
  const r=fix.aggregateEnergyPeriods(lines,periods,928.428,120.71);
  assert.equal(r.detail.reliable,true);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption],[230.47,225.395,472.563]);
  assert.deepEqual([r.periods.P1.cost,r.periods.P2.cost,r.periods.P3.cost],[47.9,28.94,43.87]);
  assert.ok(r.periods.P1.price>0.2073&&r.periods.P1.price<0.2086);
  assert.ok(r.periods.P2.price>0.1278&&r.periods.P2.price<0.1291);
  assert.ok(r.periods.P3.price>0.0924&&r.periods.P3.price<0.0937);
});

test('Endesa energy detail fails closed if the labelled lines do not reconcile with invoice energy',()=>{
  const periods={P1:{consumption:100,cost:null,price:null}};
  const r=fix.aggregateEnergyPeriods(['Consumo Punta 100,000 kWh x 0,200000 Eur/kWh 20,00 €'],periods,100,99);
  assert.equal(r.detail.reliable,false);
  assert.equal(r.periods.P1.cost,null);
});
