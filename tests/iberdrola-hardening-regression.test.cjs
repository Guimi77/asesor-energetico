'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const base=require('../iberdrola-parser.js');
const hardened=require('../iberdrola-parser-hardening.js');
const d=(...pages)=>({pages,text:pages.flat().join('\n')});

function carlaFragmentedLayout(){
  return d([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO','CARLA FERRERO MALOW','Titular Potencia: C/ DE LA LLUM, 5','CARLA FERRERO MALOW Potencia punta: 5,75 kW','Potencia valle: 5,75 kW','Dirección de suministro:','C/ DE LA LLUM, 5 07190','ESPORLES (ILLES BALEARS)','Nº DE CONTRATO: 633501753','Euskadi RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: Nº FACTURA:','domicilio 22/06/2026 - 19/07/2026 21260727010128461','Madrid; DIAS FACTURADOS: FECHA DE EMISIÓN:','27 27 de julio de 2026','ENERGÍA 101,36 €','DESCUENTOS ENERGÍA -10,84 €','CARGOS NORMATIVOS 0,62 €','SERVICIOS Y OTROS CONCEPTOS 0,72 €','IVA 19,29 €','TOTAL 111,15 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA',
    'Potencia facturada Punta 5,75 kW x 27 días','texto auxiliar de maquetación','x 0,108192 €/kW día 16,80 €',
    'Valle 5,75 kW x 27 días','texto auxiliar de maquetación','x 0,050658 €/kW día 7,86 €',
    'Total importe potencia hasta 19/07/2026 24,66 €',
    'Energía consumida 485,91 kWh','texto auxiliar de maquetación','x 0,148729 €/kWh 72,27 €',
    'Descuento sobre consumo 15% 15 % s/72,27 € -10,84 €','CARGOS NORMATIVOS',
    'Financiación bono social fijo (22/06/2026-30/06/2026) 8 días x 0,019121 €/día 0,15 €',
    'Financiación bono social fijo (30/06/2026-19/07/2026) 19 días x 0,024688 €/día 0,47 €',
    'Impuesto sobre electricidad (*) 5,11269632 % s/86,71 €','texto auxiliar de maquetación','4,43 €','TOTAL ENERGÍA 91,14 €',
    'SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 27 días x 0,02663014 €/día 0,72 €','TOTAL SERVICIOS Y OTROS CONCEPTOS 0,72 €',
    'IMPORTE TOTAL 91,86 €','IVA (*) 21 % s/91,86 € 19,29 €','TOTAL IMPORTE FACTURA 111,15 €',
    'NIF titular del contrato: 47647341N','Peaje de acceso a la red (ATR): 2.0TD','Fecha final del contrato: 19/02/2027','Empresa distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.','Número de contrato de acceso: 500023491391 Otros 0,0%','Identificación punto de suministro (CUPS): ES 0031 5001 6491 5001 GV','Forma de pago: DOMICILIACION BANCARIA',
    'Las lecturas desagregadas según la tarifa de acceso, tomadas el 19/07/2026 son: punta: 1.413,79 kWh; llano: 986,75 kWh; valle 1.564,68 kWh, siendo','estas lecturas reales. Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.','Las potencias máximas demandadas en el último año han sido 3,48 kW en P1 (punta) y 3,59 kW en P2 (valle).'
  ]);
}

