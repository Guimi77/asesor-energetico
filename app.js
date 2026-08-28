import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const $=s=>document.querySelector(s);let rows=[];
const money=n=>(Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=s=>{if(!s)return 0;let x=String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(x)||0};
const first=(text,patterns)=>{for(const p of patterns){const m=text.match(p);if(m?.[1])return m[1].trim()}return ''};
const euroValues=text=>[...text.matchAll(/([\d.]+,\d{2})\s*€/g)].map(m=>num(m[1]));
const maxEuro=text=>{const v=euroValues(text);return v.length?Math.max(...v):0};
const between=(text,start,end)=>{const a=text.search(start);if(a<0)return '';const rest=text.slice(a);const b=rest.search(end);return b>0?rest.slice(0,b):rest};
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;

async function pdfText(file){
 const data=new Uint8Array(await file.arrayBuffer());
 const pdf=await pdfjsLib.getDocument({data}).promise;
 let pages=[];
 for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i);
   const c=await page.getTextContent();
   pages.push(c.items.map(x=>x.str).join(' '));
 }
 return pages.join('\n').replace(/\s+/g,' ').trim();
}

function parseHeader(text){
 const head=text.slice(0,700);
 const m=head.match(/^(.+?)\s+([A-Z]\d{8})\s+(ES[A-Z0-9]{16,24})\b/i);
 return {company:m?.[1]?.trim()||'',taxId:m?.[2]||'',cups:m?.[3]||''};
}

function parseMoneyAfter(text,label,maxChars=140){
 const i=text.search(label);if(i<0)return 0;
 const piece=text.slice(i,i+maxChars);
 const vals=euroValues(piece);
 return vals.length?vals[0]:0;
}

function parseFenie(text,file){
 const header=parseHeader(text);
 const cups=header.cups||first(text,[/CUPS\s*[:\-]?\s*(ES[A-Z0-9]{16,24})/i,/(ES\d{16}[A-Z0-9]{0,6})/i]);
 const company=header.company||first(text,[/Datos Factura\s+(.+?)(?=Tipo Contrato|Fecha fin)/i]);
 const tariff=first(text,[/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i]);
 const period=first(text,[/(\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}\s*\(\d+\s*d[ií]as\))/i,/Lecturas desde\s*(\d{2}\/\d{2}\/\d{4}\s*a\s*\d{2}\/\d{2}\/\d{4})/i]);
 const total=num(first(text,[/TOTAL FACTURA\s*:\s*([\d.]+,\d{2})\s*€/i,/([\d.]+,\d{2})\s*€\s*TOTAL FACTURA/i]));

 // Total de energía: en Feníe es el primer importe tras "Facturación de electricidad".
 const energy=parseMoneyAfter(text,/Facturaci[oó]n de electricidad/i,120);

 // Total de potencia: dentro del bloque de potencia contratada, el mayor importe es el total.
 const powerBlock=between(text,/Potencia Contratada Total/i,/(?:Precios? Cargos|Energ[ií]a reactiva|Excesos? de Potencia|Bono social)/i);
 let power=maxEuro(powerBlock);
 if(!power){
   const fallback=between(text,/T[eé]rmino de potencia/i,/(?:Excesos? de Potencia|Energ[ií]a reactiva|Bono social)/i);
   const vals=euroValues(fallback).filter(v=>v<energy);
   power=vals.length?Math.max(...vals):0;
 }

 // Consumo: suma únicamente cantidades expresadas como kWh dentro del bloque de energía.
 const energyBlock=between(text,/T[eé]rmino\s+(?:de\s+)?energ[ií]a(?:\s+variable)?/i,/T[eé]rmino\s+de\s+potencia/i);
 let kwh=[...energyBlock.matchAll(/([\d.]+,\d{2})\s*kWh/gi)].map(m=>num(m[1])).filter(v=>v>0).reduce((a,b)=>a+b,0);
 if(!kwh){
   const readBlock=between(text,/Lecturas desde/i,/Tarifa de acceso/i);
   const cons=readBlock.match(/Consumo\s*:\s*([\s\S]{0,180})/i)?.[1]||'';
   const vals=[...cons.matchAll(/[\d.]+,\d{2}/g)].map(m=>num(m[0])).slice(0,tariff==='3.0TD'?6:3);
   if(vals.length) kwh=vals.reduce((a,b)=>a+b,0);
 }

 // Excesos: solo dentro de su bloque específico.
 const excessBlock=between(text,/Excesos? de Potencia/i,/(?:Energ[ií]a reactiva|Bono social|Impuesto electricidad)/i);
 const excess=maxEuro(excessBlock);

 // Reactiva: máximo importe del bloque de reactiva, antes de impuestos/otros conceptos.
 const reactiveBlock=between(text,/Energ[ií]a reactiva/i,/(?:Bono social|Impuesto electricidad)/i);
 const reactive=maxEuro(reactiveBlock);

 // Otros conceptos e impuestos, usando el texto visible alrededor de cada etiqueta.
 const social=num(first(text,[/Bono social[^€]{0,120}?([\d.]+,\d{2})\s*€/i]));
 const tax=num(first(text,[/Impuesto electricidad[^€]{0,140}?([\d.]+,\d{2})\s*€/i]));
 const rental=num(first(text,[/Alquiler Equipo medida[^€]{0,160}?([\d.]+,\d{2})\s*€/i]));
 const vat=num(first(text,[/IVA\s+21,00%\s*s\/\s*[\d.,]+\s+([\d.]+,\d{2})\s*€/i,/IVA[^€]{0,120}?([\d.]+,\d{2})\s*€/i]));

 const accounted=round2(energy+power+excess+reactive+social+tax+rental+vat);
 const diff=round2(total-accounted);
 const balanced=total>0&&Math.abs(diff)<=0.05;

 const contracted=[...text.matchAll(/([\d.]+,\d{3})\s*kW\s*x\s*\d+\s*d[ií]as/gi)].map(m=>num(m[1]));
 let opportunity='Sin alertas';let severity='ok';
 if(!balanced){severity='danger';opportunity=`Descuadre de factura: ${money(diff)} €`}
 else if(excess>0){severity='danger';opportunity=`Exceso de potencia: ${money(excess)} €`}
 else if(reactive>0){severity='review';opportunity=`Coste de energía reactiva: ${money(reactive)} €`}
 else if(contracted.length&&Math.max(...contracted)>=50){severity='review';opportunity=`Potencia contratada elevada (${money(Math.max(...contracted))} kW): revisar maxímetros e histórico`}

 const missing=[];if(!company)missing.push('empresa');if(!cups)missing.push('CUPS');if(!period)missing.push('periodo');if(!total)missing.push('total');if(!kwh)missing.push('consumo');if(!energy)missing.push('energía');if(!power)missing.push('potencia');
 if(missing.length){severity='review';opportunity=`Revisar extracción: falta ${missing.join(', ')}`}

 return {file:file.name,company:company||'Por identificar',cups,period:period||'Por identificar',tariff:tariff||'—',kwh,energy,power,excess,reactive,social,rental,tax,vat,total,accounted,diff,balanced,avg:kwh?total/kwh:0,opportunity,severity};
}

