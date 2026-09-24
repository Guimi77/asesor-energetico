const test=require('node:test');
const assert=require('node:assert/strict');
const parser=require('../uenergia-parser.js');

function sample(){
  const p1=[
    'ELECTRICA SOLLERENSE SAU (ESA57048332) Registro mercantil de Mallorca',
    'CL. EJEMPLO PRUEBA 146, 07100 - SOLLER BALEARS, ILLES - ESPAÑA oficines@example.com',
    'DATOS DE FACTURA',
    'Número: 26000001',
    'Fecha: 15/09/2026',
    'Vencimiento: 05/10/2026',
    'NIF/CIF: 00000001R',
    'Periodo: 04/07/2026 a 04/08/2026',
    'Forma de pago: RECIBO_CSB',
    'IBAN: ES00 0000 0000 0000 0000 ****',
    'CLIENTE PRUEBA, FACTURACION',
    'CL. EJEMPLO PRUEBA, 1 B',
    '07190 - ESPORLES',
    'BALEARS, ILLES - ESPAÑA',
    'RESUMEN DE FACTURA',
    'Potencia 11,88€',
    'Energía 20,48€',
    'Otros conceptos 0,79€',
    'Impuesto sobre la electricidad 1,69€',
    'Alquiler de equipos de medida 0,85€',
    'Otros conceptos 7,89€',
    'IVA 21% 9,15€',
    'Total 52,73€',
    'Datos recuperados del CUPS ES0000000000000007AA0F entre las fechas 4 jul. 2026 y 4 ago. 2026',
    'CONTACTO AVERÍAS',
    'EDISTRIBUCIÓN REDES DIGITALES S.L.U. CUPS ES0000000000000007AA0F contrato de acceso 500000000008'
  ];
  const p2=[
    'DATOS DEL CONTRATO',
    'Titular: CLIENTE PRUEBA TITULAR',
    'NIF/CIF Titular: 00000002W',
    'Dirección: CL EJEMPLO PRUEBA, DE 00003 BA 07190 (Esporles)',
    'Población: ESPORLES',
    'Tarifa: Luz Finde (Mercado libre)',
    'Tarifa de acceso: 2.0TD - NT1',
    'CUPS: ES0000000000000007AA0F',
    'Potencia: 3,450 kW',
    'Contrato: C0000001',
    'Contrato de acceso: 500000000008',
    'Distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.',
    'Vigencia hasta: 21/05/2027',
    'DETALLE DE CONCEPTOS',
    'Potencia',
    'P1: 3,450 kW x 32 días x 0,094146 € kW/día 10,39€',
    'P2: 3,450 kW x 32 días x 0,013480 € kW/día 1,49€',
    'En total 11,88 € de los cuales 8,60 € corresponden a peajes',
    'Energía',
    'P1: 50,00 kWh x 0,294073 €/kWh 14,70€',
    'P2: 17,00 kWh x 0,215065 €/kWh 3,66€',
    'P3: 16,00 kWh x 0,132656 €/kWh 2,12€',
    'En total 20,48 € de los cuales 5,42 € corresponden a peajes',
    'Otros conceptos',
    'Financiación bono social 32 días x 0,024688 €/día 0,79€',
    'Impuestos',
    'Impuesto sobre la electricidad 5,11269632% sobre 33,15€ 1,69€',
    'Alquiler de equipos de medida',
    'ALQ Equipo Medida 32 días x 0,026630 €/día 0,85€',
    'En total 0,85 € de los cuales 0,85 € corresponden a peajes',
    'Otros conceptos',
    'Cuota U energia 32 días x 0,246575 €/día 7,89€',
    'Impuestos',
    'IVA 21% sobre 43,58€ 9,15€',
    'Importe total 52,73€',
    'LECTURAS',
    'Lecturas del contador 300000003 entre el 03/07/2026 y el 04/08/2026 (Origen Real)',
    'P1 3391 3441 50',
    'P2 853 870 17',
    'P3 633 649 16',
    'POTENCIA',
    'Periodo P1, Potencia: 3,450, Maxímetro: 804',
    'Periodo P2, Potencia: 3,450, Maxímetro: 752'
  ];
  return {pages:[p1,p2],text:[...p1,...p2].join('\n')};
}

test('detecta solo el formato U Energia',()=>{
  assert.equal(parser.detect(sample()),true);
  assert.equal(parser.detect({text:'Endesa Energía S.A. DATOS DEL CONTRATO DETALLE DE CONCEPTOS'}),false);
  assert.equal(parser.detect({text:'FENIE ENERGÍA Razón Social: TEST Periodo Facturación:'}),false);
  assert.equal(parser.detect({text:'Repsol Comercializadora de Electricidad y Gas, S.L.U. CUPS TOTAL FACTURA'}),false);
});

