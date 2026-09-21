(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTRepsolParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REVISION='repsol-2026.09.21.1';
  const RETAILER='Repsol Comercializadora de Electricidad y Gas, S.L.U.';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const num=v=>{
    if(v==null||v==='')return null;
    let s=String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');
    if(!s||s==='-'||s==='.')return null;
    const n=Number(s);return Number.isFinite(n)?n:null;
  };
  const pagesOf=d=>(d?.pages||[]).map(page=>(page||[]).map(clean).filter(Boolean));
  const flat=pages=>pages.flat();
  const textOf=lines=>(lines||[]).join('\n');
  const normalizeCups=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const moneyValues=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastMoney=s=>{const a=moneyValues(s);return a.length?a.at(-1):null;};
  const toIso=value=>{
    const m=String(value||'').match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    return m?`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`:'';
  };
  const normalizeDate=value=>{
    const m=String(value||'').match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    return m?`${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${m[3]}`:'';
  };
  const tariffOf=text=>((String(text||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i)||[])[1]||'—').replace(/\s+/g,'').toUpperCase();
  const expectedPowerPeriods=tariff=>/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;
  const expectedEnergyPeriods=tariff=>/^2\.0TD$/i.test(tariff)?3:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;

  function detect(value){
    const text=Array.isArray(value)?value.flat(Infinity).join('\n'):value?.text||textOf(flat(pagesOf(value)))||String(value||'');
    return /Repsol\s+Comercializadora\s+de\s+Electricidad\s+y\s+Gas\s*,?\s*S\.L\.U\./i.test(text)
      && /\bCUPS\b/i.test(text)
      && /(?:TOTAL\s+FACTURA|Total\s+factura)/i.test(text)
      && /(?:Factura\s+de\s+luz|FACTURACI[ÓO]N\s+TOTAL\s+DEL\s+PERIODO|DATOS\s+DEL\s+CLIENTE\s+Y\s+DEL\s+PUNTO\s+DE\s+SUMINISTRO)/i.test(text);
  }

  function variant(value){
    const text=value?.text||String(value||'');
    if(/EL\s+DESGLOSE\s+DE\s+TU\s+FACTURA/i.test(text)||/Esta\s+es\s+tu\s+factura\s+de\s+luz/i.test(text))return'modern';
    if(/FACTURACI[ÓO]N\s+TOTAL\s+DEL\s+PERIODO/i.test(text)||/DATOS\s+DEL\s+CLIENTE\s+Y\s+DEL\s+PUNTO\s+DE\s+SUMINISTRO/i.test(text))return'legacy';
    return'unknown';
  }

  function valueAfterLabel(lines,re,lookahead=3){
    for(let i=0;i<(lines||[]).length;i++){
      const line=String(lines[i]||'');
      const m=line.match(re);if(!m)continue;
      const rest=clean(line.slice((m.index||0)+m[0].length).replace(/^\s*[:;-]?\s*/,''));
      if(rest)return rest;
      for(let j=i+1;j<Math.min(lines.length,i+1+lookahead);j++){
        const q=clean(lines[j]);if(q)return q;
      }
    }
    return'';
  }

  function collectAfter(lines,startRe,stopRes,max=8){
    const start=(lines||[]).findIndex(l=>startRe.test(String(l||'')));if(start<0)return'';
    const out=[];
    for(let i=start;i<Math.min(lines.length,start+max);i++){
      let q=clean(lines[i]);
      if(i===start)q=clean(q.replace(startRe,'').replace(/^\s*[:;-]?\s*/,''));
      else q=clean(q.replace(/^Suministro\s*:\s*/i,''));
      if(!q)continue;
      if(i>start&&stopRes.some(re=>re.test(q)))break;
      out.push(q);
    }
    return clean(out.join(' '));
  }

  function parsePlace(address){
    const s=clean(address),m=s.match(/\b(\d{5})\s+(.+?)\s*\(?([A-ZÁÉÍÓÚÜÑÇ ]{3,})\)?\s*$/i);
    if(!m)return{city:'',province:''};
    let city=clean(m[2]).replace(/[,(\s]+$/,'');
    const internal=city.lastIndexOf(')');if(internal>=0&&clean(city.slice(internal+1)))city=clean(city.slice(internal+1));
    return{city,province:clean(m[3]).replace(/[()]/g,'')};
  }

  function parsePeriod(text){
    const s=String(text||'');
    let m=s.match(/Periodo\s+de\s+facturaci[oó]n\s*:?[\s\S]{0,90}?(\d{1,2}[./]\d{1,2}[./]\d{4})\s*-\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i);
    if(!m)m=s.match(/Periodo\s+de\s+Facturaci[oó]n\s*:\s*del\s*(\d{1,2}[./]\d{1,2}[./]\d{4})\s+al\s+(\d{1,2}[./]\d{1,2}[./]\d{4})/i);
    if(!m)return{label:'Por identificar',start:'',end:'',days:null};
    const startLabel=normalizeDate(m[1]),endLabel=normalizeDate(m[2]);
    let days=null;const dm=s.match(/D[ií]as\s+facturados\s*:?\s*(\d{1,3})\s*D[ií]as/i);
    if(dm)days=Number(dm[1]);
    if(days==null){const a=new Date(toIso(m[1])+'T00:00:00Z'),b=new Date(toIso(m[2])+'T00:00:00Z');if(Number.isFinite(+a)&&Number.isFinite(+b))days=Math.round((b-a)/86400000);}
    return{label:`${startLabel} - ${endLabel}${days!=null?` (${days} días)`:''}`,start:toIso(m[1]),end:toIso(m[2]),days};
  }

  function parseIdentity(pages,mode){
    const p1=pages[0]||[],p3=pages[2]||[],all=flat(pages),text=textOf(all),p1text=textOf(p1),p3text=textOf(p3);
    const cups=normalizeCups((text.match(/\bES\s*\d{16}\s*[A-Z]{2}(?:\s*[A-Z0-9]{2})?\b/i)||[])[0]||'');
    let holder='',taxId='',invoiceNumber='',contract='',issueDate='',supplyAddress='';
    if(mode==='legacy'){
      holder=clean((p1text.match(/Titular\s*:\s*([^\n]+)/i)||[])[1]||'');
      taxId=clean((p1text.match(/CIF\s*\/\s*NIF\s*:\s*([A-Z0-9-]+)/i)||[])[1]||'');
      contract=clean((p1text.match(/N[º°o.]?\s*Contrato\s*:\s*(\d{6,20})/i)||[])[1]||'');
      const inv=p1text.match(/Fecha\s+y\s+N[º°o.]?\s*Factura\s*:\s*(\d{1,2}[./]\d{1,2}[./]\d{4})\s*\/\s*(\d{6,20})/i);if(inv){issueDate=toIso(inv[1]);invoiceNumber=inv[2];}
      supplyAddress=collectAfter(p1,/Direcci[oó]n\s+de\s*(?:Suministro)?\s*:?/i,[/^Tipo\s*:/i,/^CUPS\s*:/i,/^Comercializadora\s*:/i,/^TOTAL\s+FACTURA/i],7);
    }else{
      const holderMatch=p3text.match(/Repsol\s+Comercializadora\s+de\s+Electricidad\s+y\s+Gas\s*,?\s*S\.L\.U\.\s+Mercado\s+libre\s+([^\n]+)/i);
      if(holderMatch)holder=clean(holderMatch[1]);
      if(!holder){const start=p1.findIndex(l=>/Esta\s+es\s+tu\s+factura\s+de\s+luz/i.test(l));if(start>=0){for(let i=start+1;i<Math.min(p1.length,start+7);i++){const q=clean(p1[i]);if(q&&!/€|Cup[oó]n|Total\s+a\s+pagar|T[eé]rmino\s+fijo|Energ[ií]a|Otros\s+conceptos|Impuestos/i.test(q)&&/^[A-ZÁÉÍÓÚÜÑÇÀÈÒÏa-záéíóúüñçàèòï' .-]{5,}$/u.test(q)){holder=q;break;}}}
      }
      const dniLabel=p3.findIndex(l=>/\bDNI\b/i.test(l));if(dniLabel>=0){const scope=p3.slice(dniLabel,Math.min(p3.length,dniLabel+3)).join(' '),ids=[...scope.matchAll(/\b(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/gi)];if(ids.length)taxId=ids.at(-1)[0].toUpperCase();}
      contract=clean((text.match(/N[º°o.]?\s*(?:de\s+)?contrato(?!\s+de\s+acceso)\s*:?\s*(\d{6,20})/i)||[])[1]||'');
      invoiceNumber=clean((text.match(/N[º°o.]?\s*(?:de\s+)?factura\s*:?\s*(\d{6,20})/i)||[])[1]||'');
      const im=text.match(/Fecha\s+de\s+emisi[oó]n\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i);issueDate=im?toIso(im[1]):'';
      const ai=p1.findIndex(l=>/Direcci[oó]n\s+de\s+suministro/i.test(l));if(ai>=0){const parts=[];const prev=clean(p1[ai-1]||'');if(/^(?:C\/|CL\b|CALLE\b|CARRER\b|AV\b|AVDA\b|PASEO\b|PLAZA\b|CTRA\b)/i.test(prev))parts.push(prev);let current=clean(p1[ai].replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:?/i,''));if(current)parts.push(current);for(let i=ai+1;i<Math.min(p1.length,ai+3);i++){let q=clean(p1[i]);q=clean(q.split(/Accede\s+a\s+tus\s+beneficios|TU\s+CONSUMO/i)[0]);if(q)parts.push(q);}supplyAddress=clean(parts.join(' '));}
    }
    const place=parsePlace(supplyAddress);
    return{holder,taxId,cups,invoiceNumber:invoiceNumber||'Por identificar',contract,issueDate,supplyAddress,supplyCity:place.city,supplyProvince:place.province};
  }

  function parseContractMeta(pages,mode){
    const all=flat(pages),text=textOf(all),p1=pages[0]||[],p3=pages[2]||[],p3text=textOf(p3);
    const tariff=tariffOf(text);
    let distributor='',accessContract='',meterNumber='',renewalDate='',contractType='';
    if(mode==='legacy'){
      const p1text=textOf(p1);
      distributor=clean((p1text.match(/Distribuidora\s*:\s*([^\n]+)/i)||[])[1]||'');
      accessContract=clean((p1text.match(/Contrato\s+de\s+acceso\s*:\s*([A-Z0-9-]+)/i)||[])[1]||'');
      meterNumber=clean((p1text.match(/N[º°o.]?\s+de\s+contador\s*:\s*(\d{5,20})/i)||[])[1]||'');
      const end=p1text.match(/Fecha\s+final\s+contrato\s*:\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i);renewalDate=end?normalizeDate(end[1]):'';
      contractType=clean((p1text.match(/Tipo\s*:\s*([^\n]*?)(?=\s+N[º°o.]?\s*Contrato\s*:|$)/i)||[])[1]||'Mercado libre');
    }else{
      const di=p3.findIndex(l=>/^Distribuidora\b/i.test(l));if(di>=0){const parts=[];for(let i=di+1;i<Math.min(p3.length,di+7);i++){let q=clean(p3[i]);if(/N[º°o.]?\s+de\s+contador/i.test(q))break;if(/^(?:Localizador\s+de\s+pago|CPR:|Emisor:|Referencia:|Identificaci[oó]n:)/i.test(q))continue;q=clean(q.split(/\bdistribuci[oó]n\b/i)[0]);q=clean(q.split(/\b(?:2\.0TD|3\.0TD|6\.[1-4]TD)\b/i)[0]);q=clean(q.replace(/\s+\d+\s*$/,''));if(q&&/^[A-ZÁÉÍÓÚÜÑÇ .,&-]+$/i.test(q)&&!/^Forma\s+de\s+pago/i.test(q))parts.push(q);}distributor=clean(parts.join(' '));}
      const pair=p3text.match(/N[º°o.]?\s+de\s+contador\s+N[º°o.]?\s+contrato\s+de\s+acceso[^\n]*\n\s*(\d{5,20})\s+(\d{6,20})/i);if(pair){meterNumber=pair[1];accessContract=pair[2];}
      const end=text.match(/Fecha\s+fin\s+de\s+contrato[\s\S]{0,120}?(\d{1,2}[./]\d{1,2}[./]\d{4})/i);renewalDate=end?normalizeDate(end[1]):'';
      const tm=p3text.match(/Comercializadora\s+Tipo\s+de\s+tarifa[\s\S]{0,160}?Repsol\s+Comercializadora[^\n]*?\s+(Mercado\s+libre)\b/i);contractType=tm?clean(tm[1]):'Mercado libre';
    }
    return{tariff,distributor:clean(distributor),accessContract:clean(accessContract),meterNumber:clean(meterNumber),renewalDate,contractType:clean(contractType)};
  }

  function parseConsumption(pages,mode,totalKwh){
    const all=flat(pages),text=textOf(all),expected=3,periods={};
    let values=[];
    const marker=mode==='modern'?/Consumo\s+del\s+periodo/i:/Activa\s*:\s*Consumo\s+del\s+periodo/i;
    const idx=all.findIndex(l=>marker.test(l));
    if(idx>=0){
      const scope=all.slice(idx,Math.min(all.length,idx+7)).join(' ');
      values=[...scope.matchAll(/(-?[\d.]+(?:,\d+)?)\s*kWh/gi)].map(m=>num(m[1])).filter(v=>v!=null).slice(0,expected);
    }
    if(values.length<expected){
      const m=text.match(/(?:Activa\s*:\s*)?Consumo\s+del\s+periodo[\s\S]{0,220}?(-?[\d.]+(?:,\d+)?)\s*kWh[\s\S]{0,40}?(-?[\d.]+(?:,\d+)?)\s*kWh[\s\S]{0,40}?(-?[\d.]+(?:,\d+)?)\s*kWh/i);
      if(m)values=[num(m[1]),num(m[2]),num(m[3])];
    }
    values.forEach((v,i)=>{periods[`P${i+1}`]={consumption:v,cost:null,price:null};});
    const sum=round2(values.reduce((s,v)=>s+(Number(v)||0),0));
    const reliable=values.length===expected&&totalKwh!=null&&Math.abs(sum-totalKwh)<=.05;
    return{periods,sum,reliable};
  }

  function parsePower(pages,mode,printedPower,tariff){
    const all=flat(pages),text=textOf(all),entries=[],expected=expectedPowerPeriods(tariff)||2;
    if(mode==='modern'){
      const re=/Periodo\s*([1-6])\s+(-?[\d.]+,\d{2})\s*€\s+([\d.]+,\d+)\s*kW\s*[x×]\s*(\d+)\s*d[ií]as?\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a/gi;
      for(const m of text.matchAll(re))entries.push({period:Number(m[1]),contractedKw:num(m[3]),days:Number(m[4]),price:num(m[5]),amount:num(m[2])});
    }else{
      const re=/Potencia\s+(Punta|Valle)\s+([\d.]+,\d+)\s*kW\s*[x×]\s*(\d+)\s*d[ií]as?\s*[x×]\s*Proporcional\([^)]*\)\s*€\s*\/\s*kWa[nñ]o\s+(-?[\d.]+,\d{2})/gi;
      for(const m of text.matchAll(re))entries.push({period:/Punta/i.test(m[1])?1:2,contractedKw:num(m[2]),days:Number(m[3]),price:null,amount:num(m[4])});
    }
    const unique=[];for(const e of entries)if(!unique.some(x=>x.period===e.period))unique.push(e);unique.sort((a,b)=>a.period-b.period);
    const sum=round2(unique.reduce((s,e)=>s+(e.amount||0),0));
    const reliable=unique.length===expected&&printedPower!=null&&Math.abs(sum-printedPower)<=.03;
    const contracted={};unique.forEach(e=>{contracted[`P${e.period}`]=e.contractedKw;});
    return{value:printedPower!=null?printedPower:sum,entries:unique,contracted,reliable,message:reliable?'':unique.length!==expected?'Potencia: faltan periodos facturados':'Potencia: subtotal no cuadra con el detalle'};
  }

  function parseContracted(pages,mode,fallback){
    const text=textOf(flat(pages)),out={...fallback};
    let m=text.match(/Potencias?\s+Contratadas?\s*:\s*Punta\s*=\s*([\d.,]+)\s*kW\s*;?\s*Valle\s*=\s*([\d.,]+)\s*kW/i);
    if(!m)m=text.match(/Potencia\s+contratada[\s\S]{0,100}?Punta\s*:\s*([\d.,]+)\s*kW[\s\S]{0,60}?Valle\s*:\s*([\d.,]+)\s*kW/i);
    if(m){out.P1=num(m[1]);out.P2=num(m[2]);}
    return out;
  }

  function parseMaximeters(pages){
    const all=flat(pages),text=textOf(all);
    let m=text.match(/Potencias?\s+m[aá]x\.?\s+demandadas?\s+[uú]ltimo\s+a[nñ]o\s*:\s*Punta\s*=\s*([\d.,]+)\s*kW\s*;?\s*Valle\s*=\s*([\d.,]+)\s*kW/i);
    if(!m){const i=all.findIndex(l=>/Tu\s+potencia\s+m[aá]xima\s+demandada/i.test(l));if(i>=0){const scope=all.slice(i,Math.min(all.length,i+5)).join(' '),vals=[...scope.matchAll(/([\d.,]+)\s*kW/gi)].map(x=>x[1]);if(vals.length>=2)m=[scope,vals[0],vals[1]];}}
    return m?{P1:num(m[1]),P2:num(m[2]),_reliable:true,_source:'annual_max_demand'}:{};
  }

  function findLineAmount(lines,re){
    for(const line of lines||[]){if(!re.test(line))continue;const v=lastMoney(line);if(v!=null)return v;}return null;
  }
  function lastDecimalAmount(value){
    const values=[...String(value||'').matchAll(/(-?[\d.]+,\d{2})(?!\d)/g)].map(m=>num(m[1])).filter(v=>v!=null);return values.length?values.at(-1):null;
  }
  function findLegacyAmount(lines,re){for(const line of lines||[]){if(!re.test(line))continue;const v=lastDecimalAmount(line);if(v!=null)return v;}return null;}
  function labelAmount(text,labelRe){
    const flags=(labelRe.flags||'').replace(/g/g,'');const re=new RegExp(labelRe.source+'[^\n]{0,180}?(-?[\d.]+,\d{2})\s*€',flags.includes('i')?flags:'i'+flags);
    const m=String(text||'').match(re);return m?num(m[1]):null;
  }

  function parseModernFinancials(pages){
    const p1=pages[0]||[],p2=pages[1]||[],text=textOf(flat(pages));
    const p1text=textOf(p1),p2text=textOf(p2);
    const total=findLineAmount(p1,/Total\s+factura/i)??findLineAmount(p1,/TOTAL\s+FACTURA/i);
    const paymentTotal=findLineAmount(p1,/Total\s+a\s+pagar/i)??findLineAmount(p2,/Total\s+a\s+pagar/i);
    const benefitCredit=findLineAmount(p1,/Cup[oó]n\s+saldo\s+Waylet/i)??findLineAmount(p2,/Cup[oó]n\s+saldo\s+Waylet/i)??0;
    const power=findLineAmount(p2,/T[eé]rmino\s+fijo/i)??findLineAmount(p1,/T[eé]rmino\s+fijo/i);
    const energy=findLineAmount(p2,/^Energ[ií]a\b/i)??findLineAmount(p1,/Energ[ií]a/i);
    const otherPrinted=findLineAmount(p2,/Otros\s+conceptos/i)??findLineAmount(p1,/Otros\s+conceptos/i)??0;
    const social=findLineAmount(p2,/^Financiaci[oó]n\s+Bono\s+Social\b/i)??0;
    const rental=findLineAmount(p2,/^Alquiler\s+de\s+contador\b/i)??0;
    const tax=findLineAmount(p2,/^Impuesto\s+El[eé]ctrico\b/i)??0;
    const vat=findLineAmount(p2,/^IVA\b/i)??0;
    const residualOther=round2(otherPrinted-social-rental);
    const other=round2(social+rental+(Math.abs(residualOther)>.02?residualOther:0));
    const kwh=(text.match(/Consumo\s+en\s+este\s+periodo\s*:?\s*([\d.]+,\d+)\s*kWh/i)||[])[1];
    const energyFormula=text.match(/Consumo\s*\(P1\)\s+(-?[\d.]+,\d{2})\s*€\s+([\d.]+,\d+)\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kWh/i);
    const rate=energyFormula?num(energyFormula[3]):null;
    const totalKwh=kwh?num(kwh):(energyFormula?num(energyFormula[2]):null);
    return{total,paymentTotal,benefitCredit,power,energy,otherPrinted,other,social,rental,tax,vat,kwh:totalKwh,rate,discounts:0,service:0};
  }

  function parseLegacyFinancials(pages){
    const p1=pages[0]||[];
    const total=findLegacyAmount(p1,/^TOTAL\s+FACTURA\b/i);
    const powerP1=findLegacyAmount(p1,/^Potencia\s+Punta\b/i)??0,powerP2=findLegacyAmount(p1,/^Potencia\s+Valle\b/i)??0,power=round2(powerP1+powerP2);
    const energyLine=p1.find(l=>/^Consumo\s+/i.test(l)&&/kWh/i.test(l)&&/Proporcional/i.test(l))||'';
    const energy=lastDecimalAmount(energyLine),kwh=num((energyLine.match(/([\d.]+(?:,\d+)?)\s*kWh/i)||[])[1]);
    const social=findLegacyAmount(p1,/^Financiaci[oó]n\s+Bono\s+Social\b/i)??0;
    const rental=findLegacyAmount(p1,/^Equipos\s+de\s+medida\b/i)??0;
    const service=findLegacyAmount(p1,/^Tu\s+Asistente\s+24h\b/i)??0;
    const discounts=findLegacyAmount(p1,/^Descuento\s+Tu\s+Asistente\s+24h\b/i)??0;
    const tax=findLegacyAmount(p1,/^Impuesto\s+El[eé]ctrico\b/i)??0;
    const vat=findLegacyAmount(p1,/^IVA\b/i)??0;
    const other=round2(social+rental+service+discounts);
    return{total,paymentTotal:total,benefitCredit:0,power,energy,otherPrinted:other,other,social,rental,tax,vat,kwh,rate:null,discounts,service};
  }

  function applyEnergyRate(periods,rate){
    if(rate==null)return periods;
    const out={};for(const [key,value] of Object.entries(periods||{}))out[key]={...value,price:rate};return out;
  }

  function parse(d,file,options={}){
    const pages=pagesOf(d),all=flat(pages),text=textOf(all);if(!detect({pages,text}))return null;
    const mode=variant({text}),identity=parseIdentity(pages,mode),meta=parseContractMeta(pages,mode),period=parsePeriod(text),fin=mode==='legacy'?parseLegacyFinancials(pages):parseModernFinancials(pages);
    const consumption=parseConsumption(pages,mode,fin.kwh),powerDetail=parsePower(pages,mode,fin.power,meta.tariff),contracted=parseContracted(pages,mode,powerDetail.contracted),maximeters=parseMaximeters(pages);
    const periods=applyEnergyRate(consumption.periods,fin.rate);
    const expectedEnergy=expectedEnergyPeriods(meta.tariff),energyPeriodsComplete=expectedEnergy?Object.keys(periods).filter(k=>/^P[1-6]$/.test(k)).length===expectedEnergy:Object.keys(periods).length>0;
    const energyCostReliable=fin.energy!=null&&(mode==='legacy'||fin.rate==null||fin.kwh==null||Math.abs(round2(fin.kwh*fin.rate)-fin.energy)<=.02);
    const accounted=round2((fin.power||0)+(fin.energy||0)+(fin.other||0)+(fin.tax||0)+(fin.vat||0)),diff=fin.total==null?null:round2(fin.total-accounted),balanced=fin.total!=null&&Math.abs(diff)<=.05;
    const missing=[];
    if(!identity.holder)missing.push('titular');if(!identity.cups)missing.push('CUPS');if(identity.invoiceNumber==='Por identificar')missing.push('nº factura');if(period.label==='Por identificar')missing.push('periodo');if(meta.tariff==='—')missing.push('tarifa');if(fin.total==null)missing.push('total');if(fin.kwh==null)missing.push('consumo total');
    if(!consumption.reliable)missing.push('consumo P1-P3 no cuadra con el total');if(!energyPeriodsComplete)missing.push('faltan periodos de consumo');if(!energyCostReliable)missing.push('coste de energía no cuadra con el precio');if(!powerDetail.reliable)missing.push(powerDetail.message||'potencia');if(!balanced)missing.push('cuadre económico');
    const readOk=!missing.length;
    const reading=/\(Real\)/i.test(text)||/Lectura\s+actual\s*\(Real\)/i.test(text)?{status:'actual',sourceLabel:'Lectura real indicada por Repsol'}:(options.readingClassifier?.(text)||{status:'unknown',sourceLabel:''});
    const opportunity=[];const mxKeys=Object.keys(maximeters).filter(k=>/^P\d$/.test(k)&&contracted[k]!=null);if(mxKeys.length){const maxContracted=Math.max(...mxKeys.map(k=>Number(contracted[k])||0)),maxDemand=Math.max(...mxKeys.map(k=>Number(maximeters[k])||0));if(maxContracted>=10&&maxDemand>0&&maxDemand/maxContracted<=.5)opportunity.push('Posible potencia sobredimensionada: revisar máximas demandadas del último año');}
    const adjustments=[];if(fin.discounts)adjustments.push({concept:'Descuento comercial',amount_eur:fin.discounts,category:'discount'});if(fin.benefitCredit)adjustments.push({concept:'Cupón saldo Waylet',amount_eur:fin.benefitCredit,category:'payment_benefit'});
    return{
      file:file?.name||'',invoiceNumber:identity.invoiceNumber,company:identity.holder||'Por identificar',taxId:identity.taxId,cups:identity.cups,period:period.label,tariff:meta.tariff,kwh:fin.kwh,energy:fin.energy,power:fin.power,excess:0,reactive:0,compensation:0,social:fin.social,rental:fin.rental,integratorAdjustment:0,regularizationReactive:0,other:fin.other,tax:fin.tax,vat:fin.vat,igic:0,distributorCharges:0,total:fin.total,accounted,diff,balanced,readOk,readMessage:readOk?'Lectura correcta':`Falta o revisar: ${missing.join(', ')}`,readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',avg:fin.kwh&&fin.total?fin.total/fin.kwh:0,opportunity:opportunity.length?opportunity.join(' · '):'Sin alertas',periods,contracted,maximeters,parserVersion:options.parserVersion||'',parserRevision:REVISION,powerDetail,energyPricingMode:fin.rate!=null?'single_rate':'source_total',sourceFormat:'repsol',sourceVariant:mode,supplier:RETAILER,retailer:RETAILER,commercializer:RETAILER,supplyAddress:identity.supplyAddress,supplyCity:identity.supplyCity,supplyProvince:identity.supplyProvince,contract:identity.contract,contractNumber:identity.contract,accessContract:meta.accessContract,distributor:meta.distributor,contractType:meta.contractType,renewalDate:meta.renewalDate,meterNumber:meta.meterNumber,issueDate:identity.issueDate,billingStart:period.start,billingEnd:period.end,billingDays:period.days,discounts:fin.discounts,serviceTotal:fin.service||0,paymentTotal:fin.paymentTotal,benefitCredit:fin.benefitCredit,adjustments,validation:{consumptionPeriods:consumption.reliable,energyCost:energyCostReliable,power:powerDetail.reliable,economicBalance:balanced}
    };
  }

  return Object.freeze({detect,variant,parse,revision:REVISION,_test:{parsePeriod,parseConsumption,parsePower,parsePlace}});
});
