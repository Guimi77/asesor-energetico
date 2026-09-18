'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../iberdrola-parser-v2.js');

function rawFromPages(pages){
  return pages.map(page=>{
    const items=[];
    page.forEach((line,row)=>{
      let x=30;
      for(const token of String(line).split(/\s+/).filter(Boolean)){
        items.push({str:token,transform:[1,0,0,1,x,800-row*12],height:10});
        x+=Math.max(8,token.length*5.2);
      }
    });
    return items;
  });
}
const doc=(...pages)=>({pages,rawPages:rawFromPages(pages),text:pages.flat().join('\n')});

function carla(){
  return doc([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO','CARLA FERRERO MALOW',
    'Titular Potencia: C/ DE LA LLUM, 5','CARLA FERRERO MALOW Potencia punta: 5,75 kW','Potencia valle: 5,75 kW',
    'Dirección de suministro:','C/ DE LA LLUM, 5 07190','ESPORLES (ILLES BALEARS)','Nº DE CONTRATO: 633501753',
    'RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: Nº FACTURA:','22/06/2026 - 19/07/2026 21260727010128461',
    'DIAS FACTURADOS: FECHA DE EMISIÓN:','27 27 de julio de 2026','ENERGÍA 101,36 €','DESCUENTOS ENERGÍA -10,84 €',
    'CARGOS NORMATIVOS 0,62 €','SERVICIOS Y OTROS CONCEPTOS 0,72 €','IVA 19,29 €','TOTAL 111,15 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA','Potencia facturada Punta 5,75 kW x 27 días x 0,108192 €/kW día 16,80 €',
    'Valle 5,75 kW x 27 días x 0,050658 €/kW día 7,86 €','Total importe potencia hasta 19/07/2026 24,66 €',
    'Energía consumida 485,91 kWh x 0,148729 €/kWh 72,27 €','Descuento sobre consumo 15% 15 % s/72,27 € -10,84 €',
    'CARGOS NORMATIVOS','Financiación bono social fijo (22/06/2026-30/06/2026) 8 días x 0,019121 €/día 0,15 €',
    'Financiación bono social fijo (30/06/2026-19/07/2026) 19 días x 0,024688 €/día 0,47 €',
    'Impuesto sobre electricidad (*) 5,11269632 % s/86,71 € 4,43 €','TOTAL ENERGÍA 91,14 €',
    'Alquiler equipos medida 27 días x 0,02663014 €/día 0,72 €','IVA (*) 21 % s/91,86 € 19,29 €',
    'TOTAL IMPORTE FACTURA 111,15 €','NIF titular del contrato: 47647341N','Peaje de acceso a la red (ATR): 2.0TD',
    'Empresa distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.','Número de contrato de acceso: 500023491391',
    'Identificación punto de suministro (CUPS): ES 0031 5001 6491 5001 GV',
    'Las lecturas desagregadas según la tarifa de acceso, tomadas el 19/07/2026 son: punta: 1.413,79 kWh; llano: 986,75 kWh; valle 1.564,68 kWh, siendo estas lecturas reales. Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.',
    'Las potencias máximas demandadas en el último año han sido 3,48 kW en P1 (punta) y 3,59 kW en P2 (valle).'
  ]);
}

