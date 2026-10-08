'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../invoice-formats.js');
const d=(p1,p2,p3=[])=>({pages:[p1,p2,p3],text:[...p1,...p2,...p3].join('\n')});

test('Format detector accepts Endesa and FENIE but never guesses an unknown layout',()=>{
  assert.equal(api.detect('Endesa Energía, S.A. Unipersonal Nº factura: P26CON000000001'),'endesa');
  assert.equal(api.detect('FENIE ENERGIA Razón Social: DEMO Periodo Facturación: 01/01/2026 - 31/01/2026 Término de potencia'),'fenie');
  assert.equal(api.detect('Otra comercializadora sin patrón conocido'),'unknown');
});

test('Endesa 2.0TD real invoice includes service invoices in the amount actually paid',()=>{
  const p1=['Nº factura: P26CON000000001','Periodo de facturación: del 03/07/2026 a 04/08/2026 (32 días)','Potencia 22,09 €','Energía 226,53 €','Descuentos -42,65 €','Otros 1,64 €','Impuestos 56,39 €','Total 264,00 €','Consumo Total 855,535 kWh'];
  const p2=['Titular del contrato: CLIENTE DEMO','Potencias contratadas: punta-llano 5,750 kW; valle 5,750 kW','CUPS: ES0000000000000004AA0F','Peaje de transporte y distribución: 2.0TD','Periodo 03/07/2026 04/08/2026 Multipl. Ajuste Consumo','Lectura Lectura','real real','Punta 24.606,217 24.849,430 1,00 0,000 243,213','Llano 7.737,018 7.974,459 1,00 0,000 237,441','Valle 9.337,632 9.712,513 1,00 0,000 374,881','Pot. Punta-Llano 5,750 kW x 0,102310 Eur/kW x 32 días 18,82 €','Pot. Valle 5,750 kW x 0,017763 Eur/kW x 32 días 3,27 €','Impuesto electricidad ( 206,76 Eur X 5,1126963 %) 10,57 €','IVA normal 21 % s/ 218,18 45,82 €'];
  const p3=['DETALLE DE LA FACTURA DE SERVICIOS','TOTAL IMPORTE FACTURA 2,11 €','RESUMEN TOTAL DE LAS FACTURAS','Factura de Electricidad 264,00 €','Factura de servicios 2,11 €','Total importe a pagar 266,11 €'];
  const r=api.parseEndesa(d(p1,p2,p3),{name:'demo.pdf'});
  assert.equal(r.electricityTotal,264);assert.equal(r.total,266.11);assert.equal(r.serviceTotal,2.11);assert.equal(r.paymentTotal,266.11);assert.equal(r.other,-38.9);assert.equal(r.accounted,266.11);assert.equal(r.kwh,855.535);assert.equal(r.readingStatus,'actual');
  assert.equal(r.periods.P1.consumption,243.213);assert.equal(r.periods.P1.cost,null);assert.equal(r.contracted.P1,5.75);assert.equal(r.contracted.P2,5.75);assert.equal(r.balanced,true);assert.equal(r.readOk,true);assert.match(r.opportunity,/incluidos en el importe total a pagar/);
  assert.equal(r.retailer,'Endesa Energía S.A.U.');
});

test('Endesa tolera decimales y potencias fragmentados por PDF.js sin perder el total',()=>{
  const p1=['Nº factura: P26CON000000777','Periodo de facturación: del 10/09/2025 a 11/10/2025 (31 días)','Potencia 13,38 €','Energía 22,22 €','Otros 1,91 €','Impuestos 10,10 €','Total 47 ,61 €','Consumo Total 131,680 kWh'];
  const p2=['Titular del contrato: CLIENTE PRUEBA FRAGMENTOS','CUPS: ES0000000000000004AA0F','Peaje de transporte y distribución: 2.0TD','Potencias contratadas: punta-llano 5,70 0 kW; valle 5,70 0 kW','Pot. Punta-Llano 5,700 kW x 0,073782 Eur/kW x 31 días 13,04 €','Pot. Valle 5,700 kW x 0,001911 Eur/kW x 31 días 0,34 €','Financiación Bono Social 31 días x 0,012742 Eur/día 0,40 €','Alquiler del contador 31 días x 0,048658 Eur/día 1,51 €','Impuesto electricidad ( 36,00 Eur X 5,1126963 %) 1,84 €','IVA normal 21 % s/ 39,35 8,26 €','Lectura Lectura','real real','Energía kWh','Punta 6.124,19 6.186,30 1,00 0,00 62,104','Llano 4.527,64 4.571,05 1,00 0,00 43,411','Valle 1.366,72 1.392,89 1,00 0,00 26,165'];
  const data=d(p1,p2),r=api.parseEndesa(data,{name:'endesa-fragmentada-sintetica.pdf'});
  assert.equal(r.total,47.61);
  assert.equal(r.contracted.P1,5.7);assert.equal(r.contracted.P2,5.7);
  assert.equal(r.social,.4);assert.equal(r.rental,1.51);assert.equal(r.other,0);
  assert.equal(r.accounted,47.61);assert.equal(r.diff,0);assert.equal(r.balanced,true);assert.equal(r.readOk,true);
  const normalized=api.normalizeEndesaRow(r,{completenessVersion:'energy-test.fragmented'});
  assert.equal(normalized.power.reliable,true);
  assert.equal(normalized.validation.assessment,'complete');
});

