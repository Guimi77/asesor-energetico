'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const fenie=require('../fenie-parser.js');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const xtra=fs.readFileSync(path.join(root,'xtra-history.js'),'utf8');

test('detector FENIE reconoce su formato y no captura otras comercializadoras',()=>{
  assert.equal(fenie.detect('FENIE ENERGIA Razón Social: DEMO Periodo Facturación: 01/01/2026 - 31/01/2026 Término de potencia'),true);
  assert.equal(fenie.detect('Endesa Energía, S.A. Unipersonal Nº factura: P26CON000000001'),false);
  assert.equal(fenie.detect('IBERDROLA CLIENTES FACTURA ELECTRICIDAD'),false);
  assert.equal(fenie.detect('Naturgy Clientes, S.A.U. factura electricidad'),false);
});

test('parser FENIE mantiene el contrato económico sintético 2.0TD',()=>{
  const euro='€';
  const page=[
    'FENIE ENERGIA',
    'Nº Factura: TEST000001',
    'Razón Social: CLIENTE SINTETICO',
    'CUPS: ES0000000000000000AA',
    'Tarifa: 2.0TD',
    'Periodo Facturación: 01/01/2026 - 31/01/2026 (31 días)',
    'Término de energía',
    `P1: 100,00 kWh 0,100000 ${euro}/kWh 10,00 ${euro}`,
    `P2: 50,00 kWh 0,100000 ${euro}/kWh 5,00 ${euro}`,
    'Término de potencia',
    `P1: 0,050000 ${euro}/kW día x 5,000 kW x 31 días = 7,75 ${euro}`,
    `P2: 0,010000 ${euro}/kW día x 5,000 kW x 31 días = 1,55 ${euro}`,
    `9,30 ${euro}`,
    'Bono social',
    `TOTAL FACTURA 24,30 ${euro}`
  ];
  const row=fenie.parse({pages:[page],rawPages:[[],[]],text:page.join('\n')},{name:'synthetic-fenie.pdf'});
  assert.equal(row.invoiceNumber,'TEST000001');
  assert.equal(row.cups,'ES0000000000000000AA');
  assert.equal(row.tariff,'2.0TD');
  assert.equal(row.kwh,150);
  assert.equal(row.energy,15);
  assert.equal(row.power,9.3);
  assert.equal(row.total,24.3);
  assert.equal(row.accounted,24.3);
  assert.equal(row.balanced,true);
  assert.equal(row.readOk,true);
  assert.deepEqual(row.periods.P1,{consumption:100,cost:10,price:0.1});
  assert.deepEqual(row.periods.P2,{consumption:50,cost:5,price:0.1});
});


