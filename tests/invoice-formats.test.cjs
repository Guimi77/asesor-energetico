'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../invoice-formats.js');
const d=(p1,p2,p3=[])=>({pages:[p1,p2,p3],text:[...p1,...p2,...p3].join('\n')});

test('Format detector accepts Endesa and FENIE but never guesses an unknown layout',()=>{
  assert.equal(api.detect('Endesa Energía, S.A. Unipersonal Nº factura: P26CON000000001'),'endesa');
  assert.equal(api.detect('FENIE ENERGIA Razón Social: DEMO Periodo Facturación: 01/01/2026 - 31/01/2026 Término de potencia'),'fenie');
  assert.equal(api.detect('Otra comercializadora sin patrón conocido'),'unknown');
});

test('Endesa 2.0TD real invoice balances and keeps service invoices outside the electricity total',()=>{
  const p1=['Nº factura: P26CON000000001','Periodo de facturación: del 03/07/2026 a 04/08/2026 (32 días)','Potencia 22,09 €','Energía 226,53 €','Descuentos -42,65 €','Otros 1,64 €','Impuestos 56,39 €','Total 264,00 €','Consumo Total 855,535 kWh'];
  const p2=['Titular del contrato: CLIENTE DEMO','Potencias contratadas: punta-llano 5,750 kW; valle 5,750 kW','CUPS: ES0000000000000004AA0F','Peaje de transporte y distribución: 2.0TD','Periodo 03/07/2026 04/08/2026 Multipl. Ajuste Consumo','Lectura Lectura','real real','Punta 24.606,217 24.849,430 1,00 0,000 243,213','Llano 7.737,018 7.974,459 1,00 0,000 237,441','Valle 9.337,632 9.712,513 1,00 0,000 374,881','Pot. Punta-Llano 5,750 kW x 0,102310 Eur/kW x 32 días 18,82 €','Pot. Valle 5,750 kW x 0,017763 Eur/kW x 32 días 3,27 €','Impuesto electricidad ( 206,76 Eur X 5,1126963 %) 10,57 €','IVA normal 21 % s/ 218,18 45,82 €'];
  const p3=['DETALLE DE LA FACTURA DE SERVICIOS','TOTAL IMPORTE FACTURA 2,11 €','RESUMEN TOTAL DE LAS FACTURAS','Factura de Electricidad 264,00 €','Factura de servicios 2,11 €','Total importe a pagar 266,11 €'];
  const r=api.parseEndesa(d(p1,p2,p3),{name:'demo.pdf'});
  assert.equal(r.total,264);assert.equal(r.serviceTotal,2.11);assert.equal(r.paymentTotal,266.11);assert.equal(r.kwh,855.535);assert.equal(r.readingStatus,'actual');
  assert.equal(r.periods.P1.consumption,243.213);assert.equal(r.periods.P1.cost,null);assert.equal(r.contracted.P1,5.75);assert.equal(r.contracted.P2,5.75);assert.equal(r.balanced,true);assert.equal(r.readOk,true);assert.match(r.opportunity,/servicios adicionales/);
  assert.equal(r.retailer,'Endesa Energía S.A.U.');
});

