'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

// Contract regression: no real customer data or invoices.
test('Missing distributor readings are excluded from consumption charts, not economic invoices',()=>{
  const source=fs.readFileSync('history-ui.js','utf8');
  assert.match(source,/missingDistributorReading\s*=\s*r\s*=>\s*r\?\.reading_status\s*===\s*'no_distributor_reading'/);
  assert.match(source,/chartConsumption\s*=\s*r\s*=>\s*missingDistributorReading\(r\)\s*\?\s*null/);
  assert.match(source,/const kwh=chartConsumption\(r\)/);
  assert.match(source,/rows\.filter\(r => chartConsumption\(r\) === null\)/);
  assert.match(source,/regularizaciones entre meses sin evidencia/);
  assert.match(source,/x\.eur \+= n\(r\.total_eur\)/);
});