test('extrae la factura real U Energia, conserva la cuota y cuadra',()=>{
  const r=parser.parse(sample(),{name:'26000001.pdf'},{parserVersion:'test'});
  assert.ok(r);
  assert.equal(r.readOk,true,r.readMessage);
  assert.equal(r.sourceFormat,'uenergia');
  assert.equal(r.invoiceNumber,'26000001');
  assert.equal(r.company,'CLIENTE PRUEBA TITULAR');
  assert.equal(r.taxId,'00000002W');
  assert.equal(r.billingRecipient,'CLIENTE PRUEBA, FACTURACION');
  assert.equal(r.billingTaxId,'00000001R');
  assert.equal(r.cups,'ES0000000000000007AA0F');
  assert.equal(r.period,'04/07/2026 - 04/08/2026 (32 días)');
  assert.equal(r.tariff,'2.0TD');
  assert.equal(r.productName,'Luz Finde');
  assert.equal(r.contractType,'Mercado libre');
  assert.equal(r.contract,'C0000001');
  assert.equal(r.accessContract,'500000000008');
  assert.equal(r.distributor,'EDISTRIBUCIÓN REDES DIGITALES S.L.U.');
  assert.equal(r.renewalDate,'21/05/2027');
  assert.equal(r.meterNumber,'300000003');
  assert.equal(r.kwh,83);
  assert.equal(r.energy,20.48);
  assert.equal(r.power,11.88);
  assert.equal(r.social,0.79);
  assert.equal(r.rental,0.85);
  assert.equal(r.commercialFee,7.89);
  assert.equal(r.otherConcepts.commercialFee.name,'Cuota U Energía');
  assert.equal(r.otherConcepts.commercialFee.amount,7.89);
  assert.equal(r.other,9.53);
  assert.equal(r.tax,1.69);
  assert.equal(r.vat,9.15);
  assert.equal(r.total,52.73);
  assert.equal(r.accounted,52.73);
  assert.equal(r.diff,0);
  assert.equal(r.balanced,true);
  assert.match(r.opportunity,/Cuota U Energía 7,89 €/);
  assert.equal(r.readingStatus,'actual');
  assert.equal(r.periods.P1.consumption,50);
  assert.equal(r.periods.P1.price,0.294073);
  assert.equal(r.periods.P1.cost,14.70);
  assert.equal(r.periods.P2.consumption,17);
  assert.equal(r.periods.P3.consumption,16);
  assert.deepEqual({P1:r.contracted.P1,P2:r.contracted.P2},{P1:3.45,P2:3.45});
  assert.equal(r.maximeters.P1,0.804);
  assert.equal(r.maximeters.P2,0.752);
  assert.deepEqual(r.maximeters._raw,{P1:804,P2:752});
  assert.equal(r.validation.consumptionPeriods,true);
  assert.equal(r.validation.energyCost,true);
  assert.equal(r.validation.power,true);
  assert.equal(r.validation.economicBalance,true);
});

test('tolera líneas PDF.js con columnas laterales unidas',()=>{
  const d=sample();
  d.pages[0]=d.pages[0].filter(x=>!['CLIENTE PRUEBA, FACTURACION','CL. EJEMPLO PRUEBA, 1 B','07190 - ESPORLES','BALEARS, ILLES - ESPAÑA'].includes(x));
  d.pages[0]=d.pages[0].map(x=>x==='Número: 26000001'?'Número: 26000001 CLIENTE PRUEBA, FACTURACION':x);
  d.pages[1]=d.pages[1].map(x=>({
    'Titular: CLIENTE PRUEBA TITULAR':'Titular: CLIENTE PRUEBA TITULAR CUPS: ES0000000000000007AA0F',
    'NIF/CIF Titular: 00000002W':'NIF/CIF Titular: 00000002W Potencia: 3,450 kW',
    'Dirección: CL EJEMPLO PRUEBA, DE 00003 BA 07190 (Esporles)':'Dirección: CL EJEMPLO PRUEBA, DE 00003 BA 07190 (Esporles) Contrato: C0000001',
    'Población: ESPORLES':'Población: ESPORLES Contrato de acceso: 500000000008',
    'Tarifa: Luz Finde (Mercado libre)':'Tarifa: Luz Finde (Mercado libre) Distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.',
    'Tarifa de acceso: 2.0TD - NT1':'Tarifa de acceso: 2.0TD - NT1 (https://www.edistribucion.com/)'
  }[x]||x));
  d.text=d.pages.flat().join('\n');
  const r=parser.parse(d,{name:'layout.pdf'});
  assert.equal(r.readOk,true,r.readMessage);
  assert.equal(r.billingRecipient,'CLIENTE PRUEBA, FACTURACION');
  assert.equal(r.company,'CLIENTE PRUEBA TITULAR');
  assert.equal(r.supplyAddress,'CL EJEMPLO PRUEBA, DE 00003 BA 07190 (Esporles)');
  assert.equal(r.supplyCity,'ESPORLES');
  assert.equal(r.productName,'Luz Finde');
  assert.equal(r.accessTariffRaw,'2.0TD - NT1');
});

test('falla cerrado si aparece un concepto económico no interpretado',()=>{
  const d=sample();
  d.pages[1]=d.pages[1].map(x=>x==='Importe total 52,73€'?'Importe total 53,73€':x);
  d.text=d.pages.flat().join('\n');
  const r=parser.parse(d,{name:'mismatch.pdf'});
  assert.equal(r.readOk,false);
  assert.equal(r.balanced,false);
  assert.equal(r.diff,1);
  assert.match(r.readMessage,/cuadre económico/i);
});
