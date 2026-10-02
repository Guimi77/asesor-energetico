'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {acceptedFile}=require('./helpers/regression-baseline.cjs');
// Stable production baseline after the approved boundary-period power-history fix.
// This is deliberately advanced instead of removing any lock: new work must still preserve the now-approved history logic.
const source=f=>fs.readFileSync(f,'utf8'),old=f=>acceptedFile(f);
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

test('Compensation keeps the accounting sign in stored data but is presented as a positive benefit',()=>{
 assert(ui.includes("x.compensationEur += compensation"),'history aggregation must preserve the signed source amount');
 assert(ui.includes("money(Math.abs(totalCompensationEur))"),'the accumulated compensation KPI must show the benefit as a positive amount');
 assert(ui.includes("svgChart(chartPoints,'compensationEur',v=>`${money(v)} €`,{valueTransform:v=>Math.abs(v)})"),'the compensation chart must plot the magnitude returned to the client');
 assert(ui.includes("<td>${compensation?money(compensation):'—'}</td>"),'the detailed table must keep the original accounting sign');
});
test('Compensated excesses are conditional visual data, not hidden inside other costs',()=>{
 assert(ui.includes('Excedentes compensados'));
 assert(ui.includes('Compensación acumulada'));
 assert(ui.includes("svgChart(chartPoints,'exportedKwh'"));
 assert(ui.includes("svgChart(chartPoints,'compensationEur'"));
 assert(ui.includes('<th>Excedentes kWh</th><th>Compensación €</th>'));
 assert(ui.includes("const other=n(r.social_bonus_eur)+n(r.meter_rental_eur)+n(r.distributor_charges_eur)+n(r.other_cost_eur)"));
 assert(!ui.includes("const other=n(r.compensation_eur)+n(r.social_bonus_eur)"));
});
test('Invalid numeric values never produce invalid SVG coordinates',()=>{
 for(const v of [null,undefined,NaN,Infinity,'',false]){const html=ctx.chart([{key:'x',kwh:v,eur:20}]);assert(!html.includes('<circle'));assert(!/NaN|Infinity/.test(html));}
});
test('Approved history logic and FENIE enrichment remain locked while Endesa routing may evolve',()=>{
 assert(ui.includes("actual:'Real confirmada'"));
 assert(ui.includes("estimated:'Estimada'"));
 assert(ui.includes('Lectura: ${esc(readingLabel(r))}'));
 const aggregate=chunk(ui,'  function aggregateMonthly','  // Coverage presentation');
 assert(aggregate.includes("x.kwh += n(r.consumption_kwh)"));
 assert(aggregate.includes("x.eur += n(r.total_eur)"));
 assert(aggregate.includes("invoice_compensation_periods"));
 assert(aggregate.includes("x.exportedKwh +="));
 assert(aggregate.includes("x.compensationEur += compensation"));
 assert.equal(chunk(ui,'  function powerSignature','  function rowDetail'),chunk(old('history-ui.js'),'  function powerSignature','  function rowDetail'));
 const fetch=chunk(ui,'  async function fetchRecords','  function supplyById');
 for(const token of [
  'invoice_energy_periods(period,consumption_kwh,energy_cost_eur,unit_price_eur_kwh)',
  'invoice_power_periods(period,contracted_kw,billed_power_eur,unit_price_eur_kw_day)',
  'invoice_maximeters(period,maximeter_kw,reliable,source)',
  'invoice_excesses(period,excess_kw,amount_eur)',
  'invoice_reactive(period,reactive_kvarh,amount_eur)',
  'invoice_compensation_periods(period,exported_kwh,unit_price_eur_kwh,amount_eur,vat_rate_pct)',
  'invoice_adjustments(concept,amount_eur,category)'
 ]) assert(fetch.includes(token),token);
 // The FENIE supply parser stays byte-for-byte locked. Endesa has its own adapter after this boundary.
 const enricher=source('supply-enricher-v2.js'),oldEnricher=old('supply-enricher-v2.js');
 assert.equal(chunk(enricher,'function parseSupply(lines)','function endesaAddress'),chunk(oldEnricher,'function parseSupply(lines)','function endesaAddress'));
 for(const token of [
  "format==='uenergia'?parseUenergiaSupply(pdfData,file)",
  "format==='iberdrola'?parseIberdrolaSupply(pdfData,file)",
  "format==='repsol'?parseRepsolSupply(pdfData,file)",
  "format==='naturgy'?parseNaturgySupply(pdfData,file)",
  "format==='fenie'?parseSupply(allLines)",
  "format==='endesa'?parseEndesaSupply(pdfData.pages,file)"
 ]) assert(enricher.includes(token),token);
 // The audit may evolve, but missing energy/period data must remain fail-closed.
 const audit=source('parser-audit.js');
 assert(audit.includes('const expectedEnergyPeriods='));
 assert(audit.includes('const hasAnyPeriodCost='));
 assert(audit.includes('if(consumption>0&&energy<=0)'));
 assert(audit.includes('No se acepta 0 kWh por ausencia de datos.'));
 assert(audit.includes('Detalle energético coherente'));
 // app.js, client-report-export.js and auth.js are allowed to evolve through their dedicated regression suites.
 for(const f of ['history-recommendations.js','history-recommendations.css','history-cost-chart.js'])assert.equal(source(f),old(f),f);
});