function diana(){
  return doc([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO','DIANA MARIA CHRISTINA VINCES CABADA',
    'Titular C/ CAN GAMUNDI, 17-., LC 18','DIANA MARIA CHRISTINA VINCES','CABADA 07199 PALMA DE MALLORCA (ILLES BALEARS)',
    'Dirección de suministro:','C/ CAN GAMUNDI, 17-., LC 18','PALMA 07199 PALMA DE MALLORCA (ILLES BALEARS)',
    'Nº DE CONTRATO: 957890618','RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: Nº FACTURA:',
    '27/04/2026 - 31/05/2026 21260608010256253','DIAS FACTURADOS: FECHA DE EMISIÓN:','34 8 de junio de 2026',
    'ENERGÍA 81,80 €','DESCUENTOS ENERGÍA -1,71 €','CARGOS NORMATIVOS 0,65 €',
    'SERVICIOS Y OTROS CONCEPTOS 12,07 €','IVA 19,49 €','TOTAL 112,30 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA','Potencia facturada P1 16 kW x 34 días x 0,057502 €/kW día 31,28 €',
    'P2 16 kW x 34 días x 0,029962 €/kW día 16,30 €','P3 16 kW x 34 días x 0,012647 €/kW día 6,88 €',
    'P4 16 kW x 34 días x 0,010967 €/kW día 5,97 €','P5 16 kW x 34 días x 0,007094 €/kW día 3,86 €',
    'P6 16 kW x 34 días x 0,00407 €/kW día 2,21 €','Total importe potencia hasta 31/05/2026 66,50 €',
    'Energía consumida P2 28 kWh x 0,198752 €/kWh 5,57 €','P3 14 kWh x 0,172594 €/kWh 2,42 €',
    'P4 6 kWh x 0,150296 €/kWh 0,90 €','P5 2 kWh x 0,131956 €/kWh 0,26 €','P6 15 kWh x 0,147973 €/kWh 2,22 €',
    'Total 65 kWh hasta 31/05/2026 11,37 €','Descuento sobre consumo 15% 15 % s/11,37 € -1,71 €',
    'Financiación bono social fijo 34 días x 0,019121 €/día 0,65 €','Impuesto sobre electricidad (*) 5,11269632 % s/76,81 € 3,93 €',
    'TOTAL ENERGÍA 80,74 €','Alquiler equipos medida 34 días x 0,35506849 €/día 12,07 €',
    'IVA 21 % s/92,81 € 19,49 €','TOTAL IMPORTE FACTURA 112,30 €',
    '300209449 Energía activa P1 27/04/2026 4.648 31/05/2026 4.648 0 kWh',
    '300209449 Energía activa P2 27/04/2026 4.783 31/05/2026 4.811 28 kWh',
    '300209449 Energía activa P3 27/04/2026 3.125 31/05/2026 3.139 14 kWh',
    '300209449 Energía activa P4 27/04/2026 3.902 31/05/2026 3.908 6 kWh',
    '300209449 Energía activa P5 27/04/2026 1.846 31/05/2026 1.848 2 kWh',
    '300209449 Energía activa P6 27/04/2026 15.845 31/05/2026 15.860 15 kWh'
  ],[
    '300209449 Maxímetro P1 27/04/2026 0 31/05/2026 0 0 kW',
    '300209449 Maxímetro P2 27/04/2026 0 31/05/2026 1 1 kW',
    '300209449 Maxímetro P3 27/04/2026 0 31/05/2026 0 0 kW',
    '300209449 Maxímetro P4 27/04/2026 0 31/05/2026 0 0 kW',
    '300209449 Maxímetro P5 27/04/2026 0 31/05/2026 0 0 kW',
    '300209449 Maxímetro P6 27/04/2026 0 31/05/2026 0 0 kW',
    'Última lectura: real','Peaje de acceso a la red (ATR): 3.0TD','Potencia contratada (kW): 16 / 16 / 16 / 16 / 16 / 16',
    'Empresa distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.','Número de contrato de acceso: 500021702758',
    'Identificación punto de suministro (CUPS): ES 0031 5007 4475 7001 LB'
  ]);
}

function assertCarla(r){
  assert.equal(r.readOk,true); assert.equal(r.company,'CARLA FERRERO MALOW'); assert.equal(r.cups,'ES0031500164915001GV');
  assert.equal(r.tariff,'2.0TD'); assert.equal(r.kwh,485.91); assert.equal(r.energy,72.27); assert.equal(r.power,24.66);
  assert.equal(r.tax,4.43); assert.equal(r.vat,19.29); assert.equal(r.total,111.15); assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption],[175.87,137.31,172.73]);
}
function assertDiana(r){
  assert.equal(r.readOk,true); assert.equal(r.company,'DIANA MARIA CHRISTINA VINCES CABADA'); assert.equal(r.cups,'ES0031500744757001LB');
  assert.equal(r.tariff,'3.0TD'); assert.equal(r.kwh,65); assert.equal(r.energy,11.37); assert.equal(r.power,66.5);
  assert.equal(r.tax,3.93); assert.equal(r.vat,19.49); assert.equal(r.total,112.30); assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption,r.periods.P4.consumption,r.periods.P5.consumption,r.periods.P6.consumption],[0,28,14,6,2,15]);
}

test('v2 detects Iberdrola despite punctuation/line grouping and stays isolated from other suppliers',()=>{
  assert.equal(api.detect('FACTURA DE ELECTRICIDAD IBERDROLA CLIENTES S A U CONTRATO RESUMEN'),true);
  assert.equal(api.detect('Endesa Energía factura electricidad contrato'),false);
  assert.equal(api.detect('FENIE ENERGIA factura electricidad contrato'),false);
});

test('v2 parses the Carla and Diana layouts used in production',()=>{assertCarla(api.parse(carla(),{name:'carla.pdf'}));assertDiana(api.parse(diana(),{name:'diana.pdf'}));});

