'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const guard=require('../endesa-status-consistency.js');

const baseRow=overrides=>({
  sourceFormat:'endesa',unsupported:false,company:'MALLORCA LAW, SL',cups:'ES0031500529816004AV0F',
  period:'30/04/2025 - 31/05/2025 (31 días)',tariff:'3.0TD',kwh:1422,energy:197.90,power:104.35,
  excess:0,reactive:0,total:389.37,accounted:389.37,balanced:true,readOk:false,
  readMessage:'Falta o revisar: potencia',readingStatus:'actual',readingSourceLabel:'Lectura Lectura real real',
  periods:{P1:{consumption:0},P2:{consumption:466},P3:{consumption:337},P4:{consumption:0},P5:{consumption:0},P6:{consumption:619}},
  supplyAddress:'PS DEL BORN 17 1, 07012 PALMA, Referencia del contrato de acceso: 010000000000',
  ...overrides
});

const mallorcaDoc={pages:[
  ['Potencia 104,35 €','Energía 197,90 €','Impuestos 82,70 €','Total 389,37 €'],
  ['Dirección de suministro: PS DEL BORN 17 1, 07012 PALMA,','BALEARES','Referencia del contrato de acceso: 010000000000',
   'ENERGÍA REACTIVA INDUCTIVA kWh','Periodo horario Consumo Cos A facturar','P1 0 0,00 0','P2 0 1,00 0','P3 0 1,00 0','P4 0 0,00 0','P5 0 0,00 0','P6 0 1,00 0',
   'EXCESOS DE POTENCIA kW','Periodo horario Contratada Demandada A facturar','P1 25,000 0,000 0,000','P2 25,000 5,000 0,000','P3 25,000 4,000 0,000','P4 25,000 0,000 0,000','P5 25,000 0,000 0,000','P6 25,000 4,000 0,000']
]};

test('A coherent 3.0TD row is correct even when PDF power detail is fragmented',()=>{
  const r=guard.normalize(baseRow({}),mallorcaDoc);
  assert.equal(r.readOk,true);
  assert.equal(r.readMessage,'Lectura correcta');
  assert.equal(r.readingSourceLabel,'Lectura real / real');
  assert.equal(r.supplyAddress,'PS DEL BORN 17 1, 07012 PALMA, BALEARES');
  assert.equal(r.supplyCity,'PALMA');
  assert.equal(r.supplyProvince,'BALEARES');
});

test('Summary labels may be merged or wrapped without creating a false ERROR',()=>{
  const d={pages:[
    ['RESUMEN DE LA FACTURA Potencia 104,35 € Energía 197,90 € Impuestos 82,70 € Total 389,37 €'],
    mallorcaDoc.pages[1]
  ]};
  const r=guard.normalize(baseRow({}),d);
  assert.equal(r.readOk,true);
  assert.equal(r.balanced,true);
});

test('Estimated 3.0TD readings are correct when source billing evidence is coherent',()=>{
  const row=baseRow({
    company:'ELSEBETH SVENDSEN',cups:'ES0031500151907001DN0F',period:'11/05/2026 - 04/06/2026 (24 días)',
    kwh:2853.101,energy:525.89,power:52.14,total:655.31,accounted:655.31,readingStatus:'estimated',
    periods:{P1:{consumption:178.319},P2:{consumption:762.808},P3:{consumption:485.423},P4:{consumption:0},P5:{consumption:0},P6:{consumption:1426.55}}
  });
  const d={pages:[
    ['RESUMEN Potencia 52,14 € Energía 525,89 € Impuestos 139,66 € Total 655,31 €'],
    ['Dirección de suministro: MIRAMAR, 07191 BANYALBUFAR,','BALEARES',
     'ENERGÍA REACTIVA INDUCTIVA kWh','Periodo horario Consumo Cos A facturar','P1 85,000 1,00 0,000','P2 210,000 1,00 0,000','P3 104,000 1,00 0,000','P4 29,000 0,00 0,000','P5 82,000 0,00 0,000','P6 91,000 1,00 0,000',
     'EXCESOS DE POTENCIA kW','Periodo horario Contratada Demandada A facturar','P1 15,010 5,628 0,000','P2 15,010 6,067 0,000','P3 15,010 5,795 0,000','P4 15,010 0,000 0,000','P5 15,010 0,000 0,000','P6 15,010 6,873 0,000']
  ]};
  const r=guard.normalize(row,d);
  assert.equal(r.readOk,true);
  assert.equal(r.readingSourceLabel,'Lectura estimada / estimada');
});

