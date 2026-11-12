const test=require('node:test');
const assert=require('node:assert/strict');
const parser=require('../sea-parser.js');

function sample(){
  const p1=[
    'Datos de la factura Resumen de la factura',
    'TOTAL IMPORTE FACTURA: 176,42 EUR',
    'N\u00ba Factura: FVE20260000001 Emitida: 12/11/2026',
    'Periodo consumo: 09/10/2026 - 06/11/2026',
    'Datos del contacto',
    'Titular: CLIENTE PRUEBA SEA Forma de pago: Domiciliacion',
    'NIF: 00000000T Entidad bancaria: BANCO PRUEBA',
    'N\u00ba Contrato: 9001 N\u00ba Cuenta: ****0000',
    'Fecha Fin contrato: 09/10/2027 Fecha de cargo: 19/11/2026',
    'Datos del punto de suministro',
    'CUPS: ES0000000000000009AA0F',
    'Direcci\u00f3n del suministro: Calle PRUEBA 29 07190 Esporles (Balears, Illes)',
    'Tarifa de acceso mercado libre: 2.0TD Contrato de Acceso: 500000000009 Contador: 200000009',
    'Potencia Contratada: P1: 5,600 kW. P2: 5,600 kW.',
    'Distribuidora: EDISTRIBUCI\u00d3N REDES DIGITALES S.L.U.',
    'Segmento de cargos: 1',
    'Tipo de contrato: Anual',
    'Informaci\u00f3n del Consumo El\u00e9ctrico',
    'Tu consumo en el periodo facturado ha sido 796,455 kWh',
    'Las potencias m\u00e1ximas (kW) demandadas en el \u00faltimo a\u00f1o han sido:',
    'P1 7,632 P3 7,820',
    'Servicios Energ\u00e9ticos Avanzados, S.L. - C/Gremi de Sabaters 21, B24, 2 planta 07009 Palma. Mallorca. CIF B139'+'00816',
    'https://seravanzados.com/'
  ];
  const p2=[
    'Desglose de la factura',
    'T\u00e9rmino de Potencia Contratada 25,11 \u20ac',
    'P1 5,600 kW 0,117018 \u20ac/kW * 28 d\u00edas (09/10/2026 a 06/11/2026) 18,35 \u20ac',
    'P2 5,600 kW 0,043085 \u20ac/kW * 28 d\u00edas (09/10/2026 a 06/11/2026) 6,76 \u20ac',
    'De los cuales peajes y cargos:',
    'P1 5,600 kW * (0,063904 \u20ac/kW + 0,011999 \u20ac/kW) * (28/365) d\u00edas (09/10/2026 a 06/11/2026) 11,90 \u20ac',
    'P2 5,600 kW * (0,001216 \u20ac/kW + 0,000772 \u20ac/kW) * (28/365) d\u00edas (09/10/2026 a 06/11/2026) 0,31 \u20ac',
    'T\u00e9rmino de Energ\u00eda Activa 102,75 \u20ac',
    'P1 226,191 kWh 0,129000 \u20ac/kWh (09/10/2026 a 06/11/2026) 29,18 \u20ac',
    'P2 158,363 kWh 0,129000 \u20ac/kWh (09/10/2026 a 06/11/2026) 20,43 \u20ac',
    'P3 411,901 kWh 0,129000 \u20ac/kWh (09/10/2026 a 06/11/2026) 53,14 \u20ac',
    'De los cuales peajes y cargos:',
    'P1 226,191 kWh * (0,033261 \u20ac/kWh + 0,064292 \u20ac/kWh) (09/10/2026 a 06/11/2026) 22,07 \u20ac',
    'P2 158,363 kWh * (0,016409 \u20ac/kWh + 0,012858 \u20ac/kWh) (09/10/2026 a 06/11/2026) 4,63 \u20ac',
    'P3 411,901 kWh * (0,000077 \u20ac/kWh + 0,003215 \u20ac/kWh) (09/10/2026 a 06/11/2026) 1,36 \u20ac',
    'Financiaci\u00f3n Bono Social: 0,69 \u20ac',
    'Coste servicios de ajuste del sistema (REE):',
    '796,455 kWh * 0,011853 \u20ac/kWh 9,44 \u20ac',
    'Impuesto de Electricidad (5,11269632% s/137,99 \u20ac): 7,06 \u20ac',
    'Alquiler de contador',
    '28 d\u00edas * 0,026630 \u20ac/d\u00eda 0,75 \u20ac',
    'IVA: (21% s/145,80 \u20ac) 30,62 \u20ac',
    'TOTAL IMPORTE FACTURA: 176,42 \u20ac',
    'Lecturas',
    'Consumo activo (kWh) 09/10/2026 REAL 22.239,746 14.643,732 23.348,962 0,000 0,000 0,000 200000009',
    '06/11/2026 REAL 22.465,937 14.802,095 23.760,863 0,000 0,000 0,000',
    'Cons. kWh 226,191 158,363 411,901 0,000 0,000 0,000',
    'Servicios Energ\u00e9ticos Avanzados, S.L. - C/Gremi de Sabaters 21, B24, 2 planta 07009 Palma. Mallorca. CIF B139'+'00816'
  ];
  return {pages:[p1,p2],text:[...p1,...p2].join('\n')};
}

