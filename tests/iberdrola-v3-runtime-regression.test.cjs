'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const parser=require('../iberdrola-parser-v3.js');

const doc=(...pages)=>({pages,text:pages.flat().join('\n')});
function rawFromPages(pages){
  return pages.map(page=>{
    const items=[];
    page.forEach((line,row)=>{
      let x=30;
      for(const token of String(line).split(/\s+/).filter(Boolean)){
        items.push({str:token,transform:[1,0,0,1,x,800-row*12],height:10});
        x+=Math.max(8,token.length*5.2);
      }
    });
    return items;
  });
}


function twoZero(){
  return doc([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO',
    'CLIENTE PRUEBA DOS CERO','Titular Potencia: C/ EJEMPLO, 5','CLIENTE PRUEBA DOS CERO Potencia punta: 5,75 kW','Potencia valle: 5,75 kW',
    'Dirección de suministro:','C/ EJEMPLO, 5 07000 CIUDAD (ILLES BALEARS)','Nº DE CONTRATO: 600000001',
    'RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: Nº FACTURA:','22/06/2026 - 19/07/2026 21260000000000001',
    'DIAS FACTURADOS: FECHA DE EMISIÓN:','27 27 de julio de 2026','ENERGÍA 101,36 €','DESCUENTOS ENERGÍA -10,84 €',
    'CARGOS NORMATIVOS 0,62 €','SERVICIOS Y OTROS CONCEPTOS 0,72 €','IVA 19,29 €','TOTAL 111,15 €'
  ],[
    'DETALLE DE FACTURA DETALLE DE FACTURA','ENERGÍA',
    'Potencia facturada Punta 5,75 kW x 27 días x 0,108192 €/kW día 16,80 €',
    'Valle 5,75 kW x 27 días x 0,050658 €/kW día 7,86 €',
    'Total importe potencia hasta 19/07/2026 24,66 €',
    'Energía consumida 485,91 kWh x 0,148729 €/kWh 72,27 €',
    'Descuento sobre consumo 15% 15 % s/72,27 € -10,84 €','CARGOS NORMATIVOS',
    'Financiación bono social fijo (22/06/2026-30/06/2026) 8 días x 0,019121 €/día 0,15 €',
    'Financiación bono social fijo (30/06/2026-19/07/2026) 19 días x 0,024688 €/día 0,47 €',
    'Impuesto sobre electricidad (*) 5,11269632 % s/86,71 € 4,43 €','TOTAL ENERGÍA 91,14 €',
    'SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 27 días x 0,02663014 €/día 0,72 €',
    'TOTAL SERVICIOS Y OTROS CONCEPTOS 0,72 €','IMPORTE TOTAL 91,86 €','IVA (*) 21 % s/91,86 € 19,29 €','TOTAL IMPORTE FACTURA 111,15 €',
    'Peaje de acceso a la red (ATR): 2.0TD','Empresa distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.',
    'Número de contrato de acceso: 500000000001','Identificación punto de suministro (CUPS): ES 0000 0000 0000 0000 AA',
    'Las lecturas desagregadas según la tarifa de acceso, tomadas el 19/07/2026 son: punta: 1.413,79 kWh; llano: 986,75 kWh; valle 1.564,68 kWh, siendo',
    'estas lecturas reales. Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.'
  ]);
}

function threeZero(){
  return doc([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CONTRATO',
    'CLIENTE PRUEBA TRES CERO','Titular C/ EJEMPLO, 17','CLIENTE PRUEBA TRES CERO',
    'Dirección de suministro:','C/ EJEMPLO, 17 07000 CIUDAD (ILLES BALEARS)','Nº DE CONTRATO: 600000002',
    'RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: Nº FACTURA:','27/04/2026 - 31/05/2026 21260000000000002',
    'DIAS FACTURADOS: FECHA DE EMISIÓN:','34 8 de junio de 2026','ENERGÍA 81,80 €','DESCUENTOS ENERGÍA -1,71 €',
    'CARGOS NORMATIVOS 0,65 €','SERVICIOS Y OTROS CONCEPTOS 12,07 €','IVA 19,49 €','TOTAL 112,30 €'
  ],[
    'DETALLE DE FACTURA DETALLE DE FACTURA','ENERGÍA',
    'Potencia facturada P1 16 kW x 34 días x 0,057502 €/kW día 31,28 €',
    'P2 16 kW x 34 días x 0,029962 €/kW día 16,30 €','P3 16 kW x 34 días x 0,012647 €/kW día 6,88 €',
    'P4 16 kW x 34 días x 0,010967 €/kW día 5,97 €','P5 16 kW x 34 días x 0,007094 €/kW día 3,86 €',
    'P6 16 kW x 34 días x 0,00407 €/kW día 2,21 €','Total importe potencia hasta 31/05/2026 66,50 €',
    'Energía consumida P2 28 kWh x 0,198752 €/kWh 5,57 €','P3 14 kWh x 0,172594 €/kWh 2,42 €',
    'P4 6 kWh x 0,150296 €/kWh 0,90 €','P5 2 kWh x 0,131956 €/kWh 0,26 €','P6 15 kWh x 0,147973 €/kWh 2,22 €',
    'Total 65 kWh hasta 31/05/2026 11,37 €','Descuento sobre consumo 15% 15 % s/11,37 € -1,71 €','CARGOS NORMATIVOS',
    'Financiación bono social fijo 34 días x 0,019121 €/día 0,65 €','Impuesto sobre electricidad (*) 5,11269632 % s/76,81 € 3,93 €',
    'TOTAL ENERGÍA 80,74 €','SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 34 días x 0,35506849 €/día 12,07 €',
    'TOTAL SERVICIOS Y OTROS CONCEPTOS 12,07 €','IMPORTE TOTAL 92,81 €','IVA 21 % s/92,81 € 19,49 €','TOTAL IMPORTE FACTURA 112,30 €',
    '300000001 Energía activa P1 27/04/2026 4.648 31/05/2026 4.648 0 kWh',
    '300000001 Energía activa P2 27/04/2026 4.783 31/05/2026 4.811 28 kWh',
    '300000001 Energía activa P3 27/04/2026 3.125 31/05/2026 3.139 14 kWh',
    '300000001 Energía activa P4 27/04/2026 3.902 31/05/2026 3.908 6 kWh',
    '300000001 Energía activa P5 27/04/2026 1.846 31/05/2026 1.848 2 kWh',
    '300000001 Energía activa P6 27/04/2026 15.845 31/05/2026 15.860 15 kWh'
  ],[
    'Última lectura: real','Peaje de acceso a la red (ATR): 3.0TD','Potencia contratada (kW): 16 / 16 / 16 / 16 / 16 / 16',
    'Empresa distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.','Número de contrato de acceso: 500000000002',
    'Identificación punto de suministro (CUPS): ES 0000 0000 0000 0001 AA'
  ]);
}

