'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const parser=require('../som-energia-parser.js');
const history=fs.readFileSync('xtra-history.js','utf8');
const ui=fs.readFileSync('history-ui.js','utf8');
const exportJs=fs.readFileSync('history-client-export.js','utf8');
const enrich=fs.readFileSync('historical-export-enrichment.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260930053500_add_compensation_period_history.sql','utf8');

test('Som Energia keeps compensation period semantics in the portable parser',()=>{
  const lines=[
    'Electricitat excedentària [kWh] -47,99 -56,56 -42,53',
    'Preu energia [€/kWh] 0,03 0,03 0,03',
    'kWh x €/kWh (del 01/06/2026 al 30/06/2026) -1,44 € -1,70 € -1,28 € (1) 21%',
    '-4,42 €'
  ];
  const r=parser._test.parseCompensation(lines.join('\n'),lines);
  assert.equal(r.total,-4.42);
  assert.equal(r.exportedKwh,147.08);
  assert.deepEqual(r.periods.P1,{excessKwh:47.99,price:0.03,amount:-1.44,vatRatePct:21});
  assert.deepEqual(r.periods.P2,{excessKwh:56.56,price:0.03,amount:-1.70,vatRatePct:21});
  assert.deepEqual(r.periods.P3,{excessKwh:42.53,price:0.03,amount:-1.28,vatRatePct:21});
});

test('history maps compensation detail without abusing power excess fields',()=>{
  assert.match(history,/const compensationPeriods=Object\.entries\(row\.compensationPeriods\|\|\{\}\)/);
  assert.match(history,/exported_kwh:value\?\.excessKwh/);
  assert.match(history,/unit_price_eur_kwh:value\?\.price/);
  assert.match(history,/vat_rate_pct:value\?\.vatRatePct/);
  assert.match(history,/payload\.compensation_periods=x\.compensationPeriods/);
  assert.match(history,/payload\.exported_kwh=x\.exportedKwh/);
  assert.match(history,/upsert_xtra_energy_history_v3/);
  assert.doesNotMatch(history,/compensationPeriods[^\n]*excessPeriods/);
});

test('migration creates a dedicated fail-closed compensation table and v3 writer',()=>{
  assert.match(migration,/create table if not exists public\.invoice_compensation_periods/);
  assert.match(migration,/exported_kwh numeric not null check \(exported_kwh >= 0\)/);
  assert.match(migration,/unit_price_eur_kwh numeric not null check \(unit_price_eur_kwh >= 0\)/);
  assert.match(migration,/amount_eur numeric not null check \(amount_eur <= 0\)/);
  assert.match(migration,/vat_rate_pct numeric/);
  assert.match(migration,/unique\(invoice_id, period\)/);
  assert.match(migration,/private\.sync_invoice_compensation_periods/);
  assert.match(migration,/compensation_period_total_mismatch/);
  assert.match(migration,/exported_kwh_total_mismatch/);
  assert.match(migration,/public\.upsert_xtra_energy_history_v3/);
  assert.match(migration,/invoice_compensation_detail_synced/);
  assert.match(migration,/private\.can_access_client\(private\.client_id_for_invoice\(invoice_id\)\)/);
});

test('history UI and client export expose the stored compensation detail',()=>{
  for(const source of [ui,enrich]) assert.match(source,/invoice_compensation_periods\(period,exported_kwh,unit_price_eur_kwh,amount_eur,vat_rate_pct\)/);
  assert.match(ui,/Compensación de excedentes/);
  assert.match(ui,/Excedentes kWh/);
  assert.match(ui,/IVA %/);
  assert.match(exportJs,/Excedente compensado kWh/);
  assert.match(exportJs,/Precio compensaci\\u00f3n \\u20ac\/kWh/);
  assert.match(exportJs,/IVA compensaci\\u00f3n %/);
  assert.match(exportJs,/invoice_compensation_periods/);
});
