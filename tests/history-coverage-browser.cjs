'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1720,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
  await page.setContent('<!doctype html><html lang="es"><head></head><body><main style="padding:20px"><div id="historicoView"></div></main></body></html>');
  await page.addStyleTag({path:'styles.css'});await page.addStyleTag({path:'history-recommendations.css'});
  await page.evaluate(()=>{
   const row=(id,s,m,kwh,eur)=>({id,invoice_number:'SYNTHETIC-'+id,supply_id:s,billing_start:'2026-'+m+'-01',billing_end:'2026-'+m+'-28',validation_status:'valid',tariff:'3.0TD',consumption_kwh:kwh,energy_cost_eur:eur,power_cost_eur:0,excess_cost_eur:0,reactive_cost_eur:0,total_eur:eur,invoice_energy_periods:[],invoice_power_periods:[],invoice_maximeters:[],invoice_adjustments:[]});
   window.db={clients:[{id:'c',name:'Cliente de prueba'}],holders:[{id:'h',client_id:'c',legal_name:'Titular de prueba'}],supplies:['a','b','c'].map(id=>({id,holder_id:'h',cups:'TEST-'+id,supply_name:'Local '+id})),invoices:[row('r1','a','01',0,100),row('r2','a','03',345678.25,56000.99),row('r3','b','03',10,20),row('r4','b','04',1000,200)]};
   window.ibtCurrentProfile={id:'test-user',role:'staff'};window.mockQueries=0;
   window.ibtSupabase={from(table){window.mockQueries++;let rows=window.db[table]||[];const q={select(){return q},order(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,values){rows=rows.filter(r=>values.includes(r[k]));return q},gte(k,v){rows=rows.filter(r=>r[k]>=v);return q},lte(k,v){rows=rows.filter(r=>r[k]<=v);return q},then(resolve,reject){return Promise.resolve({data:structuredClone(rows),error:null}).then(resolve,reject)}};return q;}};
  });
  await page.addScriptTag({path:'history-recommendations.js'});await page.addScriptTag({path:'history-client-export.js'});await page.addScriptTag({path:'history-ui.js'});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}})));
  await page.waitForSelector('.history-coverage');
  assert.equal(await page.locator('.history-grid>.history-chart').count(),3);
  assert.equal(await page.locator('.history-table tbody tr').count(),4);
  assert.match(await page.locator('.history-coverage').innerText(),/Cobertura variable/);
  assert.match(await page.locator('.history-coverage').innerText(),/Entre 0 y 2 de 3/);
  assert.equal(await page.locator('svg[data-field="kwh"] circle[data-month="2026-01"]').getAttribute('data-value'),'0');
  assert.equal(await page.locator('svg[data-field="kwh"] circle[data-month="2026-02"]').count(),0);
  assert.equal(await page.locator('svg[data-field="kwh"] .history-chart-missing').count(),1);
  assert.match(await page.locator('svg[data-field="eur"] circle[data-month="2026-03"] title').textContent(),/2 CUPS con registros/);
  assert.equal(await page.locator('#historyCostChart circle').count(),2);
  const path=await page.locator('svg[data-field="kwh"] path').getAttribute('d');assert.equal((path.match(/M /g)||[]).length,2);
  await page.locator('.history-coverage summary').click();
  assert.match(await page.locator('[data-coverage-month="2026-02"]').innerText(),/0 de 3/);
  assert.match(await page.locator('[data-coverage-month="2026-02"]').innerText(),/\u2014/);
  assert.match(await page.locator('[data-coverage-month="2026-01"]').innerText(),/0,00 kWh/);
  assert.match(await page.locator('[data-coverage-month="2026-03"]').innerText(),/345\.688,25/);
  for (const width of [1720,1440,1100,700,390]) {
   await page.setViewportSize({width,height:1100});
   const clipped=await page.locator('.history-grid svg').evaluateAll(svgs=>svgs.flatMap(svg=>{const v=svg.viewBox.baseVal;return [...svg.querySelectorAll('text')].filter(el=>{const b=el.getBBox();return b.x < -.5 || b.x+b.width>v.width+.5 || b.y<-.5 || b.y+b.height>v.height+.5;}).map(el=>el.textContent);}));
   assert.deepEqual(clipped,[],'SVG labels must fit at '+width+'px');
  }
  await page.setViewportSize({width:1720,height:1100});fs.mkdirSync('test-output',{recursive:true});await page.screenshot({path:'test-output/history-coverage.png',fullPage:true});
  await page.selectOption('#historySupply','a');await page.waitForFunction(()=>document.querySelectorAll('.history-table tbody tr').length===2);
  assert.match(await page.locator('.history-coverage').innerText(),/de 1/);
  await page.evaluate(()=>{const f=document.querySelector('#historyFrom'),t=document.querySelector('#historyTo');f.value='2026-03-01';t.value='2026-03-31';t.dispatchEvent(new Event('change'));});
  await page.waitForFunction(()=>document.querySelectorAll('.history-table tbody tr').length===1);
  assert.equal(await page.locator('[data-coverage-month]').count(),1);assert.equal(await page.locator('svg[data-field="kwh"] circle').count(),1);
  assert.equal(await page.locator('.history-coverage-warning').count(),0);
  await page.locator('.history-detail-btn').click();assert.match(await page.locator('#historyDetailHost').innerText(),/periodos/i);
  const queries=await page.evaluate(()=>window.mockQueries);await page.evaluate(()=>{window.mutations=0;new MutationObserver(m=>window.mutations+=m.length).observe(document.querySelector('#historyContent'),{childList:true,subtree:true});});
  const other=await browser.newPage();await other.bringToFront();await page.waitForTimeout(200);await page.bringToFront();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.mutations),0);assert.equal(await page.evaluate(()=>window.mockQueries),queries);await other.close();
  await page.evaluate(()=>{const f=document.querySelector('#historyFrom'),t=document.querySelector('#historyTo');f.value='2027-01-01';t.value='2027-01-31';t.dispatchEvent(new Event('change'));});
  await page.waitForSelector('#historyCostChart .history-empty');assert.equal(await page.locator('.history-coverage').count(),0);assert.equal(await page.locator('.history-grid>.history-chart').count(),3);
  assert.deepEqual(errors,[]);console.log('PASS: missing-month gaps, real zero, exact totals, distinct CUPS coverage, full labels at five widths, scope/date filters, details, idle/tab stability and empty state. Synthetic records only.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
