'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

test('Facturas muestra y exporta todos los conceptos estructurados que quedan fuera de las columnas principales',()=>{
  assert.match(app,/function summaryOtherValue\(r,separateCompensation=false,separateDistributor=false\)/);
  assert.match(app,/money\(summaryOtherValue\(r\)\)/);
  assert.match(app,/r\.compensation,summaryOtherValue\(r,true,true\),r\.distributorCharges/);
  assert.match(app,/const accounted=Number\(r\?\.accounted\)/);
});