test('v2 can rebuild both invoices from raw PDF text items only',()=>{
  for(const [source,check] of [[carla(),assertCarla],[diana(),assertDiana]]){
    check(api.parse({pages:[],rawPages:source.rawPages,text:''},{name:'raw.pdf'}));
  }
});

test('v2 fails closed when a billed energy subtotal conflicts with the period detail',()=>{
  const source=diana();
  source.pages[1]=source.pages[1].map(line=>line.replace('Total 65 kWh hasta 31/05/2026 11,37 €','Total 65 kWh hasta 31/05/2026 12,37 €'));
  source.rawPages=rawFromPages(source.pages); source.text=source.pages.flat().join('\n');
  const r=api.parse(source,{name:'broken.pdf'});
  assert.equal(r.readOk,false);
  assert.match(r.readMessage,/coste de energía/i);
});


test('v2 loose-text fallback recovers energy when PDF.js breaks visual rows',()=>{
  const carlaLoose='DETALLE DE FACTURA ENERGÍA Potencia facturada Punta 5,75 kW x 27 días x 0,108192 €/kW día 16,80 € Valle 5,75 kW x 27 días x 0,050658 €/kW día 7,86 € Total importe potencia hasta 19/07/2026 24,66 € Energía consumida 485,91 kWh x 0,148729 €/kWh 72,27 € Descuento sobre consumo 15% 15 % s/72,27 € -10,84 € Las lecturas desagregadas son punta: 1.413,79 kWh; llano: 986,75 kWh; valle 1.564,68 kWh, siendo estas lecturas reales. Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.';
  const ce=api._test.parseEnergyText(carlaLoose,'2.0TD',{});
  assert.equal(ce.kwh,485.91);assert.equal(ce.energy,72.27);assert.equal(ce.consumptionReliable,true);assert.equal(ce.costReliable,true);
  assert.deepEqual([ce.periods.P1.consumption,ce.periods.P2.consumption,ce.periods.P3.consumption],[175.87,137.31,172.73]);

  const dianaLoose='ENERGÍA Potencia facturada P1 16 kW x 34 días x 0,057502 €/kW día 31,28 € P2 16 kW x 34 días x 0,029962 €/kW día 16,30 € P3 16 kW x 34 días x 0,012647 €/kW día 6,88 € P4 16 kW x 34 días x 0,010967 €/kW día 5,97 € P5 16 kW x 34 días x 0,007094 €/kW día 3,86 € P6 16 kW x 34 días x 0,00407 €/kW día 2,21 € Total importe potencia hasta 31/05/2026 66,50 € Energía consumida P2 28 kWh x 0,198752 €/kWh 5,57 € P3 14 kWh x 0,172594 €/kWh 2,42 € P4 6 kWh x 0,150296 €/kWh 0,90 € P5 2 kWh x 0,131956 €/kWh 0,26 € P6 15 kWh x 0,147973 €/kWh 2,22 € Total 65 kWh hasta 31/05/2026 11,37 € Descuento sobre consumo 15%';
  const de=api._test.parseEnergyText(dianaLoose,'3.0TD',{P1:0,P2:28,P3:14,P4:6,P5:2,P6:15});
  assert.equal(de.kwh,65);assert.equal(de.energy,11.37);assert.equal(de.consumptionReliable,true);assert.equal(de.costReliable,true);
});

test('v2 holder fallback takes the recipient name before the postal address, not nearby marketing copy',()=>{
  const text='IBERDROLA CLIENTES, S.A.U. CLIENTE PRUEBA APELLIDO C/ EJEMPLO, 17 CONTRATO Titular EMPRESA RESPONSABLE Consigue un negocio más eficiente con la ayuda Dirección de suministro: C/ EJEMPLO, 17';
  assert.equal(api._test.parseRecipientHolder(text),'CLIENTE PRUEBA APELLIDO');
});


