'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../invoice-formats.js');
const doc=(p1,p2,p3=[])=>({pages:[p1,p2,p3],text:[...p1,...p2,...p3].join('\n')});

test('Real Endesa header cannot hide billed energy or invent reactive charges',()=>{
  const p1=[
    'Endesa Energía, S.A. Unipersonal. CIF A81948077.',
    'Nº factura: P26CON000000001',
    'Periodo de facturación: del 11/05/2026 al 04/06/2026 (24 días)',
    'Potencia 52,14 €','Energía 525,89 €','Descuentos -71,36 €','Otros 8,98 €','Impuestos 139,66 €','Total 655,31 €','Consumo Total 2.853,101 kWh'
  ];
  const p2=[
    'Titular del contrato: CLIENTE PRUEBA ALFA',
    'NIF: X0000000A',
    'Dirección de suministro: C/ EJEMPLO PRUEBA 1, 07191 BANYALBUFAR, Su comercializadora: Endesa Energía S.A.U.',
    'BALEARES',
    'Contrato de mercado libre: Tempo Open',
    'Potencia contratada [kW]: P1 15,010; P2 15,010; P3 15,010; P4 15,010; P5 15,010; P6 15,010.',
    'CUPS: ES0000000000000001AA0F',
    'Referencia del contrato: 60000000001',
    'Referencia del contrato de acceso: 500000000001',
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
  assert.equal(r.contract,'60000000001');
  assert.equal(r.accessContract,'500000000001');
  assert.doesNotMatch(r.supplyAddress,/Su comercializadora|Referencia del contrato|Dirección de suministro/i);
});

test('Older Endesa billing period survives line wrapping and real legal header',()=>{
  const p1=[
    'Endesa Energía, S.A. Unipersonal.',
    'Nº factura: P24CON000000002',
    'Periodo de facturación: del 07/04/2024 a',
    '11/05/2024 (34 días)',
    'Potencia 17,36 €','Energía 76,57 €','Descuentos -22,98 €','Otros 1,11 €','Impuestos 18,40 €','Total 90,46 €','Consumo Total 305,499 kWh'
  ];
  const p2=[
    'Titular del contrato: CLIENTE PRUEBA BETA','CUPS: ES0000000000000002AA0F','Peaje de transporte y distribución: 2.0TD','Potencias contratadas: punta 5,750 kW; valle 5,750 kW',
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

test('The other three real Endesa invoices keep their exact economic balance',()=>{
  const cases=[
    {
      name:'P26CON000000003',total:107.52,energy:70.64,kwh:412.361,
      p1:['Endesa Energía, S.A. Unipersonal.','Nº factura: P26CON000000003','Periodo de facturación: del 31/01/2026 a 02/03/2026 (30 días)','Potencia 21,02 €','Energía 70,64 €','Descuentos -8,45 €','Otros 1,37 €','Impuestos 22,94 €','Total 107,52 €','Consumo Total 412,361 kWh'],
      p2:['Titular del contrato: CLIENTE PRUEBA DELTA','CUPS: ES0000000000000004AA0F','Peaje de transporte y distribución: 2.0TD','Potencias contratadas: punta-llano 4,400 kW; valle 4,400 kW','Pot. Punta-Llano 4,400 kW x 0,117686 Eur/kW x 30 días 15,53 €','Pot. Valle 4,400 kW x 0,041554 Eur/kW x 30 días 5,49 €','Impuesto electricidad ( 83,78 Eur X 5,1126963 %) 4,28 €','IVA normal 21 % s/ 88,86 18,66 €','Lectura Lectura','real real','Energía kWh','Punta 14.517,73 14.633,47 1,00 0,00 115,74','Llano 6.594,09 6.675,84 1,00 0,00 81,75','Valle 6.698,10 6.912,97 1,00 0,00 214,87']
    },
    {
      name:'P26CON000000004',total:264,energy:226.53,kwh:855.535,
      p1:['Endesa Energía, S.A. Unipersonal.','Nº factura: P26CON000000004','Periodo de facturación: del 03/07/2026 a 04/08/2026 (32 días)','Potencia 22,09 €','Energía 226,53 €','Descuentos -42,65 €','Otros 1,64 €','Impuestos 56,39 €','Total 264,00 €','Consumo Total 855,535 kWh'],
      p2:['Titular del contrato: CLIENTE PRUEBA EPSILON','CUPS: ES0000000000000005AA0F','Peaje de transporte y distribución: 2.0TD','Potencias contratadas: punta-llano 5,750 kW; valle 5,750 kW','Pot. Punta-Llano 5,750 kW x 0,102310 Eur/kW x 32 días 18,82 €','Pot. Valle 5,750 kW x 0,017763 Eur/kW x 32 días 3,27 €','Impuesto electricidad ( 206,76 Eur X 5,1126963 %) 10,57 €','IVA normal 21 % s/ 218,18 45,82 €','Lectura Lectura','real real','Energía kWh','Punta 24.606,217 24.849,430 1,00 0,000 243,213','Llano 7.737,018 7.974,459 1,00 0,000 237,441','Valle 9.337,632 9.712,513 1,00 0,000 374,881']
    },
    {
      name:'P25CON000000005',total:389.37,energy:197.90,kwh:1422,
      p1:['Endesa Energía, S.A. Unipersonal.','Nº de factura: P25CON000000005','Periodo de facturación: del 30/04/2025 al 31/05/2025 (31 días)','Potencia 104,35 €','Energía 197,90 €','Descuentos -27,94 €','Otros 11,41 €','Ajustes de peajes y otros costes 20,95 €','Impuestos 82,70 €','Total 389,37 €','Consumo Total 1.422,000 kWh'],
      p2:['Titular del contrato: EMPRESA PRUEBA ZETA, SL','CUPS: ES0000000000000006AA0F','Peaje de transporte y distribución: 3.0TD','Potencia contratada [kW]: P1 25,000; P2 25,000; P3 25,000; P4 25,000; P5 25,000; P6 25,000.','Pot. P1 25,000 kW x 31 días x 0,062949 Eur/kW y día 48,79 €','Pot. P2 25,000 kW x 31 días x 0,032127 Eur/kW y día 24,90 €','Pot. P3 25,000 kW x 31 días x 0,013881 Eur/kW y día 10,76 €','Pot. P4 25,000 kW x 31 días x 0,012064 Eur/kW y día 9,35 €','Pot. P5 25,000 kW x 31 días x 0,007833 Eur/kW y día 6,07 €','Pot. P6 25,000 kW x 31 días x 0,005780 Eur/kW y día 4,48 €','Impuesto Electricidad 295,66 Eur x 5,1126963 % 15,12 €','IVA normal (21%) 21 % s/ 321,79 67,58 €','Incluido en el importe facturado está el coste del peaje de transporte y distribución, que ha sido de 66,63 € (59,29 € potencia, 7,34 € por energía activa y 0 € energía reactiva), y de los cargos, que ha sido de 46,1 € (28,90 € potencia, 17,20 € por energía activa).','Lectura Lectura','real real','ENERGÍA ACTIVA kWh','P1 1.18.1 12.552,44 12.552,44 1,00 0,00 0,00','P2 1.18.2 46.000,37 46.466,37 1,00 0,00 466,00','P3 1.18.3 18.676,29 19.013,29 1,00 0,00 337,00','P4 1.18.4 6.854,02 6.854,02 1,00 0,00 0,00','P5 1.18.5 11.510,64 11.510,64 1,00 0,00 0,00','P6 1.18.6 17.700,24 18.319,24 1,00 0,00 619,00','ENERGÍA REACTIVA INDUCTIVA kWh','P1 0 0,00 0','P2 0 1,00 0','P3 0 1,00 0','P4 0 0,00 0','P5 0 0,00 0','P6 0 1,00 0']
    }
  ];
  for(const c of cases){
    const r=api.parseEndesa(doc(c.p1,c.p2),{name:c.name+'.pdf'});
    assert.equal(r.energy,c.energy,c.name+' energía');
    assert.equal(r.kwh,c.kwh,c.name+' consumo');
    assert.equal(r.reactive,0,c.name+' reactiva');
    assert.equal(r.accounted,c.total,c.name+' conceptos');
    assert.equal(r.total,c.total,c.name+' total');
    assert.equal(r.balanced,true,c.name+' cuadre');
    assert.equal(r.readOk,true,c.name+' lectura');
  }
});