test('detecta solo el formato SEA',()=>{
  assert.equal(parser.detect(sample()),true);
  assert.equal(parser.detect({text:'Naturgy Clientes, S.A.U. Desglose de la factura Datos de la factura'}),false);
  assert.equal(parser.detect({text:'FENIE ENERGIA Datos de la factura Desglose de la factura'}),false);
  assert.equal(parser.detect({text:'Servicios Energeticos Avanzados, S.L. B139'+'00816 Datos de la factura'}),false);
});

test('extrae SEA 2.0TD, conserva REE y cuadra',()=>{
  const r=parser.parse(sample(),{name:'sea-demo.pdf'},{parserVersion:'test'});
  assert.ok(r);
  assert.equal(r.readOk,true,r.readMessage);
  assert.equal(r.sourceFormat,'sea');
  assert.equal(r.invoiceNumber,'FVE20260000001');
  assert.equal(r.company,'CLIENTE PRUEBA SEA');
  assert.equal(r.taxId,'00000000T');
  assert.equal(r.cups,'ES0000000000000009AA0F');
  assert.equal(r.period,'09/10/2026 - 06/11/2026 (28 d\u00edas)');
  assert.equal(r.tariff,'2.0TD');
  assert.equal(r.contract,'9001');
  assert.equal(r.accessContract,'500000000009');
  assert.equal(r.meterNumber,'200000009');
  assert.equal(r.renewalDate,'09/10/2027');
  assert.equal(r.contractType,'Mercado libre');
  assert.equal(r.contractDurationType,'Anual');
  assert.equal(r.supplyCity,'Esporles');
  assert.equal(r.supplyProvince,'Balears, Illes');
  assert.equal(r.kwh,796.455);
  assert.equal(r.energy,102.75);
  assert.equal(r.power,25.11);
  assert.equal(r.social,0.69);
  assert.equal(r.systemAdjustment,9.44);
  assert.equal(r.rental,0.75);
  assert.equal(r.other,10.88);
  assert.equal(r.tax,7.06);
  assert.equal(r.vat,30.62);
  assert.equal(r.total,176.42);
  assert.equal(r.accounted,176.42);
  assert.equal(r.diff,0);
  assert.equal(r.balanced,true);
  assert.equal(r.readingStatus,'actual');
  assert.deepEqual(Object.fromEntries(Object.entries(r.periods).map(([k,v])=>[k,v.consumption])),{P1:226.191,P2:158.363,P3:411.901});
  assert.deepEqual(r.contracted,{P1:5.6,P2:5.6});
  assert.equal(r.periods.P1.price,0.129);
  assert.equal(r.periods.P1.cost,29.18);
  assert.equal(r.maximeters._reliable,false);
  assert.deepEqual(r.maximeters._raw,{P1:7.632,P3:7.82});
  assert.match(r.maximeters._reason,/no se remapea/i);
  assert.ok(r.adjustments.some(x=>x.category==='system_adjustment'&&x.amount_eur===9.44));
  assert.equal(r.validation.consumptionPeriods,true);
  assert.equal(r.validation.consumptionTotal,true);
  assert.equal(r.validation.energyCost,true);
  assert.equal(r.validation.power,true);
  assert.equal(r.validation.economicBalance,true);
});

test('ignora el desglose informativo de peajes y cargos',()=>{
  const r=parser.parse(sample(),{name:'sea-duplicate-lines.pdf'});
  assert.equal(r.powerDetail.entries.length,2);
  assert.equal(r.energyDetail.entries.length,3);
  assert.equal(r.powerDetail.sum,25.11);
  assert.equal(r.energyDetail.sum,102.75);
});

test('falla cerrado si el total deja de cuadrar',()=>{
  const d=sample();
  d.pages[0]=d.pages[0].map(x=>x==='TOTAL IMPORTE FACTURA: 176,42 EUR'?'TOTAL IMPORTE FACTURA: 177,42 EUR':x);
  d.pages[1]=d.pages[1].map(x=>x==='TOTAL IMPORTE FACTURA: 176,42 \u20ac'?'TOTAL IMPORTE FACTURA: 177,42 \u20ac':x);
  d.text=d.pages.flat().join('\n');
  const r=parser.parse(d,{name:'sea-bad-total.pdf'});
  assert.equal(r.readOk,false);
  assert.equal(r.balanced,false);
  assert.equal(r.diff,1);
  assert.match(r.readMessage,/cuadre economico/i);
});
