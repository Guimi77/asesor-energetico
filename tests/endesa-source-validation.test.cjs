'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const base=require('../invoice-formats.js');
const fix=require('../endesa-source-validation.js');
const doc=(p1,p2,p3=[])=>({pages:[p1,p2,p3],text:[...p1,...p2,...p3].join('\n')});

test('Old Endesa layout recovers wrapped period and total even when PDF.js prefixes dots',()=>{
  const api=fix.patch(base,{});
  const p1=[
    'Endesa Energía, S.A. Unipersonal.',
    'Nº factura: P24CON018734946',
    'Periodo de facturación: del 07/04/2024 a',
    '11/05/2024 (34 días)',
    'Potencia 17,36 €','Energía 76,57 €','Descuentos -22,98 €','Otros 1,11 €','Impuestos 18,40 €',
    '........................................................................ Total 90,46 €','Consumo Total 305,499 kWh'
  ];
  const p2=[
    'Titular del contrato: MIGUEL ANGEL MUNAR HOMAR','NIF: 43084418J',
    'Dirección de suministro: ESCULTOR LLORENÇ ROSSELLO 19 BJO,','07340 ALARO, BALEARES',
    'Contrato de mercado libre: Libre Endesa','Referencia de contrato de suministro: 130056614996',
    'Potencias contratadas: punta 5,750 kW; valle 5,750 kW','CUPS: ES0031500598524004EW0F','Distribuidora: EDISTRIBUCION REDES DIGITALES','Referencia del contrato de acceso: 500010569789','Peaje de transporte y distribución: 2.0TD',
    'Pot.Punta 5,750 kW x 0,085838 Eur/kW x 34 días 16,78 €','Pot. Valle 5,750 kW x 0,002989 Eur/kW x 34 días 0,58 €',
    'Impuesto electricidad ( 71,16 Eur X 3,8 %) 2,70 €','IVA normal 21 % s/ 74,76 15,70 €',
    'Lectura Lectura','real real','Energía kWh','Punta 18.820,79 18.919,15 1,00 0,00 98,36','Llano 2.410,66 2.475,15 1,00 0,00 64,49','Valle 4.862,89 5.005,53 1,00 0,00 142,65'
  ];
  const r=api.parseEndesa(doc(p1,p2),{name:'miguel.pdf'});
  assert.equal(r.period,'07/04/2024 - 11/05/2024 (34 días)');
  assert.equal(r.total,90.46);
  assert.equal(r.accounted,90.46);
  assert.equal(r.balanced,true);
  assert.equal(r.readOk,true);
  assert.equal(r.supplyAddress,'ESCULTOR LLORENÇ ROSSELLO 19 BJO, 07340 ALARO, BALEARES');
  assert.equal(r.supplyCity,'ALARO');
  assert.equal(r.supplyProvince,'BALEARES');
  assert.equal(r.contract,'130056614996');
  assert.equal(r.accessContract,'500010569789');
});