test('Iberdrola v3 accepts text or structured PDF detection without stealing other suppliers',()=>{
  assert.equal(parser.detect(twoZero()),true);
  assert.equal(parser.detect(twoZero().text),true);
  assert.equal(parser.detect('ENDESA ENERGIA FACTURA ELECTRICIDAD'),false);
  assert.equal(parser.detect('FENIE ENERGIA FACTURA ELECTRICIDAD'),false);
});

test('Iberdrola v3 closes a 2.0TD invoice exactly and preserves the three consumption periods',()=>{
  const r=parser.parse(twoZero(),{name:'2.0TD.pdf'});
  assert.equal(r.readOk,true,JSON.stringify({message:r.readMessage,company:r.company,cups:r.cups,period:r.period,tariff:r.tariff,kwh:r.kwh,energy:r.energy,power:r.power,other:r.other,tax:r.tax,vat:r.vat,total:r.total,diff:r.diff,periods:r.periods,powerDetail:r.powerDetail}));
  assert.equal(r.kwh,485.91);
  assert.equal(r.energy,72.27);
  assert.equal(r.power,24.66);
  assert.equal(r.other,-9.5);
  assert.equal(r.tax,4.43);
  assert.equal(r.vat,19.29);
  assert.equal(r.total,111.15);
  assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption],[175.87,137.31,172.73]);
});

test('Iberdrola v3 closes a 3.0TD invoice and derives P1 zero only from an explicit active reading',()=>{
  const r=parser.parse(threeZero(),{name:'3.0TD.pdf'});
  assert.equal(r.readOk,true,JSON.stringify({message:r.readMessage,company:r.company,cups:r.cups,period:r.period,tariff:r.tariff,kwh:r.kwh,energy:r.energy,power:r.power,other:r.other,tax:r.tax,vat:r.vat,total:r.total,diff:r.diff,periods:r.periods,powerDetail:r.powerDetail}));
  assert.equal(r.kwh,65);
  assert.equal(r.energy,11.37);
  assert.equal(r.power,66.5);
  assert.equal(r.other,11.01);
  assert.equal(r.tax,3.93);
  assert.equal(r.vat,19.49);
  assert.equal(r.total,112.3);
  assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption,r.periods.P4.consumption,r.periods.P5.consumption,r.periods.P6.consumption],[0,28,14,6,2,15]);
  assert.deepEqual([r.periods.P1.cost,r.periods.P2.cost,r.periods.P3.cost,r.periods.P4.cost,r.periods.P5.cost,r.periods.P6.cost],[0,5.57,2.42,0.9,0.26,2.22]);
});

test('Iberdrola v3 fails closed if billed period cost no longer matches the printed energy total',()=>{
  const d=threeZero();
  d.pages[1]=d.pages[1].map(x=>x.replace('P6 15 kWh x 0,147973 €/kWh 2,22 €','P6 15 kWh x 0,147973 €/kWh 3,22 €'));
  d.text=d.pages.flat().join('\n');
  const r=parser.parse(d,{name:'broken.pdf'});
  assert.equal(r.readOk,false);
  assert.match(r.readMessage,/coste de energía/i);
});


