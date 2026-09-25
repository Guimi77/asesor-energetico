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
