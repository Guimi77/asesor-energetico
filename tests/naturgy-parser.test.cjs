'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const parser=require('../naturgy-parser.js');

const sample=`Naturgy Clientes, S.A.U. - Estás en mercado libre.
Dirección de suministro: C. DEMO 12
2 A 07001 Palma Baleares
N.º de factura: FE26000000000001
Fecha de emisión: 24/03/2026
Período electricidad:
del 18/02/2026 al 16/03/2026
N.º de referencia: 600000001
Tu Factura Tu consumo
Consumo punta real Consumo punta estimado
Consumo llano real Consumo llano estimado
Total a pagar
Consumo valle real Consumo valle estimado
55,69 €
450
300
kWh
150
Nombre: CLIENTE DEMO                    CNAE: 9820
Doc. Identidad: 00000000T
3. Detalle: cómo calculamos tu factura
Período electricidad del 18/02/2026 al 16/03/2026
Consumo electricidad 185 kWh x 0,144972 €/kWh 26,82 €
Tarifa Por Uso Luz
Contrato: Término potencia P1 5,750 kW x 27 días x 0,110283 €/kW día 17,12 €
600000002 Término potencia P2 5,750 kW x 27 días x 0,033469 €/kW día 5,20 €
27 días
Financiación de Bono Social 27 días x 0,019121 €/día 0,52 €
Subtotal 49,66 €
Impuesto electricidad 49,66 € x 0,5 % 0,25 €
Alquiler de contador 27 días x 0,026630 €/día 0,72 €
Total electricidad 50,63 €
IVA (10%) 50,63 € x 10% 5,06 €
Total a pagar 55,69 €
N.º de contador:
600000003 16/03/2026 Punta real 18.494 58 kWh
16/03/2026 Llano real 7.673 44 kWh
16/03/2026 Valle real 5.860 83 kWh
16/03/2026 Maxímetro P1 - 3,860 kW
16/03/2026 Maxímetro P2 - 2,332 kW
Las potencias máximas demandadas en el último año han sido 4,872 kW en P1 (punta) y 5,012 kW en P2 (valle).
Código CUPS: ES0000000000000001AA Potencia contratada P1: 5,750 kW
Distribuidora: EDISTRIBUCIÓN REDES DIGITALES, S.L.U. Potencia contratada P2: 5,750 kW
N.º contrato de acceso: 600000004 Segmento de cargos: 1
Peaje de transporte y distribución: 2.0TD Cuantía de peajes: 12,77 €
Cuantía de cargos: 6,55 €
Fecha final de contrato: 17/02/2027`;

test('Naturgy detector is strict and isolated',()=>{
  assert.equal(parser.detect(sample),true);
  assert.equal(parser.detect('IBERDROLA CLIENTES, S.A.U. RESUMEN DE FACTURA CUPS ES0000000000000002AA'),false);
  assert.equal(parser.detect('Repsol Comercializadora de Electricidad y Gas, S.L.U. TOTAL FACTURA CUPS ES0000000000000003AA'),false);
  assert.equal(parser.detect('Endesa Energía, S.A.U. Nº factura P26CON000000001 CUPS ES0000000000000004AA'),false);
  assert.equal(parser.detect('FENIE ENERGÍA Razón Social DEMO Periodo Facturación Término potencia'),false);
});

test('Naturgy 2.0TD maps to normalized energy model and balances',()=>{
  const r=parser.parse({text:sample},{name:'naturgy-demo.pdf'});
  assert.equal(r.sourceFormat,'naturgy');
  assert.equal(r.invoiceNumber,'FE26000000000001');
  assert.equal(r.company,'CLIENTE DEMO');
  assert.equal(r.taxId,'00000000T');
  assert.equal(r.cups,'ES0000000000000001AA');
  assert.equal(r.period,'18/02/2026 - 16/03/2026 (27 días)');
  assert.equal(r.tariff,'2.0TD');
  assert.equal(r.kwh,185);
  assert.equal(r.energy,26.82);
  assert.equal(r.power,22.32);
  assert.equal(r.tax,0.25);
  assert.equal(r.vat,5.06);
  assert.equal(r.total,55.69);
  assert.equal(r.accounted,55.69);
  assert.equal(r.diff,0);
  assert.equal(r.balanced,true);
  assert.equal(r.readOk,true);
  assert.deepEqual(Object.fromEntries(Object.entries(r.periods).map(([k,v])=>[k,v.consumption])),{P1:58,P2:44,P3:83});
  assert.deepEqual(r.contracted,{P1:5.75,P2:5.75});
  assert.equal(r.maximeters.P1,3.86);
  assert.equal(r.maximeters.P2,2.332);
  assert.equal(r.accessContract,'600000004');
  assert.equal(r.distributor,'EDISTRIBUCIÓN REDES DIGITALES, S.L.U.');
});

