'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../iberdrola-parser.js');

const d=(p1,p2,p3=[])=>({pages:[p1,p2,p3],text:[...p1,...p2,...p3].join('\n')});

function realLayoutFixture(){
  const p1=[
    'FACTURA DE ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CIF A-95758389','CONTRATO','Titular','CLIENTE PRUEBA','APELLIDO DOS',
    'Dirección de suministro:','C/ EJEMPLO, 17, LC 18','PALMA 07199 PALMA DE','MALLORCA (ILLES BALEARS)','Nº DE CONTRATO: 957890618','RESUMEN DE FACTURA',
    'PERIODO DE FACTURACIÓN:','27/04/2026 - 31/05/2026','Nº FACTURA:','21260608010256253','DIAS FACTURADOS:','34','FECHA DE EMISIÓN:','8 de junio de 2026',
    'ENERGÍA 81,80 €','DESCUENTOS ENERGÍA -1,71 €','CARGOS NORMATIVOS 0,65 €','SERVICIOS Y OTROS CONCEPTOS 12,07 €','IVA 19,49 €','TOTAL 112,30 €'
  ];
  const p2=[
    'DETALLE DE FACTURA','ENERGÍA','Potencia facturada',
    'P1 16 kW x 34 días x 0,057502 €/kW día 31,28 €','P2 16 kW x 34 días x 0,029962 €/kW día 16,30 €','P3 16 kW x 34 días x 0,012647 €/kW día 6,88 €','P4 16 kW x 34 días x 0,010967 €/kW día 5,97 €','P5 16 kW x 34 días x 0,007094 €/kW día 3,86 €','P6 16 kW x 34 días x 0,00407 €/kW día 2,21 €','Total importe potencia hasta 31/05/2026 66,50 €',
    'Energía consumida','P2 28 kWh x 0,198752 €/kWh 5,57 €','P3 14 kWh x 0,172594 €/kWh 2,42 €','P4 6 kWh x 0,150296 €/kWh 0,90 €','P5 2 kWh x 0,131956 €/kWh 0,26 €','P6 15 kWh x 0,147973 €/kWh 2,22 €','Total 65 kWh hasta 31/05/2026 11,37 €',
    'Descuento sobre consumo 15% 15 % s/11,37 € -1,71 €','Financiación bono social fijo 34 días x 0,019121 €/día 0,65 €','Impuesto sobre electricidad (*) 5,11269632 % s/76,81 € 3,93 €','Alquiler equipos medida 34 días x 0,35506849 €/día 12,07 €','IVA 21 % s/92,81 € 19,49 €','TOTAL IMPORTE FACTURA 112,30 €',
    '300209449 Energía activa P1 27/04/2026 4.648 31/05/2026 4.648 0 kWh','300209449 Energía activa P2 27/04/2026 4.783 31/05/2026 4.811 28 kWh','300209449 Energía activa P3 27/04/2026 3.125 31/05/2026 3.139 14 kWh','300209449 Energía activa P4 27/04/2026 3.902 31/05/2026 3.908 6 kWh','300209449 Energía activa P5 27/04/2026 1.846 31/05/2026 1.848 2 kWh','300209449 Energía activa P6 27/04/2026 15.845 31/05/2026 15.860 15 kWh',
    '300209449 Energía capacitiva P1 27/04/2026 499 31/05/2026 499 0 kVArh','300209449 Energía capacitiva P2 27/04/2026 884 31/05/2026 890 6 kVArh','300209449 Energía capacitiva P3 27/04/2026 897 31/05/2026 899 2 kVArh','300209449 Energía capacitiva P4 27/04/2026 1.093 31/05/2026 1.094 1 kVArh','300209449 Energía capacitiva P5 27/04/2026 563 31/05/2026 563 0 kVArh','300209449 Energía capacitiva P6 27/04/2026 4.953 31/05/2026 4.954 1 kVArh',
    '300209449 Energía reactiva P1 27/04/2026 256 31/05/2026 256 0 kVArh','300209449 Energía reactiva P2 27/04/2026 495 31/05/2026 496 1 kVArh','300209449 Energía reactiva P3 27/04/2026 248 31/05/2026 249 1 kVArh','300209449 Energía reactiva P4 27/04/2026 286 31/05/2026 286 0 kVArh','300209449 Energía reactiva P5 27/04/2026 288 31/05/2026 288 0 kVArh'
  ];
  const p3=[
    '300209449 Energía reactiva P6 27/04/2026 157 31/05/2026 160 3 kVArh',
    '300209449 Maxímetro P1 27/04/2026 0 31/05/2026 0 0 kW','300209449 Maxímetro P2 27/04/2026 0 31/05/2026 1 1 kW','300209449 Maxímetro P3 27/04/2026 0 31/05/2026 0 0 kW','300209449 Maxímetro P4 27/04/2026 0 31/05/2026 0 0 kW','300209449 Maxímetro P5 27/04/2026 0 31/05/2026 0 0 kW','300209449 Maxímetro P6 27/04/2026 0 31/05/2026 0 0 kW',
    'Última lectura: real','Nº contador: 300209449','Peaje de acceso a la red (ATR): 3.0TD','Potencia contratada (kW): 16 / 16 / 16 / 16 / 16 / 16','Fecha final del contrato: 25/08/2027','Permanencia: Si (Fecha fin 05/09/2026)','Empresa distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.','Número de contrato de acceso: 500021702758','Identificación punto de suministro (CUPS): ES 0031 5007 4475 7001 LB','Forma de pago: DOMICILIACION BANCARIA'
  ];
  return d(p1,p2,p3);
}

