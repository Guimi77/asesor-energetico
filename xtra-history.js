import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const PILOT='GRUPO XTRA';
const COMPLETENESS_VERSION='fenie-2026.09.09.2';
const $=s=>document.querySelector(s);
const norm=v=>String(v??'').trim();
const clean=v=>norm(v).replace(/\s+/g,' ');
const cleanKey=v=>norm(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const cupsKey=v=>{const x=cleanKey(v);return x.startsWith('ES')&&x.length>=20?x.slice(0,20):x};
const num=s=>{if(s==null)return 0;let x=String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(x)||0};
const euros=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€(?!\s*\/)/g)].map(m=>num(m[1]));
const lastEuro=s=>{const a=euros(s);return a.length?a.at(-1):0};
const round2=n=>Math.round((Number(n)||0)*100)/100;
const same=(a,b,t=.05)=>Math.abs((Number(a)||0)-(Number(b)||0))<=t;
function lines(items){
const pts=items.filter(i=>i.str?.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:i.transform[5]})).sort((a,b)=>b.y-a.y||a.x-b.x),groups=[];
for(const q of pts){let g=groups.find(v=>Math.abs(v.y-q.y)<=2.2);if(!g)groups.push(g={y:q.y,a:[]});g.a.push(q)}
return groups.sort((a,b)=>b.y-a.y).map(g=>g.a.sort((a,b)=>a.x-b.x).map(v=>v.s).join(' ').replace(/\s+/g,' ').trim());
}
const find=(a,re)=>a.find(x=>re.test(x))||'';
function section(a,start,ends){const i=a.findIndex(x=>start.test(x));if(i<0)return[];let j=a.length;for(let k=i+1;k<a.length;k++){if(ends.some(r=>r.test(a[k]))){j=k;break}}return a.slice(i,j)}
function prow(a,p){return a.find(x=>new RegExp(`^\\s*P${p}:?\\b`,'i').test(x))||''}
function sectionTotal(a){let n=0;for(let p=1;p<=6;p++){const ev=euros(prow(a,p));if(!ev.length)continue;n+=p===1&&ev.length>=2?ev.at(-2):ev.at(-1)}return round2(n)}
function afterLabel(line,re){return norm(String(line||'').replace(re,'').replace(/^\s*:?\s*/,''))}
function dateIn(line){return ((String(line||'').match(/\d{2}\/\d{2}\/\d{4}/)||[])[0])||''}
function isoDate(s){const m=norm(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:''}
function parsePeriod(s){const m=norm(s).match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})(?:\s*\((\d+)\s*d[ií]as\))?/i);return m?{start:isoDate(m[1]),end:isoDate(m[2]),days:m[3]?Number(m[3]):null}:{start:'',end:'',days:null}}
function status(value,present=true){return value!==''&&value!=null?'extracted':present?'unreliable':'not_present'}
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
function excessRows(a){
const out=[];
for(let p=1;p<=6;p++){
const line=prow(a,p);if(!line)continue;
const m=line.match(/P[1-6]:?\s*([\d.,-]+)\s*[x×]\s*([\d.,-]+)\s*=\s*(-?[\d.]+,\d{2})\s*€/i);
if(m)out.push({period:p,excess_kw:num(m[1]),unit_price:num(m[2]),amount_eur:num(m[3])});
}
return out;
}
function reactiveRows(a){
const out=[];
for(let p=1;p<=6;p++){
const line=prow(a,p);if(!line)continue;
let m=line.match(/P[1-6]:?\s*([\d.,-]+)\s*kVArh\s+([\d.,-]+)\s+([\d.,-]+)\s*kVArh\s*[x×]\s*([\d.,-]+)\s*€\s*\/\s*kVArh\s*=\s*(-?[\d.]+,\d{2})\s*€/i);
if(m){out.push({period:p,reactive_kvarh:num(m[1]),consumption_kvarh:num(m[1]),cos_phi:num(m[2]),excess_kvarh:num(m[3]),unit_price_eur_kvarh:num(m[4]),amount_eur:num(m[5])});continue}
m=line.match(/P[1-6]:?[\s\S]*?([\d.,-]+)\s*kVArh\s*[x×]\s*([\d.,-]+)\s*€\s*\/\s*kVArh\s*=\s*(-?[\d.]+,\d{2})\s*€/i);
if(m)out.push({period:p,reactive_kvarh:null,consumption_kvarh:null,cos_phi:null,excess_kvarh:num(m[1]),unit_price_eur_kvarh:num(m[2]),amount_eur:num(m[3])});
}
return out;
}
function taxRows(a){
const out=[];
for(const line of a){
if(!/^\s*(IVA|IGIC)\b/i.test(line))continue;
const type=/^\s*IGIC\b/i.test(line)?'IGIC':'IVA';
const label=(line.match(/^\s*((?:IVA|IGIC)(?:\s+(?:Reducido|Normal))?)/i)||[])[1]||type;
const rate=(line.match(/([\d.,]+)\s*%/)||[])[1];
const base=(line.match(/s\/\s*(-?[\d.]+,\d{2})/i)||[])[1];
const amount=lastEuro(line);
out.push({tax_type:type,label:norm(label),rate_pct:rate?num(rate):null,taxable_base_eur:base?num(base):null,amount_eur:amount});
}
return out;
}
function rightsDetail(a,total){
  const signal=/Derechos (?:de )?(Verificaci[oó]n|Extensi[oó]n|Acceso|Enganche|Actuaci[oó]n Equipos) Distribuidora/ig;
  const block=[];let active=false;
  for(const line of a){
    signal.lastIndex=0;
    if(signal.test(line)){active=true;block.push(line);continue}
    if(active){if(/^(?:Impuesto electricidad|Alquiler Equipo|IVA\b|IGIC\b|TOTAL FACTURA)/i.test(line))break;block.push(line)}
  }
  const text=clean(block.join(' '));
  if(!text)return {text:'',items:[],status:'not_present',residual:0};
  signal.lastIndex=0;
  const matches=[...text.matchAll(signal)],items=[];
  for(let i=0;i<matches.length;i++){
    const m=matches[i],start=m.index??0,end=i+1<matches.length?(matches[i+1].index??text.length):text.length;
    const segment=text.slice(start,end),amountMatch=segment.match(/\((-?[\d.]+,\d{2})\s*€\)/i);
    if(!amountMatch)continue;
    const legal=(segment.match(/\(([^\)]*(?:R\.D\.|Art\.)[^\)]*)\)/i)||[])[1]||null;
    items.push({concept:`Derechos ${m[1]} Distribuidora`,amount_eur:num(amountMatch[1]),category:'distributor_right',legal_reference:legal,source_text:segment.slice(0,220)});
  }
  if(!items.length&&matches.length===1&&Number(total)!==0){
    const segment=text.slice(matches[0].index??0),legal=(segment.match(/\(([^\)]*(?:R\.D\.|Art\.)[^\)]*)\)/i)||[])[1]||null;
    items.push({concept:`Derechos ${matches[0][1]} Distribuidora`,amount_eur:Number(total),category:'distributor_right',legal_reference:legal,source_text:segment.slice(0,220)});
  }
  const known=round2(items.reduce((sum,item)=>sum+Number(item.amount_eur||0),0));
  const residual=round2(Number(total||0)-known);
  if(Math.abs(residual)>.05){
    items.push({concept:'Derecho distribuidora no identificado',amount_eur:residual,category:'distributor_right_unidentified',legal_reference:null,source_text:text.slice(0,220)});
    return {text,items,status:'needs_review',residual};
  }
  return {text,items,status:items.length?'extracted':'needs_review',residual:0};
}
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
const reading=window.IBTReadingStatus?.classify?.(text)||{status:'unknown',sourceLabel:null};
const invoiceLine=find(a,/(?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)/i);
const invoiceNumber=((invoiceLine.match(/(?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)\s*:?\s*([A-Z0-9][A-Z0-9._\/-]*)/i)||text.match(/(?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)\s*:?\s*([A-Z0-9][A-Z0-9._\/-]*)/i)||[])[1])||'';
const cups=((find(a,/CUPS:/i).match(/ES[A-Z0-9]{16,24}/i)||text.match(/ES[A-Z0-9]{16,24}/i)||[])[0])||'';
const tariff=((find(a,/Tarifa:/i).match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||text.match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||[])[1])||'';
const periodText=((find(a,/Periodo Facturaci[oó]n:/i).match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}(?:\s*\(\d+\s*d[ií]as\))?/i)||[])[0])||'';
const period=parsePeriod(periodText),total=lastEuro(find(a,/TOTAL FACTURA/i));
const holderLine=find(a,/Raz[oó]n Social\s*:/i),taxIdLine=find(a,/NIF\s*\/\s*CIF\s*:/i),addressLine=find(a,/Dir\.\s*Suministro\s*:/i),accessLine=find(a,/Contrato Acceso\s*:/i);
const holderName=afterLabel(holderLine,/.*?Raz[oó]n Social\s*:/i),holderTaxId=afterLabel(taxIdLine,/.*?NIF\s*\/\s*CIF\s*:/i).split(/\s+/)[0]||'',sourceSupplyAddress=afterLabel(addressLine,/.*?Dir\.\s*Suministro\s*:/i);
const accessContract=((afterLabel(accessLine,/.*?Contrato Acceso\s*:/i).match(/[A-Z0-9._-]+/i)||[])[0])||'';
const issueDate=isoDate(dateIn(find(a,/Fecha de Factura\s*:/i)));
const contract=((text.match(/\b(CO-\d{4}-[A-Z0-9._-]+)\b/i)||[])[1])||'';
const contractType=afterLabel(find(a,/Tipo Contrato\s*:/i),/.*?Tipo Contrato\s*:/i);
const contractEndDate=isoDate(dateIn(find(a,/Fecha fin del contrato de suministro\s*:/i)));
const meterLine=find(a,/Alquiler Equipo medida.*N[º°o.]?\s*Contador/i),meterNumber=((meterLine.match(/N[º°o.]?\s*Contador\s*([A-Z0-9._-]+)/i)||[])[1])||'';
const es=section(a,/T[eé]rmino (?:de )?energ[ií]a(?: variable)?/i,[/T[eé]rmino de potencia/i]),periods={},energyPeriods=[];let kwh=0,energyPricesReliable=true;
for(let p=1;p<=6;p++){
const l=prow(es,p);if(!l)continue;
const km=l.match(/([\d.]+,\d{2})\s*kWh/i),consumption=km?num(km[1]):0,ev=euros(l),cost=ev.length?(ev.length>1?ev.at(-2):ev[0]):0;
const pr=[...l.matchAll(/([\d.,]+)\s*€\s*\/\s*kWh/gi)].map(m=>num(m[1]));if(pr.length<4)energyPricesReliable=false;
const price=pr.at(-1)||0;periods[`P${p}`]={consumption,cost,price};
energyPeriods.push({period:p,consumption_kwh:consumption,energy_cost_eur:cost,unit_price_eur_kwh:price||null,toll_price_eur_kwh:pr[0]??null,charges_price_eur_kwh:pr[1]??null,retailer_price_eur_kwh:pr[2]??null});kwh+=consumption;
}
const energy=round2(Object.values(periods).reduce((s,x)=>s+x.cost,0));
const ps=section(a,/T[eé]rmino de potencia/i,[/Excesos? de Potencia/i,/Energ[ií]a reactiva/i,/Bono social/i]),pd=powerDetails(ps),power=pd.value;
let powerPricesReliable=pd.reliable;
const powerPeriods=pd.reliable?pd.entries.map((e,i)=>{
const periodNo=pd.labels[i],line=prow(ps,periodNo),pr=[...line.matchAll(/([\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a/gi)].map(m=>num(m[1]));if(pr.length<4)powerPricesReliable=false;
return {period:periodNo,contracted_kw:e.contractedKw,billed_power_eur:e.amount,unit_price_eur_kw_day:pr.at(-1)??null,toll_price_eur_kw_day:pr[0]??null,charges_price_eur_kw_day:pr[1]??null,retailer_price_eur_kw_day:pr[2]??null};
}):[];
const excessSection=section(a,/Excesos? de Potencia/i,[/Energ[ií]a reactiva/i,/Bono social/i,/Impuesto electricidad/i]),excess=sectionTotal(excessSection),excessPeriods=excessRows(excessSection);
const reactiveSection=section(a,/Energ[ií]a reactiva/i,[/Compensaci[oó]n Excedente/i,/Regularizaci[oó]n/i,/Bono social/i,/Impuesto electricidad/i]),reactive=sectionTotal(reactiveSection),reactivePeriods=reactiveRows(reactiveSection);
const mx=maximeters(d.raw?.[1]||[]),maximeterRows=Object.keys(mx).filter(k=>/^P\d$/.test(k)).map(k=>({period:Number(k.slice(1)),maximeter_kw:mx[k],reliable:!!mx._reliable,source:'FENIE · tabla maxímetro'}));
let compensation=lastEuro(find(a,/Compensaci[oó]n Excedente/i));if(compensation>0)compensation=-compensation;
const social=lastEuro(find(a,/Bono social/i)),tax=lastEuro(find(a,/Impuesto electricidad/i)),rental=lastEuro(find(a,/Alquiler Equipo medida/i));
let integratorAdjustment=0;const ii=a.findIndex(l=>/Ajuste por Integrador/i.test(l));if(ii>=0){const v=euros(a.slice(ii,ii+5).join(' ')),neg=v.find(x=>x<0);integratorAdjustment=neg??(v.length===1?v[0]:0)}
const regularizationReactive=lastEuro(find(a,/Regularizaci[oó]n\s+Reactiva/i));
const taxLines=taxRows(a),vat=round2(taxLines.filter(x=>x.tax_type==='IVA').reduce((s,x)=>s+x.amount_eur,0)),igic=round2(taxLines.filter(x=>x.tax_type==='IGIC').reduce((s,x)=>s+x.amount_eur,0));
let db='';const rightsRe=/Derechos (?:de )?(?:Verificaci[oó]n|Extensi[oó]n|Acceso|Enganche|Actuaci[oó]n Equipos) Distribuidora/i,di=a.findIndex(l=>rightsRe.test(l));if(di>=0)for(let i=di;i<Math.min(a.length,di+8);i++){if(i>di&&/^(?:Impuesto electricidad|Alquiler Equipo|IVA\b|IGIC\b|TOTAL FACTURA)/i.test(a[i]))break;db+=' '+a[i]}const dv=euros(db),distributorCharges=dv.length?Math.max(...dv):0;
const rights=rightsDetail(a,distributorCharges);
const other=round2(social+rental+integratorAdjustment+regularizationReactive),accounted=round2(energy+power+excess+reactive+compensation+other+tax+vat+igic+distributorCharges),diff=round2(total-accounted);
const distributor=((find(a,/Empresa Distribuidora\s*:/i).replace(/.*?Empresa Distribuidora\s*:\s*/i,'').trim())||'');
const adjustments=[];
if(integratorAdjustment)adjustments.push({concept:'Ajuste por Integrador',amount_eur:integratorAdjustment,category:'adjustment'});
if(regularizationReactive)adjustments.push({concept:'Regularización Reactiva',amount_eur:regularizationReactive,category:'reactive_adjustment'});

const reactiveApplicable=!/^2\.0TD$/i.test(tariff);
const completeness={
version:COMPLETENESS_VERSION,
invoice_number:status(invoiceNumber),cups:status(cups),billing_period:status(period.start&&period.end),issue_date:status(issueDate),
holder_name:status(holderName),holder_tax_id:status(holderTaxId),supply_address:status(sourceSupplyAddress),access_contract_number:status(accessContract),
contract_number:status(contract),contract_type:status(contractType,!!find(a,/Tipo Contrato\s*:/i)),contract_end_date:status(contractEndDate),meter_number:status(meterNumber),
tariff:status(tariff),distributor:status(distributor),energy_periods:energyPeriods.length?'extracted':'unreliable',energy_price_components:energyPricesReliable?'extracted':'unreliable',
power_periods:pd.reliable?'extracted':'unreliable',power_price_components:powerPricesReliable?'extracted':'unreliable',maximeters:mx._reliable?'extracted':'unreliable',
excess_detail:excessSection.length?(excessPeriods.length?'extracted':'unreliable'):'not_present',
reactive_detail:reactiveSection.length?(reactivePeriods.length?'extracted':'unreliable'):(reactiveApplicable?'unreliable':'not_applicable'),
compensation:find(a,/Compensaci[oó]n Excedente/i)?'extracted':'not_present',social_bonus:find(a,/Bono social/i)?'extracted':'unreliable',
meter_rental:find(a,/Alquiler Equipo medida/i)?'extracted':'unreliable',electricity_tax:find(a,/Impuesto electricidad/i)?'extracted':'unreliable',
tax_lines:taxLines.length?'extracted':'unreliable',distributor_rights:rights.status,
integrator_adjustment:find(a,/Ajuste por Integrador/i)?'extracted':'not_present',reactive_regularization:find(a,/Regularizaci[oó]n\s+Reactiva/i)?'extracted':'not_present'
};
const assessment=Object.values(completeness).some(v=>v==='unreliable'||v==='needs_review')?'needs_review':'complete';
return {file:file.name,invoiceNumber,cups,tariff,periodText,period,total,kwh,energy,power,excess,reactive,compensation,social,rental,tax,vat,igic,distributorCharges,other,accounted,diff,energyPeriods,powerPeriods,maximeterRows,excessPeriods,reactivePeriods,taxLines,adjustments,distributorRights:rights.items,distributor,retailer:'FENIE ENERGIA',contract,powerReliable:pd.reliable,holderName,holderTaxId,sourceSupplyAddress,accessContract,issueDate,contractType,contractEndDate,meterNumber,readingStatus:reading.status,readingSourceLabel:reading.sourceLabel,completeness,assessment};
}
function parseUiNumber(s){return num(String(s||'').replace(/\s*€/g,''))}
function rowSnapshot(cups,periodText){
for(const tr of document.querySelectorAll('#resultsBody tr')){const c=tr.children;if(c.length<16)continue;if(cupsKey(c[2].textContent)!==cupsKey(cups))continue;if(norm(c[3].textContent)!==norm(periodText))continue;return {status:norm(c[0].textContent),kwh:parseUiNumber(c[5].textContent),energy:parseUiNumber(c[6].textContent),power:parseUiNumber(c[7].textContent),excess:parseUiNumber(c[8].textContent),reactive:parseUiNumber(c[9].textContent),total:parseUiNumber(c[12].textContent),balance:norm(c[13].textContent)}}
return null;
}
async function waitForMainRow(cups,periodText){for(let i=0;i<600;i++){const r=rowSnapshot(cups,periodText);if(r)return r;await new Promise(r=>setTimeout(r,100))}return null}
function historyStatus(text,type='ok'){
let el=$('#historySyncStatus');
if(!el){const host=$('#dropZone');if(!host)return;el=document.createElement('div');el.id='historySyncStatus';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.style.cssText='grid-column:1/-1;padding:8px 12px;margin-top:8px';host.appendChild(el)}
el.textContent=text;el.className=`status ${type==='ok'?'ok':'review'}`;
}
async function persistOne(file){
const profile=window.ibtCurrentProfile,supabase=window.ibtSupabase;
if(!supabase||!['admin','staff'].includes(profile?.role))return {skipped:true,reason:'no_internal_session'};
const x=extractFenie(await readPdf(file),file);
if(!x.cups||!x.invoiceNumber||!x.period.start||!x.powerReliable)return {skipped:true,reason:'source_incomplete'};
const ui=await waitForMainRow(x.cups,x.periodText);if(!ui)return {skipped:true,reason:'main_parser_not_found'};
const validated=/Correcta/i.test(ui.status)&&ui.balance==='OK'&&same(ui.kwh,x.kwh,.02)&&same(ui.energy,x.energy)&&same(ui.power,x.power)&&same(ui.excess,x.excess)&&same(ui.reactive,x.reactive)&&same(ui.total,x.total);
if(!validated)return {skipped:true,reason:'crosscheck_failed'};
const payload={validated:true,cups:x.cups,invoice_number:x.invoiceNumber,billing_start:x.period.start,billing_end:x.period.end,issue_date:x.issueDate,billing_days:x.period.days,tariff:x.tariff,retailer:x.retailer,distributor:x.distributor,
source_holder_name:x.holderName,source_holder_tax_id:x.holderTaxId,source_supply_address:x.sourceSupplyAddress,access_contract_number:x.accessContract,contract_number:x.contract,contract_type:x.contractType,contract_end_date:x.contractEndDate,meter_number:x.meterNumber,reading_status:x.readingStatus,reading_source_label:x.readingSourceLabel,
consumption_kwh:x.kwh,energy_cost_eur:x.energy,power_cost_eur:x.power,excess_cost_eur:x.excess,reactive_cost_eur:x.reactive,compensation_eur:x.compensation,social_bonus_eur:x.social,meter_rental_eur:x.rental,distributor_charges_eur:x.distributorCharges,electricity_tax_eur:x.tax,vat_eur:x.vat,igic_eur:x.igic,other_cost_eur:x.other,total_eur:x.total,accounted_eur:x.accounted,difference_eur:x.diff,average_total_eur_kwh:x.kwh?x.total/x.kwh:null,
parser_version:window.IBT_PARSER_VERSION||'FENIE',validation_message:'Validado contra parser principal antes de guardar histórico',completeness_assessment_status:x.assessment,source_completeness:x.completeness,
energy_periods:x.energyPeriods,power_periods:x.powerPeriods,maximeters:x.maximeterRows,excess_periods:x.excessPeriods,reactive_periods:x.reactivePeriods,tax_lines:x.taxLines,distributor_rights:x.distributorRights,adjustments:x.adjustments};
const {data,error}=await supabase.rpc('upsert_xtra_energy_history',{p_payload:payload});if(error)throw error;
const result=data||{ok:false};
if(result?.ok){
  try{
    const {data:readingData,error:readingError}=await supabase.rpc('enrich_xtra_invoice_reading_status',{p_payload:{validated:true,cups:x.cups,invoice_number:x.invoiceNumber,billing_start:x.period.start,billing_end:x.period.end,consumption_kwh:x.kwh,total_eur:x.total,reading_status:x.readingStatus,reading_source_label:x.readingSourceLabel}});
    if(readingError)console.warn('Calidad lectura XTRA:',file.name,readingError);
    else if(readingData?.ok===false)console.warn('Calidad lectura XTRA:',file.name,readingData);
  }catch(readingError){console.warn('Calidad lectura XTRA:',file.name,readingError)}
}
return result;
}
async function renderSummary(){
const supabase=window.ibtSupabase,profile=window.ibtCurrentProfile,view=$('#historicoView');
if(!view||!supabase||!['admin','staff'].includes(profile?.role))return;
if(view.querySelector('#historyApp')){window.IBTHistoryUI?.reload?.();return;}
const {count,error}=await supabase.from('invoices').select('id',{count:'exact',head:true});if(error)return;if(view.querySelector('#historyApp'))return;
view.innerHTML=`<section class="card placeholder-view"><div class="upload-icon">◷</div><h2>Histórico energético · ${PILOT}</h2><p>Solo conserva información estructurada extraída y validada. Los PDF se procesan localmente y no se almacenan.</p><strong style="font-size:2rem">${count||0}</strong><small>periodos históricos guardados</small><span id="historySyncStatus" class="status ok">Sincronización preparada</span></section>`;
}
let queue=Promise.resolve();
function enqueue(files){
const list=[...files].filter(f=>f.name?.toLowerCase().endsWith('.pdf'));if(!list.length)return;
queue=queue.then(async()=>{
let saved=0,skipped=0,failed=0,done=0,complete=0,review=0;
historyStatus(`Histórico: 0/${list.length} · validación y guardado en curso`,'review');
for(const file of list){
try{const r=await persistOne(file);if(r?.ok){saved++;if(r.completeness==='complete')complete++;else review++;}else skipped++;}
catch(e){failed++;console.warn('Histórico XTRA:',file.name,e)}
done++;historyStatus(`Histórico: ${done}/${list.length} · ${saved} guardados · ${complete} completos · ${review} revisar · ${skipped} omitidos · ${failed} errores`,'review');
await new Promise(resolve=>setTimeout(resolve,0));
}
await renderSummary();
historyStatus(`Histórico terminado: ${done}/${list.length} · ${saved} guardados · ${complete} completos · ${review} con detalle a revisar · ${skipped} omitidos · ${failed} errores`,failed||skipped||review?'review':'ok');
window.dispatchEvent(new CustomEvent('xtra-history-updated',{detail:{saved,skipped,failed,complete,review}}));
}).catch(e=>{console.warn('Cola histórico XTRA',e);historyStatus('No se ha completado el guardado del histórico. Revisa la conexión.','review')});
}
const input=$('#fileInput');if(input)input.addEventListener('change',e=>enqueue(e.target.files),{capture:true});
const dz=$('#dropZone');if(dz)dz.addEventListener('drop',e=>enqueue(e.dataTransfer?.files||[]),{capture:true});
window.addEventListener('ibt-role-changed',()=>setTimeout(renderSummary,0));
window.addEventListener('DOMContentLoaded',()=>setTimeout(renderSummary,0));
window.XtraHistory={refresh:renderSummary,mode:'structured-history-only',completenessVersion:COMPLETENESS_VERSION};
