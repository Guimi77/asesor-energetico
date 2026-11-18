'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname,'..');
const src = fs.readFileSync(path.join(root,'admin-data-management.js'),'utf8');
const auth = fs.readFileSync(path.join(root,'auth.js'),'utf8');
const index = fs.readFileSync(path.join(root,'index.html'),'utf8');
const marker = '  function holderInvoiceRelation(holder, invoice) {';
const start = src.indexOf(marker);
const end = src.indexOf('\n  function invoiceEffectiveDate(',start);
assert.ok(start !== -1 && end > start,'must be able to isolate original production relation function');
const functionSource = src.slice(start,end);
const ctx = vm.createContext({
  taxKey: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g,''),
  norm: value => String(value || '').trim().toUpperCase(),
});
const classify = vm.runInContext('('+functionSource.trim()+')',ctx);
const holder = {tax_id:'ABC123',legal_name:'TITULAR DE PRUEBA'};

test('maestro con NIF y factura sin NIF no genera falso aviso fiscal',()=>{
  assert.equal(classify(holder,{source_holder_tax_id:null,source_holder_name:'TITULAR DE PRUEBA'}).kind,'invoice_missing_tax');
  assert.match(src,/NIF\/CIF pre.{5} en el maestro\. La última factura no permite contrastarlo/);
  assert.match(src,/db-mismatch-neutral/);
});
test('faltante en maestro sigue pendiente de revisión',()=>{
  assert.equal(classify({...holder,tax_id:''},{source_holder_tax_id:null}).kind,'review');
  assert.equal(classify({...holder,tax_id:''},{source_holder_tax_id:'ABC123'}).kind,'review');
});
test('DNI diferente en la factura sigue siendo cambio potencial de titular',()=>{
  assert.equal(classify(holder,{source_holder_tax_id:'XYZ456',source_holder_name:'OTRO TITULAR'}).kind,'holder_change');
});
test('NIF igual conserva distinción de nombre actualizado',()=>{
  assert.equal(classify(holder,{source_holder_tax_id:'ABC123',source_holder_name:'TITULAR DE PRUEBA'}).kind,'coherent');
  assert.equal(classify(holder,{source_holder_tax_id:'ABC123',source_holder_name:'NOMBRE CAMBIADO'}).kind,'rename');
});
test('sin factura se conserva estado desconocido',()=>{
  assert.equal(classify(holder,null).kind,'unknown');
});
test('administración e inicio de sesión cargan scripts sin caché antigua',()=>{
  assert.match(auth,/admin-data-management\.js\?v=1ef88b414ac3/);
  assert.match(index,/auth\.js\?v=d1759727dc03/);
});
