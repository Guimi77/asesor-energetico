import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const $=s=>document.querySelector(s);let rows=[];
const money=n=>(Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=s=>{if(!s)return 0;let x=String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(x)||0};
const euroValues=s=>[...String(s||'').matchAll(/([\d.]+,\d{2})\s*€/g)].map(m=>num(m[1]));
const lastEuro=s=>{const v=euroValues(s);return v.length?v[v.length-1]:0};
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;

function makeLines(items){
 const pts=items.filter(i=>i.str&&i.str.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:i.transform[5]}));
 pts.sort((a,b)=>b.y-a.y||a.x-b.x);
 const groups=[];
 for(const p of pts){
   let g=groups.find(x=>Math.abs(x.y-p.y)<=2.2);
   if(!g){g={y:p.y,items:[]};groups.push(g)}
   g.items.push(p);
 }
 groups.sort((a,b)=>b.y-a.y);
 return groups.map(g=>g.items.sort((a,b)=>a.x-b.x).map(x=>x.s).join(' ').replace(/\s+/g,' ').trim());
}

async function pdfData(file){
 const data=new Uint8Array(await file.arrayBuffer());
 const pdf=await pdfjsLib.getDocument({data}).promise;
 const pages=[];
 for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i);const c=await page.getTextContent();pages.push(makeLines(c.items));
 }
 return {pages,text:pages.flat().join('\n')};
}

const findLine=(lines,re)=>lines.find(l=>re.test(l))||'';
function section(lines,startRe,endRes){
 const a=lines.findIndex(l=>startRe.test(l));if(a<0)return [];
 let b=lines.length;for(let i=a+1;i<lines.length;i++){if(endRes.some(r=>r.test(lines[i]))){b=i;break}}
 return lines.slice(a,b);
}
function rowFor(sectionLines,p){return sectionLines.find(l=>new RegExp(`^\\s*P${p}:?\\b`,'i').test(l))||''}
function headerValue(lines,labelRe){
 const line=findLine(lines,labelRe);if(!line)return '';
 return line.replace(labelRe,'').trim();
}

function parseFenie(data,file){
 const lines=data.pages[0]||[];const text=data.text;
 const company=headerValue(lines,/^.*Raz[oó]n Social:\s*/i).replace(/\s{2,}.*$/,'').trim();
 const cups=(headerValue(lines,/^.*CUPS:\s*/i).match(/ES[A-Z0-9]{16,24}/i)||[])[0]||((text.match(/ES[A-Z0-9]{16,24}/i)||[])[0]||'');
 const tariff=((findLine(lines,/Tarifa:/i).match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||text.match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||[])[1])||'—';
 const periodLine=findLine(lines,/Periodo Facturaci[oó]n:/i);
 const period=((periodLine.match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}\s*\(\d+\s*d[ií]as\)/i)||[])[0])||'Por identificar';
 const total=lastEuro(findLine(lines,/TOTAL FACTURA/i));

 const energySec=section(lines,/T[eé]rmino (?:de )?energ[ií]a(?: variable)?/i,[/T[eé]rmino de potencia/i]);
 const energyP1=rowFor(energySec,1);const energy=lastEuro(energyP1);
 const periods={};let kwh=0;
 for(let p=1;p<=6;p++){
   const line=rowFor(energySec,p);if(!line)continue;
   const km=line.match(/([\d.]+,\d{2})\s*kWh/i);const consumption=km?num(km[1]):0;
   const euros=euroValues(line);let cost=0;if(euros.length) cost=euros.length>1?euros[euros.length-2]:euros[0];
   const prices=[...line.matchAll(/([\d.,]+)\s*€\/kWh/gi)].map(m=>num(m[1]));const price=prices.length?prices[prices.length-1]:0;
   periods[`P${p}`]={consumption,cost,price};kwh+=consumption;
 }

 const powerSec=section(lines,/T[eé]rmino de potencia/i,[/Excesos? de Potencia/i,/Energ[ií]a reactiva/i,/Bono social/i]);
 const power=lastEuro(rowFor(powerSec,1));
 const contracted={};
 for(let p=1;p<=6;p++){const line=rowFor(powerSec,p);const m=line.match(/([\d.]+,\d{3})\s*kW/i);if(m)contracted[`P${p}`]=num(m[1])}

 const excessSec=section(lines,/Excesos? de Potencia/i,[/Energ[ií]a reactiva/i,/Bono social/i,/Impuesto electricidad/i]);
 const excess=lastEuro(rowFor(excessSec,1));
 const reactiveSec=section(lines,/Energ[ií]a reactiva/i,[/Bono social/i,/Impuesto electricidad/i]);
 const reactive=lastEuro(rowFor(reactiveSec,1));

 const social=lastEuro(findLine(lines,/Bono social/i));
 const tax=lastEuro(findLine(lines,/Impuesto electricidad/i));
 const rental=lastEuro(findLine(lines,/Alquiler Equipo medida/i));
 const vat=lastEuro(findLine(lines,/^IVA\b/i));
 const accounted=round2(energy+power+excess+reactive+social+tax+rental+vat);
 const diff=round2(total-accounted);const balanced=total>0&&Math.abs(diff)<=0.05;

 let opportunity='Sin alertas';let severity='ok';
 if(!balanced){severity='danger';opportunity=`Descuadre de factura: ${money(diff)} €`}
 else if(excess>0){severity='danger';opportunity=`Exceso de potencia: ${money(excess)} €`}
 else if(reactive>0){severity='review';opportunity=`Coste de energía reactiva: ${money(reactive)} €`}
 else {const c=Object.values(contracted);if(c.length&&Math.max(...c)>=50){severity='review';opportunity=`Potencia contratada elevada (${money(Math.max(...c))} kW): revisar maxímetros e histórico`}}
 const missing=[];if(!company)missing.push('empresa');if(!cups)missing.push('CUPS');if(period==='Por identificar')missing.push('periodo');if(!total)missing.push('total');if(!kwh)missing.push('consumo');if(!energy)missing.push('energía');if(!power)missing.push('potencia');
 if(missing.length){severity='review';opportunity=`Revisar extracción: falta ${missing.join(', ')}`}
 return {file:file.name,company:company||'Por identificar',cups,period,tariff,kwh,energy,power,excess,reactive,social,rental,tax,vat,total,accounted,diff,balanced,avg:kwh?total/kwh:0,opportunity,severity,periods,contracted};
}

