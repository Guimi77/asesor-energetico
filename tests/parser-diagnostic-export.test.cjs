'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const audit=fs.readFileSync(path.join(root,'parser-audit.js'),'utf8');

test('la app conserva exactamente los items PDF.js antes de interpretar la factura',()=>{
  assert.match(app,/window\.IBTParserDiagnostics\s*=\s*\{/);
  assert.match(app,/capturePdfJsPage\(file,i,c\.items,viewport\)/);
  assert.match(app,/text:String\(item\?\.str\?\?''\)/);
  assert.match(app,/x:Number\(t\[4\]\?\?0\)/);
  assert.match(app,/y:Number\(t\[5\]\?\?0\)/);
  assert.match(app,/width:Number\(item\?\.width\?\?0\)/);
  assert.match(app,/height:Number\(item\?\.height\?\?0\)/);
  assert.match(app,/hasEOL:!!item\?\.hasEOL/);
  assert.match(app,/transform:t\.map/);
  assert.match(app,/finalizePdfJsDiagnostic\(file\.name,r\)/);
});

test('limpiar análisis elimina también el diagnóstico PDF.js en memoria',()=>{
  assert.match(app,/window\.IBTParserDiagnostics\?\.clear\?\.\(\)/);
});

test('Auditar parser exporta items crudos y líneas reconstruidas en hojas separadas',()=>{
  assert.match(audit,/window\.IBTParserDiagnostics\?\.items\?\.\(\)/);
  assert.match(audit,/window\.IBTParserDiagnostics\?\.lines\?\.\(\)/);
  assert.match(audit,/Diagnóstico PDF\.js/);
  assert.match(audit,/Filas PDF\.js/);
  for(const header of ['Archivo PDF','Índice item PDF.js','Texto exacto','x','y','Ancho','Alto','hasEOL','fontName','t0','t5','Ancho página','Alto página']){
    assert.ok(audit.includes(header),`Falta la columna de diagnóstico: ${header}`);
  }
});


test('la auditoría común considera el número de factura parte de la identidad esencial',()=>{
  assert.match(audit,/!!invoice&&invoice!=='Por identificar'/);
  assert.match(audit,/nº factura, empresa, CUPS, periodo, tarifa o total/);
});
