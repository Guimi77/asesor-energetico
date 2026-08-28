import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const $=s=>document.querySelector(s);let rows=[];
const money=n=>(Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=s=>{if(!s)return 0;let x=String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(x)||0};
const first=(text,patterns)=>{for(const p of patterns){const m=text.match(p);if(m?.[1])return m[1].trim()}return ''};
const sumMatches=(text,re)=>{let s=0,m;while((m=re.exec(text))!==null)s+=num(m[1]);return s};

async function pdfText(file){const data=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjsLib.getDocument({data}).promise;let pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const c=await page.getTextContent();pages.push(c.items.map(x=>x.str).join(' '))}return pages.join('\n').replace(/\s+/g,' ')}

function parseFenie(text,file){
 const cups=first(text,[/CUPS\s*[:\-]?\s*(ES[A-Z0-9]{16,24})/i,/(ES\d{16}[A-Z0-9]{0,6})/i]);
 const tariff=first(text,[/Tarifa(?: de acceso)?\s*[:\-]?\s*(\d\.\dTD)/i,/(2\.0TD|3\.0TD|6\.1TD)/i]);
 const period=first(text,[/Periodo(?: de)? Facturaci[oó]n\s*[:\-]?\s*([^\n]{5,45}?)(?=Fecha|Nº|Núm|Factura|$)/i,/del\s+(\d{2}\/\d{2}\/\d{4}\s+al\s+\d{2}\/\d{2}\/\d{4})/i]);
 let company=first(text,[/Raz[oó]n Social\s*[:\-]?\s*(.*?)(?=CIF|NIF|CUPS|Direcci[oó]n)/i,/Titular\s*[:\-]?\s*(.*?)(?=CIF|NIF|CUPS|Direcci[oó]n)/i]);
 const total=num(first(text,[/TOTAL FACTURA\s*[:\-]?\s*([\d.,]+)\s*€/i,/Total(?: importe)? factura\s*[:\-]?\s*([\d.,]+)\s*€/i]));
 let kwh=num(first(text,[/Consumo total\s*[:\-]?\s*([\d.,]+)\s*kWh/i,/Total consumo\s*[:\-]?\s*([\d.,]+)\s*kWh/i]));
 if(!kwh){const vals=[...text.matchAll(/P[1-6]\s+([\d.,]+)\s*kWh/gi)].map(m=>num(m[1]));if(vals.length)kwh=vals.slice(0,6).reduce((a,b)=>a+b,0)}
 const energy=num(first(text,[/T[eé]rmino de energ[ií]a(?: variable)?\s*[:\-]?\s*([\d.,]+)\s*€/i,/Energ[ií]a\s+total\s*[:\-]?\s*([\d.,]+)\s*€/i]));
 const power=num(first(text,[/T[eé]rmino de potencia\s*[:\-]?\s*([\d.,]+)\s*€/i,/Potencia\s+total\s*[:\-]?\s*([\d.,]+)\s*€/i]));
 const excess=num(first(text,[/Excesos? de Potencia\s*[:\-]?\s*([\d.,]+)\s*€/i]));
 const reactive=num(first(text,[/Energ[ií]a Reactiva\s*[:\-]?\s*([\d.,]+)\s*€/i,/Reactiva\s*[:\-]?\s*([\d.,]+)\s*€/i]));
 const tax=num(first(text,[/Impuesto (?:Especial sobre la )?Electricidad\s*[:\-]?\s*([\d.,]+)\s*€/i]));
 const vat=num(first(text,[/(?:IVA|IGIC)\s*[:\-]?\s*([\d.,]+)\s*€/i]));
 const contracted=[...text.matchAll(/P([1-6])\s*[:\-]?\s*([\d.,]+)\s*kW/gi)].map(m=>num(m[2]));
 const maxDemand=[...text.matchAll(/(?:max[ií]metro|max\.?(?: demand)?)[^0-9]{0,20}([\d.,]+)\s*kW/gi)].map(m=>num(m[1]));
 let opportunity='Sin alertas';let severity='ok';
 if(excess>0){opportunity=`Exceso de potencia: ${money(excess)} €`;severity='danger'}
 else if(reactive>0){opportunity=`Coste por reactiva: ${money(reactive)} €`;severity='review'}
 else if(contracted.length&&maxDemand.length){const c=Math.max(...contracted),d=Math.max(...maxDemand);if(c>0&&d/c<.6){opportunity=`Revisar potencia: máx. detectado ${money(d)} kW frente a ${money(c)} kW contratados`;severity='review'}}
 const missing=[];if(!cups)missing.push('CUPS');if(!total)missing.push('total');if(!kwh)missing.push('consumo');
 if(missing.length){severity='review';opportunity=`Revisar extracción: falta ${missing.join(', ')}`}
 return {file:file.name,company:company||'Por identificar',cups,period:period||'Por identificar',tariff:tariff||'—',kwh,energy,power,excess,reactive,tax,vat,total,avg:kwh?total/kwh:0,opportunity,severity};
}

