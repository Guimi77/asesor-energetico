import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const PILOT='GRUPO XTRA';
const $=s=>document.querySelector(s);
const norm=v=>String(v??'').trim();
const cleanKey=v=>norm(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const cupsKey=v=>{const x=cleanKey(v);return x.startsWith('ES')&&x.length>=20?x.slice(0,20):x};
const num=s=>{if(s==null)return 0;let x=String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(x)||0};
const euros=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1]));
const lastEuro=s=>{const a=euros(s);return a.length?a.at(-1):0};
const round2=n=>Math.round((Number(n)||0)*100)/100;

function lines(items){
  const pts=items.filter(i=>i.str?.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:i.transform[5]})).sort((a,b)=>b.y-a.y||a.x-b.x),groups=[];
  for(const q of pts){let g=groups.find(v=>Math.abs(v.y-q.y)<=2.2);if(!g)groups.push(g={y:q.y,a:[]});g.a.push(q)}
  return groups.sort((a,b)=>b.y-a.y).map(g=>g.a.sort((a,b)=>a.x-b.x).map(v=>v.s).join(' ').replace(/\s+/g,' ').trim());
}
const find=(a,re)=>a.find(x=>re.test(x))||'';
function section(a,start,ends){const i=a.findIndex(x=>start.test(x));if(i<0)return[];let j=a.length;for(let k=i+1;k<a.length;k++){if(ends.some(r=>r.test(a[k]))){j=k;break}}return a.slice(i,j)}
function prow(a,p){return a.find(x=>new RegExp(`^\\s*P${p}:?\\b`,'i').test(x))||''}
function sectionTotal(a){let n=0;for(let p=1;p<=6;p++){const ev=euros(prow(a,p));if(!ev.length)continue;n+=p===1&&ev.length>=2?ev.at(-2):ev.at(-1)}return round2(n)}

function powerDetails(a){
  const text=(a||[]).join('\n');
  const expression=/([\d.,]+)\s*kW\s*[x×]\s*(\d+)\s*d[ií]as?\s*=\s*(-?[\d.]+,\d{2})\s*€(?!\s*\/)/gi;
  const entries=[...text.matchAll(expression)].map(m=>({contractedKw:num(m[1]),days:Number(m[2]),amount:num(m[3])}));
  const labels=[...text.matchAll(/\bP([1-6])\s*:/g)].map(m=>Number(m[1]));
  const sum=round2(entries.reduce((s,e)=>s+e.amount,0));
  const remaining=text.replace(expression,'');
  const subtotals=[...remaining.matchAll(/(-?[\d.]+,\d{2})\s*€(?!\s*\/)/g)].map(m=>num(m[1]));
  const printed=subtotals.length===1?subtotals[0]:null;
  const bound=(entries.length+1)*0.005+0.000001;
  const reliable=entries.length>0&&entries.length===labels.length&&subtotals.length<=1&&(printed==null||Math.abs(printed-sum)<=bound);
  return {entries,labels,reliable,value:reliable&&printed!=null?printed:sum};
}

function maximeters(items){
  const out={};if(!items?.length)return out;
  const anchor=items.find(i=>/Max[ií]metro\s*\(kW\)/i.test(String(i.str||'')));if(!anchor)return out;
  const ay=anchor.transform?.[5],ax=anchor.transform?.[4]??0;if(!Number.isFinite(ay))return out;
  let vals=items.filter(i=>i!==anchor&&Math.abs((i.transform?.[5]??9999)-ay)<=3.2&&(i.transform?.[4]??0)>ax&&/^\s*-?[\d.]+,\d{2}\s*$/.test(String(i.str||''))).sort((a,b)=>(a.transform?.[4]??0)-(b.transform?.[4]??0)).map(i=>num(i.str));
  if(vals.length<2)return out;vals=vals.slice(0,6);for(let p=1;p<=vals.length;p++)out[`P${p}`]=vals[p-1];out._reliable=true;return out;
}

