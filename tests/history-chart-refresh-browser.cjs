'use strict';
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const BASE='c2a3e38daf5c064960c166941692f01691f1d7fa';
const baseline=new Map(['auth-bootstrap.js','history-ui.js','history-cost-chart.js'].map(f=>[f,execFileSync('git',['show',BASE+':'+f],{encoding:'utf8'})]));
function setup(){
 const mode=new URL(location.href).searchParams.get('case')||'large';
 const supplies=Array.from({length:52},(_,i)=>({id:'s'+i,holder_id:'holder',cups:'TEST-CUPS-'+i,supply_name:'Synthetic supply '+i}));
 const row=(id,m,kwh,eur,s='s0')=>({id,invoice_number:'TEST-'+id,supply_id:s,billing_start:'2026-'+m+'-01',billing_end:'2026-'+m+'-28',validation_status:'valid',tariff:'3.0TD',consumption_kwh:kwh,energy_cost_eur:eur,power_cost_eur:0,excess_cost_eur:0,reactive_cost_eur:0,total_eur:eur,invoice_energy_periods:[],invoice_power_periods:[],invoice_maximeters:[],invoice_adjustments:[]});
 let invoices=Array.from({length:341},(_,i)=>row('r'+i,String(1+Math.floor(i/52)).padStart(2,'0'),100+i%52,20+i%52,'s'+(i%52)));
 if(mode==='gap')invoices=[row('a','01',1,1),row('b','01',9,1),row('c','02',0,40),row('d','03',100,10)];
 if(mode==='zero')invoices=[row('a','01',0,20),row('b','02',0,30)];
 const db={clients:[{id:'client',name:'Synthetic client'}],holders:[{id:'holder',client_id:'client',legal_name:'Synthetic holder'}],supplies,invoices};
 window.mockQueries=0;
 window.ibtCurrentProfile=new URL(location.href).searchParams.has('ready')?{role:'staff'}:null;
 window.ibtSupabase={from(table){window.mockQueries++;let rows=db[table]||[];const q={select(){return q},order(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,values){rows=rows.filter(r=>values.includes(r[k]));return q},gte(k,v){rows=rows.filter(r=>r[k]>=v);return q},lte(k,v){rows=rows.filter(r=>r[k]<=v);return q},then(resolve,reject){return Promise.resolve({data:structuredClone(rows),error:null}).then(resolve,reject)}};return q;}};
 window.restoreSession=()=>{window.ibtCurrentProfile={role:'staff'};window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}}));};
}
const fixture='<!doctype html><html><head><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="history-recommendations.css"></head><body><div id="historicoView"></div><script>('+setup.toString()+')();</script><script src="history-recommendations.js"></script><script src="auth-bootstrap.js"></script></body></html>';
const allowed=new Set(['styles.css','history-recommendations.css','history-recommendations.js','auth-bootstrap.js','history-ui.js','history-cost-chart.js']);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/baseline/'),name=url.pathname.split('/').pop();
 if(!name){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);return;}
 if(['bulk-performance.js','supabase-xtra-pilot.js','xtra-history.js'].includes(name)){res.setHeader('Content-Type','text/javascript');res.end('// Not part of the UI test. No production network or PDFs.');return;}
 if(!allowed.has(name)){res.writeHead(404);res.end();return;}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
 let code=base&&baseline.has(name)?baseline.get(name):fs.readFileSync(name,'utf8');
 if(name==='history-cost-chart.js')code+='\nwindow.costSidecarLoaded=true;';res.end(code);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const root='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(6000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'/baseline/');await page.waitForFunction(()=>window.costSidecarLoaded);await page.waitForTimeout(50);
  assert.equal(await page.locator('#historyContent').count(),0);
  await page.evaluate(()=>window.restoreSession());await page.waitForSelector('.history-table');
  assert.equal(await page.locator('.history-grid>.history-chart').count(),2);console.log('REPRODUCED: delayed session restore leaves baseline with only two charts.');
  for(let i=0;i<4;i++){
   if(i===0)await page.goto(root+'/candidate/');else await page.reload();
   await page.waitForFunction(()=>window.IBTHistoryUI);await page.evaluate(()=>window.restoreSession());await page.waitForSelector('#historyCostChart svg');
   assert.equal(await page.locator('.history-grid>.history-chart').count(),3);assert.equal(await page.locator('#historyCostChart').count(),1);assert.equal(await page.locator('.history-table tbody tr').count(),341);
   assert.equal(await page.evaluate(()=>!!window.costSidecarLoaded),false);
  }
  const jan=await page.locator('#historyCostChart circle[data-month="2026-01"]').getAttribute('data-cost');assert(Math.abs(Number(jan)-2366/6526)<1e-12);
  await page.selectOption('#historySupply','s0');await page.waitForFunction(()=>document.querySelectorAll('.history-table tbody tr').length===7);assert.equal(await page.locator('#historyCostChart circle').count(),7);
  await page.fill('#historyTo','2026-01-31');await page.locator('#historyTo').dispatchEvent('change');await page.waitForFunction(()=>document.querySelectorAll('.history-table tbody tr').length===1);
  assert.equal(await page.locator('#historyCostChart circle').count(),1);assert.equal(Number(await page.locator('#historyCostChart circle').getAttribute('data-cost')),.2);
  await page.locator('.history-detail-btn').first().click();assert((await page.locator('#historyDetailHost').innerText()).includes('Energía por periodos'));assert.equal(await page.locator('#historyRecommendations').count(),1);
  await page.evaluate(()=>{window.chartMutations=0;new MutationObserver(m=>window.chartMutations+=m.length).observe(document.querySelector('#historyContent'),{childList:true,subtree:true});});
  const queries=await page.evaluate(()=>window.mockQueries);const other=await browser.newPage();await other.goto('about:blank');await other.bringToFront();await page.waitForTimeout(300);await page.bringToFront();await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>window.chartMutations),0);assert.equal(await page.evaluate(()=>window.mockQueries),queries);await other.close();
  await page.goto(root+'/candidate/?ready=1&case=gap');await page.waitForSelector('#historyCostChart svg');
  assert.equal(await page.locator('#historyCostChart circle').count(),2);assert.equal(await page.locator('.history-cost-missing').count(),1);
  assert.equal(Number(await page.locator('#historyCostChart circle[data-month="2026-01"]').getAttribute('data-cost')),.2);
  const path=await page.locator('#historyCostChart path').getAttribute('d');assert.equal((path.match(/M /g)||[]).length,2);assert(!path.includes('L '));
  await page.fill('#historyFrom','2027-01-01');await page.locator('#historyFrom').dispatchEvent('change');await page.waitForSelector('#historyCostChart .history-empty');assert.equal(await page.locator('.history-grid>.history-chart').count(),3);
  await page.goto(root+'/candidate/?ready=1&case=zero');await page.waitForSelector('#historyCostChart svg');assert.equal(await page.locator('#historyCostChart circle').count(),0);assert.equal(await page.locator('#historyCostChart path').count(),0);assert.equal(await page.locator('.history-cost-missing').count(),2);
  assert.deepEqual(errors,[]);
  console.log('PASS: reload x3, delayed and immediate sessions, 341 synthetic records, 52 supplies, three charts, weighted numeric cost, filters, detail, recommendations, no idle redraw, zero-consumption gaps and empty selections.');
  console.log('No production database, real invoices or RLS tests were used.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
