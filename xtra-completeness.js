import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const VERSION='2026.09.09.1';
const $=s=>document.querySelector(s);
const norm=v=>String(v??'').trim();
const clean=v=>norm(v).replace(/\s+/g,' ');
const cleanKey=v=>norm(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const num=s=>{if(s==null||s==='')return null;let x=String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');const n=Number(x);return Number.isFinite(n)?n:null};
const round2=n=>Math.round((Number(n)||0)*100)/100;
const euros=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v!=null);
const iso=s=>{const m=norm(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:''};
const status=(present,parsed,na=false)=>na?'not_applicable':present?(parsed?'extracted':'needs_review'):'not_present';

function lines(items){
  const pts=items.filter(i=>i.str?.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:i.transform[5]})).sort((a,b)=>b.y-a.y||a.x-b.x),groups=[];
  for(const q of pts){let g=groups.find(v=>Math.abs(v.y-q.y)<=2.2);if(!g)groups.push(g={y:q.y,a:[]});g.a.push(q)}
  return groups.sort((a,b)=>b.y-a.y).map(g=>g.a.sort((a,b)=>a.x-b.x).map(v=>v.s).join(' ').replace(/\s+/g,' ').trim());
}
function findLine(a,re){return a.find(x=>re.test(x))||''}
function section(a,start,ends){const i=a.findIndex(x=>start.test(x));if(i<0)return[];let j=a.length;for(let k=i+1;k<a.length;k++){if(ends.some(r=>r.test(a[k]))){j=k;break}}return a.slice(i,j)}
function pRow(a,p){return a.find(x=>new RegExp(`^\\s*P${p}:?\\b`,'i').test(x))||''}
function rowAmount(line,p){const e=euros(line);return e.length?(p===1&&e.length>=2?e.at(-2):e.at(-1)):null}
function extractLabel(a,re){const l=findLine(a,re);return l?clean(l.replace(re,'').replace(/^\s*:?\s*/,'')):''}

async function readPdf(file){
  const task=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});
  const pages=[],raw=[];
  try{
    const pdf=await task.promise;
    for(let i=1;i<=Math.min(pdf.numPages,3);i++){
      const p=await pdf.getPage(i),c=await p.getTextContent();
      raw.push(c.items);pages.push(lines(c.items));
    }
    return {pages,raw,text:pages.flat().join('\n')};
  }finally{await task.destroy()}
}

function parseHeader(a,text){
  const invoiceLine=findLine(a,/Factura\s*N[º°o.]?|N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura/i);
  const invoice=((invoiceLine.match(/(?:Factura\s*N[º°o.]?|N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura)\s*:?\s*([A-Z0-9][A-Z0-9._\/-]*)/i)||text.match(/(?:Factura\s*N[º°o.]?|N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura)\s*:?\s*([A-Z0-9][A-Z0-9._\/-]*)/i)||[])[1])||'';
  const cups=((findLine(a,/CUPS\s*:/i).match(/ES[A-Z0-9]{16,24}/i)||text.match(/ES[A-Z0-9]{16,24}/i)||[])[0])||'';
  const tariff=((findLine(a,/Tarifa\s*:/i).match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||text.match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||[])[1])||'';
  const periodLine=findLine(a,/Periodo Facturaci[oó]n\s*:/i),pm=periodLine.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})(?:\s*\((\d+)\s*d[ií]as\))?/i);
  const holder=extractLabel(a,/^.*?Raz[oó]n Social\s*:\s*/i);
  const taxId=extractLabel(a,/^.*?NIF\s*\/\s*CIF\s*:\s*/i);
  const address=extractLabel(a,/^.*?Dir\.\s*Suministro\s*:\s*/i);
  const access=extractLabel(a,/^.*?Contrato Acceso\s*:\s*/i).replace(/\s+Tarifa:.*$/i,'').trim();
  const distributor=extractLabel(a,/^.*?Empresa Distribuidora\s*:\s*/i);
  const issue=iso(extractLabel(a,/^.*?Fecha de Factura\s*:\s*/i));
  const contract=((text.match(/N[º°o.]?\s*de Contrato\s*:\s*([^\n]+)/i)||[])[1]||'').trim();
  const contractType=((text.match(/Tipo Contrato\s*:\s*([^\n]+)/i)||[])[1]||'').trim();
  const contractEnd=iso(((text.match(/Fecha fin del contrato de suministro\s*:\s*([^\n]+)/i)||[])[1])||'');
  const meter=((text.match(/Alquiler Equipo medida\s*\(N[º°o.]?\s*Contador\s*([^\)]+)\)/i)||text.match(/Contador\s*N[º°o.]?\s*:\s*([A-Z0-9._-]+)/i)||[])[1])||'';
  return {invoice,cups,tariff,billing_start:pm?iso(pm[1]):'',billing_end:pm?iso(pm[2]):'',billing_days:pm?.[3]?Number(pm[3]):null,holder,taxId,address,access,distributor,issue,contract,contractType,contractEnd,meter};
}