test('Iberdrola v3 recovers the Carla/Diana fields from raw PDF items when the browser visual rows are broken',()=>{
  const carlaSource=twoZero();
  const carlaBrokenPages=[
    ['FACTURA DE ELECTRICIDAD IBERDROLA CLIENTES, S.A.U.'],
    ['Total importe potencia hasta 19/07/2026 24,66 €','Las lecturas desagregadas según la tarifa de acceso, tomadas el 19/07/2026 son: punta: 1.413,79 kWh; llano: 986,75 kWh; valle 1.564,68 kWh, siendo estas lecturas reales. Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.','Peaje de acceso a la red (ATR): 2.0TD','Identificación punto de suministro (CUPS): ES 0000 0000 0000 0000 AA']
  ];
  const carla={pages:carlaBrokenPages,rawPages:rawFromPages(carlaSource.pages),text:carlaBrokenPages.flat().join('\n')};
  const c=parser.parse(carla,{name:'carla-browser.pdf'});
  assert.equal(c.readOk,true,JSON.stringify(c));
  assert.equal(c.company,'CLIENTE PRUEBA DOS CERO');
  assert.equal(c.period,'22/06/2026 - 19/07/2026 (27 días)');
  assert.equal(c.kwh,485.91);assert.equal(c.energy,72.27);assert.equal(c.power,24.66);assert.equal(c.tax,4.43);assert.equal(c.diff,0);

  const dianaSource=threeZero();
  const dianaBrokenPages=[
    ['FACTURA DE ELECTRICIDAD IBERDROLA CLIENTES, S.A.U.','CLIENTE PRUEBA TRES'],
    ['Total importe potencia hasta 31/05/2026 66,50 €','Energía consumida P2 28 kWh x 0,198752 €/kWh 5,57 €','P3 14 kWh x 0,172594 €/kWh 2,42 €','P4 6 kWh x 0,150296 €/kWh 0,90 €','P5 2 kWh x 0,131956 €/kWh 0,26 €','P6 15 kWh x 0,147973 €/kWh 2,22 €','Total 65 kWh hasta 31/05/2026 11,37 €'],
    ['Peaje de acceso a la red (ATR): 3.0TD','Potencia contratada (kW): 16 / 16 / 16 / 16 / 16 / 16','Identificación punto de suministro (CUPS): ES 0000 0000 0000 0001 AA']
  ];
  const diana={pages:dianaBrokenPages,rawPages:rawFromPages(dianaSource.pages),text:dianaBrokenPages.flat().join('\n')};
  const d=parser.parse(diana,{name:'diana-browser.pdf'});
  assert.equal(d.readOk,true,JSON.stringify(d));
  assert.equal(d.company,'CLIENTE PRUEBA TRES CERO');
  assert.equal(d.period,'27/04/2026 - 31/05/2026 (34 días)');
  assert.equal(d.kwh,65);assert.equal(d.energy,11.37);assert.equal(d.power,66.5);assert.equal(d.tax,3.93);assert.equal(d.diff,0);
  assert.deepEqual([d.periods.P1.consumption,d.periods.P2.consumption,d.periods.P3.consumption,d.periods.P4.consumption,d.periods.P5.consumption,d.periods.P6.consumption],[0,28,14,6,2,15]);
});


function spatialPage(rows){
  const items=[];
  rows.forEach((parts,rowIndex)=>{
    const y=800-rowIndex*11;
    for(const [x,str] of parts)items.push({str,transform:[1,0,0,1,x,y],height:9});
  });
  return items;
}