test('Reactive measurements with zero billed amount stay zero and all six contracted periods are preserved',()=>{
  let learned=null;
  const root={EnergyMaster:{learnInvoice:r=>{learned=r;return{ok:true}}},console};
  const api=fix.patch(base,root);
  const p1=[
    'Endesa Energía, S.A. Unipersonal.','IMPORTE FACTURA: 655,31 €','Nº de factura: P26CON024803189','Periodo de facturación: del 11/05/2026 al 04/06/2026 (24 días)',
    'Potencia 52,14 €','Energía 525,89 €','Descuentos -71,36 €','Otros 8,98 €','Impuestos 139,66 €','Total 655,31 €','Consumo Total 2.853,101 kWh'
  ];
  const p2=[
    'Titular del contrato: ELSEBETH SVENDSEN','NIF: Y4634464R','Dirección de suministro: MIRAMAR, 07191 BANYALBUFAR,','BALEARES','Contrato de mercado libre: Tempo Open',
    'Potencia contratada [kW]: P1 15,010; P2 15,010; P3 15,010; P4 15,010;','P5 15,010; P6 15,010.','CUPS: ES0031500151907001DN0F','Referencia del contrato: 12089360530','Referencia del contrato de acceso: 010018513094','Peaje de transporte y distribución: 3.0TD',
    'Pot. P1 15,010 kW x 24 días x 0,067393 Eur/kW y día 24,28 €','Pot. P2 15,010 kW x 24 días x 0,034203 Eur/kW y día 12,32 €','Pot. P3 15,010 kW x 24 días x 0,014995 Eur/kW y día 5,40 €','Pot. P4 15,010 kW x 24 días x 0,013083 Eur/kW y día 4,71 €','Pot. P5 15,010 kW x 24 días x 0,008671 Eur/kW y día 3,12 €','Pot. P6 15,010 kW x 24 días x 0,006407 Eur/kW y día 2,31 €',
    'Impuesto Electricidad 507,13 Eur x 5,1126963 % 25,93 €','IVA normal (21%) 21 % s/ 541,58 113,73 €','Lectura Lectura','estimada estimada','ENERGÍA ACTIVA kWh',
    'P1 1.18.1 12.028,667 12.206,986 1,00 0,000 178,319','P2 1.18.2 19.046,997 19.809,805 1,00 0,000 762,808','P3 1.18.3 17.732,082 18.217,505 1,00 0,000 485,423','P4 1.18.4 16.794,474 16.794,474 1,00 0,000 0,000','P5 1.18.5 10.562,016 10.562,016 1,00 0,000 0,000','P6 1.18.6 59.047,670 60.474,220 1,00 0,000 1.426,550',
    'POTENCIA kW','P1 1.16.1 5,628 1 5,628','P2 1.16.2 6,067 1 6,067','P3 1.16.3 5,795 1 5,795','P4 1.16.4 0,000 1 0,000','P5 1.16.5 0,000 1 0,000','P6 1.16.6 6,873 1 6,873',
    'ENERGÍA REACTIVA INDUCTIVA kWh','Periodo horario Consumo Cos A facturar','P1 85,000 1,00 0,000','P2 210,000 1,00 0,000','P3 104,000 1,00 0,000','P4 29,000 0,00 0,000','P5 82,000 0,00 0,000','P6 91,000 1,00 0,000',
    'EXCESOS DE POTENCIA kW','Periodo horario Contratada Demandada A facturar','P1 15,010 5,628 0,000','P2 15,010 6,067 0,000','P3 15,010 5,795 0,000','P4 15,010 0,000 0,000','P5 15,010 0,000 0,000','P6 15,010 6,873 0,000'
  ];
  const r=api.parseEndesa(doc(p1,p2),{name:'elsebeth.pdf'});
  assert.equal(r.reactive,0);assert.equal(r.excess,0);assert.equal(r.readOk,true);assert.equal(r.balanced,true);
  assert.equal(r.contracted.P5,15.01);assert.equal(r.contracted.P6,15.01);assert.equal(r.maximeters.P6,6.873);
  assert.match(r.opportunity,/demanda máx\. 6,87 kW \(46%\)/);
  assert.ok(learned);assert.equal(learned.cups,'ES0031500151907001DN0F');assert.equal(learned.contract,'12089360530');assert.equal(learned.supplyAddress,'MIRAMAR, 07191 BANYALBUFAR, BALEARES');
});

