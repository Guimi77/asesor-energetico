'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const parser=require('../iberdrola-parser-v3.js');

const doc=(...pages)=>({pages,text:pages.flat().join('\n')});

const carla=()=>doc([
  'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CIF A-95758389',
  'CLIENTE PRUEBA ALFA','Titular Potencia: C/ DE LA PRUEBA, 5','07190 ESPORLES (ILLES BALEARS)',
  'CLIENTE PRUEBA ALFA Potencia punta: 5,75 kW','Potencia valle: 5,75 kW',
  'Direcci ó n de suministro:','C/ DE LA PRUEBA, 5 07190','ESPORLES (ILLES BALEARS)','Nº DE CONTRATO: 600000002',
  'RESUMEN DE FACTURA','PERIODO DE FACTURACI Ó N: Nº FACTURA:','22/06/2026 - 19/07/2026 21260727010128461',
  'DIAS FACTURADOS: FECHA DE EMISI Ó N:','27 27 de julio de 2026',
  'ENERG Í A............................................................................101,36 €',
  'DESCUENTOS ENERG Í A ............................................ -10,84 €',
  'CARGOS NORMATIVOS .................................................0,62 €',
  'SERVICIOS Y OTROS CONCEPTOS...........................0,72 €',
  'IVA..........................................................................................19,29 €',
  'TOTAL','111,15 €'
],[
  'DETALLE DE FACTURA DETALLE DE FACTURA','ENERG Í A',
  'Potencia facturada Punta 5,75 kW x 27 d í as x 0,108192 € /kW d í a 16,80 €',
  'Valle 5,75 kW x 27 d í as x 0,050658 € /kW d í a 7,86 €',
  'Total importe potencia hasta 19/07/2026 24,66 €',
  'Energ í a consumida 485,91 kWh x 0,148729 € /kWh 72,27 €',
  'Descuento sobre consumo 15% 15 % s/72,27 € -10,84 €',
  'CARGOS NORMATIVOS',
  'Financiaci ó n bono social fijo (22/06/2026-30/06/2026) 8 d í as x 0,019121 € /d í a 0,15 €',
  'Financiaci ó n bono social fijo (30/06/2026-19/07/2026) 19 d í as x 0,024688 € /d í a 0,47 €',
  'Impuesto sobre electricidad (*) 5,11269632 % s/86,71 € 4,43 €',
  'TOTAL ENERG Í A 91,14 €',
  'SERVICIOS Y OTROS CONCEPTOS',
  'Alquiler equipos medida 27 d í as x 0,02663014 € /d í a 0,72 €',
  'TOTAL SERVICIOS Y OTROS CONCEPTOS 0,72 €','IMPORTE TOTAL 91,86 €',
  'IVA (*) 21 % s/91,86 € 19,29 €','TOTAL IMPORTE FACTURA 111,15 €',
  'NIF titular del contrato: 00000001R','Nº contador: 300000002',
  'Peaje de acceso a la red (ATR): 2.0TD','Fecha final del contrato: 19/02/2027',
  'N ú mero de contrato de acceso: 500000000007',
  'Identificaci ó n punto de suministro (CUPS): ES 0000 0000 0000 0002 AA',
  'Las lecturas desagregadas seg ú n la tarifa de acceso, tomadas el 19/07/2026 son: punta: 1.413,79 kWh; llano: 986,75 kWh; valle 1.564,68 kWh, siendo 16100092',
  'estas lecturas reales. Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.'
]);