test('Iberdrola geometry parser ignores consumption infographic euros and reads only billed concept rows',()=>{
  const carla={
    pages:[],
    rawPages:[
      spatialPage([
        [[40,'FACTURA DE ELECTRICIDAD'],[260,'IBERDROLA CLIENTES, S.A.U.']],
        [[40,'CLIENTE PRUEBA ALFA']],
        [[40,'C/ DE LA PRUEBA, 5']],
        [[40,'CONTRATO']],
        [[40,'Dirección de suministro:'],[210,'C/ DE LA PRUEBA, 5 07190 ESPORLES (ILLES BALEARS)']],
        [[40,'Nº DE CONTRATO: 600000002']],
        [[40,'RESUMEN DE FACTURA']],
        [[40,'PERIODO DE FACTURACIÓN:'],[250,'22/06/2026 - 19/07/2026']],
        [[40,'Nº FACTURA:'],[250,'21260727010128461']],
        [[40,'DIAS FACTURADOS:'],[250,'27']],
        [[40,'ENERGÍA'],[520,'101,36 €']],
        [[40,'DESCUENTOS ENERGÍA'],[520,'-10,84 €']],
        [[40,'CARGOS NORMATIVOS'],[520,'0,62 €']],
        [[40,'SERVICIOS Y OTROS CONCEPTOS'],[520,'0,72 €']],
        [[40,'IVA'],[520,'19,29 €']],
        [[40,'TOTAL'],[520,'111,15 €']]
      ]),
      spatialPage([
        [[40,'INFORMACIÓN SOBRE CONSUMO']],
        [[40,'485,91 kWh'],[300,'4,12 €'],[400,'4,12 €']],
        [[40,'DETALLE DE FACTURA']],
        [[40,'ENERGÍA']],
        [[40,'Potencia facturada Punta'],[270,'5,75 kW x 27 días x 0,108192 €/kW día'],[540,'16,80 €']],
        [[40,'Valle'],[270,'5,75 kW x 27 días x 0,050658 €/kW día'],[540,'7,86 €']],
        [[40,'Total importe potencia hasta 19/07/2026'],[540,'24,66 €']],
        [[40,'Energía consumida'],[270,'485,91 kWh x 0,148729 €/kWh'],[540,'72,27 €']],
        [[40,'Descuento sobre consumo 15%'],[270,'15 % s/72,27 €'],[540,'-10,84 €']],
        [[40,'CARGOS NORMATIVOS']],
        [[40,'Financiación bono social fijo (22/06/2026-30/06/2026)'],[540,'0,15 €']],
        [[40,'Financiación bono social fijo (30/06/2026-19/07/2026)'],[540,'0,47 €']],
        [[40,'Impuesto sobre electricidad (*)'],[270,'5,11269632 % s/86,71 €'],[540,'4,43 €']],
        [[40,'TOTAL ENERGÍA'],[540,'91,14 €']],
        [[40,'SERVICIOS Y OTROS CONCEPTOS']],
        [[40,'Alquiler equipos medida'],[540,'0,72 €']],
        [[40,'TOTAL SERVICIOS Y OTROS CONCEPTOS'],[540,'0,72 €']],
        [[40,'IMPORTE TOTAL'],[540,'91,86 €']],
        [[40,'IVA (*)'],[270,'21 % s/91,86 €'],[540,'19,29 €']],
        [[40,'TOTAL IMPORTE FACTURA'],[540,'111,15 €']],
        [[40,'Peaje de acceso a la red (ATR): 2.0TD']],
        [[40,'Identificación punto de suministro (CUPS): ES 0000 0000 0000 0002 AA']],
        [[40,'Sus consumos desagregados han sido punta: 175,87 kWh; llano: 137,31 kWh; valle 172,73 kWh.']]
      ])
    ]
  };
  carla.text='intentionally misleading flattened text 485,91 kWh 4,12 € 4,12 €';
  const cr=parser.parse(carla,{name:'carla-real-geometry.pdf'});
  assert.equal(cr.readOk,true,JSON.stringify(cr));
  assert.equal(cr.energy,72.27);
  assert.equal(cr.power,24.66);
  assert.equal(cr.discounts,-10.84);
  assert.equal(cr.social,0.62);
  assert.equal(cr.rental,0.72);
  assert.equal(cr.tax,4.43);
  assert.equal(cr.vat,19.29);
  assert.equal(cr.other,-9.50);
  assert.equal(cr.total,111.15);
  assert.equal(cr.diff,0);

  const diana={
    pages:[],
    rawPages:[
      spatialPage([
        [[40,'FACTURA DE ELECTRICIDAD'],[260,'IBERDROLA CLIENTES, S.A.U.']],
        [[40,'ALICIA PRUEBA SINTETICA CLIENTE ALFA']],
        [[40,'C/ VIA PRUEBA, 17-., LC 18']],
        [[40,'CONTRATO']],
        [[40,'Dirección de suministro:'],[210,'C/ VIA PRUEBA, 17-., LC 18 PALMA 07199 PALMA DE MALLORCA (ILLES BALEARS)']],
        [[40,'Nº DE CONTRATO: 600000001']],
        [[40,'RESUMEN DE FACTURA']],
        [[40,'PERIODO DE FACTURACIÓN:'],[250,'27/04/2026 - 31/05/2026']],
        [[40,'Nº FACTURA:'],[250,'21260608010256253']],
        [[40,'DIAS FACTURADOS:'],[250,'34']],
        [[40,'ENERGÍA'],[520,'81,80 €']],
        [[40,'DESCUENTOS ENERGÍA'],[520,'-1,71 €']],
        [[40,'CARGOS NORMATIVOS'],[520,'0,65 €']],
        [[40,'SERVICIOS Y OTROS CONCEPTOS'],[520,'12,07 €']],
        [[40,'IVA'],[520,'19,49 €']],
        [[40,'TOTAL'],[520,'112,30 €']]
      ]),
      spatialPage([
        [[40,'INFORMACIÓN SOBRE CONSUMO']],
        [[40,'65 kWh'],[300,'3,30 €'],[400,'7,78 €']],
        [[40,'DETALLE DE FACTURA']],
        [[40,'ENERGÍA']],
        [[40,'Potencia facturada P1'],[270,'16 kW x 34 días x 0,057502 €/kW día'],[540,'31,28 €']],
        [[40,'P2'],[270,'16 kW x 34 días x 0,029962 €/kW día'],[540,'16,30 €']],
        [[40,'P3'],[270,'16 kW x 34 días x 0,012647 €/kW día'],[540,'6,88 €']],
        [[40,'P4'],[270,'16 kW x 34 días x 0,010967 €/kW día'],[540,'5,97 €']],
        [[40,'P5'],[270,'16 kW x 34 días x 0,007094 €/kW día'],[540,'3,86 €']],
        [[40,'P6'],[270,'16 kW x 34 días x 0,00407 €/kW día'],[540,'2,21 €']],
        [[40,'Total importe potencia hasta 31/05/2026'],[540,'66,50 €']],
        [[40,'Energía consumida P2'],[270,'28 kWh x 0,198752 €/kWh'],[540,'5,57 €']],
        [[40,'P3'],[270,'14 kWh x 0,172594 €/kWh'],[540,'2,42 €']],
        [[40,'P4'],[270,'6 kWh x 0,150296 €/kWh'],[540,'0,90 €']],
        [[40,'P5'],[270,'2 kWh x 0,131956 €/kWh'],[540,'0,26 €']],
        [[40,'P6'],[270,'15 kWh x 0,147973 €/kWh'],[540,'2,22 €']],
        [[40,'Total 65 kWh hasta 31/05/2026'],[540,'11,37 €']],
        [[40,'Descuento sobre consumo 15%'],[540,'-1,71 €']],
        [[40,'CARGOS NORMATIVOS']],
        [[40,'Financiación bono social fijo'],[540,'0,65 €']],
        [[40,'Impuesto sobre electricidad (*)'],[270,'5,11269632 % s/76,81 €'],[540,'3,93 €']],
        [[40,'TOTAL ENERGÍA'],[540,'80,74 €']],
        [[40,'SERVICIOS Y OTROS CONCEPTOS']],
        [[40,'Alquiler equipos medida'],[540,'12,07 €']],
        [[40,'IVA'],[270,'21 % s/92,81 €'],[540,'19,49 €']],
        [[40,'TOTAL IMPORTE FACTURA'],[540,'112,30 €']],
        [[40,'300000001 Energía activa P1 27/04/2026 4.648 31/05/2026 4.648 0 kWh']],
        [[40,'300000001 Energía activa P2 27/04/2026 4.783 31/05/2026 4.811 28 kWh']]
      ]),
      spatialPage([
        [[40,'Última lectura: real']],
        [[40,'Peaje de acceso a la red (ATR): 3.0TD']],
        [[40,'Potencia contratada (kW): 16 / 16 / 16 / 16 / 16 / 16']],
        [[40,'Identificación punto de suministro (CUPS): ES 0000 0000 0000 0001 AA']]
      ])
    ]
  };
  diana.text='intentionally misleading flattened text 65 kWh 3,30 € 7,78 €';
  const dr=parser.parse(diana,{name:'diana-real-geometry.pdf'});
  assert.equal(dr.readOk,true,JSON.stringify(dr));
  assert.equal(dr.kwh,65);
  assert.equal(dr.energy,11.37);
  assert.equal(dr.power,66.50);
  assert.equal(dr.discounts,-1.71);
  assert.equal(dr.social,0.65);
  assert.equal(dr.rental,12.07);
  assert.equal(dr.tax,3.93);
  assert.equal(dr.vat,19.49);
  assert.equal(dr.other,11.01);
  assert.equal(dr.total,112.30);
  assert.equal(dr.diff,0);
  assert.deepEqual([dr.periods.P1.consumption,dr.periods.P2.consumption,dr.periods.P3.consumption,dr.periods.P4.consumption,dr.periods.P5.consumption,dr.periods.P6.consumption],[0,28,14,6,2,15]);
});


