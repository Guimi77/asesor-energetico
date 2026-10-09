'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ui = fs.readFileSync('history-ui.js', 'utf8');
const marker = 'window.IBTHistoryUI = { reload: refreshRecords };';
assert(ui.includes(marker), 'history test export boundary must exist');
const ctx = { window: { addEventListener() {} }, document: {}, console };
vm.createContext(ctx);
vm.runInContext(ui.replace(marker, 'window.testCharts = { svgChart, svgCostChart, chartAxisLabels, chartSeries, closeSearchMenu };'), ctx);
const core = ctx.window.testCharts;
const renderers = [
  points => core.svgChart(points, 'kwh', v => v + ' kWh'),
  points => core.svgChart(points, 'eur', v => v + ' EUR'),
  points => core.svgCostChart(points),
];
const indices = html => [...html.matchAll(/class="history-axis-label" data-point-index="(\d+)"/g)].map(m => Number(m[1]));
const values = (html, attribute) => [...html.matchAll(new RegExp('<circle[^>]* ' + attribute + '="([^"]+)"', 'g'))].map(m => Number(m[1]));
const monthly = count => Array.from({ length: count }, (_, i) => ({
  key: `${2025 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`,
  kwh: 100 + i * 25, eur: 40 + i * 7.5, records: 1, supplies: 1,
}));

// Synthetic dates and values only. The short first invoice must stay separate.
function periodRecords(count) {
  let start = Date.UTC(2024, 11, 24);
  return Array.from({ length: count }, (_, i) => {
    const days = i === 0 ? 17 : 30;
    const end = start + days * 86400000;
    const record = { id: 'synthetic-' + i, supply_id: 'synthetic-supply',
      billing_start: new Date(start).toISOString().slice(0, 10),
      billing_end: new Date(end).toISOString().slice(0, 10), billing_days: days,
      consumption_kwh: 100 + i * 25, total_eur: 40 + i * 7.5 };
    start = end;
    return record;
  });
}

test('All three charts label every point through twelve points; longer series keep both ends', () => {
  for (const count of [0, 1, 6, 8, 9, 10, 12, 13, 24, 50]) {
    const points = monthly(count);
    const sets = renderers.map(render => indices(render(points)));
    assert.deepEqual(sets[0], sets[1]);
    assert.deepEqual(sets[1], sets[2]);
    for (let i = 0; i < renderers.length; i++) {
      const html = renderers[i](points), selected = sets[i];
      assert.equal(selected.length, count <= 12 ? count : 8);
      assert.equal(new Set(selected).size, selected.length);
      assert.equal((html.match(/<circle /g) || []).length, count);
      if (count) { assert.equal(selected[0], 0); assert.equal(selected.at(-1), count - 1); }
      if (count <= 12) assert.deepEqual(selected, points.map((_, index) => index));
    }
  }
});

test('Ten irregular monthly invoices remain ten real periods with complete dates on two lines', () => {
  const records = periodRecords(10), before = JSON.stringify(records);
  const series = core.chartSeries(records);
  assert.equal(series.mode, 'period');
  assert.equal(series.points.length, 10);
  for (const render of renderers) {
    const html = render(series.points);
    assert.equal(indices(html).length, 10);
    assert.equal((html.match(/<tspan /g) || []).length, 20);
    for (const point of series.points) assert(html.includes('<title>' + point.label + '</title>'));
  }
  assert.deepEqual(values(renderers[0](series.points), 'data-value'), records.map(r => r.consumption_kwh));
  assert.deepEqual(values(renderers[1](series.points), 'data-value'), records.map(r => r.total_eur));
  assert.deepEqual(values(renderers[2](series.points), 'data-cost'), records.map(r => r.total_eur / r.consumption_kwh));
  assert.equal(JSON.stringify(records), before);
});

test('Axis labels cannot mutate points, replace missing values, or invent a zero cost', () => {
  const points = monthly(10);
  points[2].kwh = 0;
  points[4].kwh = null;
  points[6].eur = null;
  points[8].eur = -20;
  const before = JSON.stringify(points);
  const kwh = renderers[0](points), eur = renderers[1](points), cost = renderers[2](points);
  assert.deepEqual(values(kwh, 'data-value'), points.filter(p => Number.isFinite(p.kwh)).map(p => p.kwh));
  assert.deepEqual(values(eur, 'data-value'), points.filter(p => Number.isFinite(p.eur)).map(p => p.eur));
  assert.deepEqual(values(cost, 'data-cost'), points.filter(p => Number.isFinite(p.kwh) && p.kwh > 0 && Number.isFinite(p.eur)).map(p => p.eur / p.kwh));
  for (const html of [kwh, eur, cost]) { assert.equal(indices(html).length, 10); assert(!/NaN|Infinity/.test(html)); }
  assert.equal((cost.match(/class="history-cost-missing"/g) || []).length, 3);
  assert.equal(JSON.stringify(points), before);
});

test('Extra label space leaves the numeric plot coordinates unchanged', () => {
  const points = [{ key: '2025-01', kwh: 100, eur: 20 }, { key: '2025-02', kwh: 200, eur: 60 }];
  const kwh = renderers[0](points), cost = renderers[2](points);
  assert(kwh.includes('cx="102" cy="82"'));
  assert(kwh.includes('cx="640" cy="12"'));
  assert(cost.includes('cx="640" cy="12"'));
  for (const html of [kwh, cost]) assert(html.includes('y1="152"'));
});

test('Date text is escaped in both visible lines and hover titles', () => {
  const html = core.chartAxisLabels([{ x: 100, p: { chartMode: 'period', label: '<img src=x> - A&B' } }], 192);
  assert(!html.includes('<img'));
  assert(html.includes('&lt;img src=x&gt;'));
  assert(html.includes('A&amp;B'));
});

test('Closing a filter still exposes the correct collapsed accessibility state', () => {
  const attributes = {}, menu = { hidden: false };
  core.closeSearchMenu({ setAttribute: (key, value) => { attributes[key] = value; } }, menu);
  assert.equal(menu.hidden, true);
  assert.equal(attributes['aria-expanded'], 'false');
});