test('La fiabilidad del detalle de potencia Endesa no depende de un error ajeno de la factura',()=>{
  const row={invoiceNumber:'P26CON000000778',company:'CLIENTE PRUEBA POTENCIA',cups:'ES0000000000000003AA',period:'01/01/2026 - 31/01/2026 (31 días)',tariff:'2.0TD',kwh:100,energy:20,power:10,excess:0,reactive:0,compensation:0,social:0,rental:0,other:0,tax:1,vat:0,igic:0,distributorCharges:0,total:0,accounted:31,diff:-31,balanced:false,readOk:false,readMessage:'Falta o revisar: total',periods:{P1:{consumption:30},P2:{consumption:30},P3:{consumption:40}},contracted:{P1:5.75,P2:5.75},maximeters:{},powerDetail:{reliable:true,entries:[{period:1,amount:6},{period:2,amount:4}]},sourceFormat:'endesa'};
  const normalized=api.normalizeEndesaRow(row,{completenessVersion:'energy-test.power'});
  assert.equal(normalized.validation.readOk,false);
  assert.equal(normalized.power.reliable,true);
});

test('Endesa separates discount, Bono Social and meter rental without hiding them in Otros',()=>{
  const cases=[
    {name:'mayo',discount:-278.63,social:1.20,rental:1.68,socialLines:['Financiación Bono Social 30 días x 0,040000 Eur/día 1,20 €'],rentalLines:['Alquiler del contador 10 días x 0,061000 Eur/día 0,61 €','Alquiler del contador 20 días x 0,053500 Eur/día 1,07 €']},
    {name:'julio',discount:-302.38,social:1.20,rental:1.60,socialLines:['Financiación Bono Social 20 días x 0,049000 Eur/día 0,98 €','Financiación Bono Social 10 días x 0,022000 Eur/día 0,22 €'],rentalLines:['Alquiler del contador 25 días x 0,054400 Eur/día 1,36 €','Alquiler del contador 5 días x 0,048000 Eur/día 0,24 €']},
    {name:'septiembre',discount:-326.62,social:1.48,rental:1.60,socialLines:['Financiación Bono Social 30 días x 0,049333 Eur/día 1,48 €'],rentalLines:['Alquiler del contador 30 días x 0,053333 Eur/día 1,60 €']}
  ];
  for(const x of cases){
    const summaryOther=Number((x.social+x.rental).toFixed(2));
    const total=Number((300+10+x.discount+summaryOther+10+40).toFixed(2));
    const euro=v=>v.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
    const p1=['Nº factura: P26CON000000010','Periodo de facturación: del 01/01/2026 a 31/01/2026 (30 días)','Potencia 10,00 €','Energía 300,00 €',`Descuentos ${euro(x.discount)} €`,`Otros ${euro(summaryOther)} €`,'Impuestos 50,00 €',`Total ${euro(total)} €`,'Consumo Total 300,000 kWh'];
    const p2=['Titular del contrato: CLIENTE PRUEBA ECONOMIA','Dirección de suministro: C/ EJEMPLO 1, 07000 CIUDAD','Potencias contratadas: punta-llano 5,750 kW; valle 5,750 kW','CUPS: ES0000000000000003AA','Peaje de transporte y distribución: 2.0TD','Punta 1,000 101,000 1,00 0,000 100,000','Llano 1,000 101,000 1,00 0,000 100,000','Valle 1,000 101,000 1,00 0,000 100,000','Pot. Punta-Llano 5,750 kW x 0,034783 Eur/kW x 30 días 6,00 €','Pot. Valle 5,750 kW x 0,023188 Eur/kW x 30 días 4,00 €',...x.socialLines,...x.rentalLines,'Impuesto electricidad 310,00 Eur x 3,2258 % 10,00 €','IVA normal 21 % s/ 190,48 40,00 €'];
    const r=api.parseEndesa(d(p1,p2),{name:x.name+'.pdf'});
    assert.equal(r.social,x.social,x.name+' bono social');
    assert.equal(r.rental,x.rental,x.name+' alquiler');
    assert.equal(r.other,x.discount,x.name+' otros conserva solo descuento');
    assert.equal(r.otherResidual,0,x.name+' residual otros');
    assert.equal(r.otherClassificationReliable,true,x.name+' clasificación fiable');
    assert.equal(r.accounted,total,x.name+' cuadre');
    assert.equal(r.balanced,true,x.name+' balance');
    const normalized=api.normalizeEndesaRow(r,{completenessVersion:'energy-test.1'});
    assert.equal(normalized.costs.socialBonusEur,x.social,x.name+' modelo bono');
    assert.equal(normalized.costs.meterRentalEur,x.rental,x.name+' modelo alquiler');
    assert.equal(normalized.validation.completeness.social_bonus,'extracted',x.name+' completitud bono');
    assert.equal(normalized.validation.completeness.meter_rental,'extracted',x.name+' completitud alquiler');
  }
});