function classicThreeZeroSingleRate(){
  return doc([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','PLAN ESTABLE',
    'CLIENTE SINTETICO CLASICO, S.L.','Titular C/ PRUEBA CLASICA, 1','07000 CIUDAD (ILLES BALEARS)',
    'Dirección de suministro:','C/ PRUEBA CLASICA, 1 07000 CIUDAD (ILLES BALEARS)',
    'Número de factura 21240000000000001','Nº DE CONTRATO: 600000001',
    'RESUMEN DE FACTURA','PERIODO DE FACTURACIÓN: 01/01/2024 - 30/01/2024',
    'DIAS FACTURADOS: 29','ENERGÍA 379,67 €','DESCUENTOS ENERGÍA -46,35 €',
    'CARGOS NORMATIVOS 0,60 €','SERVICIOS Y OTROS CONCEPTOS 5,00 €',
    'IVA 71,17 €','TOTAL 410,09 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA',
    'Potencia facturada P1 10 kW x 29 días x 0,050000 €/kW día 14,50 €',
    'P2 10 kW x 29 días x 0,040000 €/kW día 11,60 €',
    'P3 10 kW x 29 días x 0,030000 €/kW día 8,70 €',
    'P4 10 kW x 29 días x 0,025000 €/kW día 7,25 €',
    'P5 10 kW x 29 días x 0,020000 €/kW día 5,80 €',
    'P6 10 kW x 29 días x 0,015000 €/kW día 4,35 €',
    'Total importe potencia hasta 30/01/2024 52,20 €',
    'Energía consumida 1.545 kWh x 0,200000 €/kWh 309,00 €',
    'Descuento sobre consumo 5% 5 % s/309,00 € -15,45 €',
    'Descuento sobre consumo 10% 10 % s/309,00 € -30,90 €',
    'CARGOS NORMATIVOS','Financiación bono social fijo 29 días 0,60 €',
    'Impuesto sobre electricidad 18,47 €',
    'SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 1,00 €',
    'Protección eléctrica negocio 4,00 €','TOTAL SERVICIOS Y OTROS CONCEPTOS 5,00 €',
    'IVA 21 % 71,17 €','TOTAL IMPORTE FACTURA 410,09 €',
    'Energía activa P1 01/01/2024 100 30/01/2024 200 100 kWh',
    'Energía activa P2 01/01/2024 200 30/01/2024 400 200 kWh',
    'Energía activa P3 01/01/2024 300 30/01/2024 600 300 kWh',
    'Energía activa P4 01/01/2024 400 30/01/2024 800 400 kWh',
    'Energía activa P5 01/01/2024 500 30/01/2024 750 250 kWh',
    'Energía activa P6 01/01/2024 600 30/01/2024 895 295 kWh',
    'Peaje de acceso a la red (ATR): 3.0TD',
    'Identificación punto de suministro (CUPS): ES 0000 0000 0000 0001 AA',
    'NIF: B00000001'
  ]);
}