function dianaFragmentedLayout(){
  return d([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO','DIANA MARIA CHRISTINA VINCES CABADA','Titular C/ CAN GAMUNDI, 17-., LC 18','DIANA MARIA CHRISTINA VINCES','5448, CABADA 07199 PALMA DE MALLORCA (ILLES BALEARS)','Dirección de suministro:','Bizkaia,','C/ CAN GAMUNDI, 17-., LC 18','de PALMA 07199 PALMA DE','Mercantil MALLORCA (ILLES BALEARS)','Nº DE CONTRATO: 957890618','Euskadi RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: Nº FACTURA:','domicilio 27/04/2026 - 31/05/2026 21260608010256253','Madrid; DIAS FACTURADOS: FECHA DE EMISIÓN:','34 8 de junio de 2026','ENERGÍA 81,80 €','DESCUENTOS ENERGÍA -1,71 €','CARGOS NORMATIVOS 0,65 €','SERVICIOS Y OTROS CONCEPTOS 12,07 €','IVA 19,49 €','TOTAL 112,30 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA',
    'Potencia facturada P1 16 kW x 34 días','texto auxiliar de maquetación','x 0,057502 €/kW día 31,28 €',
    'P2 16 kW x 34 días','texto auxiliar de maquetación','x 0,029962 €/kW día 16,30 €',
    'P3 16 kW x 34 días','texto auxiliar de maquetación','x 0,012647 €/kW día 6,88 €',
    'P4 16 kW x 34 días','texto auxiliar de maquetación','x 0,010967 €/kW día 5,97 €',
    'P5 16 kW x 34 días','texto auxiliar de maquetación','x 0,007094 €/kW día 3,86 €',
    'P6 16 kW x 34 días','texto auxiliar de maquetación','x 0,00407 €/kW día 2,21 €',
    'Total importe potencia hasta 31/05/2026 66,50 €',
    'Energía consumida P2 28 kWh','texto auxiliar de maquetación','x 0,198752 €/kWh 5,57 €',
    'P3 14 kWh','texto auxiliar de maquetación','x 0,172594 €/kWh 2,42 €',
    'P4 6 kWh','texto auxiliar de maquetación','x 0,150296 €/kWh 0,90 €',
    'P5 2 kWh','texto auxiliar de maquetación','x 0,131956 €/kWh 0,26 €',
    'P6 15 kWh','texto auxiliar de maquetación','x 0,147973 €/kWh 2,22 €',
    'Total 65 kWh hasta 31/05/2026 11,37 €','Descuento sobre consumo 15% 15 % s/11,37 € -1,71 €','CARGOS NORMATIVOS','Financiación bono social fijo 34 días x 0,019121 €/día 0,65 €','Impuesto sobre electricidad (*) 5,11269632 % s/76,81 €','texto auxiliar de maquetación','3,93 €','TOTAL ENERGÍA 80,74 €','SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 34 días x 0,35506849 €/día 12,07 €','TOTAL SERVICIOS Y OTROS CONCEPTOS 12,07 €','IMPORTE TOTAL 92,81 €','IVA 21 % s/92,81 € 19,49 €','TOTAL IMPORTE FACTURA 112,30 €',
    '300209449 Energía activa P1 27/04/2026 4.648 31/05/2026 4.648 0 kWh','300209449 Energía activa P2 27/04/2026 4.783 31/05/2026 4.811 28 kWh','300209449 Energía activa P3 27/04/2026 3.125 31/05/2026 3.139 14 kWh','300209449 Energía activa P4 27/04/2026 3.902 31/05/2026 3.908 6 kWh','300209449 Energía activa P5 27/04/2026 1.846 31/05/2026 1.848 2 kWh','300209449 Energía activa P6 27/04/2026 15.845 31/05/2026 15.860 15 kWh'
  ],[
    '300209449 Energía reactiva P6 27/04/2026 157 31/05/2026 160 3 kVArh','300209449 Maxímetro P1 27/04/2026 0 31/05/2026 0 0 kW','300209449 Maxímetro P2 27/04/2026 0 31/05/2026 1 1 kW','300209449 Maxímetro P3 27/04/2026 0 31/05/2026 0 0 kW','300209449 Maxímetro P4 27/04/2026 0 31/05/2026 0 0 kW','300209449 Maxímetro P5 27/04/2026 0 31/05/2026 0 0 kW','300209449 Maxímetro P6 27/04/2026 0 31/05/2026 0 0 kW','Última lectura: real','Peaje de acceso a la red (ATR): 3.0TD','Potencia contratada (kW): 16 / 16 / 16 / 16 / 16 / 16 Bono Social 0,6%','Empresa distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.','Número de contrato de acceso: 500021702758','Identificación punto de suministro (CUPS): ES 0031 5007 4475 7001 LB','Forma de pago: DOMICILIACION BANCARIA'
  ]);
}

function assertFixed(r,expected){
  const diagnostic=JSON.stringify({readOk:r.readOk,company:r.company,cups:r.cups,period:r.period,tariff:r.tariff,kwh:r.kwh,energy:r.energy,power:r.power,other:r.other,tax:r.tax,vat:r.vat,total:r.total,accounted:r.accounted,diff:r.diff,readMessage:r.readMessage,powerDetail:r.powerDetail,hardeningRevision:r.hardeningRevision});
  assert.equal(r.readOk,true,diagnostic);
  assert.equal(r.balanced,true);
  assert.equal(r.diff,0);
  assert.equal(r.kwh,expected.kwh);
  assert.equal(r.energy,expected.energy);
  assert.equal(r.power,expected.power);
  assert.equal(r.other,expected.other);
  assert.equal(r.tax,expected.tax);
  assert.equal(r.vat,expected.vat);
  assert.equal(r.total,expected.total);
  assert.equal(r.hardeningRevision,'2026.09.17.2');
}

test('Carla: the hardening adapter recovers a valid 2.0TD invoice when PDF.js fragments formulas with unrelated text',()=>{
  const doc=carlaFragmentedLayout();
  const before=base.parse(doc,{name:'carla.pdf'});
  assert.equal(before.company,'CARLA FERRERO MALOW');
  assert.equal(before.cups,'ES0031500164915001GV');
  assert.equal(before.tariff,'2.0TD');
  assert.equal(before.total,111.15);
  assert.equal(before.readOk,false);
  const r=hardened.parse(doc,{name:'carla.pdf'});
  assertFixed(r,{kwh:485.91,energy:72.27,power:24.66,other:-9.50,tax:4.43,vat:19.29,total:111.15});
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption],[175.87,137.31,172.73]);
});

test('Diana: the hardening adapter recovers six power and energy periods without accepting an unbalanced reconstruction',()=>{
  const doc=dianaFragmentedLayout();
  const before=base.parse(doc,{name:'diana.pdf'});
  assert.equal(before.company,'DIANA MARIA CHRISTINA VINCES CABADA');
  assert.equal(before.cups,'ES0031500744757001LB');
  assert.equal(before.tariff,'3.0TD');
  assert.equal(before.total,112.30);
  assert.equal(before.readOk,false);
  const r=hardened.parse(doc,{name:'diana.pdf'});
  assertFixed(r,{kwh:65,energy:11.37,power:66.50,other:11.01,tax:3.93,vat:19.49,total:112.30});
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption,r.periods.P4.consumption,r.periods.P5.consumption,r.periods.P6.consumption],[0,28,14,6,2,15]);
  assert.deepEqual([r.contracted.P1,r.contracted.P2,r.contracted.P3,r.contracted.P4,r.contracted.P5,r.contracted.P6],[16,16,16,16,16,16]);
});