function isoDate(s){const m=norm(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:''}
function parsePeriod(s){const m=norm(s).match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})(?:\s*\((\d+)\s*d[ií]as\))?/i);return m?{start:isoDate(m[1]),end:isoDate(m[2]),days:m[3]?Number(m[3]):null}:{start:'',end:'',days:null}}

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
  }finally{
    await task.destroy();
  }
}


function extractFenie(d,file){
  const a=d.pages[0]||[],text=d.text;
  const invoiceLine=find(a,/(?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)/i);
  const invoiceNumber=((invoiceLine.match(/(?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)\s*:?\s*([A-Z0-9][A-Z0-9._\/-]*)/i)||text.match(/(?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)\s*:?\s*([A-Z0-9][A-Z0-9._\/-]*)/i)||[])[1])||'';
  const cups=((find(a,/CUPS:/i).match(/ES[A-Z0-9]{16,24}/i)||text.match(/ES[A-Z0-9]{16,24}/i)||[])[0])||'';
  const tariff=((find(a,/Tarifa:/i).match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||text.match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||[])[1])||'';
  const periodText=((find(a,/Periodo Facturaci[oó]n:/i).match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}(?:\s*\(\d+\s*d[ií]as\))?/i)||[])[0])||'';
  const period=parsePeriod(periodText),total=lastEuro(find(a,/TOTAL FACTURA/i));

  const es=section(a,/T[eé]rmino (?:de )?energ[ií]a(?: variable)?/i,[/T[eé]rmino de potencia/i]),periods={},energyPeriods=[];let kwh=0;
  for(let p=1;p<=6;p++){const l=prow(es,p);if(!l)continue;const km=l.match(/([\d.]+,\d{2})\s*kWh/i),consumption=km?num(km[1]):0,ev=euros(l),cost=ev.length?(ev.length>1?ev.at(-2):ev[0]):0,pr=[...l.matchAll(/([\d.,]+)\s*€\/kWh/gi)].map(m=>num(m[1]));const price=pr.at(-1)||0;periods[`P${p}`]={consumption,cost,price};energyPeriods.push({period:p,consumption_kwh:consumption,energy_cost_eur:cost,unit_price_eur_kwh:price||null});kwh+=consumption}
  const energy=round2(Object.values(periods).reduce((s,x)=>s+x.cost,0));

  const ps=section(a,/T[eé]rmino de potencia/i,[/Excesos? de Potencia/i,/Energ[ií]a reactiva/i,/Bono social/i]),pd=powerDetails(ps),power=pd.value;
  const powerPeriods=pd.reliable?pd.entries.map((e,i)=>({period:pd.labels[i],contracted_kw:e.contractedKw,billed_power_eur:e.amount,unit_price_eur_kw_day:null})):[];
  const excess=sectionTotal(section(a,/Excesos? de Potencia/i,[/Energ[ií]a reactiva/i,/Bono social/i,/Impuesto electricidad/i]));
  const reactive=sectionTotal(section(a,/Energ[ií]a reactiva/i,[/Compensaci[oó]n Excedente/i,/Regularizaci[oó]n/i,/Bono social/i,/Impuesto electricidad/i]));
  const mx=maximeters(d.raw?.[1]||[]),maximeterRows=Object.keys(mx).filter(k=>/^P\d$/.test(k)).map(k=>({period:Number(k.slice(1)),maximeter_kw:mx[k],reliable:!!mx._reliable,source:'FENIE · tabla maxímetro'}));

  let compensation=lastEuro(find(a,/Compensaci[oó]n Excedente/i));if(compensation>0)compensation=-compensation;
  const social=lastEuro(find(a,/Bono social/i)),tax=lastEuro(find(a,/Impuesto electricidad/i)),rental=lastEuro(find(a,/Alquiler Equipo medida/i));
  let integratorAdjustment=0;const ii=a.findIndex(l=>/Ajuste por Integrador/i.test(l));if(ii>=0){const v=euros(a.slice(ii,ii+5).join(' ')),neg=v.find(x=>x<0);integratorAdjustment=neg??(v.length===1?v[0]:0)}
  const regularizationReactive=lastEuro(find(a,/Regularizaci[oó]n\s+Reactiva/i));
  const vat=round2(a.filter(l=>/^\s*IVA\b/i.test(l)).reduce((s,l)=>s+lastEuro(l),0)),igic=round2(a.filter(l=>/^\s*IGIC\b/i.test(l)).reduce((s,l)=>s+lastEuro(l),0));
  let db='';const rightsRe=/Derechos (?:de )?(?:Verificaci[oó]n|Extensi[oó]n|Acceso|Enganche|Actuaci[oó]n Equipos) Distribuidora/i,di=a.findIndex(l=>rightsRe.test(l));if(di>=0)for(let i=di;i<Math.min(a.length,di+6);i++){if(i>di&&/^(?:Impuesto electricidad|Alquiler Equipo|IVA\b|IGIC\b|TOTAL FACTURA)/i.test(a[i]))break;db+=' '+a[i]}const dv=euros(db),distributorCharges=dv.length?Math.max(...dv):0;
  const other=round2(social+rental+integratorAdjustment+regularizationReactive),accounted=round2(energy+power+excess+reactive+compensation+other+tax+vat+igic+distributorCharges),diff=round2(total-accounted);
  const distributor=((find(a,/Empresa Distribuidora\s*:/i).replace(/.*?Empresa Distribuidora\s*:\s*/i,'').trim())||'');
  const contract=((text.match(/\b(CO-\d{4}-[A-Z0-9._-]+)\b/i)||[])[1])||'';
  const adjustments=[];if(integratorAdjustment)adjustments.push({concept:'Ajuste por Integrador',amount_eur:integratorAdjustment,category:'adjustment'});if(regularizationReactive)adjustments.push({concept:'Regularización Reactiva',amount_eur:regularizationReactive,category:'reactive_adjustment'});

  return {file:file.name,invoiceNumber,cups,tariff,periodText,period,total,kwh,energy,power,excess,reactive,compensation,social,rental,tax,vat,igic,distributorCharges,other,accounted,diff,energyPeriods,powerPeriods,maximeterRows,adjustments,distributor,retailer:'FENIE ENERGIA',contract,powerReliable:pd.reliable};
}