function modernThreeZeroThousands(){
  return doc([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','CON GARANTIA DE',
    'CLIENTE SINTETICO MODERNO','Titular Potencia: C/ PRUEBA MODERNA, 2',
    'Dirección de suministro: C/ PRUEBA MODERNA, 2 07000 CIUDAD (ILLES BALEARS)',
    'Nº DE CONTRATO: 600000002','RESUMEN DE FACTURA',
    'PERIODO DE FACTURACIÓN: Nº FACTURA:','01/05/2026 - 31/05/2026 21260000000000102',
    'DIAS FACTURADOS: 30','ENERGÍA 2.728,00 €','DESCUENTOS ENERGÍA -400,00 €',
    'CARGOS NORMATIVOS 0,50 €','SERVICIOS Y OTROS CONCEPTOS 5,50 €',
    'IVA 490,14 €','TOTAL 2.824,14 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA',
    'Potencia facturada P1 10 kW x 30 días x 0,100000 €/kW día 30,00 €',
    'P2 10 kW x 30 días x 0,080000 €/kW día 24,00 €',
    'P3 10 kW x 30 días x 0,060000 €/kW día 18,00 €',
    'P4 10 kW x 30 días x 0,040000 €/kW día 12,00 €',
    'P5 10 kW x 30 días x 0,030000 €/kW día 9,00 €',
    'P6 10 kW x 30 días x 0,020000 €/kW día 6,00 €',
    'Total importe potencia hasta 31/05/2026 99,00 €',
    'Energía consumida 12.345 kWh x 0,200000 €/kWh 2.469,00 €',
    'Descuento sobre consumo 400,00 € -400,00 €',
    'CARGOS NORMATIVOS','Financiación bono social fijo 0,50 €',
    'Energía reactiva P4 100 kVArh x 0,200000 €/kVArh 20,00 €',
    'Total energía reactiva 20,00 €',
    'Impuesto sobre electricidad 140,00 €',
    'SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 5,50 €',
    'TOTAL SERVICIOS Y OTROS CONCEPTOS 5,50 €',
    'IVA 21 % 490,14 €','TOTAL IMPORTE FACTURA 2.824,14 €',
    'Energía activa P1 01/05/2026 1.000 31/05/2026 1.000 0 kWh',
    'Energía activa P2 01/05/2026 2.000 31/05/2026 2.000 0 kWh',
    'Energía activa P3 01/05/2026 3.000 31/05/2026 3.000 0 kWh',
    'Energía activa P4 01/05/2026 4.000 31/05/2026 8.000 4.000 kWh',
    'Energía activa P5 01/05/2026 5.000 31/05/2026 8.000 3.000 kWh',
    'Energía activa P6 01/05/2026 6.000 31/05/2026 11.345 5.345 kWh',
    'Peaje de acceso a la red (ATR): 3.0TD',
    'Identificación punto de suministro (CUPS): ES 0000 0000 0000 0002 AA'
  ]);
}

function twoZeroThousandsWithService(){
  return doc([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.','Energía','Pack sintético 99,99 €',
    'CLIENTE SINTETICO DOS CERO','Titular Potencia: C/ PRUEBA DOS, 3',
    'Dirección de suministro: C/ PRUEBA DOS, 3 07000 CIUDAD (ILLES BALEARS)',
    'Nº DE CONTRATO: 600000003','RESUMEN DE FACTURA',
    'PERIODO DE FACTURACIÓN: Nº FACTURA:','01/06/2026 - 01/07/2026 21260000000000103',
    'DIAS FACTURADOS: 30','ENERGÍA 211,75 €','DESCUENTOS ENERGÍA -17,93 €',
    'CARGOS NORMATIVOS 0,50 €','SERVICIOS Y OTROS CONCEPTOS 5,00 Duplicado €',
    'IVA 41,86 €','TOTAL 241,18 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA',
    'Potencia facturada Punta 5 kW x 30 días x 0,100000 €/kW día 15,00 €',
    'Valle 5 kW x 30 días x 0,050000 €/kW día 7,50 €',
    'Total importe potencia hasta 01/07/2026 22,50 €',
    'Energía consumida 1.195 kWh x 0,150000 €/kWh 179,25 €',
    'Descuento sobre consumo 10% 10 % s/179,25 € -17,93 €',
    'CARGOS NORMATIVOS','Financiación bono social fijo 0,50 €',
    'Impuesto sobre electricidad 10,00 €',
    'SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 1,00 €',
    'Servicio adicional sintético 4,00 €','TOTAL SERVICIOS Y OTROS CONCEPTOS 5,00 €',
    'IVA 21 % 41,86 €','TOTAL IMPORTE FACTURA 241,18 €',
    'Peaje de acceso a la red (ATR): 2.0TD',
    'Identificación punto de suministro (CUPS): ES 0000 0000 0000 0003 AA',
    'Sus consumos desagregados han sido punta: 235 kWh; llano: 142 kWh; valle 818 kWh.'
  ]);
}

