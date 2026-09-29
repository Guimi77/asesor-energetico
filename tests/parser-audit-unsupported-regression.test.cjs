const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'parser-audit.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('parser audit separates unsupported documents from supported quality metrics',()=>{
  assert.match(source,/let supported=0,unsupported=0/);
  assert.match(source,/if\(\/\^NO\\s\+COMPATIBLE\$\/i\.test\(parserStatus\)\)/);
  assert.match(source,/unsupported\+\+/);
  assert.match(source,/DOCUMENTO NO COMPATIBLE/);
  assert.match(source,/continue;/);
  assert.match(source,/supported\+\+/);
  assert.match(source,/const pct=x=>a\.supported\?x\/a\.supported:0/);
  assert.match(source,/\['Facturas compatibles',a\.supported\]/);
  assert.match(source,/\['Documentos no compatibles',a\.unsupported\]/);
});

test('unsupported documents do not fall through into identity failure checks',()=>{
  const unsupportedGate=source.indexOf("if(/^NO\\s+COMPATIBLE$/i.test(parserStatus))");
  const continueAt=source.indexOf('continue;',unsupportedGate);
  const identityCheck=source.indexOf('const idGood=',unsupportedGate);
  assert.ok(unsupportedGate>=0);
  assert.ok(continueAt>unsupportedGate);
  assert.ok(identityCheck>continueAt);
});

test('audit reports documents with issues rather than unique invoice numbers',()=>{
  assert.match(source,/const issueDocuments=new Set\(\)/);
  assert.match(source,/issueDocuments\.add\(documentKey\)/);
  assert.match(source,/issueDocuments:issueDocuments\.size/);
  assert.match(source,/documentos con incidencias: \$\{a\.issueDocuments\}/i);
});

test('audit cache token is refreshed when unsupported semantics change',()=>{
  assert.match(html,/parser-audit\.js\?v=19e3e2875d53/);
});