function parseUiNumber(s){return num(String(s||'').replace(/\s*€/g,''))}
function rowSnapshot(cups,periodText){
  for(const tr of document.querySelectorAll('#resultsBody tr')){const c=tr.children;if(c.length<16)continue;if(cupsKey(c[2].textContent)!==cupsKey(cups))continue;if(norm(c[3].textContent)!==norm(periodText))continue;return {status:norm(c[0].textContent),kwh:parseUiNumber(c[5].textContent),energy:parseUiNumber(c[6].textContent),power:parseUiNumber(c[7].textContent),excess:parseUiNumber(c[8].textContent),reactive:parseUiNumber(c[9].textContent),total:parseUiNumber(c[12].textContent),balance:norm(c[13].textContent)}}
  return null;
}
async function waitForMainRow(cups,periodText){for(let i=0;i<600;i++){const r=rowSnapshot(cups,periodText);if(r)return r;await new Promise(r=>setTimeout(r,100))}return null}
function same(a,b,t=.05){return Math.abs((Number(a)||0)-(Number(b)||0))<=t}

function historyStatus(text,type='ok'){
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
  el.className=`status ${type==='ok'?'ok':'review'}`;
}


async function persistOne(file){
  const profile=window.ibtCurrentProfile,supabase=window.ibtSupabase;
  if(!supabase||!['admin','staff'].includes(profile?.role))return {skipped:true,reason:'no_internal_session'};
  const x=extractFenie(await readPdf(file),file);
  if(!x.cups||!x.invoiceNumber||!x.period.start||!x.powerReliable)return {skipped:true,reason:'source_incomplete'};
  const ui=await waitForMainRow(x.cups,x.periodText);
  if(!ui)return {skipped:true,reason:'main_parser_not_found'};
  const validated=/Correcta/i.test(ui.status)&&ui.balance==='OK'&&same(ui.kwh,x.kwh,.02)&&same(ui.energy,x.energy)&&same(ui.power,x.power)&&same(ui.excess,x.excess)&&same(ui.reactive,x.reactive)&&same(ui.total,x.total);
  if(!validated)return {skipped:true,reason:'crosscheck_failed'};

  const payload={validated:true,cups:x.cups,invoice_number:x.invoiceNumber,billing_start:x.period.start,billing_end:x.period.end,billing_days:x.period.days,tariff:x.tariff,retailer:x.retailer,distributor:x.distributor,consumption_kwh:x.kwh,energy_cost_eur:x.energy,power_cost_eur:x.power,excess_cost_eur:x.excess,reactive_cost_eur:x.reactive,compensation_eur:x.compensation,social_bonus_eur:x.social,meter_rental_eur:x.rental,distributor_charges_eur:x.distributorCharges,electricity_tax_eur:x.tax,vat_eur:x.vat,igic_eur:x.igic,other_cost_eur:x.other,total_eur:x.total,accounted_eur:x.accounted,difference_eur:x.diff,average_total_eur_kwh:x.kwh?x.total/x.kwh:null,parser_version:window.IBT_PARSER_VERSION||'FENIE',validation_message:'Validado contra parser principal antes de guardar histórico',energy_periods:x.energyPeriods,power_periods:x.powerPeriods,maximeters:x.maximeterRows,adjustments:x.adjustments};
  const {data,error}=await supabase.rpc('upsert_xtra_energy_history',{p_payload:payload});if(error)throw error;return data||{ok:false};
}