function browserGroupedDianaFixture(){
  const p1=['FACTURA DE ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO jg PDF','DIANA MARIA CHRISTINA VINCES CABADA','Titular C/ CAN GAMUNDI, 17-., LC 18','PALMA','DIANA MARIA CHRISTINA VINCES','CABADA 07199 PALMA DE MALLORCA (ILLES BALEARS)','Dirección de suministro:','C/ CAN GAMUNDI, 17-., LC 18','PALMA 07199 PALMA DE','MALLORCA (ILLES BALEARS)','Nº DE CONTRATO: 957890618','RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: Nº FACTURA:','27/04/2026 - 31/05/2026 21260608010256253','DIAS FACTURADOS: FECHA DE EMISIÓN:','34 8 de junio de 2026','EMPRESA RESPONSABLE. Controla tu consumo energético con nuestro'];
  const p2=['DETALLE DE FACTURA','ENERGÍA','Potencia facturada P1 16 kW x 34 días x 0,057502 €/kW día 31,28 €','P2 16 kW x 34 días x 0,029962 €/kW día 16,30 €','P3 16 kW x 34 días x 0,012647 €/kW día 6,88 €','P4 16 kW x 34 días x 0,010967 €/kW día 5,97 €','P5 16 kW x 34 días x 0,007094 €/kW día 3,86 €','P6 16 kW x 34 días x 0,00407 €/kW día 2,21 €','Total importe potencia hasta 31/05/2026 66,50 €','Energía consumida P2 28 kWh x 0,198752 €/kWh 5,57 €','P3 14 kWh x 0,172594 €/kWh 2,42 €','P4 6 kWh x 0,150296 €/kWh 0,90 €','P5 2 kWh x 0,131956 €/kWh 0,26 €','P6 15 kWh x 0,147973 €/kWh 2,22 €','Total 65 kWh hasta 31/05/2026 11,37 €','Descuento sobre consumo 15% 15 % s/11,37 € -1,71 €','CARGOS NORMATIVOS','Financiación bono social fijo 34 días x 0,019121 €/día 0,65 €','Impuesto sobre electricidad (*) 5,11269632 % s/76,81 € 3,93 €','Alquiler equipos medida 34 días x 0,35506849 €/día 12,07 €','IVA 21 % s/92,81 € 19,49 €','TOTAL IMPORTE FACTURA 112,30 €'];
  const p3=['Última lectura: real','Peaje de acceso a la red (ATR): 3.0TD','Potencia contratada (kW): 16 / 16 / 16 / 16 / 16 / 16','Identificación punto de suministro (CUPS): ES 0031 5007 4475 7001 LB'];
  return d(p1,p2,p3);
}

