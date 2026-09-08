'use strict';
// Maintenance only: executed in the verification branch, never in the app.
const fs = require('node:fs');
const assert = require('node:assert/strict');
function edit(file, fn) { const old = fs.readFileSync(file, 'utf8'); const next = fn(old); assert.notEqual(next, old, 'No change: ' + file); fs.writeFileSync(file, next); }
function replace(s, from, to) { assert.equal(s.split(from).length, 2, 'Expected one target: ' + from.slice(0, 100)); return s.replace(from, to); }
function block(s, start, end, next) { const a = s.indexOf(start), b = s.indexOf(end, a + start.length); assert(a >= 0 && b > a, 'Missing block: ' + start); return s.slice(0, a) + next + '\n' + s.slice(b); }

edit('app.js', s => block(s, 'async function pdfData(file){', 'const find=', `async function pdfData(file){
 const task=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});
 const pages=[],rawPages=[];
 try{
  const pdf=await task.promise;
  for(let i=1;i<=pdf.numPages;i++){
   const p=await pdf.getPage(i),c=await p.getTextContent();
   rawPages.push(c.items);pages.push(lines(c.items));
  }
  return{pages,rawPages,text:pages.flat().join('\\n')};
 }finally{
  // Close the document AND its owned worker, including failed reads.
  await task.destroy();
 }
}`));

edit('xtra-history.js', s => {
 s=block(s,'async function readPdf(file){','function extractFenie',`async function readPdf(file){
  const task=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});
  const pages=[],raw=[];
  try{
    const pdf=await task.promise;
    for(let i=1;i<=Math.min(pdf.numPages,3);i++){
      const p=await pdf.getPage(i),c=await p.getTextContent();
      raw.push(c.items);pages.push(lines(c.items));
    }
    return {pages,raw,text:pages.flat().join('\\n')};
  }finally{
    await task.destroy();
  }
}

`);
 s=block(s,"function historyStatus(text,type='ok'){",'async function persistOne',`function historyStatus(text,type='ok'){
  let el=$('#historySyncStatus');
  if(!el){
    const host=$('#dropZone');
    if(!host)return;
    el=document.createElement('div');el.id='historySyncStatus';
    el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    el.style.cssText='grid-column:1/-1;padding:8px 12px;margin-top:8px';
    host.appendChild(el);
  }
  el.textContent=text;
  el.className=\`status \${type==='ok'?'ok':'review'}\`;
}

`);
 const a=s.indexOf('function enqueue(files){'), b=s.indexOf("const input=$('#fileInput')",a);
 assert(a>=0 && b>a);
 s=s.slice(0,a)+`function enqueue(files){
 const list=[...files].filter(f=>f.name?.toLowerCase().endsWith('.pdf'));
 if(!list.length)return;
 queue=queue.then(async()=>{
  let saved=0,skipped=0,failed=0,done=0;
  historyStatus(\`Histórico: 0/\${list.length} · validación y guardado en curso\`,'review');
  for(const file of list){
   try{const r=await persistOne(file);if(r?.ok)saved++;else skipped++;}
   catch(e){failed++;console.warn('Histórico XTRA:',file.name,e);}
   done++;
   historyStatus(\`Histórico: \${done}/\${list.length} · \${saved} guardados · \${skipped} omitidos · \${failed} errores\`,'review');
   // Yield to input/paint without depending on an active browser tab.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  await renderSummary();
  historyStatus(\`Histórico terminado: \${done}/\${list.length} · \${saved} guardados · \${skipped} omitidos por validación · \${failed} errores\`,failed||skipped?'review':'ok');
  window.dispatchEvent(new CustomEvent('xtra-history-updated',{detail:{saved,skipped,failed}}));
 }).catch(e=>{console.warn('Cola histórico XTRA',e);historyStatus('No se ha completado el guardado del histórico. Revisa la conexión.','review');});
}

`+s.slice(b);
 return s;
});

edit('supply-enricher-v2.js', s => block(s,'async function inspect(file) {','async function inspectFiles',`async function inspect(file) {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const allLines = [];
  try {
    const pdf = await task.promise;
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      allLines.push(...linesFromItems(content.items));
    }
  } finally {
    await task.destroy();
  }
  const data = parseSupply(allLines);
  if (!data.cups) return { read: false, changed: false, data };
  const master = await waitForMaster();
  const result = master.learnInvoice(data);
  return { read: true, changed: Boolean(result?.enriched), result, data };
}

`));