test('Endesa 3.0TD estimated invoice reads P1-P6 and current demands without inventing period prices',()=>{
  const p1=['Nº de factura: P26CON000000002','Periodo de facturación: del 11/05/2026 al 04/06/2026 (24 días)','Potencia 52,14 €','Energía 525,89 €','Descuentos -71,36 €','Otros 8,98 €','Impuestos 139,66 €','Total 655,31 €','Consumo Total 2.853,101 kWh'];
  const p2=['Titular del contrato: CLIENTE DEMO','Potencia contratada [kW]: P1 15,010; P2 15,010; P3 15,010; P4 15,010; P5 15,010; P6 15,010.','CUPS: ES0000000000000005AA0F','Peaje de transporte y distribución: 3.0TD','Lectura Lectura','estimada estimada','P1 1.18.1 12.028,667 12.206,986 1,00 0,000 178,319','P2 1.18.2 19.046,997 19.809,805 1,00 0,000 762,808','P3 1.18.3 17.732,082 18.217,505 1,00 0,000 485,423','P4 1.18.4 16.794,474 16.794,474 1,00 0,000 0,000','P5 1.18.5 10.562,016 10.562,016 1,00 0,000 0,000','P6 1.18.6 59.047,670 60.474,220 1,00 0,000 1.426,550','P1 1.16.1 5,628 1 5,628','P2 1.16.2 6,067 1 6,067','P3 1.16.3 5,795 1 5,795','P4 1.16.4 0,000 1 0,000','P5 1.16.5 0,000 1 0,000','P6 1.16.6 6,873 1 6,873','Pot. P1 15,010 kW x 24 días x 0,067393 Eur/kW y día 24,28 €','Pot. P2 15,010 kW x 24 días x 0,034203 Eur/kW y día 12,32 €','Pot. P3 15,010 kW x 24 días x 0,014995 Eur/kW y día 5,40 €','Pot. P4 15,010 kW x 24 días x 0,013083 Eur/kW y día 4,71 €','Pot. P5 15,010 kW x 24 días x 0,008671 Eur/kW y día 3,12 €','Pot. P6 15,010 kW x 24 días x 0,006407 Eur/kW y día 2,31 €','Impuesto Electricidad 507,13 Eur x 5,1126963 % 25,93 €','IVA normal (21%) 21 % s/ 541,58 113,73 €'];
  const r=api.parseEndesa(d(p1,p2),{name:'demo3.pdf'});
  assert.equal(r.kwh,2853.101);assert.equal(r.readingStatus,'estimated');assert.equal(r.periods.P6.consumption,1426.55);assert.equal(r.periods.P6.cost,null);assert.equal(r.contracted.P6,15.01);assert.equal(r.maximeters.P6,6.873);assert.equal(r.balanced,true);assert.equal(r.readOk,true);assert.match(r.opportunity,/potencia sobredimensionada/i);
});

test('Endesa regulated adjustments are included exactly instead of disappearing into a fake mismatch',()=>{
  const p1=['Nº de factura: P25CON000000003','Periodo de facturación: del 30/04/2025 al 31/05/2025 (31 días)','Potencia 104,35 €','Energía 197,90 €','Descuentos -27,94 €','Otros 11,41 €','Ajustes de peajes y otros costes 20,95 €','Impuestos 82,70 €','Total 389,37 €','Consumo Total 1.422,000 kWh'];
  const p2=['Titular del contrato: CLIENTE PRUEBA EMPRESA','Potencia contratada [kW]: P1 25,000; P2 25,000; P3 25,000; P4 25,000; P5 25,000; P6 25,000.','CUPS: ES0000000000000006AA0F','Peaje de transporte y distribución: 3.0TD','Pot. P1 25,000 kW x 31 días x 0,062949 Eur/kW y día 48,79 €','Pot. P2 25,000 kW x 31 días x 0,032127 Eur/kW y día 24,90 €','Pot. P3 25,000 kW x 31 días x 0,013881 Eur/kW y día 10,76 €','Pot. P4 25,000 kW x 31 días x 0,012064 Eur/kW y día 9,35 €','Pot. P5 25,000 kW x 31 días x 0,007833 Eur/kW y día 6,07 €','Pot. P6 25,000 kW x 31 días x 0,005780 Eur/kW y día 4,48 €','Impuesto Electricidad 295,66 Eur x 5,1126963 % 15,12 €','IVA normal (21%) 21 % s/ 321,79 67,58 €'];
  const r=api.parseEndesa(d(p1,p2),{name:'adjust.pdf'});
  assert.equal(r.other,4.42);assert.equal(r.adjustments,20.95);assert.equal(r.accounted,389.37);assert.equal(r.balanced,true);
});