test('Endesa preserves genuine residual Otros after classifying known charges',()=>{
  const p1=['Nº factura: P26CON000000011','Periodo de facturación: del 01/02/2026 a 28/02/2026 (28 días)','Potencia 10,00 €','Energía 100,00 €','Descuentos -5,00 €','Otros 5,00 €','Impuestos 20,00 €','Total 130,00 €','Consumo Total 100,000 kWh'];
  const p2=['Titular del contrato: CLIENTE PRUEBA RESIDUAL','Potencias contratadas: punta-llano 5,750 kW; valle 5,750 kW','CUPS: ES0000000000000004AA','Peaje de transporte y distribución: 2.0TD','Punta 1,000 31,000 1,00 0,000 30,000','Llano 1,000 31,000 1,00 0,000 30,000','Valle 1,000 41,000 1,00 0,000 40,000','Pot. Punta-Llano 5,750 kW x 0,034783 Eur/kW x 28 días 6,00 €','Pot. Valle 5,750 kW x 0,024845 Eur/kW x 28 días 4,00 €','Financiación Bono Social 28 días x 0,042857 Eur/día 1,20 €','Alquiler del contador 28 días x 0,057143 Eur/día 1,60 €','Impuesto electricidad 110,00 Eur x 4,5454 % 5,00 €','IVA normal 21 % s/ 71,43 15,00 €'];
  const r=api.parseEndesa(d(p1,p2),{name:'residual.pdf'});
  assert.equal(r.social,1.2);assert.equal(r.rental,1.6);assert.equal(r.otherResidual,2.2);assert.equal(r.other,-2.8);assert.equal(r.accounted,130);assert.equal(r.balanced,true);
});

test('Endesa expone modelo energético normalizado portable sin alterar el parser clásico',()=>{
  const p1=['Nº factura: P26CON000000001','Periodo de facturación: del 03/07/2026 a 04/08/2026 (32 días)','Potencia 22,09 €','Energía 226,53 €','Descuentos -42,65 €','Otros 1,64 €','Impuestos 56,39 €','Total 264,00 €','Consumo Total 855,535 kWh'];
  const p2=['Titular del contrato: CLIENTE DEMO','Potencias contratadas: punta-llano 5,750 kW; valle 5,750 kW','CUPS: ES0000000000000004AA0F','Peaje de transporte y distribución: 2.0TD','Punta 24.606,217 24.849,430 1,00 0,000 243,213','Llano 7.737,018 7.974,459 1,00 0,000 237,441','Valle 9.337,632 9.712,513 1,00 0,000 374,881','Pot. Punta-Llano 5,750 kW x 0,102310 Eur/kW x 32 días 18,82 €','Pot. Valle 5,750 kW x 0,017763 Eur/kW x 32 días 3,27 €','Impuesto electricidad ( 206,76 Eur X 5,1126963 %) 10,57 €','IVA normal 21 % s/ 218,18 45,82 €'];
  const p3=['DETALLE DE LA FACTURA DE SERVICIOS','TOTAL IMPORTE FACTURA 2,11 €','RESUMEN TOTAL DE LAS FACTURAS','Factura de Electricidad 264,00 €','Factura de servicios 2,11 €','Total importe a pagar 266,11 €'];
  const data=d(p1,p2,p3),legacy=api.parseEndesa(data,{name:'demo.pdf'}),normalized=api.parseEndesaNormalized(data,{name:'demo.pdf'},{completenessVersion:'energy-test.1'});
  assert.equal(normalized.modelVersion,'ibt-energy-invoice-1');
  assert.equal(normalized.parser.id,'endesa');
  assert.equal(normalized.invoice.number,legacy.invoiceNumber);
  assert.equal(normalized.invoice.billing.start,'2026-07-03');
  assert.equal(normalized.invoice.billing.end,'2026-08-04');
  assert.equal(normalized.invoice.billing.days,32);
  assert.equal(normalized.supply.cups,legacy.cups);
  assert.equal(normalized.energy.totalKwh,legacy.kwh);
  assert.equal(normalized.energy.totalEur,legacy.energy);
  assert.equal(normalized.power.totalEur,legacy.power);
  assert.equal(normalized.costs.totalEur,legacy.total);
  assert.equal(normalized.costs.differenceEur,legacy.diff);
  assert.equal(normalized.energy.periods.length,3);
  assert.equal(normalized.power.periods.length,2);
  assert.equal(normalized.validation.completeness.version,'energy-test.1');
});

