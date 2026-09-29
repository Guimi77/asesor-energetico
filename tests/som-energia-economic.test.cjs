'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const parser=require('../som-energia-parser.js');

const detail=[
'Bo social 30 dies x 0,006282 €/dia 0,19 €',
'Compensació','per','electricitat','excedentària',
'Electricitat excedentària [kWh] -37,42 -40,55 -29,93',
'Preu energia [€/kWh] 0,03 0,03 0,03',
'kWh x €/kWh (periode prova) -1,12 € -1,22 € -0,9 € -3,24 €',
'Impost de',"l'electricitat",'48,37 € x 0,5%','0,24 €',
'Lloguer de','comptador','30 dies x 0,02663 €/dia 0,80 €',
'IVA 10% 49,41 € (BASE IMPOSABLE) 4,94 €',
'TOTAL FACTURA 54,35 €'
].join('\n');

test('detalle económico Som Energia cuadra sin ajuste REE',()=>{
 const lines=detail.split('\n');
 const r=parser._test.parseFinancials(detail,lines,{energy:35.87},{total:15.55});
 assert.equal(r.social,0.19);
 assert.equal(r.compensation.total,-3.24);
 assert.equal(r.tax,0.24);
 assert.equal(r.rental,0.8);
 assert.equal(r.vat,4.94);
 assert.equal(r.accounted,54.35);
 assert.equal(r.diff,0);
 assert.equal(r.balanced,true);
});

test('Serveis d Ajust se conserva separado',()=>{
 const text=detail.replace('Bo social',"Serveis d'Ajust segons preu REE 3,75 €\nBo social").replace('54,35 €','58,10 €');
 const r=parser._test.parseFinancials(text,text.split('\n'),{energy:35.87},{total:15.55});
 assert.equal(r.adjustment,3.75);
 assert.equal(r.accounted,58.10);
 assert.equal(r.balanced,true);
});

test('pago público explícito se clasifica sin alterar el coste',()=>{
 const p=parser._test.parseExternalPayments(["Import abonat per l'Ajuntament: 10,00 €"]);
 assert.equal(p.length,1);
 assert.equal(p[0].amountEur,10);
});