test('Endesa two-column 2.0TD text keeps every reading instead of losing right-column periods',()=>{
  const p1=['Nº factura: P26CON000000004','Periodo de facturación: del 03/07/2026 a 04/08/2026 (32 días)','Potencia 22,09 €','Energía 226,53 €','Descuentos -42,65 €','Otros 1,64 €','Impuestos 56,39 €','Total 264,00 €','Consumo Total 855,535 kWh'];
  const p2=['Titular del contrato: CLIENTE PRUEBA EPSILON ....................................................... CUPS: ES0000000000000004AA0F','Potencias contratadas: punta-llano 5,750 kW; valle 5,750 kW','Peaje de transporte y distribución: 2.0TD','Punta 24.606,217 24.849,430 1,00 0,000 243,213','texto izquierdo Llano 7.737,018 7.974,459 1,00 0,000 237,441','otro texto Valle 9.337,632 9.712,513 1,00 0,000 374,881','Pot. Punta-Llano 5,750 kW x 0,102310 Eur/kW x 32 días 18,82 €','Pot. Valle 5,750 kW x 0,017763 Eur/kW x 32 días 3,27 €','Impuesto electricidad ( 206,76 Eur X 5,1126963 %) 10,57 €','IVA normal 21 % s/ 218,18 45,82 €'];
  const r=api.parseEndesa(d(p1,p2),{name:'merged2.pdf'});
  assert.equal(r.company,'CLIENTE PRUEBA EPSILON');assert.equal(r.periods.P1.consumption,243.213);assert.equal(r.periods.P2.consumption,237.441);assert.equal(r.periods.P3.consumption,374.881);assert.equal(r.readOk,true);
});

test('Endesa two-column 3.0TD text uses exact active-energy register codes',()=>{
  const p1=['Nº de factura: P26CON000000005','Periodo de facturación: del 11/05/2026 al 04/06/2026 (24 días)','Potencia 52,14 €','Energía 525,89 €','Descuentos -71,36 €','Otros 8,98 €','Impuestos 139,66 €','Total 655,31 €','Consumo Total 2.853,101 kWh'];
  const p2=['Titular del contrato: CLIENTE PRUEBA ALFA ............................................ Número de contador: 300000004','Potencia contratada [kW]: P1 15,010; P2 15,010; P3 15,010; P4 15,010; P5 15,010; P6 15,010.','CUPS: ES0000000000000005AA0F','Peaje de transporte y distribución: 3.0TD','ENERGÍA ACTIVA kWh P3 0 1,00 0,000','P1 1.18.1 12.028,667 12.206,986 1,00 0,000 178,319 P4 0 0,00 0,000','P2 1.18.2 19.046,997 19.809,805 1,00 0,000 762,808 P5 0 0,00 0,000','P3 1.18.3 17.732,082 18.217,505 1,00 0,000 485,423 P6 0 1,00 0,000','P4 1.18.4 16.794,474 16.794,474 1,00 0,000 0,000','P5 1.18.5 10.562,016 10.562,016 1,00 0,000 0,000','P6 1.18.6 59.047,670 60.474,220 1,00 0,000 1.426,550','P1 1.16.1 5,628 1 5,628','P2 1.16.2 6,067 1 6,067','P3 1.16.3 5,795 1 5,795','P4 1.16.4 0,000 1 0,000','P5 1.16.5 0,000 1 0,000','P6 1.16.6 6,873 1 6,873','Pot. P1 15,010 kW x 24 días x 0,067393 Eur/kW y día 24,28 €','Pot. P2 15,010 kW x 24 días x 0,034203 Eur/kW y día 12,32 €','Pot. P3 15,010 kW x 24 días x 0,014995 Eur/kW y día 5,40 €','Pot. P4 15,010 kW x 24 días x 0,013083 Eur/kW y día 4,71 €','Pot. P5 15,010 kW x 24 días x 0,008671 Eur/kW y día 3,12 €','Pot. P6 15,010 kW x 24 días x 0,006407 Eur/kW y día 2,31 €','Impuesto Electricidad 507,13 Eur x 5,1126963 % 25,93 €','IVA normal (21%) 21 % s/ 541,58 113,73 €'];
  const r=api.parseEndesa(d(p1,p2),{name:'merged3.pdf'});
  assert.equal(r.company,'CLIENTE PRUEBA ALFA');assert.equal(r.periods.P1.consumption,178.319);assert.equal(r.periods.P2.consumption,762.808);assert.equal(r.periods.P3.consumption,485.423);assert.equal(r.periods.P6.consumption,1426.55);assert.equal(r.maximeters.P6,6.873);assert.equal(r.readOk,true);
});

