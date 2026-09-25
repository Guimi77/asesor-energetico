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
