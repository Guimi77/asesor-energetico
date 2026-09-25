'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('fallback loads before the main parser and Tesseract stays lazy',()=>{
  const html=read('index.html');
  assert.ok(html.indexOf('fenie-ocr-fallback.js')<html.indexOf('app.js'));
  assert.ok(!/tesseract(?:\.min)?\.js/i.test(html));
});
test('main parser only routes individual PDF processing through guarded fallback',()=>{
  const app=read('app.js');
  assert.match(app,/async function parseInvoiceFile\(file\)/);
  assert.match(app,/fallback\.prepare\(file,original,pdfjsLib\)/);
  assert.match(app,/criticalRowOk/);
  assert.match(app,/const r=await parseInvoiceFile\(file\)/);
  assert.match(app,/function parseFenie\(/);
  assert.match(app,/formats\.parseEndesa/);
});
test('historical persistence reuses the same fallback and keeps crosscheck gate',()=>{
  const history=read('xtra-history.js');
  assert.match(history,/fallback\.prepare\(file,source,pdfjsLib\)/);
  assert.match(history,/crosscheck_failed/);
  assert.match(history,/\/Correcta\/i\.test\(ui\.status\).*ui\.balance==='OK'/s);
});
