import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const PARSER_VERSION='2026.09.25.1';window.IBT_PARSER_VERSION=PARSER_VERSION;
const PDFJS_DIAGNOSTIC_PAGES=[];
function clonePdfJsItem(item,index){
 const t=Array.isArray(item?.transform)?item.transform.slice(0,6):[];
 return{index,text:String(item?.str??''),x:Number(t[4]??0),y:Number(t[5]??0),width:Number(item?.width??0),height:Number(item?.height??0),hasEOL:!!item?.hasEOL,dir:String(item?.dir??''),fontName:String(item?.fontName??''),transform:t.map(v=>Number(v??0))};
}
function clearPdfJsDiagnostic(fileName=''){
 if(!fileName){PDFJS_DIAGNOSTIC_PAGES.length=0;return}
 for(let i=PDFJS_DIAGNOSTIC_PAGES.length-1;i>=0;i--)if(PDFJS_DIAGNOSTIC_PAGES[i].file===fileName)PDFJS_DIAGNOSTIC_PAGES.splice(i,1);
}
function capturePdfJsPage(file,pageNumber,items,viewport){
 PDFJS_DIAGNOSTIC_PAGES.push({file:file?.name||'',page:pageNumber,pageWidth:Number(viewport?.width??0),pageHeight:Number(viewport?.height??0),invoiceNumber:'',sourceFormat:'',parserVersion:PARSER_VERSION,items:(items||[]).map(clonePdfJsItem),reconstructedLines:rawLines(items||[])});
}
function finalizePdfJsDiagnostic(fileName,row){
 for(const page of PDFJS_DIAGNOSTIC_PAGES)if(page.file===fileName){page.invoiceNumber=String(row?.invoiceNumber||'');page.sourceFormat=String(row?.sourceFormat||'');page.parserVersion=String(row?.parserVersion||PARSER_VERSION);}
}
window.IBTParserDiagnostics={
 clear:()=>clearPdfJsDiagnostic(),
 pages:()=>PDFJS_DIAGNOSTIC_PAGES.map(p=>({...p,items:p.items.map(i=>({...i,transform:[...i.transform]})),reconstructedLines:[...p.reconstructedLines]})),
 items:()=>PDFJS_DIAGNOSTIC_PAGES.flatMap(p=>p.items.map(i=>({file:p.file,invoiceNumber:p.invoiceNumber,sourceFormat:p.sourceFormat,parserVersion:p.parserVersion,page:p.page,pageWidth:p.pageWidth,pageHeight:p.pageHeight,...i}))),
 lines:()=>PDFJS_DIAGNOSTIC_PAGES.flatMap(p=>p.reconstructedLines.map((text,index)=>({file:p.file,invoiceNumber:p.invoiceNumber,sourceFormat:p.sourceFormat,parserVersion:p.parserVersion,page:p.page,lineIndex:index,text})))
};
const $=s=>document.querySelector(s);let rows=[];const money=n=>(Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}),round2=n=>Math.round((Number(n)||0)*100)/100,cleanKey=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const num=s=>{if(s==null)return 0;let x=String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(x)||0},euros=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])),lastEuro=s=>{const a=euros(s);return a.length?a.at(-1):0},readingStatusLabel=s=>({actual:'Real confirmada',estimated:'Estimada',no_distributor_reading:'Sin lectura distribuidora',unknown:'No determinada'})[s]||'No determinada';
const semanticPdfText=value=>window.IBTPdfTextNormalizer?.repair?.(value)??String(value??'').replace(/\s+/g,' ').trim();
const normalizePdfData=data=>window.IBTPdfTextNormalizer?.normalizeData?.(data)??data;
function rawLines(items){const p=items.filter(i=>i.str?.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:i.transform[5]})).sort((a,b)=>b.y-a.y||a.x-b.x),g=[];for(const q of p){let z=g.find(v=>Math.abs(v.y-q.y)<=2.2);if(!z)g.push(z={y:q.y,a:[]});z.a.push(q)}return g.sort((a,b)=>b.y-a.y).map(z=>z.a.sort((a,b)=>a.x-b.x).map(v=>v.s).join(' ').replace(/\s+/g,' ').trim())}
function lines(items){return rawLines(items).map(semanticPdfText)}
async function pdfData(file){
 clearPdfJsDiagnostic(file?.name||'');
 const task=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});
 const pages=[],rawPages=[];
 try{
  const pdf=await task.promise;
  for(let i=1;i<=pdf.numPages;i++){
   const p=await pdf.getPage(i),c=await p.getTextContent(),viewport=p.getViewport({scale:1});
   capturePdfJsPage(file,i,c.items,viewport);
   rawPages.push(c.items);pages.push(lines(c.items));
  }
  return normalizePdfData({pages,rawPages,text:pages.flat().join('\n')});
 }finally{
  // Close the document AND its owned worker, including failed reads.
  await task.destroy();
 }
}
const find=(a,re)=>a.find(x=>re.test(x))||'';
function section(a,start,ends){const i=a.findIndex(x=>start.test(x));if(i<0)return[];let j=a.length;for(let k=i+1;k<a.length;k++)if(ends.some(r=>r.test(a[k]))){j=k;break}return a.slice(i,j)}
function prow(a,p){return a.find(x=>new RegExp(`^\\s*P${p}:?\\b`,'i').test(x))||''}
function sumPeriods(a){let n=0;for(let p=1;p<=6;p++){const l=prow(a,p);if(l)n+=lastEuro(l)}return round2(n)}
function sectionTotal(a){let n=0;for(let p=1;p<=6;p++){const ev=euros(prow(a,p));if(!ev.length)continue;n+=p===1&&ev.length>=2?ev.at(-2):ev.at(-1)}return round2(n)}
function powerProw(a,p){return a.find(x=>new RegExp(`(?:^|\\s)P${p}:?\\b`,'i').test(x))||''}
// Parse billed power expressions, never a unit rate or the neighbouring subtotal.
// Pn labels may sit on another baseline in the PDF, so they are not row anchors.
function powerSectionDetails(a,expectedPeriods=0){
 const text=(a||[]).join('\n');
 const expression=/([\d.,]+)\s*kW\s*[x×]\s*(\d+)\s*d[ií]as?\s*=\s*(-?[\d.]+,\d{2})\s*€(?!\s*\/)/gi;
 const entries=[...text.matchAll(expression)].map(m=>({contractedKw:num(m[1]),days:Number(m[2]),amount:num(m[3])}));
 const sum=round2(entries.reduce((s,e)=>s+e.amount,0));
 // Once the individual billed expressions are removed, a standalone amount
 // can only be a printed section subtotal. Euro/kW-day prices are excluded.
 const remaining=text.replace(expression,'');
 const subtotals=[...remaining.matchAll(/(-?[\d.]+,\d{2})\s*€(?!\s*\/)/g)].map(m=>num(m[1]));
 const labels=[...text.matchAll(/\bP([1-6])\s*:/g)].map(m=>Number(m[1])),uniqueLabels=[...new Set(labels)];
 const expected=Number(expectedPeriods)||0;
 const complete=entries.length>0&&(expected?entries.length===expected:entries.length===uniqueLabels.length);
 const printedTotal=subtotals.length===1?subtotals[0]:null;
 // Each printed line and subtotal is rounded to cents independently.
 // This is a check against an explicit source amount, not a balancing entry.
 const roundingBound=(entries.length+1)*0.005+0.000001;
 const agrees=printedTotal==null||Math.abs(printedTotal-sum)<=roundingBound;
 const reliable=complete&&subtotals.length<=1&&agrees;
 return {value:reliable&&printedTotal!=null?printedTotal:sum,sum,printedTotal,entries,reliable,
  message:!complete?'Potencia: faltan importes individuales':subtotals.length>1?'Potencia: subtotal ambiguo':!agrees?'Potencia: subtotal y periodos no coinciden':''};
}
function powerSectionTotal(a){return powerSectionDetails(a).value;}
function maximeters(items){const out={};if(!items?.length)return out;const anchor=items.find(i=>/Max[ií]metro\s*\(kW\)/i.test(String(i.str||'')));if(!anchor)return out;const ay=anchor.transform?.[5],ax=anchor.transform?.[4]??0;if(!Number.isFinite(ay))return out;let vals=items.filter(i=>i!==anchor&&Math.abs((i.transform?.[5]??9999)-ay)<=3.2&&(i.transform?.[4]??0)>ax&&/^\s*-?[\d.]+,\d{2}\s*$/.test(String(i.str||''))).sort((a,b)=>(a.transform?.[4]??0)-(b.transform?.[4]??0)).map(i=>num(i.str));if(vals.length<2)return out;vals=vals.slice(0,6);for(let p=1;p<=vals.length;p++)out[`P${p}`]=vals[p-1];out._reliable=true;return out}
function parseFenie(d,file){
 const parser=window.IBTFenieParser;
 if(!parser?.parse)throw new Error('FENIE parser no cargado');
 return parser.parse(d,file,{parserVersion:PARSER_VERSION,readingClassifier:window.IBTReadingStatus?.classify});
}
function unsupportedFallback(file){return{unsupported:true,file:file?.name||'',invoiceNumber:'—',company:`No compatible · ${file?.name||'PDF'}`,cups:'',period:'—',tariff:'—',kwh:null,energy:null,power:null,excess:null,reactive:null,compensation:null,social:null,rental:null,integratorAdjustment:null,regularizationReactive:null,other:null,tax:null,vat:null,igic:null,distributorCharges:null,total:null,accounted:null,diff:null,balanced:false,readOk:false,readMessage:'Factura no compatible todavía',readingStatus:'unknown',readingSourceLabel:'',avg:null,opportunity:'Factura no compatible todavía. No se ha interpretado ni guardado ningún dato.',periods:{},contracted:{},maximeters:{},powerDetail:{reliable:false},sourceFormat:'unknown'}}
function parseInvoice(d,file){d=normalizePdfData(d);const uenergia=window.IBTUenergiaParser;if(uenergia?.detect?.(d))return uenergia.parse(d,file,{parserVersion:PARSER_VERSION,readingClassifier:window.IBTReadingStatus?.classify});const iberdrola=window.IBTIberdrolaParser;if(iberdrola?.detect?.(d))return iberdrola.parse(d,file,{parserVersion:PARSER_VERSION,readingClassifier:window.IBTReadingStatus?.classify});const repsol=window.IBTRepsolParser;if(repsol?.detect?.(d))return repsol.parse(d,file,{parserVersion:PARSER_VERSION,readingClassifier:window.IBTReadingStatus?.classify});const naturgy=window.IBTNaturgyParser;if(naturgy?.detect?.(d))return naturgy.parse(d,file,{parserVersion:PARSER_VERSION,readingClassifier:window.IBTReadingStatus?.classify});const fenie=window.IBTFenieParser;if(fenie?.detect?.(d))return fenie.parse(d,file,{parserVersion:PARSER_VERSION,readingClassifier:window.IBTReadingStatus?.classify});const formats=window.IBTInvoiceFormats;if(!formats?.detect){if(/Endesa\s+Energ[ií]a/i.test(d.text))return unsupportedFallback(file);return unsupportedFallback(file)}const format=formats.detect(d.text);if(format==='endesa')return formats.parseEndesa(d,file,{parserVersion:PARSER_VERSION,readingClassifier:window.IBTReadingStatus?.classify});return formats.unsupportedRow?.(file)||unsupportedFallback(file)}
async function parseInvoiceFile(file){
 const original=await pdfData(file);
 if(window.IBTUenergiaParser?.detect?.(original))return parseInvoice(original,file);if(window.IBTIberdrolaParser?.detect?.(original)||window.IBTRepsolParser?.detect?.(original)||window.IBTNaturgyParser?.detect?.(original))return parseInvoice(original,file);
 const fallback=window.IBTFenieOcrFallback;
 if(!fallback?.prepare)return parseInvoice(original,file);
 const prepared=await fallback.prepare(file,original,pdfjsLib);
 if(!prepared.attempted)return parseInvoice(original,file);
 if(prepared.error){
  const row=unsupportedFallback(file);row.readMessage='No se pudo leer la primera página escaneada de esta posible factura FENIE';row.opportunity=row.readMessage;row.ocrFallback=true;row.ocrValidated=false;return row;
 }
 const row=parseInvoice(prepared.data,file);row.ocrFallback=true;
 if(row.unsupported){row.readMessage='La primera página se ha leído por OCR, pero el formato FENIE no se ha podido validar';row.opportunity=row.readMessage;row.ocrValidated=false;return row}
 const reason=fallback.criticalReason?.(row)||'';
 if(!fallback.criticalRowOk?.(row)){
  row.readOk=false;row.readMessage=`OCR FENIE requiere revisión: ${reason||'faltan datos críticos'}`;row.ocrValidated=false;return row;
 }
 row.ocrValidated=true;return row;
}
async function process(files){for(const file of [...files]){if(!file.name.toLowerCase().endsWith('.pdf'))continue;try{const r=await parseInvoiceFile(file);finalizePdfJsDiagnostic(file.name,r);const k=cleanKey(r.invoiceNumber);if(!(k&&k!==cleanKey('Por identificar')&&rows.some(x=>cleanKey(x.invoiceNumber)===k)))rows.push(r);window.IBTInvoiceSupersession?.reconcile?.(rows)}catch(e){console.warn('Error leyendo',file.name,e)}render()}}
function activeRows(){const result=window.IBTInvoiceSupersession?.reconcile?.(rows);return result?.active||rows.filter(r=>!r?.superseded)}
function render(){
 const active=activeRows(),visible=[...rows].sort((a,b)=>Number(!!a.superseded)-Number(!!b.superseded)),b=$('#resultsBody');
 b.innerHTML=rows.length?'':'<tr class="empty"><td colspan="16">Aún no hay facturas procesadas.</td></tr>';
 for(const r of visible){
  const tr=document.createElement('tr'),superseded=!!r.superseded,possible=!!r.possibleSupersession;
  const diagnostic=superseded?`Refacturación detectada: sustituida por la factura ${r.supersededBy}. No se suma, no se exporta y no entra en histórico.`:possible?'Posible refacturación: mismo CUPS, periodo y consumo, pero no se puede determinar con seguridad cuál es posterior. Revisar antes de consolidar.':(!r.readOk&&r.readMessage?`Motivo del error: ${r.readMessage}`:r.opportunity);
  if(r.unsupported){tr.innerHTML=`<td><span class="status danger">No compatible</span></td><td>${r.company}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td class="opp">${diagnostic}</td>`}
  else{const statusClass=superseded?'review':r.readOk?'ok':'danger',statusLabel=superseded?'Sustituida':r.readOk?'Correcta':'Error';tr.innerHTML=`<td><span class="status ${statusClass}" title="${superseded?diagnostic:(r.readMessage||'')}">${statusLabel}</span></td><td>${r.company}</td><td>${r.cups||'—'}</td><td>${r.period}</td><td>${r.tariff}</td><td>${money(r.kwh)}</td><td>${money(r.energy)}</td><td>${money(r.power)}</td><td>${money(r.excess)}</td><td>${money(r.reactive)}</td><td>${money(r.other+r.compensation+r.distributorCharges)}</td><td>${money(r.tax+r.vat+r.igic)}</td><td><strong>${money(r.total)}</strong></td><td><strong>${r.total?(r.balanced?'OK':money(r.diff)+' €'):'—'}</strong></td><td>${r.avg?money(r.avg):'—'}</td><td class="opp">${diagnostic}</td>`}
  b.appendChild(tr)
 }
 $('#statInvoices').textContent=active.length;$('#statOk').textContent=active.filter(r=>r.readOk).length;$('#statReview').textContent=active.filter(r=>!r.readOk).length;$('#statKwh').textContent=money(active.reduce((s,r)=>s+(Number.isFinite(Number(r.kwh))?Number(r.kwh):0),0))+' kWh';$('#statTotal').textContent=money(active.reduce((s,r)=>s+(Number.isFinite(Number(r.total))?Number(r.total):0),0))+' €';$('#exportExcel').disabled=!active.length
}
const XL={navy:'10233F',blue:'1834B8',green:'27943B',lightGreen:'E7F5E9',orange:'F4B740',lightOrange:'FFF2D7',red:'B42318',lightRed:'FDE9E7',gray:'65758A',light:'F4F7FB',stripe:'EAF0F8',white:'FFFFFF'};const grid={top:{style:'thin',color:{rgb:'D7E0EA'}},bottom:{style:'thin',color:{rgb:'D7E0EA'}},left:{style:'thin',color:{rgb:'D7E0EA'}},right:{style:'thin',color:{rgb:'D7E0EA'}}};
function decorate(ws,title,subtitle,widths,last){ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:last}},{s:{r:1,c:0},e:{r:1,c:last}}];ws.A1={t:'s',v:title,s:{font:{bold:true,color:{rgb:XL.white},sz:18},fill:{fgColor:{rgb:XL.navy}},alignment:{vertical:'center'}}};ws.A2={t:'s',v:subtitle,s:{font:{italic:true,color:{rgb:XL.gray}},fill:{fgColor:{rgb:XL.light}}}};ws['!rows']=[{hpt:40},{hpt:22},{hpt:34}];ws['!cols']=widths.map(w=>({wch:w}));ws['!freeze']={xSplit:0,ySplit:3,topLeftCell:'A4',activePane:'bottomLeft',state:'frozen'};ws['!views']=[{showGridLines:false}];const range=XLSX.utils.decode_range(ws['!ref']);for(let c=0;c<=range.e.c;c++){const x=ws[XLSX.utils.encode_cell({r:2,c})];if(x)x.s={font:{bold:true,color:{rgb:XL.white},sz:10},fill:{fgColor:{rgb:XL.blue}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:grid}}for(let r=3;r<=range.e.r;r++)for(let c=0;c<=range.e.c;c++){const x=ws[XLSX.utils.encode_cell({r,c})];if(x)x.s={font:{color:{rgb:'1F2937'},sz:9},fill:{fgColor:{rgb:r%2?XL.white:XL.stripe}},alignment:{vertical:'center',wrapText:c===range.e.c},border:grid}}ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:2,c:0},e:{r:range.e.r,c:range.e.c}})}}
function exportExcel(){const exportRows=activeRows();const wb=XLSX.utils.book_new();wb.Props={Comments:`Parser ${PARSER_VERSION}`};const sumH=['Estado','Nº factura','Empresa','CUPS','Periodo','Tarifa','Consumo kWh','Energía €','Potencia €','Excesos €','Reactiva €','Comp. excedentes €','Otros €','Derechos distribuidora €','Imp. electricidad €','IVA €','IGIC €','Total factura €','Cuadre','Coste €/kWh','Qué revisar','Tipo lectura','Origen lectura'],sumR=exportRows.map(r=>[r.unsupported?'NO COMPATIBLE':r.readOk?'CORRECTA':'ERROR',r.invoiceNumber,r.company,r.cups,r.period,r.tariff,r.kwh,r.energy,r.power,r.excess,r.reactive,r.compensation,r.other,r.distributorCharges,r.tax,r.vat,r.igic,r.total,r.unsupported?'—':r.balanced?'OK':'REVISAR',r.avg,r.opportunity,readingStatusLabel(r.readingStatus),r.readingSourceLabel||'']),ws=XLSX.utils.aoa_to_sheet([['INSTAL·LACIONS BT · INFORME ENERGÉTICO'],[`Resumen de facturas procesadas · Alpha · Parser ${PARSER_VERSION}`],sumH,...sumR]);decorate(ws,'INSTAL·LACIONS BT · INFORME ENERGÉTICO',`Resumen de facturas procesadas · Parser ${PARSER_VERSION}`,[12,18,28,27,26,10,14,13,13,12,12,16,13,19,16,12,12,15,11,14,42,20,30],22);for(let i=4;i<=exportRows.length+3;i++){const a=ws[`A${i}`];if(a)a.s={font:{bold:true,color:{rgb:exportRows[i-4].readOk?'19742B':XL.red}},fill:{fgColor:{rgb:exportRows[i-4].readOk?XL.lightGreen:XL.lightRed}},alignment:{horizontal:'center'},border:grid};const o=ws[`U${i}`];if(o&&exportRows[i-4].opportunity!=='Sin alertas')o.s={font:{bold:true,color:{rgb:'8B5600'}},fill:{fgColor:{rgb:XL.lightOrange}},alignment:{wrapText:true},border:grid}}XLSX.utils.book_append_sheet(wb,ws,'Resumen');
 const detH=['Nº factura','Empresa','CUPS','Periodo','Tarifa'];for(let p=1;p<=6;p++)detH.push(`P${p} kWh`,`P${p} €`,`P${p} €/kWh`,`P${p} kW contratados`,`P${p} maxímetro kW`);const detR=exportRows.map(r=>{const x=[r.invoiceNumber,r.company,r.cups,r.period,r.tariff];for(let p=1;p<=6;p++){const key=`P${p}`,has=Object.prototype.hasOwnProperty.call(r.periods,key),q=r.periods[key]||{};x.push(has?q.consumption:'',has?q.cost:'',has?q.price:'',Object.prototype.hasOwnProperty.call(r.contracted,key)?r.contracted[key]:'',r.maximeters[key]??'')}return x}),wd=XLSX.utils.aoa_to_sheet([['INSTAL·LACIONS BT · DETALLE P1-P6'],['Consumos, precios, potencias contratadas y maxímetros'],detH,...detR]);decorate(wd,'INSTAL·LACIONS BT · DETALLE P1-P6','Consumos, precios, potencias contratadas y maxímetros',[18,27,27,25,10,...Array(30).fill(14)],34);XLSX.utils.book_append_sheet(wb,wd,'Detalle P1-P6');
 const opH=['Nº factura','Empresa','CUPS','Periodo','Total €','Excesos €','Reactiva €','Qué revisar'],opR=exportRows.filter(r=>r.opportunity!=='Sin alertas'||!r.readOk).map(r=>[r.invoiceNumber,r.company,r.cups,r.period,r.total,r.excess,r.reactive,r.opportunity]),wo=XLSX.utils.aoa_to_sheet([['INSTAL·LACIONS BT · PUNTOS A REVISAR'],['Alertas y puntos de revisión detectados'],opH,...opR]);decorate(wo,'INSTAL·LACIONS BT · PUNTOS A REVISAR','Alertas y puntos de revisión detectados',[18,28,27,25,14,14,14,55],7);XLSX.utils.book_append_sheet(wb,wo,'Puntos a revisar');XLSX.writeFile(wb,'Informe_Energetico_Instalacions_BT.xlsx')}
