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