function browserGroupedCarlaFixture(){
  const p1=['FACTURA DE ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO','Titular Potencia: C/ DE LA LLUM, 5','CARLA FERRERO MALOW Potencia punta: 5,75 kW','Potencia valle: 5,75 kW','Dirección de suministro:','C/ DE LA LLUM, 5 07190','ESPORLES (ILLES BALEARS)','Nº DE CONTRATO: 633501753','RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN:','22/06/2026 - 19/07/2026','Nº FACTURA:','21260727010128461','DIAS FACTURADOS:','27','FECHA DE EMISIÓN:','27 de julio de 2026','Puede encontrar el desglose detallado de los conceptos facturados'];
  const p2=['DETALLE DE FACTURA','ENERGÍA','Potencia facturada Punta 5,75 kW x 27 días x 0,108192 €/kW día 16,80 €','Valle 5,75 kW x 27 días x 0,050658 €/kW día 7,86 €','Total importe potencia hasta 19/07/2026 24,66 €','Energía consumida 485,91 kWh x 0,148729 €/kWh 72,27 €','Descuento sobre consumo 15% 15 % s/72,27 € -10,84 €','CARGOS NORMATIVOS','Financiación bono social fijo (22/06/2026-30/06/2026) 8 días x 0,019121 €/día 0,15 €','Financiación bono social fijo (30/06/2026-19/07/2026) 19 días x 0,024688 €/día 0,47 €','Impuesto sobre electricidad (*) 5,11269632 % s/86,71 € 4,43 €','Alquiler equipos medida 27 días x 0,02663014 €/día 0,72 €','IVA (*) 21 % s/91,86 € 19,29 €','TOTAL IMPORTE FACTURA 111,15 €','Peaje de acceso a la red (ATR): 2.0TD','Identificación punto de suministro (CUPS): ES 0031 5001 6491 5001 GV','Las lecturas desagregadas según la tarifa de acceso, tomadas el 19/07/2026 son: punta: 1.413,79 kWh; llano: 986,75 kWh; valle 1.564,68 kWh, siendo estas lecturas reales. Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.'];
  return d(p1,p2,[]);
}

test('Iberdrola detector is conservative and does not steal Endesa/FENIE/unknown invoices',()=>{
  assert.equal(api.detect(realLayoutFixture().text),true);
  assert.equal(api.detect('Endesa Energía, S.A. Unipersonal Nº factura P26CON0001'),false);
  assert.equal(api.detect('FENIE ENERGIA Razón Social: DEMO Periodo Facturación: 01/01/2026 - 31/01/2026'),false);
  assert.equal(api.detect('IBERDROLA CLIENTES, S.A.U. publicidad sin factura'),false);
});

