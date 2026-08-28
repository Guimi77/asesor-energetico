import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const $=s=>document.querySelector(s);let rows=[];
const money=n=>(Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=s=>{if(!s)return 0;let x=String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(x)||0};
const first=(text,patterns)=>{for(const p of patterns){const m=text.match(p);if(m?.[1])return m[1].trim()}return ''};
const euroValues=text=>[...text.matchAll(/([\d.]+,\d{2})\s*€/g)].map(m=>num(m[1]));
const maxEuro=text=>{const vals=euroValues(text);return vals.length?Math.max(...vals):0};
const between=(text,start,end)=>{const a=text.search(start);if(a<0)return '';const rest=text.slice(a);const b=rest.search(end);return b>0?rest.slice(0,b):rest};

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

function parseFenie(text,file){
 const header=parseHeader(text);
 const cups=header.cups||first(text,[/CUPS\s*[:\-]?\s*(ES[A-Z0-9]{16,24})/i,/(ES\d{16}[A-Z0-9]{0,6})/i]);
 const company=header.company||first(text,[/Datos Factura\s+(.+?)(?=Tipo Contrato|Fecha fin)/i]);
 const tariff=first(text,[/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i]);
 const period=first(text,[/(\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}\s*\(\d+\s*d[ií]as\))/i,/Lecturas desde\s*(\d{2}\/\d{2}\/\d{4}\s*a\s*\d{2}\/\d{2}\/\d{4})/i]);
 const total=num(first(text,[/TOTAL FACTURA\s*:\s*([\d.]+,\d{2})\s*€/i,/([\d.]+,\d{2})\s*€\s*TOTAL FACTURA/i]));

 const energyBlock=between(text,/T[eé]rmino\s+(?:de\s+)?energ[ií]a(?:\s+variable)?/i,/T[eé]rmino\s+de\s+potencia/i);
 const powerBlock=between(text,/T[eé]rmino\s+de\s+potencia/i,/(?:Energ[ií]a\s+reactiva|Excesos?\s+de\s+Potencia|Bono social)/i);
 const energy=maxEuro(energyBlock);
 const power=maxEuro(powerBlock);

 let kwh=0;
 const p1=text.slice(0,Math.max(0,text.search(/T[eé]rmino\s+de\s+potencia/i)));
 const consumed=[...p1.matchAll(/x\s*([\d.]+,\d{2})\s*kWh/gi)].map(m=>num(m[1]));
 if(consumed.length) kwh=consumed.reduce((a,b)=>a+b,0);
 if(!kwh){
   const readBlock=between(text,/Lecturas desde/i,/Tarifa de acceso/i);
   const m=readBlock.match(/Consumo\s*:\s*((?:[\d.]+,\d{2}\s*){3,6})/i);
   if(m) kwh=[...m[1].matchAll(/[\d.]+,\d{2}/g)].map(x=>num(x[0])).reduce((a,b)=>a+b,0);
 }

 let reactive=0;
 if(/Energ[ií]a\s+reactiva/i.test(text)){
   const rStart=text.search(/Precios Cargos/i);
   const rEnd=text.search(/Excesos?\s+de\s+Potencia/i);
   if(rStart>=0&&rEnd>rStart){
     const rvals=euroValues(text.slice(rStart,rEnd)).filter(v=>v<Math.max(power||Infinity,1000));
     const candidates=rvals.filter(v=>v>0&&v<200);
     if(candidates.length) reactive=Math.max(...candidates);
   }
 }

 const excess=num(first(text,[/Excesos?\s+de\s+Potencia[\s\S]{0,220}?Total[\s\S]{0,80}?([\d.]+,\d{2})\s*€/i]));
 let tax=num(first(text,[/Impuesto electricidad\s*([\d.]+,\d{2})\s*€/i,/([\d.]+,\d{2})\s*€\s*Impuesto electricidad/i]));
 let vat=num(first(text,[/IVA[\s\S]{0,80}?([\d.]+,\d{2})\s*€/i,/([\d.]+,\d{2})\s*€\s*(?:21,00%[^€]{0,40})?IVA/i]));
 if(!vat){const m=text.match(/21,00%\s*s\/\s*[\d.,]+\s*([\d.]+,\d{2})\s*€\s*IVA/i);if(m)vat=num(m[1])}

 const contracted=[...text.matchAll(/([\d.]+,\d{3})\s*kW\s*x\s*\d+\s*d[ií]as/gi)].map(m=>num(m[1]));
 let opportunity='Sin alertas';let severity='ok';
 if(excess>0){opportunity=`Exceso de potencia: ${money(excess)} €`;severity='danger'}
 else if(reactive>0){opportunity=`Coste de energía reactiva detectado: ${money(reactive)} €`;severity='review'}
 else if(contracted.length&&Math.max(...contracted)>=50){opportunity=`Potencia contratada elevada (${money(Math.max(...contracted))} kW): revisar maxímetros e histórico`;severity='review'}

 const missing=[];if(!company)missing.push('empresa');if(!cups)missing.push('CUPS');if(!period)missing.push('periodo');if(!total)missing.push('total');if(!kwh)missing.push('consumo');if(!energy)missing.push('energía');if(!power)missing.push('potencia');
 if(missing.length){severity='review';opportunity=`Revisar extracción: falta ${missing.join(', ')}`}

 return {file:file.name,company:company||'Por identificar',cups,period:period||'Por identificar',tariff:tariff||'—',kwh,energy,power,excess,reactive,tax,vat,total,avg:kwh?total/kwh:0,opportunity,severity};
}

async function process(files){
 for(const file of files){
   if(!file.name.toLowerCase().endsWith('.pdf'))continue;
   try{const text=await pdfText(file);rows.push(parseFenie(text,file))}
   catch(e){rows.push({file:file.name,company:'Error de lectura',cups:'',period:'',tariff:'—',kwh:0,energy:0,power:0,excess:0,reactive:0,tax:0,vat:0,total:0,avg:0,opportunity:e.message,severity:'danger'})}
   render();
 }
}

function render(){
 const body=$('#resultsBody');body.innerHTML=rows.length?'':`<tr class="empty"><td colspan="14">Aún no hay facturas procesadas.</td></tr>`;
 for(const r of rows){
   const tr=document.createElement('tr');
   tr.innerHTML=`<td><span class="status ${r.severity}">${r.severity==='ok'?'Correcta':r.severity==='danger'?'Alerta':'Revisar'}</span></td><td>${r.company}</td><td>${r.cups||'—'}</td><td>${r.period}</td><td>${r.tariff}</td><td>${money(r.kwh)}</td><td>${money(r.energy)}</td><td>${money(r.power)}</td><td>${money(r.excess)}</td><td>${money(r.reactive)}</td><td>${money(r.tax+r.vat)}</td><td><strong>${money(r.total)}</strong></td><td>${r.avg?money(r.avg):'—'}</td><td class="opp">${r.opportunity}</td>`;
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
 const data=rows.map(r=>({'Empresa':r.company,'CUPS':r.cups,'Periodo':r.period,'Tarifa':r.tariff,'Consumo kWh':r.kwh,'Coste energía €':r.energy,'Coste potencia €':r.power,'Excesos potencia €':r.excess,'Reactiva €':r.reactive,'Impuestos €':r.tax+r.vat,'Total factura €':r.total,'Coste medio €/kWh':r.avg,'Oportunidad':r.opportunity,'Archivo':r.file}));
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
