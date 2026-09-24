'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../iberdrola-parser.js');
const d=(...pages)=>({pages,text:pages.flat().join('\n')});

function dianaBrowserLayout(){
  return d([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO',
    'ALICIA PRUEBA SINTETICA CLIENTE ALFA','Titular C/ VIA PRUEBA, 17-., LC 18','ALICIA PRUEBA SINTETICA CLIENTE','5448, ALFA 07199 PALMA DE MALLORCA (ILLES BALEARS)',
    'Dirección de suministro:','Bizkaia,','C/ VIA PRUEBA, 17-., LC 18','de PALMA 07199 PALMA DE','Mercantil MALLORCA (ILLES BALEARS)',
    'Nº DE CONTRATO: 600000001','Euskadi RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: Nº FACTURA:','domicilio 27/04/2026 - 31/05/2026 21260608010256253','Madrid; DIAS FACTURADOS: FECHA DE EMISIÓN:','34 8 de junio de 2026',
    'ENERGÍA 81,80 €','DESCUENTOS ENERGÍA -1,71 €','CARGOS NORMATIVOS 0,65 €','SERVICIOS Y OTROS CONCEPTOS 12,07 €','IVA 19,49 €','TOTAL 112,30 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA','Potencia facturada P1 16 kW x 34 días x 0,057502 €/kW día 31,28 €','P2 16 kW x 34 días x 0,029962 €/kW día 16,30 €','P3 16 kW x 34 días x 0,012647 €/kW día 6,88 €','P4 16 kW x 34 días x 0,010967 €/kW día 5,97 €','P5 16 kW x 34 días x 0,007094 €/kW día 3,86 €','P6 16 kW x 34 días x 0,00407 €/kW día 2,21 €',
    'Total importe potencia hasta 31/05/2026 66,50 €','Energía consumida P2 28 kWh x 0,198752 €/kWh 5,57 €','P3 14 kWh x 0,172594 €/kWh 2,42 €','P4 6 kWh x 0,150296 €/kWh 0,90 €','P5 2 kWh x 0,131956 €/kWh 0,26 €','P6 15 kWh x 0,147973 €/kWh 2,22 €','Total 65 kWh hasta 31/05/2026 11,37 €',
    'Descuento sobre consumo 15% 15 % s/11,37 € -1,71 €','Financiación bono social fijo 34 días x 0,019121 €/día 0,65 €','Impuesto sobre electricidad (*) 5,11269632 % s/76,81 € 3,93 €','TOTAL ENERGÍA 80,74 €','Alquiler equipos medida 34 días x 0,35506849 €/día 12,07 €','IVA 21 % s/92,81 € 19,49 €','TOTAL IMPORTE FACTURA 112,30 €',
    '300000001 Energía activa P1 27/04/2026 4.648 31/05/2026 4.648 0 kWh','300000001 Energía activa P2 27/04/2026 4.783 31/05/2026 4.811 28 kWh','300000001 Energía activa P3 27/04/2026 3.125 31/05/2026 3.139 14 kWh','300000001 Energía activa P4 27/04/2026 3.902 31/05/2026 3.908 6 kWh','300000001 Energía activa P5 27/04/2026 1.846 31/05/2026 1.848 2 kWh','300000001 Energía activa P6 27/04/2026 15.845 31/05/2026 15.860 15 kWh'
  ],[
    '300000001 Energía reactiva P6 27/04/2026 157 31/05/2026 160 3 kVArh','300000001 Maxímetro P1 27/04/2026 0 31/05/2026 0 0 kW','300000001 Maxímetro P2 27/04/2026 0 31/05/2026 1 1 kW','300000001 Maxímetro P3 27/04/2026 0 31/05/2026 0 0 kW','300000001 Maxímetro P4 27/04/2026 0 31/05/2026 0 0 kW','300000001 Maxímetro P5 27/04/2026 0 31/05/2026 0 0 kW','300000001 Maxímetro P6 27/04/2026 0 31/05/2026 0 0 kW',
    'Última lectura: real','Peaje de acceso a la red (ATR): 3.0TD','Potencia contratada (kW): 16 / 16 / 16 / 16 / 16 / 16 Bono Social 0,6%','Empresa distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.','Número de contrato de acceso: 500000000006','Identificación punto de suministro (CUPS): ES 0000 0000 0000 0001 AA','Forma de pago: DOMICILIACION BANCARIA'
  ]);
}