async function process(files){for(const file of files){if(!file.name.toLowerCase().endsWith('.pdf'))continue;try{const text=await pdfText(file);rows.push(parseFenie(text,file))}catch(e){rows.push({file:file.name,company:'Error de lectura',cups:'',period:'',tariff:'—',kwh:0,energy:0,power:0,excess:0,reactive:0,tax:0,vat:0,total:0,avg:0,opportunity:e.message,severity:'danger'})}render()}}
function render(){const body=$('#resultsBody');body.innerHTML=rows.length?'':`<tr class="empty"><td colspan="14">Aún no hay facturas procesadas.</td></tr>`;for(const r of rows){const tr=document.createElement('tr');tr.innerHTML=`<td><span class="status ${r.severity}">${r.severity==='ok'?'Correcta':r.severity==='danger'?'Alerta':'Revisar'}</span></td><td>${r.company}</td><td>${r.cups||'—'}</td><td>${r.period}</td><td>${r.tariff}</td><td>${money(r.kwh)}</td><td>${money(r.energy)}</td><td>${money(r.power)}</td><td>${money(r.excess)}</td><td>${money(r.reactive)}</td><td>${money(r.tax+r.vat)}</td><td><strong>${money(r.total)}</strong></td><td>${r.avg?money(r.avg):'—'}</td><td class="opp">${r.opportunity}</td>`;body.appendChild(tr)}
 $('#statInvoices').textContent=rows.length;$('#statOk').textContent=rows.filter(x=>x.severity==='ok').length;$('#statReview').textContent=rows.filter(x=>x.severity!=='ok').length;$('#statKwh').textContent=money(rows.reduce((s,x)=>s+x.kwh,0))+' kWh';$('#statTotal').textContent=money(rows.reduce((s,x)=>s+x.total,0))+' €';$('#exportExcel').disabled=!rows.length}
function exportExcel(){const data=rows.map(r=>({'Empresa':r.company,'CUPS':r.cups,'Periodo':r.period,'Tarifa':r.tariff,'Consumo kWh':r.kwh,'Coste energía €':r.energy,'Coste potencia €':r.power,'Excesos potencia €':r.excess,'Reactiva €':r.reactive,'Impuestos €':r.tax+r.vat,'Total factura €':r.total,'Coste medio €/kWh':r.avg,'Oportunidad':r.opportunity,'Archivo':r.file}));const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Informe mensual');XLSX.writeFile(wb,'informe-energetico.xlsx')}
const dz=$('#dropZone'),input=$('#fileInput');$('#pickFiles').onclick=()=>input.click();input.onchange=e=>process([...e.target.files]);['dragenter','dragover'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>process([...e.dataTransfer.files]));$('#exportExcel').onclick=exportExcel;$('#clearData').onclick=()=>{rows=[];render()};
