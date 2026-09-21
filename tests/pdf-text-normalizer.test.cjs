'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const normalizer=require('../pdf-text-normalizer.js');
const formats=require('../invoice-formats.js');

test('repara de forma comun los acentos separados por PDF.js sin quitar acentos validos',()=>{
  const samples=[
    ['Energ í a consumida','Energía consumida'],
    ['27 d í as','27 días'],
    ['FACTURACI Ó N','FACTURACIÓN'],
    ['N ú mero de contrato','Número de contrato'],
    ['Ú ltima lectura','Última lectura'],
    ['EDISTRIBUCI Ó N REDES DIGITALES','EDISTRIBUCIÓN REDES DIGITALES']
  ];
  for(const [input,expected] of samples)assert.equal(normalizer.repair(input),expected);
  assert.equal(normalizer.repair('Dirección de suministro'),'Dirección de suministro');
  assert.equal(normalizer.repair('Energía consumida'),'Energía consumida');
});

test('la normalizacion es idempotente y no altera cifras, CUPS, fechas ni importes',()=>{
  const source='Energ í a consumida 485,91 kWh x 0,148729 €/kWh 72,27 € · ES0031500164915001GV · 22/06/2026';
  const once=normalizer.repair(source),twice=normalizer.repair(once);
  assert.equal(once,twice);
  assert.match(once,/485,91 kWh/);
  assert.match(once,/0,148729 €/);
  assert.match(once,/72,27 €/);
  assert.match(once,/ES0031500164915001GV/);
  assert.match(once,/22\/06\/2026/);
});

test('normalizeData conserva rawPages para auditoria y normaliza pages/text para todos los parsers',()=>{
  const rawPages=[[{str:'Energ'},{str:'í'},{str:'a'}]];
  const source={pages:[['Energ í a consumida'],['N ú mero de contrato']],rawPages,text:'texto antiguo'};
  const out=normalizer.normalizeData(source);
  assert.strictEqual(out.rawPages,rawPages);
  assert.deepEqual(out.pages,[['Energía consumida'],['Número de contrato']]);
  assert.equal(out.text,'Energía consumida\nNúmero de contrato');
  assert.equal(out.textNormalizationVersion,normalizer.VERSION);
});

test('FENIE y Endesa se detectan tras pasar por la misma normalizacion comun',()=>{
  const fenie=normalizer.repair('FENIE ENERG Í A Raz ó n Social: TEST Periodo Facturaci ó n: T é rmino de potencia');
  assert.equal(formats.detect(fenie),'fenie');
  const endesa=normalizer.repair('Endesa Energ í a, S.A. Nº factura: P26CON123456789');
  assert.equal(formats.detect(endesa),'endesa');
});

test('la arquitectura aplica la capa comun antes de parser principal, historico y enriquecedor',()=>{
  const root=path.join(__dirname,'..');
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const history=fs.readFileSync(path.join(root,'xtra-history.js'),'utf8');
  const supply=fs.readFileSync(path.join(root,'supply-enricher-v2.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(app,/IBTPdfTextNormalizer\?\.repair/);
  assert.match(app,/IBTPdfTextNormalizer\?\.normalizeData/);
  assert.match(app,/function parseInvoice\(d,file\)\{d=normalizePdfData\(d\)/);
  assert.match(history,/IBTPdfTextNormalizer\?\.repair/);
  assert.match(supply,/IBTPdfTextNormalizer\?\.repair/);
  const normalizerIndex=html.indexOf('pdf-text-normalizer.js?v=');
  const formatsIndex=html.indexOf('invoice-formats.js?v=');
  const iberdrolaIndex=html.indexOf('iberdrola-parser-v3.js?v=');
  const appIndex=html.indexOf('app.js?v=');
  assert.ok(normalizerIndex>=0,'falta pdf-text-normalizer.js en index.html');
  assert.ok(normalizerIndex<formatsIndex,'la normalizacion debe cargarse antes de invoice-formats');
  assert.ok(normalizerIndex<iberdrolaIndex,'la normalizacion debe cargarse antes de Iberdrola');
  assert.ok(normalizerIndex<appIndex,'la normalizacion debe cargarse antes de app.js');
});