function carlaBrowserLayout(){
  return d([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO','CLIENTE PRUEBA ALFA','Titular Potencia: C/ DE LA PRUEBA, 5','CLIENTE PRUEBA ALFA Potencia punta: 5,75 kW','Potencia valle: 5,75 kW','Dirección de suministro:','C/ DE LA PRUEBA, 5 07190','ESPORLES (ILLES BALEARS)','Nº DE CONTRATO: 600000002','Euskadi RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: Nº FACTURA:','domicilio 22/06/2026 - 19/07/2026 21260727010128461','Madrid; DIAS FACTURADOS: FECHA DE EMISIÓN:','27 27 de julio de 2026','TOTAL 111,15 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA','Potencia facturada Punta 5,75 kW x 27 días x 0,108192 €/kW día 16,80 €','Valle 5,75 kW x 27 días x 0,050658 €/kW día 7,86 €','Total importe potencia hasta 19/07/2026 24,66 €','Energía consumida 485,91 kWh x 0,148729 €/kWh 72,27 €','Descuento sobre consumo 15% 15 % s/72,27 € -10,84 €','Financiación bono social fijo (22/06/2026-30/06/2026) 8 días x 0,019121 €/día 0,15 €','Financiación bono social fijo (30/06/2026-19/07/2026) 19 días x 0,024688 €/día 0,47 €','Impuesto sobre electricidad (*) 5,11269632 % s/86,71 € 4,43 €','TOTAL ENERGÍA 91,14 €','Alquiler equipos medida 27 días x 0,02663014 €/día 0,72 €','IVA (*) 21 % s/91,86 € 19,29 €','TOTAL IMPORTE FACTURA 111,15 €',
    'NIF titular del contrato: 00000001R','Peaje de acceso a la red (ATR): 2.0TD','Fecha final del contrato: 19/02/2027','Empresa distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.','Número de contrato de acceso: 500000000007 Otros 0,0%','Identificación punto de suministro (CUPS): ES 0000 0000 0000 0002 AA','Forma de pago: DOMICILIACION BANCARIA','Las lecturas desagregadas según la tarifa de acceso, tomadas el 19/07/2026 son: punta: 1.413,79 kWh; llano: 986,75 kWh; valle 1.564,68 kWh, siendo','estas lecturas reales. Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.','Las potencias máximas demandadas en el último año han sido 3,48 kW en P1 (punta) y 3,59 kW en P2 (valle).'
  ]);
}

test('3.0TD browser-style lines do not confuse neighbouring amounts with power, taxes or contracted P6',()=>{
  const r=api.parse(dianaBrowserLayout(),{name:'diana.pdf'});
  assert.equal(r.readOk,true);
  assert.equal(r.company,'ALICIA PRUEBA SINTETICA CLIENTE ALFA');
  assert.equal(r.cups,'ES0000000000000001AA');
  assert.equal(r.invoiceNumber,'21260608010256253');
  assert.equal(r.period,'27/04/2026 - 31/05/2026 (34 días)');
  assert.equal(r.power,66.50);
  assert.equal(r.energy,11.37);
  assert.equal(r.social,0.65);
  assert.equal(r.tax,3.93);
  assert.equal(r.other,11.01);
  assert.equal(r.accounted,112.30);
  assert.equal(r.diff,0);
  assert.deepEqual([r.contracted.P1,r.contracted.P2,r.contracted.P3,r.contracted.P4,r.contracted.P5,r.contracted.P6],[16,16,16,16,16,16]);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption,r.periods.P4.consumption,r.periods.P5.consumption,r.periods.P6.consumption],[0,28,14,6,2,15]);
});

test('2.0TD Iberdrola single-rate invoice parses Punta/Valle power and three energy periods without inventing period costs',()=>{
  const r=api.parse(carlaBrowserLayout(),{name:'carla.pdf'});
  assert.equal(api.detect(carlaBrowserLayout().text),true);
  assert.equal(r.readOk,true);
  assert.equal(r.company,'CLIENTE PRUEBA ALFA');
  assert.equal(r.taxId,'00000001R');
  assert.equal(r.cups,'ES0000000000000002AA');
  assert.equal(r.invoiceNumber,'21260727010128461');
  assert.equal(r.period,'22/06/2026 - 19/07/2026 (27 días)');
  assert.equal(r.tariff,'2.0TD');
  assert.equal(r.kwh,485.91);
  assert.equal(r.energy,72.27);
  assert.equal(r.power,24.66);
  assert.equal(r.discounts,-10.84);
  assert.equal(r.social,0.62);
  assert.equal(r.rental,0.72);
  assert.equal(r.other,-9.50);
  assert.equal(r.tax,4.43);
  assert.equal(r.vat,19.29);
  assert.equal(r.total,111.15);
  assert.equal(r.diff,0);
  assert.deepEqual([r.contracted.P1,r.contracted.P2],[5.75,5.75]);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption],[175.87,137.31,172.73]);
  assert.equal(r.periods.P1.cost,null);
  assert.equal(r.energyPricingMode,'single_rate');
  assert.deepEqual([r.maxDemandAnnual.P1,r.maxDemandAnnual.P2],[3.48,3.59]);
});
