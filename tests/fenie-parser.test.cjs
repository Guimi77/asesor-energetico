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


test('parser FENIE contabiliza descuentos comerciales impresos sin esconderlos',()=>{
  const euro='€';
  const page=[
    'FENIE ENERGIA',
    'Nº Factura: TEST-DESCUENTO-001',
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
    'Alquiler Equipo medida (Nº Contador 000000001): 0,83 '+euro,
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
