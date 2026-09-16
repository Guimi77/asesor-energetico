'use strict';
// Synthetic fixtures only. No customer identifiers or uploaded PDFs.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const helper=require(path.join(root,'fenie-image-fallback.js'));
const cups='ES0000000000000000AA';
const continuation=[[],[
  'Razón Social: TEST CLIENTE, S.L.',
  `CUPS: ${cups}`,
  'Contrato Acceso: 000000000000 Tarifa: 3.0TD',
  'Empresa Distribuidora: DISTRIBUIDORA TEST, S.A.',
  'Lecturas desde 01/06/2026 a 30/06/2026',
  'Maxímetro (kW)',
  'Fenie Energía',
]];

test('normal FENIE text page never enters OCR fallback',()=>{
  const first=[
    'FENIE ENERGÍA',
    'Razón Social: TEST CLIENTE, S.L.',
    `CUPS: ${cups}`,
    'Datos Factura TEST CLIENTE, S.L.',
    'Fecha de Factura: 30/06/2026',
    'Periodo Facturación: 01/06/2026 - 30/06/2026 (30 días)',
    'Nº Factura: 202600000099',
    'Tarifa: 3.0TD',
    'Término energía variable P1: 0,100000 €/kWh x 100,00 kWh = 10,00 €',
    'Término de potencia P1: 0,003333 €/kW día x 10,000 kW x 30 días = 1,00 €',
    'Impuesto electricidad 1,00 € IVA 0,00 € TOTAL FACTURA: 18,00 €',
  ];
  assert.ok(first.join('').length>120,'fixture must model a real text-rich first page');
  assert.equal(helper.needsOcr([first,continuation[1]]),false);
});

test('blank first page with strong FENIE continuation enters fallback',()=>{
  assert.equal(helper.needsOcr(continuation),true);
});

test('blank first page with Endesa or generic text stays out of fallback',()=>{
  assert.equal(helper.needsOcr([[],['Endesa Energía, S.A.','P26CON000001','CUPS: '+cups,'3.0TD','Maxímetro (kW)']]),false);
  assert.equal(helper.needsOcr([[],['CUPS: '+cups,'3.0TD','Lecturas desde 01/06/2026 a 30/06/2026','Maxímetro (kW)']]),false);
});

const ocr=`
Razón Social: TEST CLIENTE, S.L.
CUuPS: ES000000000000000OAA
Datos Factura TEST CLIENTE, S.L.
Periodo Facturación: 01/06/2026 - 30/06/2026 (30 días)
Factura N2: 202600000001
Facturación de electricidad
Término energía variable Importe Total
Pi: 0,100000 €/kWh x 100,00 kWh = 10,00 € 10,00 €
P2: 0,000000 €/kWh x 0,00 kWh = 0,00 €
P3: 0,000000 €/kWh x 0,00 kWh = 0,00 €
P2: 0,000000 €/kWh x 0,00 kWh = 0,00 €
P5: 0,000000 €/kWh x 0,00 kWh = 0,00 €
P6: 0,000000 €/kWh x 0,00 kWh = 0,00 €
Término de potencia
P1: 0,003333 €/kW día x 10,000 kW x 30 días = 1,00 € 6,00 €
P2: 0,003333 €/kW día x 10,000 kW x 30 días = 1,00 €
P3: 0,003333 €/kW día x 10,000 kW x 30 días = 1,00 €
P4: 0,003333 €/kW día x 10,000 kW x 30 días = 1,00 €
P5: 0,003333 €/kW día x 10,000 kW x 30 días = 1,00 €
P6: 0,003333 €/kW día x 10,000 kW x 30 días = 1,00 €
Excesos de Potencia Exceso Precio Total
P1: 0,00 x 1,000000 = 0,00 € 0,00 €
P2: 0,00 x 1,000000 = 0,00 €
P3: 0,00 x 1,000000 = 0,00 €
P2: 0,00 x 1,000000 = 0,00 €
P5: 0,00 x 1,000000 = 0,00 €
P6: 0,00 x 1,000000 = 0,00 €
Energía reactiva Consumo Cos phi Exceso Precio Total
Pl: 0,00 kVArh 1,00 0,00 kVArh x 0,000000 €/kVArh = 0,00 € 0,00 €
P2: 0,00 kVArh 1,00 0,00 kVArh x 0,000000 €/kVArh = 0,00 €
P3: 0,00 kVArh 1,00 0,00 kVArh x 0,000000 €/kVArh = 0,00 €
P2: 0,00 kVArh 1,00 0,00 kVArh x 0,000000 €/kVArh = 0,00 €
PS: 0,00 kVArh 1,00 0,00 kVArh x 0,000000 €/kVArh = 0,00 €
P6: 0,00 kVArh 1,00 0,00 kVArh x 0,000000 €/kVArh = 0,00 €
Alquiler Equipo medida: 1,00 €
Impuesto electricidad 1,00 €
IVA 0,00 €
`;

