'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const audit=fs.readFileSync('parser-audit.js','utf8');

test('el runtime expone la fuente interna y puede refrescar la presentacion',()=>{
  assert.match(app,/window\.IBTAnalysisRuntime=Object\.freeze/);
  assert.match(app,/snapshot:\(\)=>\(\{/);
  assert.match(app,/unsupported:!!r\.unsupported/);
  assert.match(app,/sourceFormat:r\.sourceFormat/);
  assert.match(app,/parserRevision:r\.parserRevision/);
  assert.match(app,/refresh:refreshRuntimeDom/);
});

test('el guard solo re-renderiza cuando DOM y estado interno divergen',()=>{
  assert.match(app,/function runtimeDomInSync\(\)/);
  assert.match(app,/if\(!runtimeDomInSync\(\)\)refreshRuntimeDom\(\)/);
  assert.match(app,/new MutationObserver\(scheduleRuntimeDomRepair\)/);
  assert.match(app,/Number\(\$\('#statOk'\)\?\.textContent\|\|0\)!==expected\.ok/);
  assert.match(app,/if\(row\.readOk\)\{if\(!badge\.classList\.contains\('ok'\)\)return false\}/);
});

test('la auditoria guarda el runtime y el estado de sincronizacion',()=>{
  assert.match(audit,/window\.IBTAnalysisRuntime\?\.snapshot/);
  assert.match(audit,/Runtime navegador/);
  assert.match(audit,/DOM sincronizado/);
  assert.match(audit,/Parser SEA cargado/);
  assert.match(audit,/parserRevision/);
});
