'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../history-recommendations.js');

const supplies = [{
  id: 'alconaser-supply',
  holder_id: 'alconaser-holder',
  cups: 'ES0031500164216001LX0F',
  supply_name: 'Suministro ALCONASER de prueba',
}];

function record(id, start, end, maximeters) {
  return {
    id,
    invoice_number: id,
    supply_id: 'alconaser-supply',
    billing_start: start,
    billing_end: end,
    validation_status: 'valid',
    reading_status: 'unknown',
    tariff: '3.0TD',
    consumption_kwh: 1000,
    energy_cost_eur: 150,
    total_eur: 250,
    excess_cost_eur: 0,
    reactive_cost_eur: 0,
    invoice_power_periods: Array.from({length: 6}, (_, index) => ({
      period: index + 1,
      contracted_kw: 16.5,
    })),
    invoice_maximeters: maximeters.map((maximeter_kw, index) => ({
      period: index + 1,
      maximeter_kw,
      reliable: true,
      source: 'FENIE · tabla maxímetro',
    })),
    invoice_excesses: [],
    invoice_reactive: [],
  };
}

function powerItem(records) {
  return api.build({records, supplies}).items.find(item => item.type === 'power');
}

test('power history accepts a partial first invoice when the series is continuous and reaches 80 days', () => {
  const records = [
    record('2026060516386', '2026-05-13', '2026-05-31', [0, 3, 3, 0, 0, 3]),
    record('2026070375297', '2026-06-01', '2026-06-30', [5, 4, 0, 0, 0, 5]),
    record('2026080615278', '2026-07-01', '2026-07-31', [2, 3, 0, 0, 0, 2]),
  ];

  const item = powerItem(records);
  assert(item, 'the historical engine must preserve the power warning after three comparable invoices');
  assert.equal(item.coverageDays, 80);
  assert.equal(item.partialBoundaryPeriods, 1);
  assert.equal(item.measurements.length, 4);
  assert.equal(Math.max(...item.measurements.map(row => row.maximum)), 5);
  assert.match(item.evidence, /factura\(s\) parcial\(es\).*inicio o final/i);
  assert.match(item.caveat, /al menos 14 días/i);
});

test('a short invoice inside the series is not treated as comparable power history', () => {
  const records = [
    record('full-before', '2026-01-01', '2026-01-31', [4, 4, 4, 4, 4, 4]),
    record('short-middle', '2026-02-01', '2026-02-19', [4, 4, 4, 4, 4, 4]),
    record('full-after', '2026-02-20', '2026-03-31', [4, 4, 4, 4, 4, 4]),
  ];

  assert.equal(powerItem(records), undefined);
});

test('a boundary fragment shorter than the internal minimum remains excluded', () => {
  const records = [
    record('too-short-start', '2026-01-19', '2026-01-31', [4, 4, 4, 4, 4, 4]),
    record('full-middle', '2026-02-01', '2026-02-28', [4, 4, 4, 4, 4, 4]),
    record('full-end', '2026-03-01', '2026-04-09', [4, 4, 4, 4, 4, 4]),
  ];

  assert.equal(powerItem(records), undefined);
});