test('Iberdrola 3.0TD real layout parses identity, P1-P6, contract data and exact economic balance',()=>{
  const r=api.parse(realLayoutFixture(),{name:'iberdrola-demo.pdf'},{parserVersion:'TEST'});
  assert.equal(r.sourceFormat,'iberdrola');
  assert.equal(r.invoiceNumber,'21260608010256253');
  assert.equal(r.company,'CLIENTE PRUEBA APELLIDO DOS');
  assert.equal(r.taxId,'');
  assert.equal(r.cups,'ES0031500744757001LB');
  assert.equal(r.period,'27/04/2026 - 31/05/2026 (34 días)');
  assert.equal(r.tariff,'3.0TD');
  assert.equal(r.kwh,65);
  assert.equal(r.energy,11.37);
  assert.equal(r.power,66.50);
  assert.equal(r.discounts,-1.71);
  assert.equal(r.social,0.65);
  assert.equal(r.rental,12.07);
  assert.equal(r.other,11.01);
  assert.equal(r.tax,3.93);
  assert.equal(r.vat,19.49);
  assert.equal(r.total,112.30);
  assert.equal(r.accounted,112.30);
  assert.equal(r.diff,0);
  assert.equal(r.balanced,true);
  assert.equal(r.readOk,true);
  assert.equal(r.periods.P1.consumption,0);
  assert.equal(r.periods.P1.cost,0);
  assert.equal(r.periods.P1.price,null);
  assert.deepEqual([r.periods.P2.consumption,r.periods.P3.consumption,r.periods.P4.consumption,r.periods.P5.consumption,r.periods.P6.consumption],[28,14,6,2,15]);
  assert.deepEqual([r.contracted.P1,r.contracted.P2,r.contracted.P3,r.contracted.P4,r.contracted.P5,r.contracted.P6],[16,16,16,16,16,16]);
  assert.deepEqual([r.maximeters.P1,r.maximeters.P2,r.maximeters.P3,r.maximeters.P4,r.maximeters.P5,r.maximeters.P6],[0,1,0,0,0,0]);
  assert.equal(r.maximeters._reliable,true);
  assert.equal(r.reactive,0);
  assert.deepEqual(r.reactivePeriods,{P1:0,P2:1,P3:1,P4:0,P5:0,P6:3});
  assert.equal(r.contract,'957890618');
  assert.equal(r.accessContract,'500021702758');
  assert.equal(r.distributor,'EDISTRIBUCIÓN REDES DIGITALES S.L.U.');
  assert.equal(r.renewalDate,'25/08/2027');
  assert.equal(r.meterNumber,'300209449');
  assert.equal(r.readingStatus,'actual');
  assert.equal(r.supplyCity,'PALMA DE MALLORCA');
  assert.equal(r.supplyProvince,'ILLES BALEARS');
  assert.match(r.opportunity,/potencia sobredimensionada/i);
});

test('Iberdrola refuses to mark a row correct when the energy subtotal stops matching its periods',()=>{
  const fixture=realLayoutFixture();
  const line=fixture.pages[1].findIndex(x=>/^P6 15 kWh/i.test(x));
  fixture.pages[1][line]='P6 15 kWh x 0,147973 €/kWh 3,22 €';
  fixture.text=fixture.pages.flat().join('\n');
  const r=api.parse(fixture,{name:'broken.pdf'});
  assert.equal(r.readOk,false);
  assert.match(r.readMessage,/coste de energía(?: por periodos)?/i);
});

test('browser grouped Diana cannot turn Spanish prose into CUPS or marketing into holder',()=>{
  const r=api.parse(browserGroupedDianaFixture(),{name:'diana.pdf'});
  assert.equal(r.company,'DIANA MARIA CHRISTINA VINCES CABADA');
  assert.equal(r.cups,'ES0031500744757001LB');
  assert.equal(r.power,66.50);
  assert.equal(r.energy,11.37);
  assert.equal(r.social,0.65);
  assert.equal(r.other,11.01);
  assert.equal(r.accounted,112.30);
  assert.equal(r.diff,0);
  assert.equal(r.readingStatus,'actual');
  assert.equal(r.readOk,true);
  assert.equal(r.periods.P1.consumption,0);
  assert.equal(r.periods.P1.cost,0);
});

test('browser grouped Carla 2.0TD keeps single-rate energy, both powers and both social-bonus lines',()=>{
  const r=api.parse(browserGroupedCarlaFixture(),{name:'carla.pdf'});
  assert.equal(r.company,'CARLA FERRERO MALOW');
  assert.equal(r.cups,'ES0031500164915001GV');
  assert.equal(r.kwh,485.91);
  assert.equal(r.energy,72.27);
  assert.equal(r.power,24.66);
  assert.equal(r.contracted.P1,5.75);
  assert.equal(r.contracted.P2,5.75);
  assert.equal(r.social,0.62);
  assert.equal(r.other,-9.50);
  assert.equal(r.accounted,111.15);
  assert.equal(r.diff,0);
  assert.equal(r.readingStatus,'actual');
  assert.equal(r.readOk,true);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption],[175.87,137.31,172.73]);
});