test('v2 rescue reads energy from the exact Iberdrola document text when visual line reconstruction is unusable',()=>{
  const carlaText=[
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','Peaje de acceso a la red (ATR): 2.0TD',
    'Energía consumida 485,91 kWh x 0,148729 €/kWh 72,27 €',
    'Las lecturas desagregadas según la tarifa de acceso, tomadas el 19/07/2026 son: punta: 1.413,79 kWh; llano: 986,75 kWh; valle 1.564,68 kWh, siendo estas lecturas reales. Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.'
  ].join('\n');
  const ce=api._test.rescueEnergyFromDocumentText(carlaText,'2.0TD');
  assert.equal(ce.kwh,485.91);assert.equal(ce.energy,72.27);assert.equal(ce.consumptionReliable,true);assert.equal(ce.costReliable,true);
  assert.deepEqual([ce.periods.P1.consumption,ce.periods.P2.consumption,ce.periods.P3.consumption],[175.87,137.31,172.73]);

  const dianaText=[
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','Peaje de acceso a la red (ATR): 3.0TD',
    'Energía consumida P2 28 kWh x 0,198752 €/kWh 5,57 €',
    'P3 14 kWh x 0,172594 €/kWh 2,42 €',
    'P4 6 kWh x 0,150296 €/kWh 0,90 €',
    'P5 2 kWh x 0,131956 €/kWh 0,26 €',
    'P6 15 kWh x 0,147973 €/kWh 2,22 €',
    'Total 65 kWh hasta 31/05/2026 11,37 €',
    '300209449 Energía activa P1 27/04/2026 4.648 31/05/2026 4.648 0 kWh',
    '300209449 Energía activa P2 27/04/2026 4.783 31/05/2026 4.811 28 kWh',
    '300209449 Energía activa P3 27/04/2026 3.125 31/05/2026 3.139 14 kWh',
    '300209449 Energía activa P4 27/04/2026 3.902 31/05/2026 3.908 6 kWh',
    '300209449 Energía activa P5 27/04/2026 1.846 31/05/2026 1.848 2 kWh',
    '300209449 Energía activa P6 27/04/2026 15.845 31/05/2026 15.860 15 kWh'
  ].join('\n');
  const de=api._test.rescueEnergyFromDocumentText(dianaText,'3.0TD');
  assert.equal(de.kwh,65);assert.equal(de.energy,11.37);assert.equal(de.consumptionReliable,true);assert.equal(de.costReliable,true);
  assert.deepEqual([de.periods.P1.consumption,de.periods.P2.consumption,de.periods.P3.consumption,de.periods.P4.consumption,de.periods.P5.consumption,de.periods.P6.consumption],[0,28,14,6,2,15]);
  assert.deepEqual([de.periods.P1.cost,de.periods.P2.cost,de.periods.P3.cost,de.periods.P4.cost,de.periods.P5.cost,de.periods.P6.cost],[0,5.57,2.42,0.9,0.26,2.22]);
});


test('v2 2026.09.18.5 recovers Carla even when PDF.js loses the billed-energy row structure',()=>{
  const text=[
    'ENERGÍA 101,36 €',
    'Potencia facturada Punta 5,75 kW x 27 días x 0,108192 €/kW día 16,80 €',
    'Valle 5,75 kW x 27 días x 0,050658 €/kW día 7,86 €',
    'Total importe potencia hasta 19/07/2026 24,66 €',
    'Energía consumida texto-intercalado 485,91 kWh texto-intercalado 0,148729 €/kWh texto-intercalado 72,27 €',
    'Impuesto sobre electricidad (*) 5,11269632 % s/86,71 € 4,43 €',
    'Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.'
  ].join('\n');
  const e=api._test.rescueEnergyFromDocumentText(text,'2.0TD',{summaryEnergy:101.36,power:24.66,tax:4.43});
  assert.equal(e.kwh,485.91);assert.equal(e.energy,72.27);assert.equal(e.consumptionReliable,true);assert.equal(e.costReliable,true);
  assert.deepEqual([e.periods.P1.consumption,e.periods.P2.consumption,e.periods.P3.consumption],[175.87,137.31,172.73]);
});

test('v2 2026.09.18.5 completes Diana P1 as zero only when the other five periods exactly equal the printed totals',()=>{
  const text=[
    'Energía consumida P2 28 kWh x 0,198752 €/kWh 5,57 €',
    'P3 14 kWh x 0,172594 €/kWh 2,42 €',
    'P4 6 kWh x 0,150296 €/kWh 0,90 €',
    'P5 2 kWh x 0,131956 €/kWh 0,26 €',
    'P6 15 kWh x 0,147973 €/kWh 2,22 €',
    'Total 65 kWh hasta 31/05/2026 11,37 €'
  ].join('\n');
  const e=api._test.rescueEnergyFromDocumentText(text,'3.0TD',{});
  assert.equal(e.consumptionReliable,true);assert.equal(e.costReliable,true);
  assert.deepEqual([e.periods.P1.consumption,e.periods.P2.consumption,e.periods.P3.consumption,e.periods.P4.consumption,e.periods.P5.consumption,e.periods.P6.consumption],[0,28,14,6,2,15]);
  assert.deepEqual([e.periods.P1.cost,e.periods.P2.cost,e.periods.P3.cost,e.periods.P4.cost,e.periods.P5.cost,e.periods.P6.cost],[0,5.57,2.42,0.9,0.26,2.22]);
});
