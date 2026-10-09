'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
    // This test needs no network, authentication, real invoices or database.
    await page.route('**/*', route => route.abort());
    await page.setContent('<style>body{font-family:Arial,sans-serif}</style><div id="historyContent"></div>');
    const source = fs.readFileSync('history-ui.js', 'utf8');
    const marker = 'window.IBTHistoryUI = { reload: refreshRecords };';
    assert(source.includes(marker));
    await page.addScriptTag({ content: source.replace(marker,
      'window.testCharts = { svgChart, svgCostChart, chartSeries, injectStyles };') });
    await page.evaluate(() => window.testCharts.injectStyles());
    let checked = 0;
    for (const width of [320, 410, 600, 800]) {
      for (const period of [false, true]) {
        for (const count of [1, 8, 10, 12, 13, 24]) {
          const results = await page.evaluate(({ width, period, count }) => {
            const api = window.testCharts;
            const points = Array.from({ length: count }, (_, i) => ({
              key: `${2025 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`,
              kwh: 100 + i * 25, eur: 40 + i * 7.5,
            }));
            if (period) {
              const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
              points.forEach((p, i) => {
                p.chartMode = 'period';
                p.label = i === 0 ? '10 dic 24 - 09 ene 25'
                  : '10 ' + months[(i - 1) % 12] + ' - 09 ' + months[i % 12];
              });
            }
            const charts = [api.svgChart(points, 'kwh', v => v + ' kWh'),
              api.svgChart(points, 'eur', v => v.toFixed(2) + ' EUR'), api.svgCostChart(points)];
            document.querySelector('#historyContent').innerHTML = charts.map(html =>
              '<div class="history-chart" style="width:' + width + 'px">' + html + '</div>').join('');
            return [...document.querySelectorAll('.history-svg')].map(svg => {
              const vb = svg.viewBox.baseVal;
              const labels = [...svg.querySelectorAll('.history-axis-label')];
              const boxes = labels.map(label => label.getBBox());
              const otherBoxes = [...svg.querySelectorAll('text:not(.history-axis-label)')].map(el => el.getBBox());
              const intersects = (a, b) => a.x < b.x + b.width - 0.1 && a.x + a.width > b.x + 0.1
                && a.y < b.y + b.height - 0.1 && a.y + a.height > b.y + 0.1;
              const circles = [...svg.querySelectorAll('circle')];
              return {
                labels: labels.length, dots: circles.length,
                clipped: boxes.some(b => b.x < 0 || b.y < 0 || b.x + b.width > vb.width || b.y + b.height > vb.height),
                overlap: boxes.some((b, i) => boxes.slice(i + 1).some(other => intersects(b, other))),
                axesOverlap: boxes.some(b => otherBoxes.some(other => intersects(b, other))),
                misaligned: labels.some(label => Math.abs(Number(label.getAttribute('x'))
                  - Number(circles[Number(label.dataset.pointIndex)].getAttribute('cx'))) > 0.01),
              };
            });
          }, { width, period, count });
          assert.equal(results.length, 3);
          for (const result of results) {
            const context = JSON.stringify({ width, period, count, result });
            assert.equal(result.labels, count <= 12 ? count : 8, context);
            assert.equal(result.dots, count, context);
            assert.equal(result.clipped, false, context);
            assert.equal(result.overlap, false, context);
            assert.equal(result.axesOverlap, false, context);
            assert.equal(result.misaligned, false, context);
            checked++;
          }
        }
      }
    }
    console.log('Axis-label browser checks passed: ' + checked + ' chart/width combinations.');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
