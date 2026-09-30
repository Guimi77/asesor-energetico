'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const parser=require('../som-energia-parser.js');

function sample(){
  const p1=[
    'Som Energia, SCCL',
    'Comercialitzadora del Mercat Lliure',
    'DADES DE LA FACTURA',
    'IMPORT DE LA FACTURA: 54,35 €',
    'Núm. de factura: FE2600000001',
    'Data de la factura: 14/05/2026',
    'Període facturat: del 01/04/2026 al 30/04/2026',
    'Núm. de contracte: 600000001',
    'Adreça de subministrament: C/ EJEMPLO, 1 07001 (PALMA)',
    'DADES DE LA TITULARITAT',
    'Nom del / de la titular del contracte: CLIENTE PRUEBA ALFA',
    'NIF/CIF: 00000001R',
    'Número de comptador: 300000001',
    'Tipus Detall de lectures Punta Pla Vall',
    'Total periode 999 999 999'
  ];
  const p2=[
    'DADES DEL CONTRACTE',
    'Empresa distribuïdora: EDISTRIBUCIÓN REDES DIGITALES S. L.',
    'Núm. contracte distribuïdora: 500000000001',
    'DETALL DE LA FACTURA',
    'Concepte Detall Punta Pla Vall Total conceptes IVA',
    'Facturació per potencia contractada',
    'Potència contractada [kW] 5,75 5,75',
    'Preu potència contractada [€/kW i any] 29,934 2,955',
    'kW x €/kW x (30/365) dies (del 01/04/2026 al 30/04/2026) 14,15 € 1,40 € 15,55 € 10%',
    'Facturació per electricitat utilitzada',
    'Electricitat utilitzada [kWh] (real) 85,41 33,39 89,58',
    'Preu energia [€/kWh] 0,229 0,153 0,125',
    'kWh x €/kWh (del 01/04/2026 al 30/04/2026) 19,56 € 5,11 € 11,20 € 35,87 € 10%',
    'TOTAL FACTURA 54,35 €',
    'Potència contractada (kW): Punta: 5,75 - Vall:5,75',
    'Peatge de transport i distribució: 2.0TD',
    'CUPS: ES0000000000000001AA0F',
    'CNAE: 9820',
    'Data final del contracte: 15/11/2026 sense condicions de permanència',
    'Autoproducció tipus: Amb excedents acollits a compensació',
    'CAU (Codi d’autoconsum unificat): ES0000000000000002AA0FA000'
  ];
  return {pages:[p1,p2],text:[...p1,...p2].join('\n')};
}

test('detector Som Energia es estricto y no captura documentos informativos ni otras comercializadoras',()=>{
  assert.equal(parser.detect(sample()),true);
  assert.equal(parser.detect({text:'Som Energia, SCCL informació cooperativa i Flux Solar'}),false);
  assert.equal(parser.detect({text:'Endesa Energía S.A.U. DADES DE LA FACTURA DETALL DE LA FACTURA CUPS: ES0000000000000001AA'}),false);
  assert.equal(parser.detect({text:'FENIE ENERGÍA DADES DE LA FACTURA DETALL DE LA FACTURA CUPS: ES0000000000000001AA'}),false);
});

test('fase mínima extrae identidad, suministro, consumo, potencia y total sin usar lecturas auxiliares',()=>{
  const r=parser.parse(sample(),{name:'som-demo.pdf'},{parserVersion:'test'});
  assert.equal(r.readOk,true,r.readMessage);
  assert.equal(r.sourceFormat,'som-energia');
  assert.equal(r.sourceVariant,'som-2.0td-autoconsum-2026');
  assert.equal(r.supplierLegalType,'cooperative');
  assert.equal(r.invoiceNumber,'FE2600000001');
  assert.equal(r.company,'CLIENTE PRUEBA ALFA');
  assert.equal(r.taxId,'00000001R');
  assert.equal(r.cups,'ES0000000000000001AA0F');
  assert.equal(r.period,'01/04/2026 - 30/04/2026 (30 días)');
  assert.equal(r.tariff,'2.0TD');
  assert.equal(r.kwh,208.38);
  assert.equal(r.energy,35.87);
  assert.equal(r.power,15.55);
  assert.equal(r.total,54.35);
  assert.equal(r.periods.P1.consumption,85.41);
  assert.equal(r.periods.P2.consumption,33.39);
  assert.equal(r.periods.P3.consumption,89.58);
  assert.equal(r.periods.P1.price,0.229);
  assert.equal(r.periods.P3.cost,11.20);
  assert.deepEqual(r.contracted,{P1:5.75,P2:5.75});
  assert.equal(r.accessContract,'500000000001');
  assert.equal(r.distributor,'EDISTRIBUCIÓN REDES DIGITALES S. L.');
  assert.equal(r.supplyCity,'PALMA');
  assert.equal(r.supplyProvince,'');
  assert.equal(r.powerDetail.reliable,true);
  assert.equal(r.powerDetail.entries.length,2);
  assert.equal(r.powerDetail.entries[0].amount,14.15);
  assert.equal(r.powerDetail.entries[0].annualPrice,29.934);
  assert.ok(Math.abs(r.powerDetail.entries[0].dailyPrice-(29.934/365))<1e-12);
  assert.equal(r.readingStatus,'actual');
  assert.equal(r.validation.stage,'minimal');
});

test('detalle económico alimenta Otros/descuentos y mantiene el cuadre visible',()=>{
  const d=sample();
  const i=d.pages[1].indexOf('TOTAL FACTURA 54,35 €');
  d.pages[1].splice(i,0,
    'Bo social 30 dies x 0,006282 €/dia 0,19 € 10%',
    'Compensació','per','electricitat','excedentària',
    'Electricitat excedentària [kWh] -37,42 -40,55 -29,93',
    'Preu energia [€/kWh] 0,03 0,03 0,03',
    'kWh x €/kWh (del 01/04/2026 al 30/04/2026) -1,12 € -1,22 € -0,9 € -3,24 €',
    'Impost de',"l'electricitat",'48,37 € x 0,5%','0,24 € 10%',
    'Lloguer de','comptador','30 dies x 0,02663 €/dia 0,80 € 10%',
    'IVA 10% 49,41 € (BASE IMPOSABLE) 4,94 €'
  );
  d.text=d.pages.flat().join('\n');
  const r=parser.parse(d,{name:'economic.pdf'});
  assert.equal(r.readOk,true,r.readMessage);
  assert.equal(r.other,0.99);
  assert.equal(r.compensation,-3.24);
  assert.equal(r.other+r.compensation,-2.25);
  assert.equal(r.accounted,54.35);
  assert.equal(r.balanced,true);
});

test('prioriza NIF/CIF del titular y no el CIF de la cooperativa',()=>{
  const r=parser.parse(sample(),{name:'holder.pdf'});
  assert.equal(r.taxId,'00000001R');
});

test('falla cerrado si desaparecen los consumos facturados P1-P3',()=>{
  const d=sample();
  d.pages[1]=d.pages[1].filter(x=>!x.startsWith('Electricitat utilitzada [kWh]'));
  d.text=d.pages.flat().join('\n');
  const r=parser.parse(d,{name:'missing-periods.pdf'});
  assert.equal(r.readOk,false);
  assert.match(r.readMessage,/consum/i);
});

test('interpreta el punto como miles solo cuando no hay coma decimal',()=>{
  assert.equal(parser._test.numEs('12.345'),12345);
  assert.equal(parser._test.numEs('2.954,94'),2954.94);
  assert.equal(parser._test.numEs('-3,24'),-3.24);
});
