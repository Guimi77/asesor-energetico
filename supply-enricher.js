import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const clean=s=>norm(s).replace(/^[\s:;-]+/,'');

function linesFromItems(items){
  const pts=items.filter(i=>i.str&&i.str.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:i.transform[5]})).sort((a,b)=>b.y-a.y||a.x-b.x),groups=[];
  for(const p of pts){let g=groups.find(x=>Math.abs(x.y-p.y)<=2.8);if(!g){g={y:p.y,items:[]};groups.push(g)}g.items.push(p)}
  return groups.sort((a,b)=>b.y-a.y).map(g=>norm(g.items.sort((a,b)=>a.x-b.x).map(x=>x.s).join(' ')));
}

function splitPlace(address){
  const a=norm(address);
  const m=a.match(/\b(\d{5})\s+([^()]+?)(?:\s*\(([^()]*)\))?\s*$/i);
  if(!m)return{city:'',province:''};
  return{city:clean(m[2]),province:clean(m[3]||'')};
}

function between(text,label,nextLabels){
  const next=nextLabels.map(x=>`(?=${x}\\s*:)`).join('|');
  const re=new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?:${next}|$)`,'i');
  const m=text.match(re);
  return m?clean(m[1].split('\n')[0]):'';
}

function parseSupply(lines){
  const text=lines.join('\n');
  const compact=norm(lines.slice(0,40).join(' '));
  const cups=(text.match(/\bES[A-Z0-9]{18,24}\b/i)||[])[0]||'';

  let company=between(compact,'Raz[oó]n Social',['NIF \/ CIF','CUPS','Dir\\. Suministro','Contrato Acceso','Tarifa','Empresa Distribuidora']);
  let taxId=between(compact,'NIF \/ CIF',['CUPS','Dir\\. Suministro','Contrato Acceso','Tarifa','Empresa Distribuidora']);
  let address=between(compact,'Dir\\. Suministro',['Contrato Acceso','Tarifa','Empresa Distribuidora','Raz[oó]n Social']);
  let accessContract=between(compact,'Contrato Acceso',['Tarifa','Empresa Distribuidora','Raz[oó]n Social']);
  let tariff=between(compact,'Tarifa',['Empresa Distribuidora','Raz[oó]n Social']);
  let distributor=between(compact,'Empresa Distribuidora',['Raz[oó]n Social','Datos Factura']);

  tariff=((tariff.match(/\b(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)\b/i)||text.match(/\b(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)\b/i)||[])[1]||'').toUpperCase();
  if(!taxId){const m=text.match(/\b(?:NIF\s*\/\s*CIF|NIF|CIF)\s*:?\s*([A-Z0-9-]{7,15})/i);if(m)taxId=m[1]}
  if(!address){const m=text.match(/Dir\.\s*Suministro\s*:?\s*([^\n]+)/i);if(m)address=clean(m[1])}
  if(!distributor){const m=text.match(/Empresa Distribuidora\s*:?\s*([^\n]+)/i);if(m)distributor=clean(m[1])}
  if(!accessContract){const m=text.match(/Contrato Acceso\s*:?\s*([A-Z0-9._\/-]+)/i);if(m)accessContract=m[1]}

  const contract=((text.match(/N[º°o.]?\s*de\s*Contrato\s*:?\s*(CO-\d{4}-[A-Z0-9._-]+)/i)||text.match(/\b(CO-\d{4}-[A-Z0-9._-]+)\b/i)||[])[1])||'';
  const invoice=((text.match(/(?:N[º°o.]?\s*Factura|Factura n[º°o.]?)\s*:?\s*([A-Z0-9-]+)/i)||[])[1])||'';
  const contractType=((text.match(/Tipo Contrato\s*:?\s*([^\n]+)/i)||[])[1])||'';
  const renewal=((text.match(/Fecha fin del contrato de suministro\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1])||'';

  const place=splitPlace(address);
  if(!place.city&&address){
    const m=address.match(/,?\s*(\d{5})\s+([A-ZÁÉÍÓÚÜÑ .'-]+?)(?:\s*\(([A-ZÁÉÍÓÚÜÑ .'-]+)\))?$/i);
    if(m){place.city=clean(m[2]);place.province=clean(m[3]||'')}
  }

  const powers={};
  const powerBlock=(text.match(/T[eé]rmino de potencia([\s\S]{0,1200}?)(?:Excesos? de Potencia|Bono social|Impuesto electricidad)/i)||[])[1]||'';
  for(let i=1;i<=6;i++){
    const re=new RegExp(`P${i}:?[\\s\\S]{0,180}?([0-9]+(?:[.,][0-9]+)?)\\s*kW`,'i');
    const m=powerBlock.match(re);
    if(m)powers['p'+i]=m[1];
  }

  const period=(text.match(/(?:Periodo|Per[ií]odo) Facturaci[oó]n\s*:?\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i)||[]);

  return{
    company,cups,taxId,tariff,contract,address,
    city:place.city,province:place.province,
    distributor,retailer:'FENIE ENERGIA',accessContract,
    supplyName:address,invoiceNumber:invoice,periodEnd:period[2]||'',
    contractType:clean(contractType),renewalDate:renewal,...powers
  };
}

async function inspect(file){
  if(!file?.name?.toLowerCase().endsWith('.pdf'))return null;
  try{
    const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,all=[];
    for(let p=1;p<=Math.min(pdf.numPages,3);p++){
      const page=await pdf.getPage(p),c=await page.getTextContent();
      all.push(...linesFromItems(c.items));
    }
    const data=parseSupply(all);
    if(data.cups){
      let tries=0;
      const send=()=>{
        if(window.EnergyMaster?.learnInvoice){
          window.EnergyMaster.learnInvoice(data);
          window.dispatchEvent(new CustomEvent('master-enrichment-result',{detail:{file:file.name,data}}));
        }else if(tries++<60)setTimeout(send,100);
      };
      send();
      return data;
    }
  }catch(e){console.warn('No se pudo enriquecer el maestro desde',file.name,e)}
  return null;
}

async function inspectFiles(files){
  const pdfs=[...files].filter(f=>f.name?.toLowerCase().endsWith('.pdf'));
  if(!pdfs.length)return;
  const el=document.querySelector('#masterStatus');
  if(el)el.innerHTML=`<strong>Comprobando ${pdfs.length} factura(s) contra el maestro…</strong>`;
  let ok=0;
  for(const f of pdfs)if(await inspect(f))ok++;
  if(el)setTimeout(()=>{el.innerHTML=`<strong>${ok}/${pdfs.length} documentos leídos para verificar el maestro.</strong> Revisa Clientes/CUPS para ver dirección, localidad, contrato, tarifa y potencia actualizados.`},300);
}

const input=document.querySelector('#fileInput');
if(input)input.addEventListener('change',e=>inspectFiles(e.target.files));
const dz=document.querySelector('#dropZone');
if(dz)dz.addEventListener('drop',e=>inspectFiles(e.dataTransfer.files));