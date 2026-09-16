'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
// Stable production baseline after the approved boundary-period power-history fix.
// This is deliberately advanced instead of removing any lock: new work must still preserve the now-approved history logic.
const BASE='2bc997c07165b1feb2064158957826b0cfe0b288';
const source=f=>fs.readFileSync(f,'utf8'),old=f=>execFileSync('git',['show',BASE+':'+f],{encoding:'utf8'});
const ui=source('history-ui.js');
const chunk=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i);return s.slice(i,j)};
const ctx={Number,Math,qty:(v,d)=>Number(v).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}),esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c])),monthLabel:v=>v};
vm.createContext(ctx);vm.runInContext(chunk(ui,'  function svgCostChart','  function powerSignature')+'\nglobalThis.chart=svgCostChart;',ctx);
test('Third chart belongs to the core history renderer and old sidecar is not loaded',()=>{
 assert(ui.includes('id="historyCostChart"'));assert(ui.includes('${svgCostChart(chartPoints)}'));
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
 assert(ctx.chart([]).includes('cobertura suficiente'));const html=ctx.chart([{key:'2026-01',kwh:0,eur:20}]);assert(!html.includes('<circle'));assert(!html.includes('<path'));assert(html.includes('sin dato'));
});
test('Valid zero cost, small positive consumption and negative totals remain numerical values',()=>{
 for(const [kwh,eur,value] of [[100,0,0],[.001,.0001,.1],[100,-20,-.2]]){const html=ctx.chart([{key:'x',kwh,eur}]);assert(html.includes('data-cost="'+value+'"'));assert(!html.includes('history-cost-missing'));}
});
test('Invalid numeric values never produce invalid SVG coordinates',()=>{
 for(const v of [null,undefined,NaN,Infinity,'',false]){const html=ctx.chart([{key:'x',kwh:v,eur:20}]);assert(!html.includes('<circle'));assert(!/NaN|Infinity/.test(html));}
});
test('Approved history logic and FENIE enrichment remain locked while Endesa routing may evolve',()=>{
 assert(ui.includes("actual:'Real confirmada'"));
 assert(ui.includes("estimated:'Estimada'"));
 assert(ui.includes('Lectura: ${esc(readingLabel(r))}'));
 assert.equal(chunk(ui,'  function aggregateMonthly','  // Coverage presentation'),chunk(old('history-ui.js'),'  function aggregateMonthly','  // Coverage presentation'));
 assert.equal(chunk(ui,'  function powerSignature','  function renderRecommendations'),chunk(old('history-ui.js'),'  function powerSignature','  function renderRecommendations'));
 assert.equal(chunk(ui,'  async function fetchRecords','  function supplyById'),chunk(old('history-ui.js'),'  async function fetchRecords','  function supplyById'));
 // The FENIE supply parser stays byte-for-byte locked. Only the later format router may add Endesa.
 const enricher=source('supply-enricher-v2.js'),oldEnricher=old('supply-enricher-v2.js');
 assert.equal(chunk(enricher,'function parseSupply(lines)','function endesaAddress'),chunk(oldEnricher,'function parseSupply(lines)','async function waitForMaster'));
 assert(enricher.includes("format==='fenie'?parseSupply(allLines):format==='endesa'?parseEndesaSupply(pages,file):{}"));
 // The audit can evolve only to distinguish unavailable detail from an actual zero/error.
 const audit=source('parser-audit.js');assert(audit.includes('const hasAnyPeriodCost='));assert(audit.includes('if(!hasAnyPeriodCost)energyOk++'));assert(audit.includes('Detalle energético coherente o no informado'));
 // app.js, client-report-export.js and auth.js are allowed to evolve through their dedicated regression suites.
 for(const f of ['history-recommendations.js','history-recommendations.css','history-cost-chart.js'])assert.equal(source(f),old(f),f);
});