const dz=$('#dropZone'),input=$('#fileInput');$('#pickFiles').onclick=()=>{input.value='';input.click()};input.onchange=e=>{const f=[...e.target.files];input.value='';process(f)};['dragenter','dragover'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>process([...e.dataTransfer.files]));$('#exportExcel').onclick=exportExcel;$('#clearData').onclick=()=>{rows=[];input.value='';window.IBTParserDiagnostics?.clear?.();render()};render();

// Keep the validation reason beside the status so it cannot disappear beyond
// the horizontal scroll area. Export the same reason instead of an unrelated
// commercial opportunity whenever the row is red.
const diagnosticFor=r=>r.superseded?`Refacturación detectada: sustituida por la factura ${r.supersededBy}. No se suma ni se exporta.`:r.possibleSupersession?'Posible refacturación: revisar antes de consolidar.':!r.readOk&&r.readMessage?`Motivo del error: ${r.readMessage}`:r.opportunity;
function bringDiagnosticForward(){
 const table=$('#resultsBody')?.closest('table'),head=table?.querySelector('thead tr');
 if(head?.lastElementChild&&!head.children[1]?.dataset.validationReason){const cell=head.lastElementChild;cell.dataset.validationReason='1';head.insertBefore(cell,head.children[1]);}
 for(const tr of $('#resultsBody')?.rows||[])if(tr.cells.length===16&&!tr.cells[1]?.dataset.validationReason){const cell=tr.cells[15];cell.dataset.validationReason='1';tr.insertBefore(cell,tr.cells[1]);}
}
new MutationObserver(bringDiagnosticForward).observe($('#resultsBody'),{childList:true});
bringDiagnosticForward();
$('#exportExcel').onclick=()=>{
 const original=rows.map(r=>r.opportunity);
 rows.forEach(r=>{r.opportunity=diagnosticFor(r)});
 try{exportExcel()}finally{rows.forEach((r,i)=>{r.opportunity=original[i]})}
};
