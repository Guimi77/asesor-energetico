'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<main><div id="historicoView"></div></main>');
    await page.addScriptTag({ path: require.resolve('exceljs/dist/exceljs.min.js') });
    await page.addScriptTag({ path: 'client-workbook-layout.js' });
    await page.addScriptTag({ path: 'history-client-export.js' });
    await page.evaluate(() => {
      const row = (id, month, source) => ({
        id, invoice_number: id, supply_id: 's',
        billing_start: `2026-${month}-01`, billing_end: `2026-${month}-28`,
        validation_status: 'valid', tariff: '2.0TD',
        consumption_kwh: 100, energy_cost_eur: 10, power_cost_eur: 10,
        excess_cost_eur: 0, reactive_cost_eur: 0, compensation_eur: 0,
        social_bonus_eur: 0, meter_rental_eur: 0, distributor_charges_eur: 0,
        electricity_tax_eur: 0, vat_eur: 5, igic_eur: 0, other_cost_eur: 0,
        total_eur: 25, invoice_energy_periods: [], invoice_power_periods: [],
        invoice_maximeters: [], invoice_adjustments: [], ...source
      });
      window.testDB = {
        clients: [{ id: 'c', name: 'SYNTHETIC CLIENT' }],
        holders: [{ id: 'h', client_id: 'c', legal_name: 'CURRENT HOLDER' }],
        supplies: [{ id: 's', holder_id: 'h', cups: 'TEST-CUPS-HOLDER', supply_name: 'Synthetic Site' }],
        invoices: [
          row('OLD-HOLDER', '01', {
            source_holder_name: '  PREVIOUS & <img src=x onerror="window.syntheticInjected=true">  ',
            source_holder_tax_id: 'SYNTHETIC-OLD-TAX'
          }),
          row('CURRENT-HOLDER', '02', { source_holder_name: 'CURRENT HOLDER', source_holder_tax_id: 'SYNTHETIC-CURRENT-TAX' }),
          row('EMPTY-NAME', '03', { source_holder_name: '' }),
          row('WHITESPACE-NAME', '04', { source_holder_name: ' \t ' }),
          row('NULL-NAME', '05', { source_holder_name: null }),
          row('MISSING-NAME', '06', {})
        ]
      };
      window.originalDB = JSON.stringify(window.testDB);
      window.selects = [];
      window.ibtCurrentProfile = { id: 'synthetic-staff', role: 'staff' };
      // Honor the requested projection: a test that returns every column would
      // miss an omitted source_holder_name in the real Supabase SELECT.
      const selectedFields = columns => {
        let depth = 0, field = '';
        const fields = [];
        for (const character of columns + ',') {
          if (character === ',' && depth === 0) {
            fields.push(field.trim().split('(')[0]); field = '';
          } else {
            field += character;
            if (character === '(') depth++;
            if (character === ')') depth--;
          }
        }
        return fields.filter(Boolean);
      };
      window.ibtSupabase = {
        from(table) {
          let rows = window.testDB[table] || [], fields = [];
          const query = {
            select(columns) { fields = selectedFields(columns); window.selects.push({ table, fields }); return query; },
            order() { return query; },
            eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
            in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; },
            gte(key, value) { rows = rows.filter(row => row[key] >= value); return query; },
            lte(key, value) { rows = rows.filter(row => row[key] <= value); return query; },
            then(resolve, reject) {
              const data = rows.map(row => Object.fromEntries(fields.filter(field => field in row).map(field => [field, row[field]])));
              return Promise.resolve({ data: structuredClone(data), error: null }).then(resolve, reject);
            }
          };
          return query;
        }
      };
    });
    await page.addScriptTag({ path: 'history-ui.js' });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('ibt-role-changed', { detail: { profile: window.ibtCurrentProfile } })));
    await page.waitForFunction(() => document.querySelectorAll('.history-table tbody tr').length === 6 && !document.querySelector('#historyExportClient').disabled);
    const expectedSource = 'PREVIOUS & <img src=x onerror="window.syntheticInjected=true">';
    const label = id => page.locator(`tr[data-history-id="${id}"] td`).nth(1);
    assert.equal(await label('OLD-HOLDER').innerText(), expectedSource);
    assert.equal(await label('OLD-HOLDER').locator('img').count(), 0, 'An invoice holder is text, never active HTML');
    assert.equal(await page.evaluate(() => window.syntheticInjected), undefined);
    for (const id of ['CURRENT-HOLDER', 'EMPTY-NAME', 'WHITESPACE-NAME', 'NULL-NAME', 'MISSING-NAME']) {
      assert.equal(await label(id).innerText(), 'CURRENT HOLDER', id);
    }
    const invoiceSelects = await page.evaluate(() => window.selects.filter(query => query.table === 'invoices'));
    assert(invoiceSelects.length > 0);
    for (const query of invoiceSelects) {
      assert(query.fields.includes('source_holder_name'));
      assert(query.fields.includes('source_holder_tax_id'));
    }
    const downloadEvent = page.waitForEvent('download');
    await page.click('#historyExportClient');
    const download = await downloadEvent;
    assert(download.suggestedFilename().startsWith('CURRENT HOLDER_'), 'Export remains grouped by the selected current holder');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fs.readFileSync(await download.path()));
    const periods = workbook.getWorksheet('PERIODOS');
    assert.equal(periods.getCell('B5').value, expectedSource, 'The exported invoice keeps its original holder');
    for (let row = 6; row <= 10; row++) assert.equal(periods.getCell(`B${row}`).value, 'CURRENT HOLDER');
    assert.equal(workbook.getWorksheet('SUMINISTROS').getCell('A1').value, 'CURRENT HOLDER · ELECTRICIDAD');
    assert.equal(workbook.getWorksheet('RESUMEN TOTAL').getCell('B11').result, 600);
    assert.equal(workbook.getWorksheet('RESUMEN TOTAL').getCell('C11').result, 150);
    assert.equal(await page.evaluate(() => JSON.stringify(window.testDB) === window.originalDB), true, 'Source records and the current master must remain intact');
    assert.deepEqual(errors, []);
    console.log('PASS: projected invoice provenance, original holder in UI and actual XLSX, empty-name fallback, HTML escaping, unchanged current-holder scope, totals and input data. Synthetic data only.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