test('Endesa puede normalizar una fila runtime ya validada sin volver a parsear el PDF',()=>{
  const row={invoiceNumber:'P26CONRUNTIME001',period:'01/01/2026 - 31/01/2026 (31 días)',tariff:'2.0TD',company:'CLIENTE RUNTIME',taxId:'A00000000',cups:'ES0000000000000000AA',supplyAddress:'DIRECCION YA SANEADA 1',accessContract:'500000000001',contract:'130000000001',contractType:'Libre Endesa',renewalDate:'31/12/2026',distributor:'EDISTRIBUCION',retailer:'Endesa Energía S.A.U.',kwh:100,energy:20,power:10,excess:0,reactive:0,compensation:0,social:0,rental:0,tax:1,vat:6.51,igic:0,distributorCharges:0,other:0,total:37.51,accounted:37.51,diff:0,balanced:true,readOk:true,readMessage:'Lectura correcta',readingStatus:'actual',readingSourceLabel:'Lectura real / real',periods:{P1:{consumption:30,cost:6,price:.2},P2:{consumption:30,cost:6,price:.2},P3:{consumption:40,cost:8,price:.2}},contracted:{P1:5.75,P2:5.75},maximeters:{},powerDetail:{entries:[{amount:5},{amount:5}],reliable:true},discounts:0,summaryOther:0,adjustments:0,serviceTotal:0,parserVersion:'runtime-test'};
  const normalized=api.normalizeEndesaRow(row,{completenessVersion:'energy-test.1'});
  assert.equal(normalized.supply.address,'DIRECCION YA SANEADA 1');
  assert.equal(normalized.contract.number,'130000000001');
  assert.equal(normalized.contract.accessNumber,'500000000001');
  assert.equal(normalized.power.reliable,true);
  assert.equal(normalized.validation.assessment,'complete');
  assert.equal(normalized.power.periods.length,2);
  assert.equal(normalized.validation.completeness.version,'energy-test.1');
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

test('Catalan Endesa service invoice uses SERVEIS / IMPORT and is added to total paid',()=>{
  const p1=['Endesa Energia, S.A. Unipersonal.','Núm. factura: P26CON000000099','Període de facturació: del 19/08/2026 a 19/09/2026 (31 dies)','Potència 31,32 €','Energia 90,54 €','Altres 1,60 €','Impostos 33,51 €','Total 156,97 €','Consum Total 662,704 kWh'];
  const p2=['Titular del contracte: CLIENTE PRUEBA SERVICIO','Potències contractades: punta-pla 5,600 kW; vall 5,600 kW','CUPS: ES0000000000000003AA0F','Peatge de transport i distribució: 2.0TD','Període 19/08/2026 19/09/2026 Multipl. Ajust Consum','Lectura Lectura','real real','Punta 21.921,945 22.127,605 1,00 0,000 205,660','Pla 14.421,495 14.572,771 1,00 0,000 151,276','Vall 22.883,491 23.189,260 1,00 0,000 305,769','Pot. Punta-Pla 5,600 kW x 0,090214 Eur/kW x 31 dies 15,66 €','Pot. P3 5,600 kW x 0,090214 Eur/kW x 31 dies 15,66 €','Impost electricitat ( 122,63 Eur X 5,1126963 %) 6,27 €','IVA normal 21 % s/ 129,73 27,24 €'];
  const p3=['DETALL DE LA FACTURA DE SERVEIS','Protección 360 Plus 4,78 €','IVA GENERAL 21% (s/ 4,30 €) 0,90 €','TOTAL IMPORT FACTURA 5,20 €','RESUM TOTAL DE LES FACTURES','Factura d Electricitat 156,97 €','Factura de serveis 5,20 €','Total import a pagar 162,17 €'];
  const r=api.parseEndesa(d(p1,p2,p3),{name:'catala-serveis.pdf'});
  assert.equal(r.electricityTotal,156.97);assert.equal(r.serviceTotal,5.2);assert.equal(r.total,162.17);assert.equal(r.paymentTotal,162.17);
  assert.equal(r.other,6.8);assert.equal(r.accounted,162.17);assert.equal(r.balanced,true);assert.equal(r.readOk,true);
});