test('Naturgy ignores page-1 chart axis labels and uses actual reading rows',()=>{
  const r=parser.parse({text:sample},{name:'naturgy-chart-axis-demo.pdf'});
  assert.equal(r.readOk,true);
  assert.deepEqual(Object.fromEntries(Object.entries(r.periods).map(([k,v])=>[k,v.consumption])),{P1:58,P2:44,P3:83});
  assert.equal(Object.values(r.periods).reduce((sum,p)=>sum+p.consumption,0),185);
});

test('Naturgy fails closed when consumption periods do not reconcile',()=>{
  const r=parser.parse({text:sample.replace('Valle real 5.860 83 kWh','Valle real 5.860 80 kWh')},{name:'bad.pdf'});
  assert.equal(r.readOk,false);
  assert.match(r.readMessage,/consumo P1-P3/i);
});

test('Naturgy fails closed when the invoice no longer balances',()=>{
  const r=parser.parse({text:sample.replace('Total a pagar 55,69 €','Total a pagar 56,69 €')},{name:'bad-total.pdf'});
  assert.equal(r.balanced,false);
  assert.equal(r.readOk,false);
  assert.match(r.readMessage,/cuadre econ/i);
});


const catalanThreePeriod=`Naturgy Clientes, S.A.U.- Estàs al mercat lliure.
Adreça de subministrament: PSO. REI 4
BJ 07190 Esporles Baleares
Núm. de factura:
FE26390039376943
Data d'emissió: 16/10/2026
Període electricitat:
del 10/09/2026 al 13/10/2026
Núm. de referència: 2005195727
Nom: SA MOLETA CB CNAE: 9820
Doc. Identitat: E56941875
3. Detall: com calculem la teva factura
Període electricitat del 10/09/2026 al 13/10/2026
Consum electricitat punta 1.296 kWh x 0,206464 €/kWh 267,58 €
Plan Fijo Luz
Contracte: Consum electricitat pla 1.018 kWh x 0,133311 €/kWh 135,71 €
3009841506 Consum electricitat vall 1.945 kWh x 0,097973 €/kWh 190,56 €
34 dies
Terme de potència P1 13,200 kW x 34 dies x 0,122973 €/kW dia 55,19 €
Terme de potència P2 13,200 kW x 34 dies x 0,043976 €/kW dia 19,74 €
Finançament de Bo Social 34 dies x 0,024688 €/dia 0,84 €
Subtotal 669,62 €
Impost electricitat 669,62 € x 5,112696 % 34,24 €
Altres conceptes
Lloguer de comptador 34 dies x 0,044712 €/dia 1,52 €
Total Electricitat 705,38 €
IVA (21%) 705,38 € x 21% 148,13 €
Total a pagar 853,51 €
13/10/2026 Punta real 231.814 1.296 kWh
13/10/2026 Pla real 52.695 1.018 kWh
13/10/2026 Vall real 105.340 1.945 kWh
Codi CUPS: ES0031500565852001AM Potència contractada P1:13,200 kW
Distribuïdora: EDISTRIBUCIÓN REDES DIGITALES, S.L.U. Potència contractada P2:13,200 kW
Núm. contracte d'accés: 500022126636
Peatge de transport i distribució: 2.0TD
Import de peatges: 89,19 €
Import de càrrecs: 108,39 €
Data final de contracte: 13/10/2027`;