test('Older Endesa layout accepts a-period wording and keeps P3',()=>{
  const p1=['Nº factura: P24CON000000002','Periodo de facturación: del 07/04/2024 a 11/05/2024 (34 días)','Potencia 17,36 €','Energía 76,57 €','Descuentos -22,98 €','Otros 1,11 €','Impuestos 18,40 €','Total 90,46 €','del Consumo Total 305,499 kWh'];
  const p2=['Titular del contrato: CLIENTE PRUEBA BETA ....................................................... CUPS: ES0000000000000002AA0F','Potencias contratadas: punta 5,750 kW; valle 5,750 kW','Peaje de transporte y distribución: 2.0TD','Punta 18.820,79 18.919,15 1,00 0,00 98,36','Llano 2.410,66 2.475,15 1,00 0,00 64,49','texto Valle 4.862,89 5.005,53 1,00 0,00 142,65','Pot.Punta 5,750 kW x 0,085838 Eur/kW x 34 días 16,78 €','Pot. Valle 5,750 kW x 0,002989 Eur/kW x 34 días 0,58 €','Impuesto electricidad ( 71,16 Eur X 3,8 %) 2,70 €','IVA normal 21 % s/ 74,76 15,70 €'];
  const r=api.parseEndesa(d(p1,p2),{name:'old.pdf'});
  assert.equal(r.period,'07/04/2024 - 11/05/2024 (34 días)');assert.equal(r.total,90.46);assert.equal(r.periods.P3.consumption,142.65);assert.equal(r.readOk,true);
});

test('Endesa refuses a green status when period consumption does not reconcile',()=>{
  const p1=['Nº factura: P26CON000000006','Periodo de facturación: del 01/08/2026 a 31/08/2026 (31 días)','Potencia 10,00 €','Energía 20,00 €','Impuestos 6,30 €','Total 36,30 €','Consumo Total 300,000 kWh'];
  const p2=['Titular del contrato: TEST','Potencias contratadas: punta 3,450 kW; valle 3,450 kW','CUPS: ES0000000000000007AA0F','Peaje de transporte y distribución: 2.0TD','Punta 1,00 2,00 1,00 0,00 100,00','Llano 1,00 2,00 1,00 0,00 50,00','Valle 1,00 2,00 1,00 0,00 50,00','Pot. Punta 3,450 kW x 31 días x 0,08 Eur/kW x día 8,00 €','Pot. Valle 3,450 kW x 31 días x 0,02 Eur/kW x día 2,00 €','Impuesto electricidad 30,00 Eur x 5 % 1,50 €','IVA normal 21 % s/ 31,50 4,80 €'];
  const r=api.parseEndesa(d(p1,p2),{name:'bad-periods.pdf'});assert.equal(r.readOk,false);assert.match(r.readMessage,/consumo por periodos/i);
});

test('Unsupported format never receives invented zero values',()=>{
  const r=api.unsupportedRow({name:'unknown.pdf'});assert.equal(r.unsupported,true);assert.equal(r.kwh,null);assert.equal(r.total,null);assert.match(r.opportunity,/No se ha interpretado/);
});