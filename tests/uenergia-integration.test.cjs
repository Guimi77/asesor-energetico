const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const history=fs.readFileSync(path.join(root,'xtra-history.js'),'utf8');
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

test('la regresion CI comprueba sintaxis y tests U Energia',()=>{
  assert.match(workflow,/node --check uenergia-parser\.js/);
  assert.match(workflow,/tests\/uenergia-parser\.test\.cjs/);
  assert.match(workflow,/tests\/uenergia-integration\.test\.cjs/);
});