// Fixture 100% sintetico: reproduce solo la estructura del formato ingles, sin datos reales de cliente.
test('parser FENIE reconoce y cuadra la variante inglesa sin afectar el modelo comun',()=>{
  const euro='€';
  const page=[
    'FENIE ENERGIA',
    'Company Name: CLIENTE SINTETICO ENGLISH',
    'Tax ID: TEST-TAX-ID',
    'CUPS code: ES0000000000000000AA',
    'Address of Supply: TEST STREET 7, 00000 TEST',
    'Access Contract 500000000000 Tariff: 2.0TD',
    'Distribution Company TEST DISTRIBUTION, S.L.U.',
    'Date of invoice: 09/11/2026',
    'Invoicing Period: 01/10/2026 - 31/10/2026 (31 days)',
    'Invoice no. SYNTH-EN-001',
    'Contract Number: CO-2026-SYNTH_2.0',
    'Type of contract:: Indexed',
    'End date of supply contract: 24/02/2027',
    'Variable energy term',
    'P1: 0,033261 '+euro+'/kWh + 0,064292 '+euro+'/kWh + 0,321747 '+euro+'/kWh = 0,419300 '+euro+'/kWh x 110,00 kWh = 46,12 '+euro+' 111,98 '+euro,
    'P2: 0,016409 '+euro+'/kWh + 0,012858 '+euro+'/kWh + 0,295095 '+euro+'/kWh = 0,324362 '+euro+'/kWh x 91,00 kWh = 29,52 '+euro,
    'P3: 0,000077 '+euro+'/kWh + 0,003215 '+euro+'/kWh + 0,280616 '+euro+'/kWh = 0,283908 '+euro+'/kWh x 128,00 kWh = 36,34 '+euro,
    'Power Term',
    'P1: 0,063904 '+euro+'/kW day + 0,011999 '+euro+'/kW day + 0,00 '+euro+'/kW day = 0,075903 '+euro+'/kW dayx 14,490kW x 31 days= 34,09 '+euro,
    '34,98 '+euro,
    'P2: 0,001216 '+euro+'/kW day + 0,000772 '+euro+'/kW day + 0,00 '+euro+'/kW day = 0,001988 '+euro+'/kW dayx 14,490kW x 31 days= 0,89 '+euro,
    'Excesses of Power',
    'P1: 0,000000 x 8,662206 = 0,00 '+euro,
    'P2: 0,000000 x 0,164796 = 0,00 '+euro,
    'Rates reduction Royal Decree test 0,77 '+euro,
    'Electricity tax 5,11269632% s/ 147,73 7,55 '+euro,
    'Metering Equipment lease (Meter Nº TESTMETER): 0,83 '+euro,
    'VAC 21,00% s/ 156,11 32,78 '+euro,
    'TOTAL INVOICED: 188,89'+euro
  ];
  const data={pages:[page],rawPages:[[],[]],text:page.join('\\n')};
  assert.equal(fenie.detect(data),true);
  const row=fenie.parse(data,{name:'synthetic-fenie-english.pdf'});
  assert.equal(row.invoiceNumber,'SYNTH-EN-001');
  assert.equal(row.company,'CLIENTE SINTETICO ENGLISH');
  assert.equal(row.cups,'ES0000000000000000AA');
  assert.equal(row.period,'01/10/2026 - 31/10/2026 (31 days)');
  assert.equal(row.tariff,'2.0TD');
  assert.equal(row.kwh,329);
  assert.equal(row.energy,111.98);
  assert.equal(row.power,34.98);
  assert.equal(row.social,0.77);
  assert.equal(row.tax,7.55);
  assert.equal(row.rental,0.83);
  assert.equal(row.vat,32.78);
  assert.equal(row.total,188.89);
  assert.equal(row.accounted,188.89);
  assert.equal(row.diff,0);
  assert.equal(row.balanced,true);
  assert.equal(row.readOk,true);
  assert.deepEqual(row.periods.P1,{consumption:110,cost:46.12,price:0.4193});
  assert.deepEqual(row.periods.P2,{consumption:91,cost:29.52,price:0.324362});
  assert.deepEqual(row.periods.P3,{consumption:128,cost:36.34,price:0.283908});
  assert.equal(row.contracted.P1,14.49);
  assert.equal(row.contracted.P2,14.49);

  const normalized=fenie.parseNormalized(data,{name:'synthetic-fenie-english.pdf'},{completenessVersion:'energy-test.english'});
  assert.equal(normalized.invoice.number,'SYNTH-EN-001');
  assert.equal(normalized.invoice.issueDate,'2026-11-09');
  assert.equal(normalized.invoice.billing.start,'2026-10-01');
  assert.equal(normalized.invoice.billing.end,'2026-10-31');
  assert.equal(normalized.invoice.billing.days,31);
  assert.equal(normalized.parties.holder.name,'CLIENTE SINTETICO ENGLISH');
  assert.equal(normalized.parties.holder.taxId,'TEST-TAX-ID');
  assert.equal(normalized.supply.address,'TEST STREET 7, 00000 TEST');
  assert.equal(normalized.contract.accessNumber,'500000000000');
  assert.equal(normalized.contract.type,'Indexed');
  assert.equal(normalized.contract.endDate,'2027-02-24');
  assert.equal(normalized.contract.meterNumber,'TESTMETER');
  assert.equal(normalized.parties.distributor,'TEST DISTRIBUTION, S.L.U.');
  assert.equal(normalized.costs.totalEur,188.89);
  assert.equal(normalized.validation.completeness.energy_periods,'extracted');
  assert.equal(normalized.validation.completeness.power_periods,'extracted');
  assert.equal(normalized.taxLines[0].tax_type,'IVA');
  assert.equal(normalized.taxLines[0].label,'VAC');
});