async function renderSummary(){
  const supabase=window.ibtSupabase,profile=window.ibtCurrentProfile,view=$('#historicoView');
  if(!view||!supabase||!['admin','staff'].includes(profile?.role))return;
  if(view.querySelector('#historyApp')){window.IBTHistoryUI?.reload?.();return;}
  const {count,error}=await supabase.from('invoices').select('id',{count:'exact',head:true});
  if(error)return;
  if(view.querySelector('#historyApp'))return;
  view.innerHTML=`<section class="card placeholder-view"><div class="upload-icon">◷</div><h2>Histórico energético · ${PILOT}</h2><p>Solo conserva información estructurada extraída y validada. Los PDF se procesan localmente y no se almacenan.</p><strong style="font-size:2rem">${count||0}</strong><small>periodos históricos guardados</small><span id="historySyncStatus" class="status ok">Sincronización preparada</span></section>`;
}

let queue=Promise.resolve();
function enqueue(files){
 const list=[...files].filter(f=>f.name?.toLowerCase().endsWith('.pdf'));
 if(!list.length)return;
 queue=queue.then(async()=>{
  let saved=0,skipped=0,failed=0,done=0;
  historyStatus(`Histórico: 0/${list.length} · validación y guardado en curso`,'review');
  for(const file of list){
   try{const r=await persistOne(file);if(r?.ok)saved++;else skipped++;}
   catch(e){failed++;console.warn('Histórico XTRA:',file.name,e);}
   done++;
   historyStatus(`Histórico: ${done}/${list.length} · ${saved} guardados · ${skipped} omitidos · ${failed} errores`,'review');
   // Yield to input/paint without depending on an active browser tab.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  await renderSummary();
  historyStatus(`Histórico terminado: ${done}/${list.length} · ${saved} guardados · ${skipped} omitidos por validación · ${failed} errores`,failed||skipped?'review':'ok');
  window.dispatchEvent(new CustomEvent('xtra-history-updated',{detail:{saved,skipped,failed}}));
 }).catch(e=>{console.warn('Cola histórico XTRA',e);historyStatus('No se ha completado el guardado del histórico. Revisa la conexión.','review');});
}

const input=$('#fileInput');if(input)input.addEventListener('change',e=>enqueue(e.target.files),{capture:true});
const dz=$('#dropZone');if(dz)dz.addEventListener('drop',e=>enqueue(e.dataTransfer?.files||[]),{capture:true});
window.addEventListener('ibt-role-changed',()=>setTimeout(renderSummary,0));
window.addEventListener('DOMContentLoaded',()=>setTimeout(renderSummary,0));
window.XtraHistory={refresh:renderSummary,mode:'structured-history-only'};