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


function sampleCatalanFixed(){
  const p1=[
    'Dades de la factura Resum de la factura',
    'TOTAL IMPORT FACTURA: 58,62 €',
    'Núm. Factura: FVE20990001001 Emesa: 17/11/2026',
    'Període consum: 13/10/2026 - 10/11/2026',
    'Dades del contacte',
    'Titular: CLIENT PROVA CAT Mètode de pagament: Domiciliación',
    'NIF: 00000000T Entitat bancària: BANC PROVA',
    'Núm. Contracte: 9101 Núm. Compte: ****1998',
    'Data fi contracte: 13/10/2027 Data de càrrec: 24/11/2026',
    'Dades del punt de subministrament',
    'CUPS: ES0000000000000001AA0F',
    'Direcció del subministrament: Calle PRUEBA CAT 29 BJO 07190 Esporles (Balears, Illes)',
    "Tarifa d'accés mercat lliure: 2.0TD Contracte d'Accés: 500000000010 Comptador: 200000010",
    'Potència Contractada: P1: 5,600 kW. P2: 5,600 kW.',
    'Distribuïdora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.',
    'Segment de càrrecs: 1',
    'Tipus de contracte: Anual',
    'Informació del Consum Elèctric',
    'El teu consum en el període facturat ha estat 179,726 kWh',
    'Les potències màximes (kW) demandades el darrer any han estat:',
    'P1 5,216 P3 5,012',
    'https://seravanzados.com/'
  ];
  const p2=[
    'Desglossament de la factura',
    'Terme de Potència Contractada 15,65 €',
    'P1 5,600 kW 0,086881 €/kW * 28 dies (13/10/2026 a 10/11/2026) 13,62 €',
    'P2 5,600 kW 0,012948 €/kW * 28 dies (13/10/2026 a 10/11/2026) 2,03 €',
    'Dels quals peatges i càrrecs:',
    "Terme d'Energia Activa 27,15 €",
    'P1 55,811 kWh 0,151000 €/kWh (13/10/2026 a 10/11/2026) 8,43 €',
    'P2 42,816 kWh 0,151000 €/kWh (13/10/2026 a 10/11/2026) 6,47 €',
    'P3 81,099 kWh 0,151000 €/kWh (13/10/2026 a 10/11/2026) 12,25 €',
    'Finançament del Bo Social: 0,69 €',
    "Cost serveis d'ajust del sistema (REE):",
    '179,726 kWh * 0,010516 €/kWh 1,89 €',
    "Impost d'Electricitat (5,11269632% s/45,38 €): 2,32 €",
    'Lloguer de comptador',
    '28 dies * 0,026630 €/dia 0,75 €',
    'IVA: (21% s/48,45 €) 10,17 €',
    'TOTAL IMPORT FACTURA: 58,62 €',
    'Lectures',
    'Consum actiu (kWh) 13/10/2026 Real 31.352,598 13.692,856 12.128,757 0,000 0,000 0,000 200000010',
    '10/11/2026 Real 31.408,409 13.735,672 12.209,856 0,000 0,000 0,000',
    'Consum. kWh 55,811 42,816 81,099 0,000 0,000 0,000'
  ];
  return {pages:[p1,p2],text:[...p1,...p2].join('\n')};
}