function referencedThreeZero(){
  return doc([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.',
    'CLIENTE SINTETICO REFERENCIADO','Titular Potencia: C/ PRUEBA INDEXADA, 4',
    'Dirección de suministro: C/ PRUEBA INDEXADA, 4 07000 CIUDAD (ILLES BALEARS)',
    'Nº DE CONTRATO: 600000004','RESUMEN DE FACTURA',
    'PERIODO DE FACTURACIÓN: Nº FACTURA:','01/07/2026 - 31/07/2026 21260000000000104',
    'DIAS FACTURADOS: 30','ENERGÍA 108,30 €',
    'CARGOS NORMATIVOS 0,50 €','SERVICIOS Y OTROS CONCEPTOS 1,00 €',
    'IVA 23,06 €','TOTAL 132,86 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA',
    'Potencia facturada peajes P1 10 kW x 30 días x 0,010000 €/kW día 3,00 €',
    'P2 10 kW x 30 días x 0,009000 €/kW día 2,70 €',
    'P3 10 kW x 30 días x 0,008000 €/kW día 2,40 €',
    'P4 10 kW x 30 días x 0,007000 €/kW día 2,10 €',
    'P5 10 kW x 30 días x 0,006000 €/kW día 1,80 €',
    'P6 10 kW x 30 días x 0,005000 €/kW día 1,50 €',
    'Total términos de potencia peajes 13,50 €',
    'Potencia facturada (cargos) P1 10 kW x 30 días x 0,005000 €/kW día 1,50 €',
    'P2 10 kW x 30 días x 0,004000 €/kW día 1,20 €',
    'P3 10 kW x 30 días x 0,003000 €/kW día 0,90 €',
    'P4 10 kW x 30 días x 0,002000 €/kW día 0,60 €',
    'P5 10 kW x 30 días x 0,001000 €/kW día 0,30 €',
    'P6 10 kW x 30 días x 0,001000 €/kW día 0,30 €',
    'Total importes de potencia (cargos) 4,80 €',
    'Energía Referenciada P1 100 kWh x 0,200000 €/kWh 20,00 €',
    'P2 200 kWh x 0,150000 €/kWh 30,00 €',
    'P6 300 kWh x 0,100000 €/kWh 30,00 €',
    'Total Energía Referenciada 80,00 €',
    'Exceso de potencia 3,00 €','Total energía reactiva 2,00 €',
    'CARGOS NORMATIVOS','Financiación bono social fijo 0,50 €',
    'Impuesto sobre electricidad 5,00 €',
    'SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 1,00 €',
    'TOTAL SERVICIOS Y OTROS CONCEPTOS 1,00 €',
    'IVA 21 % 23,06 €','TOTAL IMPORTE FACTURA 132,86 €',
    'Energía activa P1 01/07/2026 100 31/07/2026 200 100 kWh',
    'Energía activa P2 01/07/2026 200 31/07/2026 400 200 kWh',
    'Energía activa P3 01/07/2026 300 31/07/2026 300 0 kWh',
    'Energía activa P4 01/07/2026 400 31/07/2026 400 0 kWh',
    'Energía activa P5 01/07/2026 500 31/07/2026 500 0 kWh',
    'Energía activa P6 01/07/2026 600 31/07/2026 900 300 kWh',
    'Peaje de acceso a la red (ATR): 3.0TD',
    'Identificación punto de suministro (CUPS): ES 0000 0000 0000 0004 AA'
  ]);
}

test('Iberdrola classic 3.0TD reads dotted thousands, old invoice label, repeated discounts and full services total',()=>{
  const r=parser.parse(classicThreeZeroSingleRate(),{name:'classic-synthetic.pdf'});
  assert.equal(r.readOk,true,JSON.stringify(r));
  assert.equal(r.company,'CLIENTE SINTETICO CLASICO, S.L.');
  assert.equal(r.invoiceNumber,'21240000000000001');
  assert.equal(r.kwh,1545);
  assert.equal(r.energy,309);
  assert.equal(r.power,52.2);
  assert.equal(r.discounts,-46.35);
  assert.equal(r.other,-40.75);
  assert.equal(r.total,410.09);
  assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption,r.periods.P4.consumption,r.periods.P5.consumption,r.periods.P6.consumption],[100,200,300,400,250,295]);
});

test('Iberdrola modern 3.0TD reads thousands from meter rows and billed reactive separately',()=>{
  const r=parser.parse(modernThreeZeroThousands(),{name:'modern-synthetic.pdf'});
  assert.equal(r.readOk,true,JSON.stringify(r));
  assert.equal(r.company,'CLIENTE SINTETICO MODERNO');
  assert.equal(r.kwh,12345);
  assert.equal(r.energy,2469);
  assert.equal(r.power,99);
  assert.equal(r.reactive,20);
  assert.equal(r.total,2824.14);
  assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption,r.periods.P4.consumption,r.periods.P5.consumption,r.periods.P6.consumption],[0,0,0,4000,3000,5345]);
});

test('Iberdrola 2.0TD keeps dotted thousands as quantities and accounts for services beyond meter rental',()=>{
  const r=parser.parse(twoZeroThousandsWithService(),{name:'2.0-thousands-synthetic.pdf'});
  assert.equal(r.readOk,true,JSON.stringify(r));
  assert.equal(r.kwh,1195);
  assert.equal(r.energy,179.25);
  assert.equal(r.power,22.5);
  assert.equal(r.rental,1);
  assert.equal(r.other,-12.43);
  assert.equal(r.total,241.18);
  assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption],[235,142,818]);
});

test('Iberdrola referenced 3.0TD combines toll and charge power, excess and reactive without inventing missing periods',()=>{
  const r=parser.parse(referencedThreeZero(),{name:'referenced-synthetic.pdf'});
  assert.equal(r.readOk,true,JSON.stringify(r));
  assert.equal(r.energyPricingMode,'referenced_periods');
  assert.equal(r.kwh,600);
  assert.equal(r.energy,80);
  assert.equal(r.power,18.3);
  assert.equal(r.excess,3);
  assert.equal(r.reactive,2);
  assert.equal(r.total,132.86);
  assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption,r.periods.P4.consumption,r.periods.P5.consumption,r.periods.P6.consumption],[100,200,0,0,0,300]);
});