edit('history-ui.js', s => {
 s=block(s,'  function detectedEvents(records) {','  function rowDetail(r) {',`  function comparablePowers(record) {
    const map=new Map();
    for(const x of record.invoice_power_periods || []) {
      if(x.contracted_kw==null || String(x.contracted_kw).trim()==='')continue;
      const value=Number(x.contracted_kw), period=Number(x.period);
      if(!Number.isFinite(value)||value<0||!Number.isInteger(period)||period<1||period>6)continue;
      if(map.has(period) && map.get(period)!==value)map.set(period,null);
      else if(!map.has(period))map.set(period,value);
    }
    return map;
  }

  function detectedEvents(records) {
    const bySupply=new Map(),events=[];
    for(const r of records){
      if(!bySupply.has(r.supply_id))bySupply.set(r.supply_id,[]);
      bySupply.get(r.supply_id).push(r);
    }
    for(const [supplyId,list] of bySupply){
      list.sort((a,b)=>String(a.billing_start).localeCompare(String(b.billing_start)));
      for(let i=1;i<list.length;i++){
        const prev=list[i-1],cur=list[i];
        const before=String(prev.tariff||'').trim(),after=String(cur.tariff||'').trim();
        if(before&&after&&before!=='—'&&after!=='—'&&before!==after)
          events.push({date:cur.billing_start,type:'Cambio de tarifa observado',supplyId,prev,cur,changes:[{label:'Tarifa',before,after}]});
        const p0=comparablePowers(prev),p1=comparablePowers(cur),changes=[];
        for(const [period,value] of p1){
          const old=p0.get(period);
          if(old==null||value==null||Math.abs(value-old)<0.0005)continue;
          changes.push({label:'P'+period,before:old,after:value,delta:value-old});
        }
        changes.sort((a,b)=>a.label.localeCompare(b.label));
        if(changes.length)events.push({date:cur.billing_start,type:'Cambio de potencia observado',supplyId,prev,cur,changes});
      }
    }
    return events.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  }

  function renderContractEvent(e) {
    const s=supplyById(e.supplyId),h=holderForSupply(s);
    const name=s?.supply_name||s?.address||'Suministro';
    const rows=e.changes.map(c=>{
      const power=typeof c.delta==='number';
      const before=power?qty(c.before,3)+' kW':c.before;
      const after=power?qty(c.after,3)+' kW':c.after;
      const difference=power?(c.delta>0?'+':'')+qty(c.delta,3)+' kW':'Cambio de tarifa';
      return '<tr><td>'+esc(c.label)+'</td><td>'+esc(before)+'</td><td><strong>'+esc(after)+'</strong></td><td>'+esc(difference)+'</td></tr>';
    }).join('');
    const source=r=>esc(r.invoice_number||'Sin referencia')+' · '+dateES(r.billing_start)+' – '+dateES(r.billing_end);
    return '<div class="history-event"><div><small>Inicio del periodo posterior</small><br><strong>'+dateES(e.date)+'</strong></div><b>'+esc(e.type)+'</b><div><strong>'+esc(name)+'</strong><p class="history-scope">'+esc([h?.legal_name,s?.cups].filter(Boolean).join(' · '))+'</p><table class="history-mini-table"><thead><tr><th>Concepto</th><th>Antes</th><th>Después</th><th>Diferencia</th></tr></thead><tbody>'+rows+'</tbody></table><p class="history-scope">Registro anterior: '+source(e.prev)+'<br>Registro posterior: '+source(e.cur)+'</p></div></div>';
  }

`);
 s=replace(s,'<p class="eyebrow">Cambios detectados</p><h2 style="margin:0">Evolución contractual</h2>','<p class="eyebrow">Hechos del histórico · no recomendaciones</p><h2 style="margin:0">Cambios observados en el suministro</h2>');
 const start=s.indexOf('        <div class="history-events">');
 const end=s.indexOf('\n',start);
 assert(start>=0&&end>start);
 s=s.slice(0,start)+`        <p class="history-scope">Comparamos los datos de dos periodos guardados. Estos cambios no son recomendaciones de ahorro. La fecha corresponde al inicio del periodo posterior; no confirma el día exacto del cambio contractual.</p>
        <div class="history-events">\${events.length ? events.map(renderContractEvent).join('') : '<div class="history-empty">No se observan cambios comparables en esta selección. Los datos ausentes no se interpretan como un cambio.</div>'}</div>`+s.slice(end);
 return s;
});

edit('auth-bootstrap.js', s => {
 s=replace(s,"xtra-history.js?v=20260908-2","xtra-history.js?v=20260908-4");
 return replace(s,"history-ui.js?v=20260908-1","history-ui.js?v=20260908-4");
});
edit('index.html', s => {
 s=replace(s,'app.js?v=20260907-7','app.js?v=20260908-8');
 s=replace(s,'supply-enricher-v2.js?v=20260901-1','supply-enricher-v2.js?v=20260908-2');
 return replace(s,'auth-bootstrap.js?v=20260908-2','auth-bootstrap.js?v=20260908-4');
});
console.log('Prepared targeted changes. Extraction rules and authentication were not edited.');