const diana=()=>doc([
  'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CIF A-95758389',
  'ALICIA PRUEBA SINTETICA CLIENTE ALFA','Titular C/ VIA PRUEBA, 17-., LC 18','PALMA',
  'ALICIA PRUEBA SINTETICA CLIENTE','ALFA 07199 PALMA DE MALLORCA (ILLES BALEARS)',
  'Direcci ó n de suministro:','C/ VIA PRUEBA, 17-., LC 18','PALMA 07199 PALMA DE','MALLORCA (ILLES BALEARS)',
  'Nº DE CONTRATO: 600000001 EMPRESA SOSTENIBLE,','RESUMEN DE FACTURA',
  'PERIODO DE FACTURACI Ó N: Nº FACTURA:',
  'Calcula y reduce la huella de carbono',
  '27/04/2026 - 31/05/2026 21260608010256253',
  'de tu empresa con nuestra calculadora:',
  'DIAS FACTURADOS: FECHA DE EMISI Ó N: www.mihuellacarbono.com','34 8 de junio de 2026',
  'ENERG Í A.............................................................................81,80 €',
  'DESCUENTOS ENERG Í A .................................................-1,71 €',
  'CARGOS NORMATIVOS .................................................0,65 €',
  'SERVICIOS Y OTROS CONCEPTOS..........................12,07 €',
  'IVA..........................................................................................19,49 €',
  'TOTAL','112,30 €'
],[
  'DETALLE DE FACTURA DETALLE DE FACTURA','ENERG Í A',
  'Potencia facturada P1 16 kW x 34 d í as x 0,057502 € /kW d í a 31,28 €',
  'P2 16 kW x 34 d í as x 0,029962 € /kW d í a 16,30 €',
  'P3 16 kW x 34 d í as x 0,012647 € /kW d í a 6,88 €',
  'P4 16 kW x 34 d í as x 0,010967 € /kW d í a 5,97 €',
  'P5 16 kW x 34 d í as x 0,007094 € /kW d í a 3,86 €',
  'P6 16 kW x 34 d í as x 0,00407 € /kW d í a 2,21 €',
  'Total importe potencia hasta 31/05/2026 66,50 €',
  'Energ í a consumida P2 28 kWh x 0,198752 € /kWh 5,57 €',
  'P3 14 kWh x 0,172594 € /kWh 2,42 €','P4 6 kWh x 0,150296 € /kWh 0,90 €',
  'P5 2 kWh x 0,131956 € /kWh 0,26 €','P6 15 kWh x 0,147973 € /kWh 2,22 €',
  'Total 65 kWh hasta 31/05/2026 11,37 €',
  'Descuento sobre consumo 15% 15 % s/11,37 € -1,71 €','CARGOS NORMATIVOS',
  'Financiaci ó n bono social fijo 34 d í as x 0,019121 € /d í a 0,65 €',
  'Impuesto sobre electricidad (*) 5,11269632 % s/76,81 € 3,93 €','TOTAL ENERG Í A 80,74 €',
  'SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 34 d í as x 0,35506849 € /d í a 12,07 €',
  'TOTAL SERVICIOS Y OTROS CONCEPTOS 12,07 €','IMPORTE TOTAL 92,81 €',
  'IVA 21 % s/92,81 € 19,49 €','TOTAL IMPORTE FACTURA 112,30 €',
  '300000001 Energ í a activa P1 27/04/2026 4.648 31/05/2026 4.648 0 kWh',
  '300000001 Energ í a activa P2 27/04/2026 4.783 31/05/2026 4.811 28 kWh',
  '300000001 Energ í a activa P3 27/04/2026 3.125 31/05/2026 3.139 14 kWh',
  '300000001 Energ í a activa P4 27/04/2026 3.902 31/05/2026 3.908 6 kWh',
  '300000001 Energ í a activa P5 27/04/2026 1.846 31/05/2026 1.848 2 kWh',
  '300000001 Energ í a activa P6 27/04/2026 15.845 31/05/2026 15.860 15 kWh'
],[
  'Ú ltima lectura: real','Peaje de acceso a la red (ATR): 3.0TD',
  'Potencia contratada (kW): 16 / 16 / 16 / 16 / 16 / 16',
  'Fecha final del contrato: 25/08/2027','Permanencia: Si (Fecha fin 05/09/2026)',
  'Empresa distribuidora: EDISTRIBUCI Ó N REDES DIGITALES S.L.U.',
  'N ú mero de contrato de acceso: 500000000006',
  'Identificaci ó n punto de suministro (CUPS): ES 0000 0000 0000 0001 AA',
  'Energ í a reactiva P1 0 kVArh','Energ í a reactiva P2 1 kVArh','Energ í a reactiva P3 1 kVArh',
  'Energ í a reactiva P4 0 kVArh','Energ í a reactiva P5 0 kVArh','Energ í a reactiva P6 3 kVArh',
  'Energ í a capacitiva P1 0 kVArh','Energ í a capacitiva P2 6 kVArh','Energ í a capacitiva P3 2 kVArh',
  'Energ í a capacitiva P4 1 kVArh','Energ í a capacitiva P5 0 kVArh','Energ í a capacitiva P6 1 kVArh',
  'Max í metro P1 0 kW','Max í metro P2 1 kW','Max í metro P3 0 kW','Max í metro P4 0 kW','Max í metro P5 0 kW','Max í metro P6 0 kW'
]);