async function process(files){
 for(const file of files){
   if(!file.name.toLowerCase().endsWith('.pdf'))continue;
   try{const text=await pdfText(file);rows.push(parseFenie(text,file))}
   catch(e){rows.push({file:file.name,company:'Error de lectura',cups:'',period:'',tariff:'—',kwh:0,energy:0,power:0,excess:0,reactive:0,social:0,rental:0,tax:0,vat:0,total:0,accounted:0,diff:0,balanced:false,avg:0,opportunity:e.message,severity:'danger'})}
   render();
 }
}

function render(){
 const body=$('#resultsBody');body.innerHTML=rows.length?'':`<tr class="empty"><td colspan="16">Aún no hay facturas procesadas.</td></tr>`;
 for(const r of rows){
   const other=r.social+r.rental;
   const tr=document.createElement('tr');
   const balanceText=r.total?(r.balanced?'OK':`${money(r.diff)} €`):'—';
   tr.innerHTML=`<td><span class="status ${r.severity}">${r.severity==='ok'?'Correcta':r.severity==='danger'?'Alerta':'Revisar'}</span></td><td>${r.company}</td><td>${r.cups||'—'}</td><td>${r.period}</td><td>${r.tariff}</td><td>${money(r.kwh)}</td><td>${money(r.energy)}</td><td>${money(r.power)}</td><td>${money(r.excess)}</td><td>${money(r.reactive)}</td><td>${money(other)}</td><td>${money(r.tax+r.vat)}</td><td><strong>${money(r.total)}</strong></td><td><strong>${balanceText}</strong></td><td>${r.avg?money(r.avg):'—'}</td><td class="opp">${r.opportunity}</td>`;
   body.appendChild(tr);
 }
 $('#statInvoices').textContent=rows.length;
 $('#statOk').textContent=rows.filter(x=>x.severity==='ok').length;
 $('#statReview').textContent=rows.filter(x=>x.severity!=='ok').length;
 $('#statKwh').textContent=money(rows.reduce((s,x)=>s+x.kwh,0))+' kWh';
 $('#statTotal').textContent=money(rows.reduce((s,x)=>s+x.total,0))+' €';
 $('#exportExcel').disabled=!rows.length;
}

function exportExcel(){
 const data=rows.map(r=>({'Empresa':r.company,'CUPS':r.cups,'Periodo':r.period,'Tarifa':r.tariff,'Consumo kWh':r.kwh,'Coste energía €':r.energy,'Coste potencia €':r.power,'Excesos potencia €':r.excess,'Reactiva €':r.reactive,'Bono social €':r.social,'Alquiler contador €':r.rental,'Impuesto electricidad €':r.tax,'IVA €':r.vat,'Suma conceptos €':r.accounted,'Total factura €':r.total,'Diferencia cuadre €':r.diff,'Cuadre':r.balanced?'OK':'REVISAR','Coste medio €/kWh':r.avg,'Oportunidad':r.opportunity,'Archivo':r.file}));
 const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Informe mensual');XLSX.writeFile(wb,'informe-energetico.xlsx');
}

const dz=$('#dropZone'),input=$('#fileInput');
$('#pickFiles').onclick=()=>input.click();
input.onchange=e=>process([...e.target.files]);
['dragenter','dragover'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add('drag')}));
['dragleave','drop'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove('drag')}));
dz.addEventListener('drop',e=>process([...e.dataTransfer.files]));
$('#exportExcel').onclick=exportExcel;
$('#clearData').onclick=()=>{rows=[];render()};