function splitTwoZero(){
  return doc([
    'FACTURA DE','ELECTRICIDAD','IBERDROLA CLIENTES, S.A.U.',
    'CLIENTE PRUEBA SPLIT','Titular Potencia: C/ EJEMPLO SPLIT, 5',
    'Dirección de suministro: C/ EJEMPLO SPLIT, 5 07000 CIUDAD (ILLES BALEARS)',
    'Nº DE CONTRATO: 600000005','RESUMEN DE FACTURA',
    'PERIODO DE FACTURACIÓN: Nº FACTURA:','03/12/2025 - 07/01/2026 21260000000000105',
    'DIAS FACTURADOS: FECHA DE EMISIÓN:','36 12 de enero de 2026',
    'ENERGÍA 205,67 €','DESCUENTOS ENERGÍA -22,13 €','CARGOS NORMATIVOS 0,49 €',
    'SERVICIOS Y OTROS CONCEPTOS 3,38 €','IVA 39,36 €','TOTAL 226,77 €'
  ],[
    'DETALLE DE FACTURA','ENERGÍA',
    'Potencia facturada (03/12/2025-31/12/2025) Punta 9 kW x 28 días x 0,108192 €/kW día 27,26 €',
    'Valle 9 kW x 28 días x 0,046548 €/kW día 11,73 €',
    'Total importe potencia hasta 31/12/2025 38,99 €',
    'Potencia facturada (31/12/2025-07/01/2026) Punta 9 kW x 7 días x 0,113621 €/kW día 7,16 €',
    'Valle 9 kW x 7 días x 0,048095 €/kW día 3,03 €',
    'Total importe potencia hasta 07/01/2026 10,19 €',
    'Energía consumida (03/12/2025-31/12/2025) 671 kWh x 0,174875 €/kWh 117,34 €',
    'Energía consumida (31/12/2025-07/01/2026) 166 kWh x 0,181957 €/kWh 30,20 €',
    'Descuento sobre consumo 15% 15 % s/147,54 € -22,13 €',
    'CARGOS NORMATIVOS','Financiación bono social fijo 0,49 €',
    'Impuesto sobre electricidad 8,95 €','TOTAL ENERGÍA 184,03 €',
    'SERVICIOS Y OTROS CONCEPTOS','Alquiler equipos medida 1,56 €',
    'Servicio sintético 1,82 €','TOTAL SERVICIOS Y OTROS CONCEPTOS 3,38 €',
    'IVA 21 % 39,36 €','TOTAL IMPORTE FACTURA 226,77 €',
    'Peaje de acceso a la red (ATR): 2.0TD',
    'Identificación punto de suministro (CUPS): ES 0000 0000 0000 0005 AA',
    'Sus consumos desagregados han sido punta: 137 kWh; llano: 88 kWh; valle 612 kWh.'
  ]);
}

function fneeVariant(){
  const d=modernThreeZeroThousands();
  d.pages[0]=d.pages[0].map(x=>x
    .replace('ENERGÍA 2.728,00 €','ENERGÍA 2.738,00 €')
    .replace('TOTAL 2.824,14 €','TOTAL 2.834,14 €'));
  const at=d.pages[1].findIndex(x=>x.includes('Descuento sobre consumo'));
  d.pages[1].splice(at,0,'Regularización FNEE (*) 10.000 kWh x 0,001000 €/kWh 10,00 €');
  d.pages[1]=d.pages[1].map(x=>x.replace('TOTAL IMPORTE FACTURA 2.824,14 €','TOTAL IMPORTE FACTURA 2.834,14 €'));
  d.text=d.pages.flat().join('\n');
  return d;
}

test('Iberdrola detail concepts add power discounts and multiple VAT lines without losing cents',()=>{
  const rows=parser._test.rowsFromLines([
    'Descuento sobre consumo 15% 15 % s/141,15 € -21,17 €',
    'Descuento sobre T. Potencia 5% s/22,94 € -1,15 €',
    'IVA Reducido (*) 10 % s/189,70 € 18,97 €',
    'IVA 21 % s/7,28 € 1,53 €'
  ]);
  const d=parser._test.parseDetailConcepts(rows);
  assert.equal(d.discount,-22.32);
  assert.equal(d.vat,20.5);
});

test('Iberdrola 2.0TD aggregates split power and energy sub-periods and preserves printed billed days',()=>{
  const r=parser.parse(splitTwoZero(),{name:'split-2.0-synthetic.pdf'});
  assert.equal(r.readOk,true,JSON.stringify(r));
  assert.equal(r.billingDays,36);
  assert.equal(r.period,'03/12/2025 - 07/01/2026 (36 días)');
  assert.equal(r.power,49.18);
  assert.equal(r.energy,147.54);
  assert.equal(r.kwh,837);
  assert.equal(r.energyPricingMode,'split_single_rate');
  assert.equal(r.diff,0);
  assert.deepEqual([r.periods.P1.consumption,r.periods.P2.consumption,r.periods.P3.consumption],[137,88,612]);
});

test('Iberdrola includes FNEE regularization as an explicit adjustment in the economic balance',()=>{
  const r=parser.parse(fneeVariant(),{name:'fnee-synthetic.pdf'});
  assert.equal(r.readOk,true,JSON.stringify(r));
  assert.equal(r.fneeRegularization,10);
  assert.equal(r.other,-384);
  assert.equal(r.total,2834.14);
  assert.equal(r.diff,0);
});

test('Iberdrola rejects commercial simulations even when they contain invoice-like labels',()=>{
  const d=doc(['IBERDROLA CLIENTES, S.A.U.','SIMULACIÓN Y COMPARATIVA','Oferta para comparar','DATOS DE FACTURA COMPARATIVA','TOTAL IMPORTE FACTURA IBERDROLA 107,03 €','ELECTRICIDAD']);
  assert.equal(parser.detect(d),false);
});
