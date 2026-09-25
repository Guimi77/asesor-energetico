(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTNaturgyParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REVISION='naturgy-2026.09.22.1';
  const RETAILER='Naturgy Clientes, S.A.U.';
  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const num=v=>{
    if(v==null||v==='')return null;
    let s=String(v).trim().replace(/\s/g,'');
    if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(','))s=s.replace(',','.');
    const n=Number(s.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:null;
  };
  const pagesOf=d=>(d?.pages||[]).map(page=>(page||[]).map(clean).filter(Boolean));
  const textOf=d=>{
    if(typeof d==='string')return d;
    if(clean(d?.text))return String(d.text);
    return pagesOf(d).flat().join('\n');
  };
  const normalizeCups=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tariffOf=s=>((String(s||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i)||[])[1]||'—').replace(/\s+/g,'').toUpperCase();
  const toIso=value=>{const m=String(value||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'):'';};
  const normDate=value=>{const m=String(value||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?String(m[1]).padStart(2,'0')+'/'+String(m[2]).padStart(2,'0')+'/'+m[3]:'';};
  const moneyValues=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastMoney=s=>{const values=moneyValues(s);return values.length?values.at(-1):null;};
  const linesOf=s=>String(s||'').split(/\r?\n/).map(clean).filter(Boolean);
  const lineMatch=(s,re)=>linesOf(s).find(line=>re.test(line))||'';
  const lineAmount=(s,re)=>{for(const line of linesOf(s)){if(re.test(line)){const v=lastMoney(line);if(v!=null)return v;}}return null;};

  function detect(value){
    const s=textOf(value);
    return /Naturgy\s+Clientes\s*,?\s*S\.?\s*A\.?\s*U\.?/i.test(s)
      && /Detalle\s*:\s*c[oó]mo\s+calculamos\s+tu\s+factura/i.test(s)
      && /C[oó]digo\s+CUPS\s*:/i.test(s)
      && /Total\s+a\s+pagar/i.test(s);
  }

  function capture(text,re){const m=String(text||'').match(re);return clean(m?.[1]||'');}

  function parseAddress(text){
    const lines=linesOf(text),idx=lines.findIndex(line=>/Direcci[oó]n\s+de\s+suministro\s*:/i.test(line));
    if(idx<0)return'';
    let first=clean(lines[idx].replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,''));
    const parts=[];
    for(let i=idx+1;i<Math.min(lines.length,idx+4);i++){
      if(/N[.º°o]*\s*de\s+factura\s*:/i.test(lines[i]))break;
      parts.push(lines[i]);
      if(/\b\d{5}\b/.test(lines[i]))break;
    }
    const continuation=clean(parts.join(' '));
    const province=(continuation.match(/\b\d{5}\s+.+?\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ-]+)\s*$/)||[])[1]||'';
    if(province&&new RegExp('\\b'+province+'\\s*$','i').test(first))first=first.replace(new RegExp('\\s+'+province+'\\s*$','i'),'');
    return clean([first,continuation].filter(Boolean).join(' '));
  }

  function splitPlace(address){
    const m=clean(address).match(/\b(\d{5})\s+(.+)$/);
    if(!m)return{postalCode:'',city:'',province:''};
    const tail=clean(m[2]),parts=tail.split(/\s+/).filter(Boolean);
    if(parts.length<2)return{postalCode:m[1],city:tail,province:''};
    return{postalCode:m[1],city:parts.slice(0,-1).join(' '),province:parts.at(-1)};
  }

  function parsePeriod(text){
    const m=String(text||'').match(/Per[ií]odo\s+electricidad\s*(?:del)?\s*(\d{2}\/\d{2}\/\d{4})\s*(?:al|-)\s*(\d{2}\/\d{2}\/\d{4})/i);
    if(!m)return{label:'Por identificar',start:'',end:'',days:null};
    const detail=String(text||'').match(/Per[ií]odo\s+electricidad\s+del\s+\d{2}\/\d{2}\/\d{4}\s+al\s+\d{2}\/\d{2}\/\d{4}[\s\S]{0,900}?(\d{1,3})\s*d[ií]as/i);
    const days=detail?Number(detail[1]):null;
    return{label:m[1]+' - '+m[2]+(days?' ('+days+' días)':''),start:toIso(m[1]),end:toIso(m[2]),days};
  }

  function parseIdentity(text){
    const invoiceNumber=capture(text,/N[.º°o]*\s*de\s+factura\s*:\s*([A-Z0-9][A-Z0-9._\/-]*)/i)||'Por identificar';
    const holder=capture(text,/\bNombre\s*:\s*([^\n]{2,120}?)(?=\s+CNAE\s*:|\n|$)/i);
    const taxId=capture(text,/Doc\.?\s*Identidad\s*:\s*([A-Z0-9-]{6,20})/i);
    const cups=normalizeCups(capture(text,/C[oó]digo\s+CUPS\s*:\s*(ES(?:\s*\d){16}(?:\s*[A-Z]){2}(?:(?:\s*\d)(?:\s*[A-Z]))?)/i));
    const supplyAddress=parseAddress(text),place=splitPlace(supplyAddress);
    const issueDate=normDate(capture(text,/Fecha\s+de\s+emisi[oó]n\s*:\s*(\d{2}\/\d{2}\/\d{4})/i));
    const reference=capture(text,/N[.º°o]*\s*de\s+referencia\s*:\s*([A-Z0-9._\/-]+)/i);
    const cnae=capture(text,/\bCNAE\s*:\s*([0-9]{2,8})/i);
    return{invoiceNumber,holder,taxId,cups,supplyAddress,supplyCity:place.city,supplyProvince:place.province,postalCode:place.postalCode,issueDate,reference,cnae};
  }

  function parseContractMeta(text){
    const tariff=tariffOf(text),lines=linesOf(text);
    let contract=capture(text,/Contrato\s*:[^\n]*\n\s*(\d{6,20})\b/i);
    if(!contract){const i=lines.findIndex(line=>/^Contrato\s*:/i.test(line));if(i>=0){for(let n=i+1;n<Math.min(lines.length,i+3);n++){const m=lines[n].match(/^(\d{6,20})\b/);if(m){contract=m[1];break;}}}}
    const accessContract=capture(text,/N[.º°o]*\s*contrato\s+de\s+acceso\s*:\s*(\d{6,24})/i);
    const distLine=lineMatch(text,/^Distribuidora\s*:/i);
    const distributor=clean(distLine.replace(/^Distribuidora\s*:\s*/i,'').split(/\s{2,}|\s+Potencia\s+contratada/i)[0]);
    const renewalDate=normDate(capture(text,/Fecha\s+final\s+de\s+contrato\s*:\s*(\d{2}\/\d{2}\/\d{4})/i));
    const meterNumber=capture(text,/N[.º°o]*\s*de\s+contador\s*:\s*(?:\n\s*)?(\d{6,24})/i);
    const productLine=lineMatch(text,/^Tarifa\s+/i),product=clean(productLine.split(/\s{2,}/)[0]);
    const tolls=lineAmount(text,/Cuant[ií]a\s+de\s+peajes\s*:/i);
    const charges=lineAmount(text,/Cuant[ií]a\s+de\s+cargos\s*:/i);
    return{tariff,contract,accessContract,distributor,renewalDate,meterNumber,product,tolls,charges};
  }

  function parseConsumption(text,totalKwh,rate){
    const labels=[['P1','Punta'],['P2','Llano'],['P3','Valle']],periods={};
    for(const [key,label] of labels){
      const re=new RegExp(label+'\\s+real[\\s\\S]{0,160}?(-?[\\d.]+(?:,\\d+)?)\\s*kWh','i');
      const m=String(text||'').match(re);
      if(m)periods[key]={consumption:num(m[1]),cost:null,price:rate};
    }
    const sum=round2(Object.values(periods).reduce((s,p)=>s+Number(p.consumption||0),0));
    return{periods,reliable:totalKwh!=null&&Object.keys(periods).length===3&&Math.abs(sum-totalKwh)<=.1,sum};
  }

  function parseMaximeters(text){
    const out={};
    for(let p=1;p<=6;p++){
      const m=String(text||'').match(new RegExp('M[aá]x[ií]metro\\s+P'+p+'[\\s\\S]{0,120}?(-?[\\d.]+(?:,\\d+)?)\\s*kW','i'));
      if(m)out['P'+p]=num(m[1]);
    }
    if(Object.keys(out).length)out._reliable=true;
    const annual=String(text||'').match(/potencias\s+m[aá]ximas\s+demandadas\s+en\s+el\s+[uú]ltimo\s+a[nñ]o\s+han\s+sido\s+([\d.]+,\d+)\s*kW\s+en\s+P1[\s\S]{0,80}?([\d.]+,\d+)\s*kW\s+en\s+P2/i);
    if(annual)out._annualMax={P1:num(annual[1]),P2:num(annual[2])};
    return out;
  }

  function parsePower(text,tariff){
    const expected=/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;
    const entries=[],contracted={};
    const re=/T[eé]rmino\s+potencia\s+P([1-6])[\s\S]{0,100}?([\d.]+,\d+)\s*kW\s*[x×]\s*(\d+)\s*d[ií]as\s*[x×]\s*([\d.]+,\d+)\s*€\/kW\s*d[ií]a\s*(-?[\d.]+,\d{2})\s*€/gi;
    for(const m of String(text||'').matchAll(re)){
      const period=Number(m[1]);
      const e={period,contractedKw:num(m[2]),days:Number(m[3]),price:num(m[4]),amount:num(m[5])};
      entries.push(e);contracted['P'+period]=e.contractedKw;
    }
    for(let p=1;p<=6;p++){
      const m=String(text||'').match(new RegExp('Potencia\\s+contratada\\s+P'+p+'\\s*:\\s*([\\d.]+,\\d+)\\s*kW','i'));
      if(m)contracted['P'+p]=num(m[1]);
    }
    entries.sort((a,b)=>a.period-b.period);
    const sum=round2(entries.reduce((s,e)=>s+Number(e.amount||0),0));
    const formulaOk=entries.every(e=>Math.abs(round2(e.contractedKw*e.days*e.price)-e.amount)<=.02);
    const reliable=expected>0&&entries.length===expected&&formulaOk;
    return{value:sum,sum,printedTotal:sum,entries,contracted,reliable,message:reliable?'':'Potencia: '+entries.length+'/'+(expected||'?')+' periodos fiables'};
  }

  function parseFinancials(text){
    const energyLine=lineMatch(text,/^Consumo\s+electricidad\b/i);
    const energyMatch=energyLine.match(/Consumo\s+electricidad\s+([\d.]+(?:,\d+)?)\s*kWh\s*[x×]\s*([\d.]+,\d+)\s*€\/kWh[\s\S]*?(-?[\d.]+,\d{2})\s*€/i);
    const kwh=energyMatch?num(energyMatch[1]):null,rate=energyMatch?num(energyMatch[2]):null,energy=energyMatch?num(energyMatch[3]):null;
    const social=lineAmount(text,/^Financiaci[oó]n\s+de\s+Bono\s+Social\b/i)??0;
    const tax=lineAmount(text,/^Impuesto\s+electricidad\b/i)??0;
    const rental=lineAmount(text,/^Alquiler\s+de\s+contador\b/i)??0;
    const electricityTotal=lineAmount(text,/^Total\s+electricidad\b/i);
    const vatLine=lineMatch(text,/^IVA\s*\(/i),vat=lastMoney(vatLine)??0;
    const vatBase=num((vatLine.match(/IVA\s*\([^)]*\)\s+(-?[\d.]+,\d{2})\s*€/i)||[])[1])??electricityTotal;
    const vatRate=num((vatLine.match(/[x×]\s*([\d.]+(?:,\d+)?)\s*%/i)||[])[1]);
    const total=lineAmount(text,/^Total\s+a\s+pagar\b/i);
    const other=round2(social+rental);
    return{kwh,rate,energy,social,tax,rental,electricityTotal,vat,vatRate,vatBase,total,other};
  }

  function parse(d,file,options={}){
    const text=textOf(d);if(!detect(text))return null;
    const identity=parseIdentity(text),meta=parseContractMeta(text),period=parsePeriod(text),fin=parseFinancials(text),powerDetail=parsePower(text,meta.tariff),consumption=parseConsumption(text,fin.kwh,fin.rate),maximeters=parseMaximeters(text);
    const power=powerDetail.value,accounted=round2((fin.energy||0)+(power||0)+(fin.social||0)+(fin.rental||0)+(fin.tax||0)+(fin.vat||0));
    const diff=fin.total==null?null:round2(fin.total-accounted),balanced=fin.total!=null&&Math.abs(diff)<=.05;
    const energyCostReliable=fin.kwh!=null&&fin.rate!=null&&fin.energy!=null&&Math.abs(round2(fin.kwh*fin.rate)-fin.energy)<=.02;
    const electricitySubtotalReliable=fin.electricityTotal!=null&&Math.abs(round2((fin.energy||0)+(power||0)+(fin.social||0)+(fin.tax||0)+(fin.rental||0))-fin.electricityTotal)<=.05;
    const missing=[];
    if(!identity.holder)missing.push('titular');
    if(!identity.taxId)missing.push('documento identidad');
    if(!identity.cups)missing.push('CUPS');
    if(identity.invoiceNumber==='Por identificar')missing.push('nº factura');
    if(period.label==='Por identificar')missing.push('periodo');
    if(!period.days)missing.push('días facturados');
    if(meta.tariff==='—')missing.push('tarifa');
    if(fin.kwh==null)missing.push('consumo total');
    if(!consumption.reliable)missing.push('consumo P1-P3');
    if(!energyCostReliable)missing.push('coste de energía');
    if(!powerDetail.reliable)missing.push(powerDetail.message||'potencia');
    if(!electricitySubtotalReliable)missing.push('subtotal electricidad');
    if(!balanced)missing.push('cuadre económico');
    const readOk=!missing.length;
    const actual=/(?:Punta|Llano|Valle)\s+real/i.test(text),reading=actual?{status:'actual',sourceLabel:'Lecturas reales indicadas por Naturgy'}:(options.readingClassifier?.(text)||{status:'unknown',sourceLabel:''});
    const alerts=[];
    const annual=maximeters._annualMax||{};const usable=Object.keys(annual).filter(k=>contractedValue(powerDetail.contracted,k)>0&&Number(annual[k])>0);
    if(usable.length){const mc=Math.max(...usable.map(k=>Number(powerDetail.contracted[k])||0)),md=Math.max(...usable.map(k=>Number(annual[k])||0)),ratio=mc?md/mc:1;if(mc>=10&&ratio<=.5)alerts.push('Posible potencia sobredimensionada: revisar máximas demandadas del último año');}
    return{
      file:file?.name||'',invoiceNumber:identity.invoiceNumber,company:identity.holder||'Por identificar',taxId:identity.taxId,cups:identity.cups,period:period.label,tariff:meta.tariff,kwh:fin.kwh,energy:fin.energy,power,excess:0,reactive:0,compensation:0,social:fin.social,rental:fin.rental,integratorAdjustment:0,regularizationReactive:0,other:fin.other,tax:fin.tax,vat:fin.vat,igic:0,distributorCharges:0,total:fin.total,accounted,diff,balanced,readOk,readMessage:readOk?'Lectura correcta':'Falta o revisar: '+missing.join(', '),readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',avg:fin.kwh&&fin.total?fin.total/fin.kwh:0,opportunity:alerts.length?alerts.join(' · '):'Sin alertas',periods:consumption.periods,contracted:powerDetail.contracted,maximeters,parserVersion:options.parserVersion||'',parserRevision:REVISION,powerDetail,energyPricingMode:'single_rate',sourceFormat:'naturgy',supplier:RETAILER,retailer:RETAILER,commercializer:RETAILER,supplyAddress:identity.supplyAddress,supplyCity:identity.supplyCity,supplyProvince:identity.supplyProvince,postalCode:identity.postalCode,contract:meta.contract,contractNumber:meta.contract,accessContract:meta.accessContract,distributor:meta.distributor,contractType:meta.product||'Mercado libre',renewalDate:meta.renewalDate,meterNumber:meta.meterNumber,issueDate:identity.issueDate,billingStart:period.start,billingEnd:period.end,billingDays:period.days,referenceNumber:identity.reference,cnae:identity.cnae,discounts:0,serviceTotal:0,paymentTotal:fin.total,adjustments:[],regulatedBreakdown:{tolls_eur:meta.tolls,charges_eur:meta.charges},validation:{consumptionPeriods:consumption.reliable,energyCost:energyCostReliable,power:powerDetail.reliable,electricitySubtotal:electricitySubtotalReliable,economicBalance:balanced,vatBase:fin.vatBase,vatRate:fin.vatRate}
    };
  }

  function contractedValue(contracted,key){return Number(contracted?.[key])||0;}

  return Object.freeze({detect,parse,revision:REVISION,_test:{parsePeriod,parseIdentity,parseContractMeta,parseFinancials,parseConsumption,parsePower,parseMaximeters}});
});