test('normaliza de forma central el artefacto real de acentos separados de PDF.js',()=>{
  assert.equal(parser._test.canonicalText('Energ í a consumida 485,91 kWh'),'Energia consumida 485,91 kWh');
  assert.equal(parser._test.canonicalText('27 d í as x 0,108192 € /kW d í a'),'27 dias x 0,108192 € /kW dia');
  assert.equal(parser._test.canonicalText('PERIODO DE FACTURACI Ó N:'),'PERIODO DE FACTURACION:');
  const items=[
    {str:'Energ',transform:[1,0,0,1,48.59,558.62]},
    {str:'í',transform:[1,0,0,1,66.94,558.62]},
    {str:'a consumida',transform:[1,0,0,1,68.44,558.62]},
    {str:'485,91 kWh x 0,148729',transform:[1,0,0,1,269.57,558.62]},
    {str:'€',transform:[1,0,0,1,339.82,558.62]},
    {str:'/kWh',transform:[1,0,0,1,344.51,558.62]},
    {str:'72,27',transform:[1,0,0,1,540.37,558.62]},
    {str:'€',transform:[1,0,0,1,557.82,558.62]}
  ];
  const row=parser._test.rowsFromItems(items)[0];
  assert.equal(row.text,'Energia consumida 485,91 kWh x 0,148729 € /kWh 72,27 €');
});

test('entrada exacta de la auditoría PDF.js #14: Carla cierra a céntimo',()=>{
  const r=parser.parse(carla(),{name:'FACTURA CLIENTE PRUEBA ALFA.pdf'});
  assert.equal(r.readOk,true,JSON.stringify(r));
  assert.equal(r.invoiceNumber,'21260727010128461');
  assert.equal(r.company,'CLIENTE PRUEBA ALFA');
  assert.equal(r.cups,'ES0000000000000002AA');
  assert.equal(r.taxId,'00000001R');
  assert.equal(r.accessContract,'500000000007');
  assert.equal(r.period,'22/06/2026 - 19/07/2026 (27 días)');
  assert.equal(r.tariff,'2.0TD');
  assert.equal(r.kwh,485.91);assert.equal(r.energy,72.27);assert.equal(r.power,24.66);
  assert.equal(r.discounts,-10.84);assert.equal(r.social,0.62);assert.equal(r.rental,0.72);
  assert.equal(r.other,-9.5);assert.equal(r.tax,4.43);assert.equal(r.vat,19.29);assert.equal(r.total,111.15);assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption],[175.87,137.31,172.73]);
});

test('entrada exacta de la auditoría PDF.js #14: Diana cierra a céntimo con P1=0 leído del contador',()=>{
  const r=parser.parse(diana(),{name:'600000001_2026-06-08-170136007639_260720_153834.pdf'});
  assert.equal(r.readOk,true,JSON.stringify(r));
  assert.equal(r.invoiceNumber,'21260608010256253','debe saltar las filas de marketing intercaladas entre cabecera y dato');
  assert.equal(r.company,'ALICIA PRUEBA SINTETICA CLIENTE ALFA');
  assert.equal(r.cups,'ES0000000000000001AA');
  assert.equal(r.distributor,'EDISTRIBUCION REDES DIGITALES S.L.U.');
  assert.equal(r.accessContract,'500000000006');
  assert.equal(r.renewalDate,'25/08/2027');
  assert.equal(r.period,'27/04/2026 - 31/05/2026 (34 días)');
  assert.equal(r.tariff,'3.0TD');
  assert.equal(r.kwh,65);assert.equal(r.energy,11.37);assert.equal(r.power,66.5);
  assert.equal(r.discounts,-1.71);assert.equal(r.social,0.65);assert.equal(r.rental,12.07);
  assert.equal(r.other,11.01);assert.equal(r.tax,3.93);assert.equal(r.vat,19.49);assert.equal(r.total,112.3);assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption,r.periods.P4.consumption,r.periods.P5.consumption,r.periods.P6.consumption],[0,28,14,6,2,15]);
  assert.deepEqual([r.periods.P1.cost,r.periods.P2.cost,r.periods.P3.cost,r.periods.P4.cost,r.periods.P5.cost,r.periods.P6.cost],[0,5.57,2.42,0.9,0.26,2.22]);
  assert.deepEqual([r.contracted.P1,r.contracted.P2,r.contracted.P3,r.contracted.P4,r.contracted.P5,r.contracted.P6],[16,16,16,16,16,16]);
  assert.deepEqual([r.maximeters.P1,r.maximeters.P2,r.maximeters.P3,r.maximeters.P4,r.maximeters.P5,r.maximeters.P6],[0,1,0,0,0,0]);
  assert.equal(r.maximeters._reliable,true);
  assert.deepEqual([r.reactivePeriods.P1,r.reactivePeriods.P2,r.reactivePeriods.P3,r.reactivePeriods.P4,r.reactivePeriods.P5,r.reactivePeriods.P6],[0,1,1,0,0,3]);
  assert.deepEqual([r.capacitivePeriods.P1,r.capacitivePeriods.P2,r.capacitivePeriods.P3,r.capacitivePeriods.P4,r.capacitivePeriods.P5,r.capacitivePeriods.P6],[0,6,2,1,0,1]);
  assert.equal(r.reactive,0,'medición de reactiva no equivale a coste facturado');
});
