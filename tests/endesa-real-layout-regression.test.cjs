'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../invoice-formats.js');
const doc=(p1,p2,p3=[])=>({pages:[p1,p2,p3],text:[...p1,...p2,...p3].join('\n')});

test('Real Endesa header cannot hide billed energy or invent reactive charges',()=>{
  const p1=[
    'Endesa Energía, S.A. Unipersonal. CIF A81948077.',
    'Nº factura: P26CON024803189',
    'Periodo de facturación: del 11/05/2026 al 04/06/2026 (24 días)',
    'Potencia 52,14 €','Energía 525,89 €','Descuentos -71,36 €','Otros 8,98 €','Impuestos 139,66 €','Total 655,31 €','Consumo Total 2.853,101 kWh'
  ];
  const p2=[
    'Titular del contrato: ELSEBETH SVENDSEN',
    'NIF: Y4634464R',
    'Dirección de suministro: MIRAMAR, 07191 BANYALBUFAR, Su comercializadora: Endesa Energía S.A.U.',
    'BALEARES',
    'Contrato de mercado libre: Tempo Open',
    'Potencia contratada [kW]: P1 15,010; P2 15,010; P3 15,010; P4 15,010; P5 15,010; P6 15,010.',
    'CUPS: ES0031500151907001DN0F',
    'Referencia del contrato: 12089360530',
    'Referencia del contrato de acceso: 010018513094',
    'Peaje de transporte y distribución: 3.0TD',
    'Pot. P1 15,010 kW x 24 días x 0,067393 Eur/kW y día 24,28 €',
    'Pot. P2 15,010 kW x 24 días x 0,034203 Eur/kW y día 12,32 €',
    'Pot. P3 15,010 kW x 24 días x 0,014995 Eur/kW y día 5,40 €',
    'Pot. P4 15,010 kW x 24 días x 0,013083 Eur/kW y día 4,71 €',
    'Pot. P5 15,010 kW x 24 días x 0,008671 Eur/kW y día 3,12 €',
    'Pot. P6 15,010 kW x 24 días x 0,006407 Eur/kW y día 2,31 €',
    'Impuesto Electricidad 507,13 Eur x 5,1126963 % 25,93 €',
    'IVA normal (21%) 21 % s/ 541,58 113,73 €',
    'Incluido en el importe facturado está el coste del peaje de transporte y distribución, que ha sido de 44,73 € (27,94 € potencia, 16,79 € por energía activa y 0 € energía reactiva), y de los cargos, que ha sido de 52,49 € (14,81 € potencia, 37,68 € por energía activa).',
    'Lectura Lectura','estimada estimada','ENERGÍA ACTIVA kWh',
    'P1 1.18.1 12.028,667 12.206,986 1,00 0,000 178,319',
    'P2 1.18.2 19.046,997 19.809,805 1,00 0,000 762,808',
    'P3 1.18.3 17.732,082 18.217,505 1,00 0,000 485,423',
    'P4 1.18.4 16.794,474 16.794,474 1,00 0,000 0,000',
    'P5 1.18.5 10.562,016 10.562,016 1,00 0,000 0,000',
    'P6 1.18.6 59.047,670 60.474,220 1,00 0,000 1.426,550',
    'ENERGÍA REACTIVA INDUCTIVA kWh','P1 0 1,00 0,000','P2 0 1,00 0,000','P3 0 1,00 0,000','P4 0 0,00 0,000','P5 0 0,00 0,000','P6 0 1,00 0,000'
  ];
  const r=api.parseEndesa(doc(p1,p2),{name:'real-header.pdf'});
  assert.equal(r.energy,525.89);
  assert.equal(r.reactive,0);
  assert.equal(r.accounted,655.31);
  assert.equal(r.balanced,true);
  assert.equal(r.readOk,true);
  assert.equal(r.readingStatus,'estimated');
  assert.equal(r.contract,'12089360530');
  assert.equal(r.accessContract,'010018513094');
  assert.doesNotMatch(r.supplyAddress,/Su comercializadora|Referencia del contrato|Dirección de suministro/i);
});

test('Older Endesa billing period survives line wrapping and real legal header',()=>{
  const p1=[
    'Endesa Energía, S.A. Unipersonal.',
    'Nº factura: P24CON018734946',
    'Periodo de facturación: del 07/04/2024 a',
    '11/05/2024 (34 días)',
    'Potencia 17,36 €','Energía 76,57 €','Descuentos -22,98 €','Otros 1,11 €','Impuestos 18,40 €','Total 90,46 €','Consumo Total 305,499 kWh'
  ];
  const p2=[
    'Titular del contrato: MIGUEL ANGEL MUNAR HOMAR','CUPS: ES0031500598524004EW0F','Peaje de transporte y distribución: 2.0TD','Potencias contratadas: punta 5,750 kW; valle 5,750 kW',
    'Pot.Punta 5,750 kW x 0,085838 Eur/kW x 34 días 16,78 €','Pot. Valle 5,750 kW x 0,002989 Eur/kW x 34 días 0,58 €',
    'Impuesto electricidad ( 71,16 Eur X 3,8 %) 2,70 €','IVA normal 21 % s/ 74,76 15,70 €',
    'Lectura Lectura','real real','Energía kWh','Punta 18.820,79 18.919,15 1,00 0,00 98,36','Llano 2.410,66 2.475,15 1,00 0,00 64,49','Valle 4.862,89 5.005,53 1,00 0,00 142,65'
  ];
  const r=api.parseEndesa(doc(p1,p2),{name:'old-real.pdf'});
  assert.equal(r.period,'07/04/2024 - 11/05/2024 (34 días)');
  assert.equal(r.energy,76.57);
  assert.equal(r.balanced,true);
  assert.equal(r.readingStatus,'actual');
});