function parseEnergy(a,tariff){
  const s=section(a,/T[eé]rmino (?:de )?energ[ií]a(?: variable)?/i,[/T[eé]rmino de potencia/i]);
  const out=[],detail={};
  for(let p=1;p<=6;p++){
    const na=tariff==='2.0TD'&&p>3,line=pRow(s,p),present=!!line;
    if(na){detail[`P${p}`]={status:'not_applicable'};continue}
    if(!present){detail[`P${p}`]={status:'not_present'};continue}
    const prices=[...line.matchAll(/(-?[\d.,]+)\s*€\s*\/\s*kWh/gi)].map(m=>num(m[1]));
    const km=line.match(/(-?[\d.]+,\d{2})\s*kWh/i),consumption=km?num(km[1]):null,amount=rowAmount(line,p);
    const ok=prices.length>=4&&consumption!=null&&amount!=null;
    detail[`P${p}`]={status:ok?'extracted':'needs_review'};
    if(ok)out.push({period:p,toll_price_eur_kwh:prices[0],charges_price_eur_kwh:prices[1],retailer_price_eur_kwh:prices[2],unit_price_eur_kwh:prices[3],consumption_kwh:consumption,energy_cost_eur:amount});
  }
  return {rows:out,detail,status:Object.values(detail).some(x=>x.status==='needs_review')?'needs_review':'extracted'};
}