function sampleCatalanIndexed(){
  const p1=[
    'Dades de la factura Resum de la factura',
    'TOTAL IMPORT FACTURA: 32,09 €',
    'Núm. Factura: FVE20990001002 Emesa: 17/11/2026',
    'Període consum: 13/10/2026 - 12/11/2026',
    'Dades del contacte',
    'Titular: CLIENT PROVA CAT Mètode de pagament: Domiciliación',
    'NIF: 00000000T Entitat bancària: BANC PROVA',
    'Núm. Contracte: 9102 Núm. Compte: ****1998',
    'Data fi contracte: 13/10/2027 Data de càrrec: 24/11/2026',
    'Dades del punt de subministrament',
    'CUPS: ES0000000000000002AA0F',
    'Direcció del subministrament: Calle PRUEBA CAT 29 GARAGE 07190 Esporles (Balears, Illes)',
    "Tarifa d'accés mercat lliure: 2.0TD Contracte d'Accés: 500000000011 Comptador: 200000011",
    'Potència Contractada: P1: 2,200 kW. P2: 2,200 kW.',
    'Distribuïdora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.',
    'Segment de càrrecs: 1',
    'Tipus de contracte: Anual',
    'Informació del Consum Elèctric',
    'El teu consum en el període facturat ha estat 108,893 kWh',
    'Les potències màximes (kW) demandades el darrer any han estat:',
    'P1 1,984 P3 1,968',
    'https://seravanzados.com/'
  ];
  const p2=[
    'Desglossament de la factura',
    'Terme de Potència Contractada 6,58 €',
    'P1 2,200 kW 0,086881 €/kW * 30 dies (13/10/2026 a 12/11/2026) 5,73 €',
    'P2 2,200 kW 0,012948 €/kW * 30 dies (13/10/2026 a 12/11/2026) 0,85 €',
    "Terme d'Energia Activa 16,04 €",
    'P1 25,736 kWh 0,215795 €/kWh (13/10/2026 a 12/11/2026) 5,55 €',
    'P2 27,701 kWh 0,149665 €/kWh (13/10/2026 a 12/11/2026) 4,15 €',
    'P3 55,456 kWh 0,114371 €/kWh (13/10/2026 a 12/11/2026) 6,34 €',
    'Finançament del Bo Social: 0,74 €',
    "Cost serveis d'ajust del sistema (REE):",
    '108,893 kWh * 0,010193 €/kWh 1,11 €',
    "Impost d'Electricitat (5,11269632% s/24,47 €): 1,25 €",
    'Lloguer de comptador',
    '30 dies * 0,026630 €/dia 0,80 €',
    'IVA: (21% s/26,52 €) 5,57 €',
    'TOTAL IMPORT FACTURA: 32,09 €',
    'Lectures',
    'Consum actiu (kWh) 13/10/2026 Real 6.232,360 1.730,394 3.946,559 0,000 0,000 0,000 200000011',
    '12/11/2026 Real 6.258,096 1.758,095 4.002,015 0,000 0,000 0,000',
    'Consum. kWh 25,736 27,701 55,456 0,000 0,000 0,000'
  ];
  return {pages:[p1,p2],text:[...p1,...p2].join('\n')};
}

test('detecta solo el formato SEA',()=>{
  assert.equal(parser.detect(sample()),true);
  assert.equal(parser.detect(sampleCatalanFixed()),true);
  assert.equal(parser.detect(sampleCatalanIndexed()),true);
  assert.equal(parser.detect({text:'Naturgy Clientes, S.A.U. Desglose de la factura Datos de la factura'}),false);
  assert.equal(parser.detect({text:'FENIE ENERGIA Datos de la factura Desglose de la factura'}),false);
  assert.equal(parser.detect({text:'Servicios Energeticos Avanzados, S.L. B139'+'00816 Datos de la factura'}),false);
});

test('detecta el layout PDF.js aunque el pie legal vertical no se reconstruya',()=>{
  const d=sample();
  d.pages=d.pages.map(page=>page.filter(line=>!line.includes('Servicios Energ')));
  d.text=d.pages.flat().join('\n');
  assert.equal(/B13900816/.test(d.text),false);
  assert.equal(/Servicios Energ/i.test(d.text),false);
  assert.equal(parser.detect(d),true);
  const r=parser.parse(d,{name:'sea-pdfjs-vertical-footer.pdf'});
  assert.ok(r);
  assert.equal(r.readOk,true,r.readMessage);
  assert.equal(r.cups,'ES0000000000000009AA0F');
  assert.equal(r.total,176.42);
});

test('no acepta un formato generico con REE sin ancla de emisor SEA',()=>{
  const d=sample();
  d.pages=d.pages.map(page=>page.filter(line=>!line.includes('Servicios Energ')&&!line.includes('seravanzados.com')));
  d.text=d.pages.flat().join('\n');
  assert.equal(parser.detect(d),false);
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
  assert.equal(r.maximeters._reason,'');
  assert.match(r.maximeters._note,/Resumen anual informativo/i);
  assert.equal(r.incidents.length,0);
  assert.equal(r.opportunity,'Sin alertas');
  assert.ok(r.adjustments.some(x=>x.category==='system_adjustment'&&x.amount_eur===9.44));
  assert.equal(r.validation.consumptionPeriods,true);
  assert.equal(r.validation.consumptionTotal,true);
  assert.equal(r.validation.energyCost,true);
  assert.equal(r.validation.power,true);
  assert.equal(r.validation.economicBalance,true);
});