async function process(files){for(const file of files){if(!file.name.toLowerCase().endsWith('.pdf'))continue;try{rows.push(parseFenie(await pdfData(file),file))}catch(e){rows.push({file:file.name,company:'Error de lectura',cups:'',period:'',tariff:'—',kwh:0,energy:0,power:0,excess:0,reactive:0,social:0,rental:0,tax:0,vat:0,total:0,accounted:0,diff:0,balanced:false,avg:0,opportunity:e.message,severity:'danger',periods:{},contracted:{}})}render()}}

function render(){
 const body=$('#resultsBody');body.innerHTML=rows.length?'':`<tr class="empty"><td colspan="16">Aún no hay facturas procesadas.</td></tr>`;
 for(const r of rows){const tr=document.createElement('tr');const balance=r.total?(r.balanced?'OK':`${money(r.diff)} €`):'—';tr.innerHTML=`<td><span class="status ${r.severity}">${r.severity==='ok'?'Correcta':r.severity==='danger'?'Alerta':'Revisar'}</span></td><td>${r.company}</td><td>${r.cups||'—'}</td><td>${r.period}</td><td>${r.tariff}</td><td>${money(r.kwh)}</td><td>${money(r.energy)}</td><td>${money(r.power)}</td><td>${money(r.excess)}</td><td>${money(r.reactive)}</td><td>${money(r.social+r.rental)}</td><td>${money(r.tax+r.vat)}</td><td><strong>${money(r.total)}</strong></td><td><strong>${balance}</strong></td><td>${r.avg?money(r.avg):'—'}</td><td class="opp">${r.opportunity}</td>`;body.appendChild(tr)}
 $('#statInvoices').textContent=rows.length;$('#statOk').textContent=rows.filter(x=>x.severity==='ok').length;$('#statReview').textContent=rows.filter(x=>x.severity!=='ok').length;$('#statKwh').textContent=money(rows.reduce((s,x)=>s+x.kwh,0))+' kWh';$('#statTotal').textContent=money(rows.reduce((s,x)=>s+x.total,0))+' €';$('#exportExcel').disabled=!rows.length;
}

function exportExcel(){
 const data=rows.map(r=>{const out={'Empresa':r.company,'CUPS':r.cups,'Periodo':r.period,'Tarifa':r.tariff,'Consumo kWh':r.kwh,'Coste energía €':r.energy,'Coste potencia €':r.power,'Excesos potencia €':r.excess,'Reactiva €':r.reactive,'Bono social €':r.social,'Alquiler contador €':r.rental,'Impuesto electricidad €':r.tax,'IVA €':r.vat,'Suma conceptos €':r.accounted,'Total factura €':r.total,'Diferencia cuadre €':r.diff,'Cuadre':r.balanced?'OK':'REVISAR','Coste medio €/kWh':r.avg,'Oportunidad':r.opportunity,'Archivo':r.file};for(let p=1;p<=6;p++){const x=r.periods[`P${p}`]||{};out[`P${p} kWh`]=x.consumption||0;out[`P${p} coste €`]=x.cost||0;out[`P${p} €/kWh`]=x.price||0;out[`P${p} potencia kW`]=r.contracted[`P${p}`]||0}return out});
 const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Informe mensual');XLSX.writeFile(wb,'informe-energetico.xlsx');
}

const dz=$('#dropZone'),input=$('#fileInput'];
