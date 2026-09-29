'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');

test('Som Energia se carga antes del runtime principal',()=>{
  const parser=index.indexOf('som-energia-parser.js?v=');
  const appPos=index.indexOf('app.js?v=');
  assert.ok(parser>=0,'falta som-energia-parser.js en index.html');
  assert.ok(appPos>parser,'Som Energia debe cargarse antes que app.js');
});

test('la pantalla de Facturas enruta Som Energia antes del fallback FENIE',()=>{
  const route=app.indexOf('const som=window.IBTSomEnergiaParser');
  const fenie=app.indexOf('const fenie=window.IBTFenieParser',route);
  assert.ok(route>=0,'falta ruta Som Energia en parseInvoice');
  assert.ok(fenie>route,'Som Energia debe evaluarse antes que FENIE');
  assert.match(app,/window\.IBTSomEnergiaParser\?\.detect\?\.\(original\)/);
});

test('esta fase no conecta Som Energia con histórico',()=>{
  const history=fs.readFileSync('xtra-history.js','utf8');
  assert.doesNotMatch(history,/IBTSomEnergiaParser/);
});