function parsePower(a,tariff){
  const s=section(a,/T[eé]rmino de potencia/i,[/Excesos? de Potencia/i,/Energ[ií]a reactiva/i,/Bono social/i,/Impuesto electricidad/i,/Alquiler Equipo/i]);
  const out=[],detail={};
  for(let p=1;p<=6;p++){
    const na=tariff==='2.0TD'&&p>2,line=pRow(s,p),present=!!line;
    if(na){detail[`P${p}`]={status:'not_applicable'};continue}
    if(!present){detail[`P${p}`]={status:'not_present'};continue}
    const prices=[...line.matchAll(/(-?[\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a/gi)].map(m=>num(m[1]));
    const km=line.match(/(-?[\d.,]+)\s*kW\s*[x×]\s*(\d+)\s*d[ií]as?/i),amount=rowAmount(line,p);
    const contracted=km?num(km[1]):null,days=km?Number(km[2]):null,ok=prices.length>=4&&contracted!=null&&days!=null&&amount!=null;
    detail[`P${p}`]={status:ok?'extracted':'needs_review'};
    if(ok)out.push({period:p,toll_price_eur_kw_day:prices[0],charges_price_eur_kw_day:prices[1],retailer_price_eur_kw_day:prices[2],unit_price_eur_kw_day:prices[3],contracted_kw:contracted,days,billed_power_eur:amount});
  }
  return {rows:out,detail,status:Object.values(detail).some(x=>x.status==='needs_review')?'needs_review':'extracted'};
}

function parseExcess(a,tariff){
  const s=section(a,/Excesos? de Potencia/i,[/Energ[ií]a reactiva/i,/Bono social/i,/Impuesto electricidad/i,/Alquiler Equipo/i]);
  const out=[],detail={},present=s.length>0;
  if(!present)return {rows:[],detail,status:'not_present'};
  for(let p=1;p<=6;p++){
    const na=tariff==='2.0TD'&&p>2,line=pRow(s,p);
    if(na){detail[`P${p}`]={status:'not_applicable'};continue}
    if(!line){detail[`P${p}`]={status:'not_present'};continue}
    const body=line.replace(/^\s*P\d:?\s*/i,''),m=body.match(/(-?[\d.,]+)\s*[x×]\s*(-?[\d.,]+)\s*=\s*(-?[\d.]+,\d{2})\s*€/i),amount=rowAmount(line,p);
    const ok=!!m&&amount!=null;
    detail[`P${p}`]={status:ok?'extracted':'needs_review'};
    if(ok)out.push({period:p,excess_kw:num(m[1]),unit_price:num(m[2]),amount_eur:amount});
  }
  return {rows:out,detail,status:Object.values(detail).some(x=>x.status==='needs_review')?'needs_review':'extracted'};
}

function parseReactive(a,tariff){
  const s=section(a,/Energ[ií]a reactiva/i,[/Compensaci[oó]n Excedente/i,/Regularizaci[oó]n/i,/Bono social/i,/Impuesto electricidad/i,/Alquiler Equipo/i]);
  const out=[],detail={},present=s.length>0;
  if(!present)return {rows:[],detail,status:tariff==='2.0TD'?'not_applicable':'not_present'};
  for(let p=1;p<=6;p++){
    const line=pRow(s,p);if(!line){detail[`P${p}`]={status:'not_present'};continue}
    const body=line.replace(/^\s*P\d:?\s*/i,''),m=body.match(/(-?[\d.]+,\d{2})\s*kVArh\s+(-?[\d.,]+)\s+(-?[\d.]+,\d{2})\s*kVArh\s*[x×]\s*(-?[\d.,]+)\s*€?\s*\/\s*kVArh\s*=\s*(-?[\d.]+,\d{2})\s*€/i),amount=rowAmount(line,p);
    const ok=!!m&&amount!=null;
    detail[`P${p}`]={status:ok?'extracted':'needs_review'};
    if(ok)out.push({period:p,reactive_kvarh:num(m[1]),consumption_kvarh:num(m[1]),cos_phi:num(m[2]),excess_kvarh:num(m[3]),unit_price_eur_kvarh:num(m[4]),amount_eur:amount});
  }
  return {rows:out,detail,status:Object.values(detail).some(x=>x.status==='needs_review')?'needs_review':'extracted'};
}

function parseTaxLines(a){
  const signals=a.filter(l=>/^\s*(?:IVA(?:\s+Reducido)?|IGIC)\b/i.test(l));
  const rows=[];
  for(const l of signals){
    const type=/^\s*IGIC\b/i.test(l)?'IGIC':'IVA',rm=l.match(/(-?[\d.,]+)\s*%/),bm=l.match(/\bs\/\s*(-?[\d.]+,\d{2})/i),e=euros(l),amount=e.length?e.at(-1):null;
    if(rm&&bm&&amount!=null)rows.push({tax_type:type,label:clean(l.replace(/\s*-?[\d.]+,\d{2}\s*€.*$/,'')),rate_pct:num(rm[1]),taxable_base_eur:num(bm[1]),amount_eur:amount});
  }
  return {rows,signalCount:signals.length,status:signals.length===rows.length?(signals.length?'extracted':'not_present'):'needs_review'};
}

function parseRights(a){
  const starts=[];
  for(let i=0;i<a.length;i++)if(/Derechos\s+(?:de\s+)?(?:Verificaci[oó]n|Extensi[oó]n|Acceso|Enganche|Actuaci[oó]n Equipos).*Distribuidora/i.test(a[i]))starts.push(i);
  const rows=[];
  for(const i of starts){
    const src=clean(a.slice(i,Math.min(a.length,i+3)).join(' ')),e=euros(src),amount=e.length?e[0]:null;
    const cm=src.match(/Derechos\s+(?:de\s+)?(Verificaci[oó]n|Extensi[oó]n|Acceso|Enganche|Actuaci[oó]n Equipos)/i),lm=src.match(/\((R\.D\.[^\)]*|[^\)]*Art\.[^\)]*)\)/i);
    if(cm&&amount!=null)rows.push({concept:`Derechos ${cm[1]} Distribuidora`,amount_eur:amount,legal_reference:lm?.[1]||null,source_text:a[i]});
  }
  return {rows,signalCount:starts.length,status:starts.length===rows.length?(starts.length?'extracted':'not_present'):'needs_review'};
}