test('parser FENIE contabiliza la cuota de facturacion indexada como concepto estructurado',()=>{
  const euro='€';
  const page=[
    'FENIE ENERGIA','Company Name: CLIENTE SINTETICO CUOTA','CUPS code: ES0000000000000000AA','Tariff: 2.0TD',
    'Invoicing Period: 01/06/2026 - 30/06/2026 (30 days)','Invoice no. SYNTH-FEE-001',
    'Variable energy term',
    'P1: 0,033261 '+euro+'/kWh + 0,064292 '+euro+'/kWh + 0,097221 '+euro+'/kWh = 0,194774 '+euro+'/kWh x 6,00 kWh = 1,17 '+euro+' 3,52 '+euro,
    'P2: 0,016409 '+euro+'/kWh + 0,012858 '+euro+'/kWh + 0,100495 '+euro+'/kWh = 0,129762 '+euro+'/kWh x 6,00 kWh = 0,78 '+euro,
    'P3: 0,000077 '+euro+'/kWh + 0,003215 '+euro+'/kWh + 0,117414 '+euro+'/kWh = 0,120706 '+euro+'/kWh x 13,00 kWh = 1,57 '+euro,
    'Power Term',
    'P1: 0,063904 '+euro+'/kW day + 0,011999 '+euro+'/kW day + 0,00 '+euro+'/kW day = 0,075903 '+euro+'/kW dayx 14,490kW x 30 days= 32,99 '+euro,
    '33,86 '+euro,
    'P2: 0,001216 '+euro+'/kW day + 0,000772 '+euro+'/kW day + 0,00 '+euro+'/kW day = 0,001988 '+euro+'/kW dayx 14,490kW x 30 days= 0,86 '+euro,
    'Excesses of Power','P1: 0,000000 x 8,382780 = 0,00 '+euro,'P2: 0,000000 x 0,159480 = 0,00 '+euro,
    'Cuota Facturación Indexado 6,90 '+euro,
    'Rates reduction Royal Decree test 0,57 '+euro,'Electricity tax 5,11269632% s/ 44,85 2,29 '+euro,
    'Metering Equipment lease (Meter Nº TESTMETER): 0,80 '+euro,'VAC 21,00% s/ 47,94 10,07 '+euro,'TOTAL INVOICED: 58,01'+euro
  ];
  const data={pages:[page],rawPages:[[],[]],text:page.join('\\n')};
  const row=fenie.parse(data,{name:'synthetic-fenie-billing-fee.pdf'});
  assert.equal(row.billingFee,6.9);
  assert.equal(row.other,8.27);
  assert.equal(row.accounted,58.01);
  assert.equal(row.diff,0);
  assert.equal(row.balanced,true);
  assert.equal(row.readOk,true);
  const normalized=fenie.parseNormalized(data,{name:'synthetic-fenie-billing-fee.pdf'},{completenessVersion:'energy-test.billing-fee'});
  assert.equal(normalized.costs.billingFeeEur,6.9);
  assert.equal(normalized.validation.completeness.billing_fee,'extracted');
  assert.deepEqual(normalized.adjustments.find(x=>x.category==='billing_fee'),{concept:'Cuota Facturación Indexado',amount_eur:6.9,category:'billing_fee',source_text:'Cuota Facturación Indexado 6,90 €'});
});

test('parser FENIE desglosa derechos de distribuidora impresos en ingles y conserva el cuadre',()=>{
  const euro='€';
  const page=[
    'FENIE ENERGIA','Company Name: CLIENTE SINTETICO DERECHOS','CUPS code: ES0000000000000000AA','Tariff: 2.0TD',
    'Invoicing Period: 24/02/2026 - 22/03/2026 (27 days)','Invoice no. SYNTH-RIGHTS-001',
    'Variable energy term',
    'P1: 0,033261 '+euro+'/kWh + 0,064292 '+euro+'/kWh + 0,266291 '+euro+'/kWh = 0,363844 '+euro+'/kWh x 13,11 kWh = 4,77 '+euro+' 12,03 '+euro,
    'P2: 0,016409 '+euro+'/kWh + 0,012858 '+euro+'/kWh + 0,237801 '+euro+'/kWh = 0,267068 '+euro+'/kWh x 9,96 kWh = 2,66 '+euro,
    'P3: 0,000077 '+euro+'/kWh + 0,003215 '+euro+'/kWh + 0,236666 '+euro+'/kWh = 0,239958 '+euro+'/kWh x 19,17 kWh = 4,60 '+euro,
    'Power Term',
    'P1: 0,063904 '+euro+'/kW day + 0,011999 '+euro+'/kW day + 0,00 '+euro+'/kW day = 0,075903 '+euro+'/kW dayx 14,490kW x 27 days= 29,70 '+euro,
    '30,48 '+euro,
    'P2: 0,001216 '+euro+'/kW day + 0,000772 '+euro+'/kW day + 0,00 '+euro+'/kW day = 0,001988 '+euro+'/kW dayx 14,490kW x 27 days= 0,78 '+euro,
    'Excesses of Power','P1: 0,000000 x 7,544502 = 0,00 '+euro,'P2: 0,000000 x 0,143532 = 0,00 '+euro,
    'Distributor Access Fees (R.D. 1048/2013, Article 24) (80,00€).Distributor Equipment Action Fees (R.D. 1048/2013, Article 125,00 €',
    '29) (5,00€).Distributor Extension Fees (R.D. 1048/2013, Article 25) (40,00€).',
    'Rates reduction Royal Decree test 0,52 '+euro,'Electricity tax 0,50000000% s/ 43,03 0,22 '+euro,
    'Metering Equipment lease (Meter Nº TESTMETER): 0,72 '+euro,'VAC 21,00% s/ 168,97 35,48 '+euro,'TOTAL INVOICED: 204,45'+euro
  ];
  const data={pages:[page],rawPages:[[],[]],text:page.join('\\n')};
  const row=fenie.parse(data,{name:'synthetic-fenie-rights-en.pdf'});
  assert.equal(row.distributorCharges,125);
  assert.equal(row.accounted,204.45);
  assert.equal(row.diff,0);
  assert.equal(row.balanced,true);
  assert.equal(row.readOk,true);
  const normalized=fenie.parseNormalized(data,{name:'synthetic-fenie-rights-en.pdf'},{completenessVersion:'energy-test.rights-en'});
  assert.equal(normalized.validation.completeness.distributor_rights,'extracted');
  assert.deepEqual(normalized.distributorRights.map(x=>[x.concept,x.amount_eur]),[
    ['Derechos Acceso Distribuidora',80],['Derechos Actuación Equipos Distribuidora',5],['Derechos Extensión Distribuidora',40]
  ]);
});

