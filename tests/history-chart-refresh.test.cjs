'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const BASE='c2a3e38daf5c064960c166941692f01691f1d7fa';
const source=f=>fs.readFileSync(f,'utf8'),old=f=>execFileSync('git',['show',BASE+':'+f],{encoding:'utf8'});
const ui=source('history-ui.js');
const chunk=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i);return s.slice(i,j)};
const ctx={Number,Math,qty:(v,d)=>Number(v).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}),esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),monthLabel:v=>v};
vm.createContext(ctx);vm.runInContext(chunk(ui,'  function svgCostChart','  function powerSignature')+'\nglobalThis.chart=svgCostChart;',ctx);
test('Third chart belongs to the core history renderer and old sidecar is not loaded',()=>{
 assert(ui.includes('id="historyCostChart"'));assert(ui.includes('${svgCostChart(monthly)}'));
 assert(!source('auth-bootstrap.js').includes('history-cost-chart.js'));
 assert(!source('index.html').includes('history-cost-chart.js'));
 assert(!/MutationObserver|setTimeout\s*\(|setInterval\s*\(/.test(chunk(ui,'  function svgCostChart','  function powerSignature')));
});
test('Monthly cost uses total euros divided by total consumption',()=>{
 const html=ctx.chart([{key:'2026-01',kwh:10,eur:2}]);assert(html.includes('data-cost="0.2"'));assert(html.includes('0,2000'));
});
test('Zero consumption produces a gap, not a false zero price',()=>{
 const html=ctx.chart([{key:'2026-01',kwh:100,eur:20},{key:'2026-02',kwh:0,eur:40},{key:'2026-03',kwh:100,eur:10}]);
 assert.equal((html.match(/<circle /g)||[]).length,2);assert.equal((html.match(/history-cost-missing/g)||[]).length,1);
 const path=html.match(/<path d="([^"]*)"/)[1];assert.equal((path.match(/M /g)||[]).length,2);assert(!path.includes('L '));
});
test('Empty and all-zero selections still have a useful empty or missing state',()=>{
 assert(ctx.chart([]).includes('Sin datos'));const html=ctx.chart([{key:'2026-01',kwh:0,eur:20}]);assert(!html.includes('<circle'));assert(!html.includes('<path'));assert(html.includes('sin dato'));
});
test('Valid zero cost, small positive consumption and negative totals remain numerical values',()=>{
 for(const [kwh,eur,value] of [[100,0,0],[.001,.0001,.1],[100,-20,-.2]]){const html=ctx.chart([{key:'x',kwh,eur}]);assert(html.includes('data-cost="'+value+'"'));assert(!html.includes('history-cost-missing'));}
});
test('Invalid numeric values never produce invalid SVG coordinates',()=>{
 for(const v of [null,undefined,NaN,Infinity,'',false]){const html=ctx.chart([{key:'x',kwh:v,eur:20}]);assert(!html.includes('<circle'));assert(!/NaN|Infinity/.test(html));}
});
test('Two original charts, aggregation, recommendations, data fetching and auth remain unchanged',()=>{
 for(const [a,b] of [['  function supplyById','  function powerSignature'],['  function powerSignature','  function renderRecommendations']]){
  let actual=chunk(ui,a,b);if(a.includes('supplyById'))actual=actual.replace(/  \/\/ Rendered with the other charts[\s\S]*$/,'');
  assert.equal(actual,chunk(old('history-ui.js'),a,b));
 }
 assert.equal(chunk(ui,'  async function fetchRecords','  function supplyById'),chunk(old('history-ui.js'),'  async function fetchRecords','  function supplyById'));
 // refreshRecords has reviewed export/stale-filter guards, covered by history-client-export-browser.cjs.
 for(const f of ['app.js','xtra-history.js','supply-enricher-v2.js','auth.js','bulk-performance.js','history-recommendations.js','history-recommendations.css','history-cost-chart.js','parser-audit.js','client-report-export.js'])assert.equal(source(f),old(f),f);
});
