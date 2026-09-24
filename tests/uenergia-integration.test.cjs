const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const history=fs.readFileSync(path.join(root,'xtra-history.js'),'utf8');
const master=fs.readFileSync(path.join(root,'supply-enricher-v2.js'),'utf8');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/parser-regression.yml'),'utf8');

test('U Energia se carga antes del runtime principal',()=>{
  const parserPos=index.indexOf('uenergia-parser.js');
  const appPos=index.indexOf('app.js?');
  assert.ok(parserPos>=0,'falta uenergia-parser.js en index.html');
  assert.ok(appPos>parserPos,'uenergia-parser.js debe cargarse antes que app.js');
});

test('el parser principal enruta U Energia antes de fallbacks genericos',()=>{
  assert.match(app,/window\.IBTUenergiaParser/);
  assert.match(app,/uenergia\?\.detect\?\.\(d\)/);
  assert.match(app,/window\.IBTUenergiaParser\?\.detect\?\.\(original\)/);
});

test('el historico usa el mismo parser portable y conserva ajustes',()=>{
  assert.match(history,/function extractUenergia\(/);
  assert.match(history,/window\.IBTUenergiaParser/);
  assert.match(history,/adjustments=Array\.isArray\(row\.adjustments\)/);
  assert.match(history,/uenergia\?\.detect\?\.\(source\)/);
});


test('el maestro de suministros reutiliza el parser U Energia',()=>{
  assert.match(master,/function parseUenergiaSupply\(/);
  assert.match(master,/window\.IBTUenergiaParser/);
  assert.match(master,/format==='uenergia'\?parseUenergiaSupply\(pdfData,file\)/);
});


test('el cruce con la fila principal soporta la columna de diagnostico movida',()=>{
  assert.match(history,/const offset=c\[1\]\?\.dataset\?\.validationReason\?1:0/);
  assert.match(history,/c\[2\+offset\]/);
  assert.match(history,/c\[12\+offset\]/);
  assert.match(history,/c\[13\+offset\]/);
});

test('la exclusión U Energia conserva la huella técnica sin CUPS ni nº factura identificativos',()=>{
  const exclusionLine=history.split('\n').find(line=>line.includes('HISTORY_EXCLUSIONS='));
  assert.ok(exclusionLine);
  assert.match(exclusionLine,/billingStart:'2026-07-04'/);
  assert.match(exclusionLine,/billingEnd:'2026-08-04'/);
  assert.match(exclusionLine,/kwh:83/);
  assert.match(exclusionLine,/power:11\.88/);
  assert.match(exclusionLine,/total:52\.73/);
  assert.doesNotMatch(exclusionLine,/invoiceNumber|cups:/);
  assert.match(history,/item\.billingStart===x\?\.period\?\.start/);
  assert.match(history,/same\(item\.kwh,x\?\.kwh,\.02\)/);
  assert.match(history,/same\(item\.power,x\?\.power,\.02\)/);
  assert.match(history,/same\(item\.total,x\?\.total,\.02\)/);
  assert.match(history,/reason:'user_excluded_invoice'/);
  assert.match(history,/excludedHistoryInvoice\(x\)/);
});

test('la regresion CI comprueba sintaxis y tests U Energia',()=>{
  assert.match(workflow,/node --check uenergia-parser\.js/);
  assert.match(workflow,/tests\/uenergia-parser\.test\.cjs/);
  assert.match(workflow,/tests\/uenergia-integration\.test\.cjs/);
});
