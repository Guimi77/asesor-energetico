'use strict';
// All PDFs are synthetic, generated in memory. No production database is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const {PDFDocument,StandardFonts}=require('pdf-lib');
const BASE='1668d5ea2f8059d17e08502d83c6395db361c4bf';
const specs=[['main','app.js','pdfData','const find='],['history','xtra-history.js','readPdf','function extractFenie'],['master','supply-enricher-v2.js','inspect','async function inspectFiles']];
const original=file=>execFileSync('git',['show',BASE+':'+file],{encoding:'utf8'});
function readerCode(baseline){return specs.map(([key,file,name,end])=>{
 const all=baseline?original(file):fs.readFileSync(file,'utf8');
 const pos=all.indexOf(end);assert(pos>0);
 const prefix=all.slice(0,pos).replace(/^import[^\n]*\n/gm,'').replaceAll('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs','/pdfjs/pdf.worker.mjs');
 return key+':(()=>{'+prefix+'\nreturn '+name+';})()';
}).join(',');}
function html(baseline){return '<!doctype html><html><body><button id="probe">Probar respuesta</button><span id="heartbeat"></span><script type="module">import * as pdfjsLib from "/pdfjs/pdf.mjs";window.EnergyMaster={learnInvoice:()=>({ok:true,enriched:true})};window.ticks=0;window.clicks=0;document.querySelector("#probe").onclick=()=>window.clicks++;setInterval(()=>{window.ticks++;document.querySelector("#heartbeat").textContent=window.ticks;},25);window.readers={'+readerCode(baseline)+'};window.ready=true;</script></body></html>';}
(async()=>{
 const pdf=await PDFDocument.create();const page=pdf.addPage([595,842]);const font=await pdf.embedFont(StandardFonts.Helvetica);
 page.drawText('Razon Social: CLIENTE SINTETICO',{x:30,y:780,size:12,font});
 page.drawText('CUPS: ES0000000000000000TEST',{x:30,y:750,size:12,font});
 page.drawText('Documento sintetico para verificar liberacion de recursos',{x:30,y:720,size:10,font});
 pdf.addPage([595,842]).drawText('Pagina de prueba adicional',{x:30,y:780,size:12,font});
 const bytes=Array.from(await pdf.save());
 const dist=path.dirname(require.resolve('pdfjs-dist/package.json'));
 const server=http.createServer((req,res)=>{
  if(req.url==='/pdfjs/pdf.mjs'||req.url==='/pdfjs/pdf.worker.mjs'){
   res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'max-age=3600'});
   res.end(fs.readFileSync(path.join(dist,'build',path.basename(req.url))));return;
  }
  res.writeHead(200,{'Content-Type':'text/html'});res.end(html(req.url==='/baseline'));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  let context=await browser.newContext();let tab=await context.newPage();
  await tab.goto(origin+'/baseline');await tab.waitForFunction(()=>window.ready);
  await tab.evaluate(async bytes=>{const file=new File([new Uint8Array(bytes)],'synthetic.pdf',{type:'application/pdf'});for(let i=0;i<10;i++)for(const reader of Object.values(window.readers))await reader(file);},bytes);
  const retainedBefore=tab.workers().length;
  assert(retainedBefore>=30,'Baseline should retain document workers: '+retainedBefore);
  console.log('BASELINE: 30 reads; retained workers='+retainedBefore);
  await context.close();
  context=await browser.newContext();tab=await context.newPage();
  const pageErrors=[];tab.on('pageerror',e=>pageErrors.push(e.message));
  await tab.goto(origin+'/candidate');await tab.waitForFunction(()=>window.ready);
  let active=0,peak=0,created=0;
  tab.on('worker',worker=>{active++;created++;peak=Math.max(peak,active);worker.on('close',()=>active--);});
  const summary=await tab.evaluate(async bytes=>{
   const file=new File([new Uint8Array(bytes)],'synthetic.pdf',{type:'application/pdf'});let reads=0;
   for(let i=0;i<341;i++){
    const a=await window.readers.main(file);reads++;
    const b=await window.readers.history(file);reads++;
    const c=await window.readers.master(file);reads++;
    if(a.text!==b.text||a.pages.length!==2||b.pages.length!==2||!c.read)throw Error('Reader output changed');
    if(i%10===0)await new Promise(r=>setTimeout(r,0));
   }
   const broken=new File([new Uint8Array([1,2,3])],'invalid.pdf');let failed=0;
   for(const reader of Object.values(window.readers)){try{await reader(broken);}catch{failed++;}}
   return {reads,failed,ticks:window.ticks};
  },bytes);
  await tab.waitForTimeout(200);
  assert.equal(summary.reads,1023);assert.equal(summary.failed,3);assert(summary.ticks>10);
  assert.equal(tab.workers().length,0,'Workers must be gone after success and failure');
  assert.equal(active,0);assert(peak<=2,'Worker lifetime overlap must remain bounded: '+peak);
  await tab.click('#probe');await tab.waitForTimeout(2500);await tab.click('#probe');
  assert.equal(await tab.evaluate(()=>window.clicks),2);
  assert.deepEqual(pageErrors,[]);
  console.log('CANDIDATE: '+JSON.stringify({...summary,created,peak,retainedWorkers:tab.workers().length,responsiveAfterCompletion:true}));
  console.log('SYNTHETIC RESOURCE TEST ONLY: not the 341 private customer invoices.');
  await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