function parseMaximeters(raw2){
  if(!raw2?.length)return {rows:[],status:'not_present'};
  const anchor=raw2.find(i=>/Max[ií]metro\s*\(kW\)/i.test(String(i.str||'')));if(!anchor)return {rows:[],status:'not_present'};
  const ay=anchor.transform?.[5],ax=anchor.transform?.[4]??0;
  let vals=raw2.filter(i=>i!==anchor&&Math.abs((i.transform?.[5]??9999)-ay)<=3.2&&(i.transform?.[4]??0)>ax&&/^\s*-?[\d.]+,\d{2}\s*$/.test(String(i.str||''))).sort((a,b)=>(a.transform?.[4]??0)-(b.transform?.[4]??0)).map(i=>num(i.str)).filter(v=>v!=null).slice(0,6);
  return {rows:vals.map((v,i)=>({period:i+1,maximeter_kw:v})),status:vals.length>=2?'extracted':'needs_review'};
}

function parseMoneySignals(a){
  const get=(re)=>{const l=findLine(a,re),e=euros(l);return {present:!!l,value:e.length?e.at(-1):null,status:status(!!l,e.length>0)}};
  return {
    compensation:get(/Compensaci[oó]n Excedente/i),
    social_bonus:get(/Bono social/i),
    electricity_tax:get(/Impuesto electricidad/i),
    meter_rental:get(/Alquiler Equipo medida/i),
    integrator_adjustment:get(/Ajuste por Integrador/i),
    reactive_regularization:get(/Regularizaci[oó]n\s+Reactiva/i)
  };
}

function sum(rows,key){return round2(rows.reduce((s,r)=>s+(Number(r[key])||0),0))}

function buildPayload(d){
  const a=d.pages[0]||[],text=d.text,h=parseHeader(a,text),energy=parseEnergy(a,h.tariff),power=parsePower(a,h.tariff),excess=parseExcess(a,h.tariff),reactive=parseReactive(a,h.tariff),tax=parseTaxLines(a),rights=parseRights(a),mx=parseMaximeters(d.raw?.[1]||[]),money=parseMoneySignals(a);
  const totalLine=findLine(a,/TOTAL FACTURA/i),totalE=euros(totalLine),total=totalE.length?totalE.at(-1):null;
  const mandatory={invoice_number:!!h.invoice,cups:!!h.cups,billing_period:!!(h.billing_start&&h.billing_end),tariff:!!h.tariff,distributor:!!h.distributor,total:total!=null};
  const fieldStatus={
    invoice_number:status(/Factura/i.test(text),!!h.invoice),cups:status(/CUPS\s*:/i.test(text),!!h.cups),billing_period:status(/Periodo Facturaci[oó]n/i.test(text),!!(h.billing_start&&h.billing_end)),issue_date:status(/Fecha de Factura/i.test(text),!!h.issue),tariff:status(/Tarifa\s*:/i.test(text),!!h.tariff),distributor:status(/Empresa Distribuidora/i.test(text),!!h.distributor),holder_name:status(/Raz[oó]n Social/i.test(text),!!h.holder),holder_tax_id:status(/NIF\s*\/\s*CIF/i.test(text),!!h.taxId),supply_address:status(/Dir\.\s*Suministro/i.test(text),!!h.address),access_contract:status(/Contrato Acceso/i.test(text),!!h.access),contract_number:status(/N[º°o.]?\s*de Contrato/i.test(text),!!h.contract),contract_type:status(/Tipo Contrato/i.test(text),!!h.contractType),contract_end_date:status(/Fecha fin del contrato de suministro/i.test(text),!!h.contractEnd),meter_number:status(/(?:N[º°o.]?\s*Contador|Contador\s*N[º°o.]?)/i.test(text),!!h.meter),total:status(/TOTAL FACTURA/i.test(text),total!=null)
  };
  const review=[];
  for(const [k,v] of Object.entries(mandatory))if(!v)review.push(k);
  for(const [k,v] of Object.entries(fieldStatus))if(v==='needs_review')review.push(k);
  for(const [k,v] of Object.entries({energy:energy.status,power:power.status,excess:excess.status,reactive:reactive.status,taxes:tax.status,distributor_rights:rights.status,maximeters:mx.status}))if(v==='needs_review')review.push(k);
  for(const [k,v] of Object.entries(money))if(v.status==='needs_review')review.push(k);
  const energyCost=sum(energy.rows,'energy_cost_eur'),powerCost=sum(power.rows,'billed_power_eur'),excessCost=sum(excess.rows,'amount_eur'),reactiveCost=sum(reactive.rows,'amount_eur'),consumption=sum(energy.rows,'consumption_kwh');
  const completeness={version:VERSION,fields:fieldStatus,groups:{energy:{status:energy.status,periods:energy.detail},power:{status:power.status,periods:power.detail},excess:{status:excess.status,periods:excess.detail},reactive:{status:reactive.status,periods:reactive.detail},tax_lines:{status:tax.status,count:tax.rows.length},distributor_rights:{status:rights.status,count:rights.rows.length},maximeters:{status:mx.status,count:mx.rows.length}},concepts:Object.fromEntries(Object.entries(money).map(([k,v])=>[k,{status:v.status}])),review_reasons:[...new Set(review)]};
  return {cups:h.cups,invoice_number:h.invoice,billing_start:h.billing_start,billing_end:h.billing_end,consumption_kwh:consumption,energy_cost_eur:energyCost,power_cost_eur:powerCost,excess_cost_eur:excessCost,reactive_cost_eur:reactiveCost,total_eur:total,issue_date:h.issue,source_holder_name:h.holder,source_holder_tax_id:h.taxId,source_supply_address:h.address,access_contract_number:h.access,contract_number:h.contract,contract_type:h.contractType,contract_end_date:h.contractEnd,meter_number:h.meter,completeness_assessment_status:review.length?'needs_review':'complete',source_completeness:completeness,energy_periods:energy.rows,power_periods:power.rows,excess_periods:excess.rows,reactive_periods:reactive.rows,tax_lines:tax.rows,distributor_rights:rights.rows,maximeters:mx.rows};
}