test('parser FENIE contabiliza descuentos comerciales impresos sin esconderlos',()=>{
  const euro='€';
  const page=[
    'FENIE ENERGIA',
    'Nº Factura: SINTETICAALFA',
    'Razón Social: CLIENTE PRUEBA DESCUENTO',
    'NIF / CIF: B00000000',
    'CUPS: ES0000000000000000AA',
    'Tarifa: 2.0TD',
    'Periodo Facturación: 01/05/2026 - 31/05/2026 (31 días)',
    'Término de energía variable',
    'P1: 0,033261 '+euro+'/kWh + 0,064292 '+euro+'/kWh + 0,100800 '+euro+'/kWh = 0,198353 '+euro+'/kWh x 122,00 kWh = 24,20 '+euro+' 67,50 '+euro,
    'P2: 0,016409 '+euro+'/kWh + 0,012858 '+euro+'/kWh + 0,103610 '+euro+'/kWh = 0,132877 '+euro+'/kWh x 106,00 kWh = 14,08 '+euro,
    'P3: 0,000077 '+euro+'/kWh + 0,003215 '+euro+'/kWh + 0,112658 '+euro+'/kWh = 0,115950 '+euro+'/kWh x 252,00 kWh = 29,22 '+euro,
    'Término de potencia',
    'P1: 0,063904 '+euro+'/kW día + 0,011999 '+euro+'/kW día + 0,00 '+euro+'/kW día = 0,075903 '+euro+'/kW día 5,750 kW x 31 días = 13,53 '+euro,
    'P2: 0,001216 '+euro+'/kW día + 0,000772 '+euro+'/kW día + 0,00 '+euro+'/kW día = 0,001988 '+euro+'/kW día 5,750 kW x 31 días = 0,35 '+euro,
    '13,88 '+euro,
    'Excesos de Potencia',
    'P1: 0,000000 x 8,662206 = 0,00 '+euro,
    'P2: 0,000000 x 0,164796 = 0,00 '+euro,
    'Descuento Plan Prueba (Descuento pendiente: 0,00) -10,00 '+euro,
    'Bono social Real Decreto de prueba 0,59 '+euro,
    'Impuesto electricidad 3,68 '+euro,
    'Alquiler Equipo medida (Nº Contador CONTADOR_PRUEBA): 0,83 '+euro,
    'IVA 21,00% s/ 76,48 16,06 '+euro,
    'TOTAL FACTURA: 92,54'+euro
  ];
  const data={pages:[page],rawPages:[[],[]],text:page.join('\n')};
  const row=fenie.parse(data,{name:'synthetic-fenie-discount.pdf'});
  assert.equal(row.discounts,-10);
  assert.equal(row.energy,67.5);
  assert.equal(row.power,13.88);
  assert.equal(row.other,-8.58);
  assert.equal(row.accounted,92.54);
  assert.equal(row.diff,0);
  assert.equal(row.balanced,true);
  assert.equal(row.readOk,true);

  const normalized=fenie.parseNormalized(data,{name:'synthetic-fenie-discount.pdf'},{completenessVersion:'energy-test.discount'});
  assert.equal(normalized.costs.discountsEur,-10);
  assert.equal(normalized.costs.otherEur,-8.58);
  assert.equal(normalized.costs.accountedEur,92.54);
  assert.equal(normalized.validation.completeness.discounts,'extracted');
  assert.deepEqual(normalized.adjustments,[{
    concept:'Descuento FENIE',
    amount_eur:-10,
    category:'discount',
    source_text:'Descuento Plan Prueba (Descuento pendiente: 0,00) -10,00 €'
  }]);
});