test('Explicit Endesa power summary stays valid when PDF line fragmentation hides the per-period power breakdown',()=>{
  const raw={
    company:'ELSEBETH SVENDSEN',cups:'ES0031500151907001DN0F',period:'11/05/2026 - 04/06/2026 (24 días)',tariff:'3.0TD',
    kwh:2853.101,energy:525.89,power:52.14,excess:0,reactive:0,compensation:-71.36,other:8.98,tax:25.93,vat:113.73,igic:0,distributorCharges:0,
    total:655.31,periods:{P1:{consumption:178.319},P2:{consumption:762.808},P3:{consumption:485.423},P4:{consumption:0},P5:{consumption:0},P6:{consumption:1426.55}},
    contracted:{P1:15.01,P2:15.01,P3:15.01,P4:15.01,P5:15.01,P6:15.01},maximeters:{P1:5.628,P2:6.067,P3:5.795,P4:0,P5:0,P6:6.873,_reliable:true},
    powerDetail:{reliable:false,message:'Potencia: detalle Endesa no cuadra con el resumen'},readOk:false,readMessage:'Falta o revisar: Potencia: detalle Endesa no cuadra con el resumen',
    serviceTotal:0,supplyAddress:'MIRAMAR, 07191 BANYALBUFAR, BALEARES',contract:'12089360530',accessContract:'010018513094'
  };
  const api=fix.patch({parseEndesa:()=>raw},{});
  const p1=['Periodo de facturación: del 11/05/2026 al 04/06/2026 (24 días)','Potencia 52,14 €','Impuestos 139,66 €','Total 655,31 €'];
  const p2=['Dirección de suministro: MIRAMAR, 07191 BANYALBUFAR,','BALEARES','Potencia contratada [kW]: P1 15,010; P2 15,010; P3 15,010; P4 15,010; P5 15,010; P6 15,010.','EXCESOS DE POTENCIA kW','Periodo horario Contratada Demandada A facturar','P1 15,010 5,628 0,000','P2 15,010 6,067 0,000','P3 15,010 5,795 0,000','P4 15,010 0,000 0,000','P5 15,010 0,000 0,000','P6 15,010 6,873 0,000','ENERGÍA REACTIVA INDUCTIVA kWh','Periodo horario Consumo Cos A facturar','P1 85,000 1,00 0,000','P2 210,000 1,00 0,000','P3 104,000 1,00 0,000','P4 29,000 0,00 0,000','P5 82,000 0,00 0,000','P6 91,000 1,00 0,000'];
  const r=api.parseEndesa(doc(p1,p2),{name:'fragmentada.pdf'});
  assert.equal(r.balanced,true);
  assert.equal(r.readOk,true);
  assert.equal(r.readMessage,'Lectura correcta');
});

test('Source period ignores a duplicated start date introduced by PDF text grouping',()=>{
  const pages=[['Periodo de facturación: del 07/04/2024 a','07/04/2024','11/05/2024 (34 días)']];
  assert.equal(fix.sourcePeriod(pages,'Por identificar'),'07/04/2024 - 11/05/2024 (34 días)');
});

test('Catalan Endesa 2.0TD layout is normalized before validation',()=>{
  const api=fix.patch(base,{});
  const p1=[
    'Endesa Energia, S.A. Unipersonal.','Núm. factura: P26CON036026175','Període de facturació: del 19/07/2026 a 19/08/2026 (31 dies)',
    'Potència 31,32 €','Energia 101,71 €','Altres 1,60 €','Impostos 36,55 €','Total 171,18 €','Consum Total 736,563 kWh'
  ];
  const p2=[
    'Titular del contracte: GUILLEM MATEU MOREY','NIF: 43156090V','Adreça de subministrament: DE LA PAU FTE LLORENÇ VILL 29 1,','07190 ESPORLES, LES BALEARS',
    'Contracte de mercat lliure: One 3 Períodes','Referència de contracte de subministrament: 130116808001','Referència del contracte d\'accés: 500019144432',
    'Potències contractades: punta-pla 5,600 kW; vall 5,600 kW','CUPS: ES0031500560405004PY0F','Peatge de transport i distribució: 2.0TD',
    'Pot. Punta-Pla 5,600 kW x 0,090214 Eur/kW x 31 dies 15,66 €','Pot. P3 5,600 kW x 0,090214 Eur/kW x 31 dies 15,66 €',
    'Impost electricitat ( 133,80 Eur X 5,1126963 %) 6,84 €','IVA normal 21 % s/ 141,47 29,71 €',
    'Període 19/07/2026 19/08/2026 Multipl. Ajust Consum','Lectura Lectura','real real','Energia kWh',
    'Punta 21.691,536 21.921,945 1,00 0,000 230,409','Pla 14.227,678 14.421,495 1,00 0,000 193,817','Vall 22.571,153 22.883,491 1,00 0,000 312,338'
  ];
  const r=api.parseEndesa(doc(p1,p2),{name:'catala.pdf'});
  assert.equal(r.company,'GUILLEM MATEU MOREY');assert.equal(r.period,'19/07/2026 - 19/08/2026 (31 días)');
  assert.equal(r.kwh,736.563);assert.equal(r.power,31.32);assert.equal(r.energy,101.71);assert.equal(r.tax,6.84);assert.equal(r.vat,29.71);
  assert.equal(r.accounted,171.18);assert.equal(r.readOk,true);assert.equal(r.supplyCity,'ESPORLES');
});