function paint(text,type='ok'){
  let el=$('#completenessSyncStatus');
  if(!el){const host=$('#dropZone');if(!host)return;el=document.createElement('div');el.id='completenessSyncStatus';el.setAttribute('role','status');el.style.cssText='grid-column:1/-1;padding:8px 12px;margin-top:6px';host.appendChild(el)}
  el.textContent=text;el.className=`status ${type==='ok'?'ok':'review'}`;
}

async function enrich(file){
  const supabase=window.ibtSupabase,profile=window.ibtCurrentProfile;if(!supabase||!['admin','staff'].includes(profile?.role))return {skip:true,reason:'no_internal_session'};
  const payload=buildPayload(await readPdf(file));
  for(let i=0;i<180;i++){
    const {data,error}=await supabase.rpc('enrich_xtra_invoice_completeness',{p_payload:payload});
    if(error)throw error;
    if(data?.ok)return data;
    if(data?.reason!=='invoice_not_yet_saved')return data||{ok:false};
    await new Promise(r=>setTimeout(r,500));
  }
  return {ok:false,reason:'invoice_not_yet_saved_timeout'};
}

let queue=Promise.resolve();
function enqueue(files){
  const list=[...files].filter(f=>f.name?.toLowerCase().endsWith('.pdf'));if(!list.length)return;
  queue=queue.then(async()=>{
    let complete=0,review=0,failed=0,done=0;
    paint(`Completitud: 0/${list.length} · auditando fuente`,'review');
    for(const f of list){
      try{const r=await enrich(f);if(r?.ok&&r.completeness==='complete')complete++;else if(r?.ok||r?.reason==='core_mismatch')review++;else review++;}
      catch(e){failed++;console.warn('Completitud FENIE:',f.name,e)}
      done++;paint(`Completitud: ${done}/${list.length} · ${complete} completas · ${review} revisión · ${failed} errores`,'review');
      await new Promise(r=>setTimeout(r,0));
    }
    paint(`Completitud terminada: ${complete} completas · ${review} revisión · ${failed} errores`,review||failed?'review':'ok');
    window.dispatchEvent(new CustomEvent('xtra-completeness-updated',{detail:{complete,review,failed,total:list.length}}));
    window.XtraHistory?.refresh?.();
  }).catch(e=>{console.warn('Cola completitud FENIE',e);paint('No se ha completado la auditoría de completitud.','review')});
}

const input=$('#fileInput');if(input)input.addEventListener('change',e=>enqueue(e.target.files),{capture:true});
const dz=$('#dropZone');if(dz)dz.addEventListener('drop',e=>enqueue(e.dataTransfer?.files||[]),{capture:true});
window.XtraCompleteness={mode:'source-completeness',version:VERSION,enqueue};