test('app ya no contiene reglas de interpretación FENIE',()=>{
  assert.match(app,/window\.IBTFenieParser/);
  assert.match(app,/function parseFenie\(d,file\)\{[\s\S]{0,250}IBTFenieParser/);
  assert.doesNotMatch(app,/Raz\[oó\]n Social/);
  assert.doesNotMatch(app,/Compensaci\[oó\]n Excedente/);
  assert.doesNotMatch(app,/Ajuste por Integrador/);
});

test('navegador carga fenie-parser antes de app.js',()=>{
  const parserPos=html.indexOf('fenie-parser.js');
  const appPos=html.indexOf('src="app.js');
  assert.ok(parserPos>=0);
  assert.ok(appPos>parserPos);
});

test('API portable expone detect, parse, revision y helper de potencia',()=>{
  assert.equal(typeof fenie.detect,'function');
  assert.equal(typeof fenie.parse,'function');
  assert.equal(typeof fenie.parseNormalized,'function');
  assert.equal(typeof fenie.powerSectionDetails,'function');
  assert.match(fenie.revision,/^fenie-/);
});


test('modelo FENIE normalizado conserva el núcleo económico y añade estructura portable',()=>{
  const euro='€';
  const page=[
    'FENIE ENERGIA',
    'Nº Factura: TEST000002',
    'Razón Social: CLIENTE SINTETICO SL',
    'NIF / CIF: B00000000',
    'Dir. Suministro: CALLE PRUEBA 1',
    'CUPS: ES0000000000000000AA',
    'Tarifa: 3.0TD',
    'Periodo Facturación: 01/02/2026 - 28/02/2026 (28 días)',
    'Fecha de Factura: 01/03/2026',
    'Contrato Acceso: ATR-0001',
    'Tipo Contrato: Mercado libre',
    'Fecha fin del contrato de suministro: 31/12/2026',
    'Empresa Distribuidora: DISTRIBUIDORA DEMO',
    'CO-2026-SYNTH',
    'Término de energía',
    'P1: 100,00 kWh 0,010000 '+euro+' / kWh 0,020000 '+euro+' / kWh 0,030000 '+euro+' / kWh 0,060000 '+euro+' / kWh 6,00 '+euro,
    'P2: 100,00 kWh 0,010000 '+euro+' / kWh 0,020000 '+euro+' / kWh 0,030000 '+euro+' / kWh 0,060000 '+euro+' / kWh 6,00 '+euro,
    'P3: 100,00 kWh 0,010000 '+euro+' / kWh 0,020000 '+euro+' / kWh 0,030000 '+euro+' / kWh 0,060000 '+euro+' / kWh 6,00 '+euro,
    'P4: 100,00 kWh 0,010000 '+euro+' / kWh 0,020000 '+euro+' / kWh 0,030000 '+euro+' / kWh 0,060000 '+euro+' / kWh 6,00 '+euro,
    'P5: 100,00 kWh 0,010000 '+euro+' / kWh 0,020000 '+euro+' / kWh 0,030000 '+euro+' / kWh 0,060000 '+euro+' / kWh 6,00 '+euro,
    'P6: 100,00 kWh 0,010000 '+euro+' / kWh 0,020000 '+euro+' / kWh 0,030000 '+euro+' / kWh 0,060000 '+euro+' / kWh 6,00 '+euro,
    'Término de potencia',
    'P1: 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día = 0,030000 '+euro+' / kW día 10,000 kW x 28 días = 8,40 '+euro,
    'P2: 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día = 0,030000 '+euro+' / kW día 10,000 kW x 28 días = 8,40 '+euro,
    'P3: 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día = 0,030000 '+euro+' / kW día 10,000 kW x 28 días = 8,40 '+euro,
    'P4: 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día = 0,030000 '+euro+' / kW día 10,000 kW x 28 días = 8,40 '+euro,
    'P5: 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día = 0,030000 '+euro+' / kW día 10,000 kW x 28 días = 8,40 '+euro,
    'P6: 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día + 0,010000 '+euro+' / kW día = 0,030000 '+euro+' / kW día 10,000 kW x 28 días = 8,40 '+euro,
    '50,40 '+euro,
    'Bono social',
    'TOTAL FACTURA 86,40 '+euro
  ];
  const data={pages:[page],rawPages:[[],[]],text:page.join('\n')};
  const legacy=fenie.parse(data,{name:'synthetic-normalized.pdf'});
  const normalized=fenie.parseNormalized(data,{name:'synthetic-normalized.pdf'},{completenessVersion:'energy-test.1'});
  assert.equal(normalized.modelVersion,'ibt-energy-invoice-1');
  assert.equal(normalized.parser.id,'fenie');
  assert.equal(normalized.invoice.number,legacy.invoiceNumber);
  assert.equal(normalized.invoice.billing.start,'2026-02-01');
  assert.equal(normalized.invoice.billing.end,'2026-02-28');
  assert.equal(normalized.energy.totalKwh,legacy.kwh);
  assert.equal(normalized.energy.totalEur,legacy.energy);
  assert.equal(normalized.power.totalEur,legacy.power);
  assert.equal(normalized.costs.totalEur,legacy.total);
  assert.equal(normalized.costs.differenceEur,legacy.diff);
  assert.equal(normalized.parties.holder.taxId,'B00000000');
  assert.equal(normalized.supply.cups,'ES0000000000000000AA');
  assert.equal(normalized.supply.address,'CALLE PRUEBA 1');
  assert.equal(normalized.contract.accessNumber,'ATR-0001');
  assert.equal(normalized.energy.periods.length,6);
  assert.equal(normalized.power.periods.length,6);
  assert.equal(normalized.energy.periods[0].toll_price_eur_kwh,0.01);
  assert.equal(normalized.power.periods[0].unit_price_eur_kw_day,0.03);
  assert.equal(normalized.validation.completeness.version,'energy-test.1');
});

test('modelo FENIE normalizado mantiene null para precio unitario cero como el histórico legacy',()=>{
  const euro='€';
  const page=[
    'FENIE ENERGIA',
    'Nº Factura: TEST-ZERO-PRICE',
    'Razón Social: CLIENTE SINTETICO',
    'CUPS: ES0000000000000000AA',
    'Tarifa: 3.0TD',
    'Periodo Facturación: 01/03/2026 - 31/03/2026 (31 días)',
    'Término de energía',
    'P1: 0,00 kWh 0,010000 '+euro+' / kWh 0,020000 '+euro+' / kWh 0,030000 '+euro+' / kWh 0,000000 '+euro+' / kWh 0,00 '+euro,
    'Término de potencia',
    'TOTAL FACTURA 0,00 '+euro
  ];
  const data={pages:[page],rawPages:[[],[]],text:page.join('\\n')};
  const normalized=fenie.parseNormalized(data,{name:'synthetic-zero-price.pdf'},{completenessVersion:'energy-test.1'});
  assert.equal(normalized.energy.periods.length,1);
  assert.equal(normalized.energy.periods[0].unit_price_eur_kwh,null);
  assert.equal(normalized.energy.periods[0].toll_price_eur_kwh,0.01);
  assert.equal(normalized.energy.periods[0].charges_price_eur_kwh,0.02);
  assert.equal(normalized.energy.periods[0].retailer_price_eur_kwh,0.03);
});

test('FENIE portable pasa a salida principal solo con paridad total y conserva fallback legacy',()=>{
  assert(xtra.includes('function extractFenieLegacy(d,file)'));
  assert(xtra.includes('function extractFenie(d,file)'));
  assert(xtra.includes('parser.parseNormalized(d,file'));
  assert(xtra.includes('comparison=compareFenieHistoryModels(legacy,portable)'));
  assert(xtra.includes('return comparison.ok?portable:legacy;'));
  assert(xtra.includes("recordFenieHistoryShadow(legacy,null,new Error('parseNormalized no disponible'));return legacy"));
  assert(xtra.includes('catch(error){recordFenieHistoryShadow(legacy,null,error);return legacy}'));
  assert(xtra.includes("if(fenie?.detect?.(d))return extractFenie(d,file)"));
  assert(xtra.includes('FENIE portable:'));
});