test('2.0TD acepta P1 P2 P3 en el resumen anual y solo alerta periodos fuera de rango',()=>{
  const ok=parser._test.parseReportedMaxDemand('Las potencias máximas (kW) demandadas en el último año han sido:\nP1 8,572 P2 7,900 P3 8,112','2.0TD');
  assert.deepEqual(ok._raw,{P1:8.572,P2:7.9,P3:8.112});
  assert.equal(ok._reason,'');
  const bad=parser._test.parseReportedMaxDemand('Las potencias máximas (kW) demandadas en el último año han sido:\nP1 8,572 P4 8,112','2.0TD');
  assert.match(bad._reason,/periodos no compatibles/i);
  assert.deepEqual(bad._raw,{P1:8.572,P4:8.112});
});


test('extrae variante catalana SEA 2.0TD fija y cuadra',()=>{
  const r=parser.parse(sampleCatalanFixed(),{name:'sea-ca-fixa.pdf'},{parserVersion:'test'});
  assert.ok(r);
  assert.equal(r.readOk,true,r.readMessage);
  assert.equal(r.sourceFormat,'sea');
  assert.equal(r.sourceVariant,'standard_2026_ca');
  assert.equal(r.invoiceNumber,'FVE20990001001');
  assert.equal(r.company,'CLIENT PROVA CAT');
  assert.equal(r.taxId,'00000000T');
  assert.equal(r.cups,'ES0000000000000001AA0F');
  assert.equal(r.period,'13/10/2026 - 10/11/2026 (28 días)');
  assert.equal(r.tariff,'2.0TD');
  assert.equal(r.contract,'9101');
  assert.equal(r.accessContract,'500000000010');
  assert.equal(r.meterNumber,'200000010');
  assert.equal(r.renewalDate,'13/10/2027');
  assert.equal(r.contractDurationType,'Anual');
  assert.equal(r.kwh,179.726);
  assert.equal(r.energy,27.15);
  assert.equal(r.power,15.65);
  assert.equal(r.social,0.69);
  assert.equal(r.systemAdjustment,1.89);
  assert.equal(r.rental,0.75);
  assert.equal(r.tax,2.32);
  assert.equal(r.vat,10.17);
  assert.equal(r.total,58.62);
  assert.equal(r.accounted,58.62);
  assert.equal(r.diff,0);
  assert.equal(r.balanced,true);
  assert.equal(r.readingStatus,'actual');
  assert.deepEqual(Object.fromEntries(Object.entries(r.periods).map(([k,v])=>[k,v.consumption])),{P1:55.811,P2:42.816,P3:81.099});
  assert.deepEqual(r.contracted,{P1:5.6,P2:5.6});
  assert.deepEqual(r.maximeters._raw,{P1:5.216,P3:5.012});
  assert.equal(r.incidents.length,0);
  assert.equal(r.validation.economicBalance,true);
});

test('extrae variante catalana SEA 2.0TD con precios P1-P3 distintos',()=>{
  const r=parser.parse(sampleCatalanIndexed(),{name:'sea-ca-indexada.pdf'},{parserVersion:'test'});
  assert.ok(r);
  assert.equal(r.readOk,true,r.readMessage);
  assert.equal(r.sourceVariant,'standard_2026_ca');
  assert.equal(r.period,'13/10/2026 - 12/11/2026 (30 días)');
  assert.equal(r.kwh,108.893);
  assert.equal(r.energy,16.04);
  assert.equal(r.power,6.58);
  assert.equal(r.periods.P1.price,0.215795);
  assert.equal(r.periods.P2.price,0.149665);
  assert.equal(r.periods.P3.price,0.114371);
  assert.equal(r.total,32.09);
  assert.equal(r.accounted,32.09);
  assert.equal(r.diff,0);
  assert.equal(r.balanced,true);
  assert.equal(r.validation.consumptionPeriods,true);
  assert.equal(r.validation.consumptionTotal,true);
  assert.equal(r.validation.energyCost,true);
  assert.equal(r.validation.power,true);
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
