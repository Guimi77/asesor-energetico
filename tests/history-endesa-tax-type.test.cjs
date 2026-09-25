'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260915100325_allow_electricity_tax_history_lines.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

test('Endesa electricity tax detail is accepted by history tax lines', () => {
  assert.match(sql, /invoice_tax_lines_tax_type_check/);
  assert.match(sql, /ELECTRICITY_TAX/);
  assert.match(sql, /IVA/);
  assert.match(sql, /IGIC/);
  assert.match(sql, /OTHER/);
});