test('normalizer trusts continuation CUPS and restores ordered FENIE period labels',()=>{
  const lines=helper.normalizeRecoveredText(ocr,'TOTAL FACTURA: 18,00 €',continuation);
  assert.ok(lines.includes(`CUPS: ${cups}`));
  assert.ok(lines.includes('Nº Factura: 202600000001'));
  assert.ok(lines.some(line=>/^P4: .*kWh/i.test(line)),'energy fourth row must be P4');
  assert.ok(lines.some(line=>/^P4: .*1,000000 = 0,00 €/i.test(line)),'excess fourth row must be P4');
  assert.ok(lines.some(line=>/^P5: .*kVArh/i.test(line)),'reactive fifth row must be P5');
  assert.equal(lines.at(-1),'TOTAL FACTURA: 18,00 €');
  assert.equal(helper.criticalShape(lines,continuation),true);
});

test('recovered OCR goes through the existing parseFenie and must balance before acceptance',()=>{
  const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const boot=appSource.indexOf("const dz=$('#dropZone')");
  assert.ok(boot>0,'Application bootstrap must remain present');
  const ctx=vm.createContext({window:{},document:{},pdfjsLib:{GlobalWorkerOptions:{}},console});
  vm.runInContext(appSource.slice(0,boot).replace(/^import[^\n]*\n/,'')+'\nglobalThis.parseFenieForTest=parseFenie;',ctx);
  const first=helper.normalizeRecoveredText(ocr,'TOTAL FACTURA: 18,00 €',continuation);
  const result=ctx.parseFenieForTest({pages:[first,continuation[1]],rawPages:[[],[]],text:[first,continuation[1]].flat().join('\n')},{name:'synthetic.pdf'});
  assert.equal(result.readOk,true);
  assert.equal(result.company,'TEST CLIENTE, S.L.');
  assert.equal(result.cups,cups);
  assert.equal(result.invoiceNumber,'202600000001');
  assert.equal(result.period,'01/06/2026 - 30/06/2026 (30 días)');
  assert.equal(result.tariff,'3.0TD');
  assert.equal(result.kwh,100);
  assert.equal(result.energy,10);
  assert.equal(result.power,6);
  assert.equal(result.total,18);
  assert.equal(result.diff,0);
});

test('missing total remains fail-closed instead of inventing a compatible invoice',()=>{
  const lines=helper.normalizeRecoveredText(ocr,'sin total legible',continuation);
  assert.equal(helper.criticalShape(lines,continuation),false);
});

test('production load order and cache bust expose the fallback to main and history readers',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const helperPos=html.indexOf('fenie-image-fallback.js?v=20260916-1');
  const appPos=html.indexOf('app.js?v=20260916-fenieocr1');
  assert.ok(helperPos>=0,'fallback script must be loaded');
  assert.ok(appPos>helperPos,'fallback must be available before app.js starts');

  const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.match(appSource,/IBTFenieImageFallback/);
  assert.match(appSource,/fallback\?\.needsOcr\?\.\(pages\)/);

  const historySource=fs.readFileSync(path.join(root,'xtra-history.js'),'utf8');
  assert.match(historySource,/IBTFenieImageFallback/);
  assert.match(historySource,/fallback\?\.needsOcr\?\.\(pages\)/);
  assert.match(historySource,/return \{pages,raw,text:pages\.flat\(\)\.join\('\\n'\)\};/,'history reader must preserve its normal return shape');

  const bootstrap=fs.readFileSync(path.join(root,'auth-bootstrap.js'),'utf8');
  assert.match(bootstrap,/xtra-history\.js\?v=20260916-fenieocr1/,'history cache must be busted so deployed browsers load the fix');
  assert.doesNotMatch(bootstrap,/xtra-history\.js\?v=20260915-endesa1/);
});
