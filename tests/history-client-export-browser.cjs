'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),ExcelJS=require('exceljs'),JSZip=require('jszip');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main><div id="historicoView"></div></main>');
  await page.addScriptTag({path:require.resolve('exceljs/dist/exceljs.min.js')});await page.addScriptTag({path:require.resolve('jszip/dist/jszip.min.js')});
  await page.addScriptTag({path:'report-template-config.js'});await page.addScriptTag({path:'history-client-export.js'});await page.addScriptTag({path:'history-recommendations.js'});
  await page.evaluate(()=>{
   const clients=[{id:'c',name:'SYNTHETIC GROUP'},{id:'other',name:'OTHER CLIENT'}],holders=[{id:'h',client_id:'c',legal_name:'SYNTHETIC A'},{id:'h2',client_id:'c',legal_name:'SYNTHETIC B'},{id:'hx',client_id:'other',legal_name:'OUT OF SCOPE'}];
   const supplies=[{id:'s',holder_id:'h',cups:'TEST-CUPS-001',supply_name:'Test Site 1',city:'Test City',current_tariff:'3.0TD',current_contract_number:'CURRENT-ONLY'},{id:'s2',holder_id:'h2',cups:'TEST-CUPS-002',supply_name:'Test Site 2'},{id:'sx',holder_id:'hx',cups:'FOREIGN-CUPS',supply_name:'Foreign Site'}];
   const row=(id,supply_id,start,end,kwh,total)=>({id,invoice_number:id,supply_id,billing_start:start,billing_end:end,validation_status:'valid',tariff:'2.0TD',retailer:'TEST RETAILER',distributor:'TEST DISTRIBUTOR',consumption_kwh:kwh,energy_cost_eur:kwh*.1,power_cost_eur:0,excess_cost_eur:0,reactive_cost_eur:0,compensation_eur:0,social_bonus_eur:0,meter_rental_eur:0,distributor_charges_eur:0,electricity_tax_eur:0,vat_eur:0,igic_eur:0,other_cost_eur:total-kwh*.1,total_eur:total,invoice_energy_periods:[{period:1,consumption_kwh:kwh,energy_cost_eur:kwh*.1,unit_price_eur_kwh:.1}],invoice_power_periods:[{period:1,contracted_kw:5,billed_power_eur:0,unit_price_eur_kw_day:0}],invoice_maximeters:[],invoice_adjustments:[]});
   const invoices=[row('A-JAN','s','2026-01-01','2026-01-31',100,20),row('A-FEB','s','2026-02-01','2026-02-28',300,90),row('A-NEXT-YEAR','s','2027-01-01','2027-01-31',50,10),row('B-JAN','s2','2026-01-01','2026-01-31',20,8),row('FOREIGN','sx','2026-01-01','2026-01-31',999,999)];
   window.testDB={clients,holders,supplies,invoices};window.ibtCurrentProfile={id:'synthetic-user',role:'admin'};window.queryCount=0;window.queryDelay=0;window.failNextInvoices=false;
   window.ibtSupabase={from(table){window.queryCount++;let rows=window.testDB[table]||[];const q={select(){return q},order(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q},gte(k,v){rows=rows.filter(r=>r[k]>=v);return q},lte(k,v){rows=rows.filter(r=>r[k]<=v);return q},then(resolve,reject){const fail=table==='invoices'&&window.failNextInvoices;if(fail)window.failNextInvoices=false;return new Promise(r=>setTimeout(()=>r({data:structuredClone(rows),error:fail?new Error('Synthetic query failure'):null}),window.queryDelay)).then(resolve,reject);}};return q;}};
   window.EnergyMaster={find(){throw Error('Historical reports must not use local master!');}};
  });
  await page.addScriptTag({path:'history-ui.js'});await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}})));
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#historyExportClient')?.disabled);
  await ready();assert.equal(await page.locator('.history-table tbody tr').count(),4);assert.equal(await page.locator('.history-chart').count(),3);
  await page.selectOption('#historyHolder','h');await ready();await page.selectOption('#historySupply','s');await ready();
  const downloadOne=async()=>{const event=page.waitForEvent('download');await page.click('#historyExportClient');const d=await event;const path=await d.path();return {name:d.suggestedFilename(),buffer:fs.readFileSync(path)};};
  const queries=await page.evaluate(()=>window.queryCount),file=await downloadOne();assert(file.name.endsWith('.xlsx'));assert(file.name.includes('2027-01-31'));
  assert.equal(await page.evaluate(()=>window.queryCount),queries,'Export must not query or alter Supabase');
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(file.buffer);
  assert.deepEqual(wb.worksheets.map(w=>w.name),['SUMINISTROS','CUPS 1','RESUMEN EMPRESA','PERIODOS','DETALLE P1-P6']);
  const periods=wb.getWorksheet('PERIODOS');assert.equal(periods.rowCount,7);assert.equal(periods.getCell('U5').value,20);assert.equal(periods.getCell('U6').value,90);assert.equal(periods.getCell('U7').value,10);assert.equal(periods.getCell('W6').result,.3);
  const s=wb.getWorksheet('CUPS 1');assert.equal(s.getCell('A5').value,'ENERO 2026');assert.equal(s.getCell('A17').value,'ENERO 2027');assert.equal(s.getCell('C18').result,120);assert.match(s.getCell('B5').formula,/SUMIFS/);assert.equal(s.getCell('B7').value,null,'Missing March remains blank');assert.equal(s.getImages().length,3);assert.equal(wb.getWorksheet('RESUMEN EMPRESA').getImages().length,3);
  const anchors=s.getImages().map(i=>i.range.tl.nativeRow);assert(anchors[0]>18&&anchors[1]-anchors[0]===17&&anchors[2]-anchors[1]===17);
  assert.equal(wb.getWorksheet('SUMINISTROS').getCell('G5').value,'2.0TD','Use observed tariff, not future/current master tariff');
  const zipXml=await JSZip.loadAsync(file.buffer),strings=await zipXml.file('xl/sharedStrings.xml').async('string');assert(!strings.includes('FOREIGN'));assert(!strings.includes('TEST-CUPS-002'));
  fs.mkdirSync('test-output',{recursive:true});fs.writeFileSync('test-output/history-export-synthetic.xlsx',file.buffer);
  await page.fill('#historyFrom','2026-01-15');await page.locator('#historyFrom').dispatchEvent('change');await ready();await page.fill('#historyTo','2026-01-20');await page.locator('#historyTo').dispatchEvent('change');await ready();
  const partial=await downloadOne(),pwb=new ExcelJS.Workbook();await pwb.xlsx.load(partial.buffer);assert.equal(pwb.getWorksheet('PERIODOS').rowCount,5);assert.equal(pwb.getWorksheet('PERIODOS').getCell('U5').value,20);assert.match(pwb.subject,/sin prorrateo/);
  await page.fill('#historyFrom','');await page.locator('#historyFrom').dispatchEvent('change');await ready();await page.fill('#historyTo','');await page.locator('#historyTo').dispatchEvent('change');await ready();
  await page.evaluate(()=>{window.queryDelay=100;const from=document.querySelector('#historyFrom'),to=document.querySelector('#historyTo');from.value='2026-02-01';from.dispatchEvent(new Event('change'));to.value='2026-02-28';to.dispatchEvent(new Event('change'));});
  assert(await page.locator('#historyExportClient').isDisabled());await ready();assert.equal(await page.locator('.history-table tbody tr').count(),1);assert.match(await page.locator('.history-table tbody').innerText(),/01\/02\/2026/);
  const feb=await downloadOne(),fwb=new ExcelJS.Workbook();await fwb.xlsx.load(feb.buffer);assert.equal(fwb.getWorksheet('PERIODOS').getCell('U5').value,90);
  await page.fill('#historyFrom','2028-01-01');await page.locator('#historyFrom').dispatchEvent('change');await page.waitForTimeout(350);assert(await page.locator('#historyExportClient').isDisabled());
  await page.evaluate(()=>{window.queryDelay=0;window.failNextInvoices=true;});await page.fill('#historyFrom','');await page.locator('#historyFrom').dispatchEvent('change');await page.waitForSelector('.history-error');assert(await page.locator('#historyExportClient').isDisabled());
  await page.fill('#historyTo','');await page.locator('#historyTo').dispatchEvent('change');await ready();await page.selectOption('#historyHolder','');await ready();
  const groupDownload=await downloadOne();assert(groupDownload.name.endsWith('.zip'));const zipped=await JSZip.loadAsync(groupDownload.buffer);const files=Object.keys(zipped.files).filter(n=>n.endsWith('.xlsx'));assert.equal(files.length,2);
  for(const n of files){const book=new ExcelJS.Workbook();await book.xlsx.load(await zipped.file(n).async('nodebuffer'));const w=book.getWorksheet('PERIODOS');assert.equal(new Set(w.getRows(5,w.rowCount-4).map(r=>r.getCell(2).value)).size,1);}
  await page.evaluate(()=>{window.testDB.clients=window.testDB.clients.filter(c=>c.id==='c');window.ibtCurrentProfile={id:'synthetic-client',role:'client'};window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}}));});await ready();assert.equal(await page.locator('#historyClient').count(),0);
  await page.locator('.history-detail-btn').first().click();assert.match(await page.locator('#historyDetailHost').innerText(),/periodos/i);assert.equal(await page.locator('.history-chart').count(),3);
  await page.screenshot({path:'test-output/history-export-controls.png',fullPage:false});
  const collision=await page.evaluate(async()=>{const db=window.testDB;const result=[];await window.IBTHistoryClientExport.exportSelection({client:db.clients[0],holders:db.holders.map(h=>({...h,legal_name:'Same/name'})),supplies:db.supplies,records:db.invoices},{save:async(blob,name)=>{result.push(name,[...new Uint8Array(await blob.arrayBuffer())])}});return result;});assert.equal(Object.keys((await JSZip.loadAsync(Buffer.from(collision[1]))).files).filter(n=>n.endsWith('.xlsx')).length,2);
  assert.deepEqual(errors,[]);console.log('PASS: real XLSX/ZIP generation, cached formulas, images below tables, years, all four filters, query races, failed/empty states, per-holder isolation, scoped client access, preserved charts/detail, no PDF or browser-master access. Synthetic data only; production RLS not simulated.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