test('A missing CUPS stays rejected',()=>{
  assert.equal(guard.normalize(baseRow({cups:''}),mallorcaDoc).readOk,false);
});

test('A real billed reactive amount stays rejected when parsed reactive is zero',()=>{
  const d={pages:[mallorcaDoc.pages[0],[
    'ENERGÍA REACTIVA INDUCTIVA kWh','Periodo horario Consumo Cos A facturar','P1 85,000 1,00 0,000','P2 210,000 1,00 3,500',
    'EXCESOS DE POTENCIA kW','Periodo horario Contratada Demandada A facturar','P1 25,000 0,000 0,000'
  ]]};
  assert.equal(guard.normalize(baseRow({}),d).readOk,false);
});

test('A consumption-period mismatch stays rejected',()=>{
  assert.equal(guard.normalize(baseRow({periods:{P1:{consumption:1}}}),mallorcaDoc).readOk,false);
});

test('Address cleanup stops before Endesa contract metadata',()=>{
  const rafael=['Dirección de suministro: DE JOAN RIUTORT 45 2 ,, 07190','ESPORLES, BALEARES','Referencia del contrato de acceso: 010016049438','Peaje de transporte y distribución: 2.0TD'];
  const miguel=['Dirección de suministro: ESCULTOR LLORENÇ ROSSELLO 19 BJO,','07340 ALARO, BALEARES','Referencia del contrato de acceso: 500010569789','Peaje de transporte y distribución: 2.0TD'];
  assert.equal(guard.sourceAddress(rafael,''),'DE JOAN RIUTORT 45 2, 07190, ESPORLES, BALEARES');
  assert.deepEqual(guard.placeFromAddress(guard.sourceAddress(rafael,'')),{city:'ESPORLES',province:'BALEARES'});
  assert.equal(guard.sourceAddress(miguel,''),'ESCULTOR LLORENÇ ROSSELLO 19 BJO, 07340 ALARO, BALEARES');
  assert.deepEqual(guard.placeFromAddress(guard.sourceAddress(miguel,'')),{city:'ALARO',province:'BALEARES'});
});

test('Zero in A facturar is not confused with measured demand or reactive consumption',()=>{
  assert.equal(guard.billedTableHasAmount(mallorcaDoc.pages[1],/ENERG[IÍ]A\s+REACTIVA\s+INDUCTIVA/i),false);
  assert.equal(guard.billedTableHasAmount(mallorcaDoc.pages[1],/EXCESOS\s+DE\s+POTENCIA\s+kW/i),false);
});

test('Fragmented Endesa rows do not treat demand or reactive consumption as billed euros',()=>{
  const fragmented=[
    'ENERGÍA REACTIVA INDUCTIVA kWh','Periodo horario Consumo Cos A facturar','P1 85,000 1,00','P2 210,000 1,00',
    'EXCESOS DE POTENCIA kW','Periodo horario Contratada Demandada A facturar','P1 25,000 5,000','P2 25,000 4,000'
  ];
  assert.equal(guard.billedTableHasAmount(fragmented,/ENERG[IÍ]A\s+REACTIVA\s+INDUCTIVA/i),false);
  assert.equal(guard.billedTableHasAmount(fragmented,/EXCESOS\s+DE\s+POTENCIA\s+kW/i),false);
});
