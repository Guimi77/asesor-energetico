'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER ERROR',msg.text())});
 await page.setContent('<div id="historicoView"></div>');
 await page.evaluate(()=>{
  const supplies=Array.from({length:52},(_,i)=>({id:'s'+i,holder_id:'holder',cups:'TEST-CUPS-'+String(i).padStart(4,'0'),supply_name:'Local sintético '+i,current_tariff:'3.0TD'}));
  const invoices=Array.from({length:341},(_,i)=>{const month=String(1+Math.floor(i/52)).padStart(2,'0');return {id:'r'+i,invoice_number:'TEST-'+i,supply_id:'s'+(i%52),billing_start:'2026-'+month+'-01',billing_end:'2026-'+month+'-28',validation_status:'valid',tariff:'3.0TD',consumption_kwh:100,energy_cost_eur:20,power_cost_eur:10,excess_cost_eur:5,reactive_cost_eur:2,total_eur:40,invoice_energy_periods:[],invoice_power_periods:[],invoice_maximeters:[],invoice_adjustments:[]};});
  const db={clients:[{id:'client',name:'Cliente sintético'}],holders:[{id:'holder',client_id:'client',legal_name:'Titular sintético'}],supplies,invoices};
  window.ibtCurrentProfile={role:'staff'};
  window.ibtSupabase={from(table){let rows=db[table]||[];const q={select(){return q},order(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,values){rows=rows.filter(r=>values.includes(r[k]));return q},gte(k,v){rows=rows.filter(r=>r[k]>=v);return q},lte(k,v){rows=rows.filter(r=>r[k]<=v);return q},then(resolve,reject){return Promise.resolve({data:structuredClone(rows),error:null}).then(resolve,reject)}};return q;}};
 });
 await page.addStyleTag({path:'history-recommendations.css'});
 await page.addScriptTag({path:'history-recommendations.js'});
 assert.equal(await page.evaluate(()=>typeof window.IBTHistoryRecommendations?.render),'function');
 await page.evaluate(()=>{const original=window.IBTHistoryRecommendations;window.recRenderCount=0;window.IBTHistoryRecommendations={...original,render(options){window.recRenderCount++;return original.render(options)}}});
 await page.addScriptTag({path:'history-ui.js'});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}})));
 try{await page.waitForSelector('#historyRecommendations');}catch(e){console.log('SYNTHETIC DOM DIAGNOSTICS',await page.evaluate(()=>({content:document.body.textContent.slice(-2000),calls:window.recRenderCount,api:typeof window.IBTHistoryUI,html:document.querySelector('#historyRecommendations')?.outerHTML.slice(0,500)})));throw e;}
 assert.equal(await page.locator('.history-table tbody tr').count(),341);
 assert.equal(await page.locator('.history-rec').count(),104);
 await page.locator('.history-rec>summary').first().click();
 assert.equal(await page.locator('.history-rec[open]').count(),1);
 assert.match(await page.locator('.history-rec[open]').innerText(),/Qué proponemos revisar/);
 await page.selectOption('#historySupply','s0');
 await page.waitForFunction(()=>document.querySelectorAll('.history-table tbody tr').length===7);
 assert.equal(await page.locator('.history-rec').count(),2);
 assert(!(await page.locator('#historyRecommendations').innerText()).includes('TEST-CUPS-0001'));
 await page.fill('#historyTo','2026-01-31');await page.locator('#historyTo').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelectorAll('.history-table tbody tr').length===1);
 assert.match(await page.locator('#historyRecommendations').innerText(),/5,00 € registrados/);
 await page.locator('.history-detail-btn').first().click();assert.match(await page.locator('#historyDetailHost').innerText(),/Energía por periodos/);
 const renderCount=await page.evaluate(()=>window.recRenderCount);
 await page.waitForTimeout(1500);
 assert.equal(await page.evaluate(()=>window.recRenderCount),renderCount,'No repeated renders while idle');
 await page.evaluate(()=>{window.IBTHistoryRecommendations.render=()=>{throw Error('Simulated recommendation failure')};window.IBTHistoryUI.reload();});
 await page.waitForSelector('#historyContent .history-table');
 await page.waitForFunction(()=>document.querySelector('#historyContent').textContent.includes('El histórico sigue disponible'));
 assert.equal(await page.locator('.history-table tbody tr').count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS: 341 synthetic historical records / 52 supplies; 104 scoped review prompts, filters, sources, expandable cards, preserved detail, no idle redraws; isolated failure cannot break history.');
 console.log('Synthetic UI test only: no real invoices, production database or RLS simulation claims.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