test('Naturgy Catalan 2.0TD variant is detected and fully parsed',()=>{
  assert.equal(parser.detect(catalanThreePeriod),true);
  const r=parser.parse({text:catalanThreePeriod},{name:'naturgy-catala.pdf'});
  assert.equal(r.sourceFormat,'naturgy');
  assert.equal(r.invoiceNumber,'FE26390039376943');
  assert.equal(r.company,'SA MOLETA CB');
  assert.equal(r.cups,'ES0031500565852001AM');
  assert.equal(r.kwh,4259);
  assert.equal(r.energy,593.85);
  assert.equal(r.power,74.93);
  assert.equal(r.tax,34.24);
  assert.equal(r.rental,1.52);
  assert.equal(r.total,853.51);
  assert.equal(r.diff,0);
  assert.equal(r.balanced,true);
  assert.equal(r.readOk,true);
  assert.equal(r.energyPricingMode,'period_rates');
  assert.deepEqual(Object.fromEntries(Object.entries(r.periods).map(([k,v])=>[k,[v.consumption,v.price,v.cost]])),{
    P1:[1296,0.206464,267.58],
    P2:[1018,0.133311,135.71],
    P3:[1945,0.097973,190.56]
  });
  assert.deepEqual(r.contracted,{P1:13.2,P2:13.2});
  assert.equal(r.regulatedBreakdown.tolls_eur,89.19);
  assert.equal(r.regulatedBreakdown.charges_eur,108.39);
});

test('Naturgy Catalan extra concepts remain auditable and balance',()=>{
  const text=catalanThreePeriod
    .replace('34 dies','30 dies')
    .replace(/13\/10\/2026/g,'09/09/2026')
    .replace('1.296 kWh x 0,206464 €/kWh 267,58 €','1.205 kWh x 0,206464 €/kWh 248,79 €')
    .replace('1.018 kWh x 0,133311 €/kWh 135,71 €','1.100 kWh x 0,133311 €/kWh 146,64 €')
    .replace('1.945 kWh x 0,097973 €/kWh 190,56 €','1.719 kWh x 0,097973 €/kWh 168,42 €')
    .replace('13,200 kW x 34 dies x 0,122973 €/kW dia 55,19 €','13,200 kW x 30 dies x 0,122973 €/kW dia 48,70 €')
    .replace('13,200 kW x 34 dies x 0,043976 €/kW dia 19,74 €','13,200 kW x 30 dies x 0,043976 €/kW dia 17,41 €')
    .replace('34 dies x 0,024688 €/dia 0,84 €','30 dies x 0,024688 €/dia 0,74 €')
    .replace('Subtotal 669,62 €','Subtotal 630,70 €')
    .replace('Impost electricitat 669,62 € x 5,112696 % 34,24 €','Impost electricitat 630,70 € x 5,112696 % 32,25 €')
    .replace('Lloguer de comptador 34 dies x 0,044712 €/dia 1,52 €','Lloguer de comptador 30 dies x 0,044712 €/dia 1,34 €\nCost de reconnexió a petició del\n18,09 €\ncomercialitzador')
    .replace('Total Electricitat 705,38 €','Total Electricitat 682,38 €')
    .replace('IVA (21%) 705,38 € x 21% 148,13 €','IVA (21%) 682,38 € x 21% 143,30 €')
    .replace('Total a pagar 853,51 €','Total a pagar 825,68 €')
    .replace('231.814 1.296 kWh','230.517 1.205 kWh')
    .replace('52.695 1.018 kWh','51.677 1.100 kWh')
    .replace('105.340 1.945 kWh','103.395 1.719 kWh');
  const r=parser.parse({text},{name:'naturgy-catala-reconnexio.pdf'});
  assert.equal(r.kwh,4024);
  assert.equal(r.energy,563.85);
  assert.equal(r.power,66.11);
  assert.equal(r.other,20.17);
  assert.equal(r.accounted,825.68);
  assert.equal(r.total,825.68);
  assert.equal(r.balanced,true);
  assert.equal(r.readOk,true);
});
