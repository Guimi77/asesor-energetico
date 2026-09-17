(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTIberdrolaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const money=n=>Number(n||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const num=v=>{
    if(v==null||v==='')return null;
    let s=String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');
    if(!s||s==='-'||s==='.')return null;
    const n=Number(s);return Number.isFinite(n)?n:null;
  };
  const lastEuro=s=>{
    const values=[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v!=null);
    return values.length?values.at(-1):null;
  };
  const pagesOf=d=>(d?.pages||[]).map(page=>(page||[]).map(clean).filter(Boolean));
  const flat=pages=>pages.flat();
  const lineIndex=(lines,re)=>lines.findIndex(line=>re.test(String(line||'')));
  const block=(lines,re,count=6)=>{
    const i=lineIndex(lines,re);return i<0?'':lines.slice(i,Math.min(lines.length,i+count)).join(' ');
  };
  const valueAfter=(lines,re,valueRe,count=6)=>{
    const src=block(lines,re,count);if(!src)return'';
    const m=src.match(valueRe);return m?(m[1]??m[0]):'';
  };
  const amountNear=(lines,re,count=5)=>{
    const i=lineIndex(lines,re);if(i<0)return null;
    for(let n=i;n<Math.min(lines.length,i+count);n++){const value=lastEuro(lines[n]);if(value!=null)return value;}
    return null;
  };
  const amountUntil=(lines,re,stopRe,count=7)=>{
    const i=lineIndex(lines,re);if(i<0)return null;
    const parts=[];
    for(let n=i;n<Math.min(lines.length,i+count);n++){
      const q=String(lines[n]||'');if(n>i&&stopRe&&stopRe.test(q))break;parts.push(q);
    }
    return lastEuro(parts.join(' '));
  };
  const amountUntilLast=(lines,re,stopRe,count=7)=>{
    let i=-1;for(let n=lines.length-1;n>=0;n--){if(re.test(String(lines[n]||''))){i=n;break;}}if(i<0)return null;
    const parts=[];for(let n=i;n<Math.min(lines.length,i+count);n++){const q=String(lines[n]||'');if(n>i&&stopRe&&stopRe.test(q))break;parts.push(q);}
    return lastEuro(parts.join(' '));
  };
  const normalizeTariff=s=>{
    const m=String(s||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i);
    return m?m[1].replace(/\s+/g,'').toUpperCase():'—';
  };
  const normalizeCups=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const expectedPeriods=tariff=>/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;
  const toIso=s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';};

  function detect(value){
    const s=Array.isArray(value)?value.flat().join('\n'):String(value||'');
    return /IBERDROLA\s+CLIENTES\s*,?\s*S\.A\.U\./i.test(s)
      && /RESUMEN\s+DE\s+FACTURA/i.test(s)
      && /(?:TOTAL\s+IMPORTE\s+FACTURA|Peaje\s+de\s+acceso\s+a\s+la\s+red\s*\(ATR\))/i.test(s);
  }

  function parseHolder(p1){
    const i=lineIndex(p1,/^Titular\s*$/i);if(i<0)return'';
    const parts=[];
    for(let n=i+1;n<Math.min(p1.length,i+5);n++){
      const q=clean(p1[n]);if(!q||/Direcci[oó]n\s+de\s+suministro/i.test(q))break;
      parts.push(q);
    }
    return clean(parts.join(' '));
  }

  function parseSupplyAddress(p1){
    const i=lineIndex(p1,/Direcci[oó]n\s+de\s+suministro\s*:/i);if(i<0)return'';
    const parts=[];
    const same=clean(p1[i].replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,''));if(same)parts.push(same);
    for(let n=i+1;n<Math.min(p1.length,i+6);n++){
      const q=clean(p1[n]);if(!q||/N[º°o.]?\s*DE\s*CONTRATO\s*:/i.test(q)||/RESUMEN\s+DE\s+FACTURA/i.test(q))break;
      parts.push(q);
    }
    return clean(parts.join(' '));
  }

  function splitPlace(address){
    const s=clean(address),m=s.match(/\b(\d{5})\s+(.+?)(?:\s*\(([^()]*)\))?\s*$/i);
    if(!m)return{city:'',province:''};
    return{city:clean(m[2]).replace(/\s*\([^)]*\)\s*$/,''),province:clean(m[3]||'')};
  }

  function parsePeriod(p1){
    const src=block(p1,/PERIODO\s+DE\s+FACTURACI[ÓO]N\s*:/i,4),m=src.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
    if(!m)return{label:'Por identificar',start:'',end:'',days:null};
    const daysSrc=block(p1,/D[IÍ]AS\s+FACTURADOS\s*:/i,3),dm=daysSrc.match(/D[IÍ]AS\s+FACTURADOS\s*:?\s*(\d{1,3})/i)||daysSrc.match(/\b(\d{1,3})\b/);
    const days=dm?Number(dm[1]):null;
    return{label:`${m[1]} - ${m[2]}${days?` (${days} días)`:''}`,start:toIso(m[1]),end:toIso(m[2]),days};
  }

  function parseReadingRows(lines,label,unit){
    const out={};
    for(let i=0;i<lines.length;i++){
      const marker=String(lines[i]||'').match(new RegExp(`${label}\\s+P([1-6])`,'i'));
      if(!marker)continue;
      const src=lines.slice(i,Math.min(lines.length,i+9)).join(' ');
      const m=src.match(new RegExp(`(-?[\\d.,]+)\\s*${unit}\\b`,'i'));
      if(m)out[`P${marker[1]}`]=num(m[1]);
    }
    return out;
  }

  function parsePower(lines,tariff){
    const entries=[],contracted={};
    for(let p=1;p<=6;p++){
      const re=new RegExp(`\\bP${p}\\s+([\\d.,]+)\\s*kW\\s*[x×]\\s*(\\d+)\\s*d[ií]as?\\s*[x×]\\s*([\\d.,]+)\\s*€\\s*\\/\\s*kW\\s*d[ií]a\\s+(-?[\\d.,]+)\\s*€`,'i');
      let match=null;
      for(let i=0;i<lines.length&&!match;i++){
        if(!new RegExp(`\\bP${p}\\b`).test(lines[i]))continue;
        match=lines.slice(i,Math.min(lines.length,i+4)).join(' ').match(re);
      }
      if(match){
        const entry={period:p,contractedKw:num(match[1]),days:Number(match[2]),price:num(match[3]),amount:num(match[4])};
        entries.push(entry);contracted[`P${p}`]=entry.contractedKw;
      }
    }
    const sum=round2(entries.reduce((s,e)=>s+(e.amount||0),0));
    const printed=amountUntil(lines,/Total\s+importe\s+potencia\b/i,/Energ[ií]a\s+consumida/i,4);
    const expected=expectedPeriods(tariff),complete=expected?entries.length===expected:entries.length>0;
    const reliable=complete&&printed!=null&&Math.abs(sum-printed)<=Math.max(.05,(entries.length+1)*.005+.000001);
    return{value:printed!=null?printed:sum,sum,printedTotal:printed,entries,reliable,contracted,message:reliable?'':!complete?'Potencia: faltan periodos facturados':'Potencia: subtotal no cuadra con el detalle'};
  }

  function parseEnergy(lines,tariff,activeReadings){
    const periods={};
    const expected=expectedPeriods(tariff)||6;
    for(let p=1;p<=expected;p++)periods[`P${p}`]={consumption:activeReadings[`P${p}`]??null,cost:null,price:null};
    for(let p=1;p<=6;p++){
      const re=new RegExp(`\\bP${p}\\s+([\\d.,]+)\\s*kWh\\s*[x×]\\s*([\\d.,]+)\\s*€\\s*\\/\\s*kWh\\s+(-?[\\d.,]+)\\s*€`,'i');
      let match=null;
      for(let i=0;i<lines.length&&!match;i++){
        if(!new RegExp(`\\bP${p}\\b`).test(lines[i]))continue;
        match=lines.slice(i,Math.min(lines.length,i+4)).join(' ').match(re);
      }
      if(match){periods[`P${p}`]={consumption:num(match[1]),price:num(match[2]),cost:num(match[3])};}
    }
    for(let p=1;p<=expected;p++){
      const key=`P${p}`,q=periods[key];
      if(q&&q.consumption===0&&q.cost==null)q.cost=0;
    }
    const subtotalBlock=block(lines,/^Total\s+[\d.,]+\s*kWh\s+hasta\b/i,3),subtotalKwh=(subtotalBlock.match(/Total\s+([\d.,]+)\s*kWh/i)||[])[1];
    const printedKwh=num(subtotalKwh),printedCost=amountUntil(lines,/^Total\s+[\d.,]+\s*kWh\s+hasta\b/i,/Descuento\s+sobre\s+consumo/i,4);
    const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+(Number(q?.consumption)||0),0));
    const knownCosts=Object.values(periods).filter(q=>q?.cost!=null),sumCost=round2(knownCosts.reduce((s,q)=>s+(Number(q.cost)||0),0));
    const hasAllConsumption=Object.values(periods).every(q=>q?.consumption!=null);
    const consumptionReliable=printedKwh!=null&&hasAllConsumption&&Math.abs(sumKwh-printedKwh)<=.1;
    const costReliable=printedCost!=null&&knownCosts.length===Object.values(periods).length&&Math.abs(sumCost-printedCost)<=.05;
    return{kwh:printedKwh!=null?printedKwh:sumKwh,energy:printedCost!=null?printedCost:sumCost,periods,sumKwh,sumCost,consumptionReliable,costReliable};
  }

  function parseContractedInfo(allLines,tariff,fallback){
    const out={...fallback};
    const src=block(allLines,/Potencia\s+contratada\s*\(kW\)\s*:/i,4),m=src.match(/Potencia\s+contratada\s*\(kW\)\s*:?\s*([\d.,\s/]+)/i);
    if(m){
      const values=m[1].split('/').map(v=>num(v)).filter(v=>v!=null),expected=expectedPeriods(tariff);
      values.slice(0,expected||values.length).forEach((v,i)=>{out[`P${i+1}`]=v;});
    }
    return out;
  }

  function parse(d,file,options={}){
    const pages=pagesOf(d),p1=pages[0]||[],allLines=flat(pages),all=allLines.join('\n');
    if(!detect(all))return null;
    const holder=parseHolder(p1),supplyAddress=parseSupplyAddress(p1),place=splitPlace(supplyAddress),periodInfo=parsePeriod(p1);
    const invoiceNumber=clean(valueAfter(p1,/N[º°o.]?\s*FACTURA\s*:/i,/N[º°o.]?\s*FACTURA\s*:?\s*(?:[^0-9]*)(\d{10,22})/i,4))||'Por identificar';
    const contract=clean(valueAfter(p1,/N[º°o.]?\s*DE\s*CONTRATO\s*:/i,/N[º°o.]?\s*DE\s*CONTRATO\s*:?\s*(\d{6,20})/i,2));
    const cupsBlock=block(allLines,/Identificaci[oó]n\s+punto\s+de\s+suministro\s*\(CUPS\)\s*:/i,4).split(/Forma\s+de\s+pago\s*:/i)[0],cupsRaw=(cupsBlock.match(/ES(?:\s*[A-Z0-9]){18,22}/i)||[])[0]||'';
    const cups=normalizeCups(cupsRaw),tariff=normalizeTariff(block(allLines,/Peaje\s+de\s+acceso\s+a\s+la\s+red\s*\(ATR\)\s*:/i,4)||all);
    const activeReadings=parseReadingRows(allLines,'Energ[ií]a activa','kWh'),reactiveReadings=parseReadingRows(allLines,'Energ[ií]a reactiva','kVArh'),capacitiveReadings=parseReadingRows(allLines,'Energ[ií]a capacitiva','kVArh');
    const powerDetail=parsePower(allLines,tariff),energyDetail=parseEnergy(allLines,tariff,activeReadings),contracted=parseContractedInfo(allLines,tariff,powerDetail.contracted);
    const maximeters=parseReadingRows(allLines,'Max[ií]metro','kW');if(Object.keys(maximeters).length===(expectedPeriods(tariff)||0))maximeters._reliable=true;
    const total=amountUntil(allLines,/TOTAL\s+IMPORTE\s+FACTURA/i,/^\(\*\)|N[º°o.]?\s*contador|INFORMACI[ÓO]N/i,4),
      discounts=amountUntil(allLines,/Descuento\s+sobre\s+consumo/i,/(?:CARGOS\s+NORMATIVOS|Financiaci[oó]n\s+bono\s+social|Impuesto\s+sobre\s+electricidad)/i,5)??0,
      social=amountUntil(allLines,/Financiaci[oó]n\s+bono\s+social/i,/Impuesto\s+sobre\s+electricidad/i,5)??0,
      tax=amountUntil(allLines,/Impuesto\s+sobre\s+electricidad/i,/(?:TOTAL\s+ENERG[IÍ]A|SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS|Alquiler\s+equipos?\s+medida)/i,5)??0,
      rental=amountUntil(allLines,/Alquiler\s+equipos?\s+medida/i,/(?:TOTAL\s+SERVICIOS|IMPORTE\s+TOTAL|^IVA\b)/i,5)??0,
      vat=amountUntilLast(allLines,/^IVA(?:\s|$)/i,/TOTAL\s+IMPORTE\s+FACTURA/i,4)??0;
    const energy=energyDetail.energy,power=powerDetail.value,excess=0,reactive=0,compensation=0,igic=0,distributorCharges=0,integratorAdjustment=0,regularizationReactive=0;
    const other=round2(discounts+social+rental),accounted=round2((energy||0)+(power||0)+other+tax+vat),diff=total==null?null:round2(total-accounted),balanced=total!=null&&Math.abs(diff)<=.05;
    const distributor=clean(valueAfter(allLines,/Empresa\s+distribuidora\s*:/i,/Empresa\s+distribuidora\s*:?\s*(.*?)(?=\s+N[uú]mero\s+de\s+contrato\s+de\s+acceso\s*:|$)/i,5));
    const accessContract=clean(valueAfter(allLines,/N[uú]mero\s+de\s+contrato\s+de\s+acceso\s*:/i,/N[uú]mero\s+de\s+contrato\s+de\s+acceso\s*:?\s*(\d{6,20})/i,3));
    const renewalDate=clean(valueAfter(allLines,/Fecha\s+final\s+del\s+contrato\s*:/i,/Fecha\s+final\s+del\s+contrato\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i,3));
    const permanence=clean(valueAfter(allLines,/Permanencia\s*:/i,/Permanencia\s*:?\s*(.*?)(?=\s+Empresa\s+distribuidora\s*:|$)/i,4));
    const meterNumber=clean(valueAfter(allLines,/N[º°o.]?\s*contador\s*:/i,/N[º°o.]?\s*contador\s*:?\s*(\d{5,20})/i,3));
    const issueBlock=block(p1,/FECHA\s+DE\s+EMISI[ÓO]N\s*:/i,3),issueDate=(issueBlock.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i)||[]).slice(1);
    const missing=[];
    if(!holder)missing.push('titular');if(!cups)missing.push('CUPS');if(periodInfo.label==='Por identificar')missing.push('periodo');if(tariff==='—')missing.push('tarifa');if(total==null)missing.push('total');
    if(!powerDetail.reliable)missing.push(powerDetail.message||'potencia');if(!energyDetail.consumptionReliable)missing.push('consumo por periodos no cuadra con el consumo total');if(!energyDetail.costReliable)missing.push('coste de energía por periodos no cuadra con el término de energía');
    const expected=expectedPeriods(tariff);if(expected&&Object.keys(contracted).filter(k=>/^P\d$/.test(k)).length!==expected)missing.push('potencias contratadas');
    const readingDirect=/[ÚU]ltima\s+lectura\s*:\s*real/i.test(all)?{status:'actual',sourceLabel:'Última lectura: real'}:/[ÚU]ltima\s+lectura\s*:\s*estimada/i.test(all)?{status:'estimated',sourceLabel:'Última lectura: estimada'}:null;
    const fallbackReading=options.readingClassifier?.(all)||{status:'unknown',sourceLabel:null},reading=readingDirect||fallbackReading;
    const alerts=[];
    const usable=maximeters._reliable?Object.keys(maximeters).filter(k=>/^P\d$/.test(k)&&(contracted[k]||0)>0):[];
    if(usable.length){const mc=Math.max(...usable.map(k=>contracted[k])),md=Math.max(...usable.map(k=>maximeters[k])),ratio=mc?md/mc:1;if(mc>=10&&md>0&&ratio<=.5)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}
    const readOk=balanced&&!missing.length;
    const months={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
    const normalizedIssueDate=issueDate.length===3?`${issueDate[2]}-${months[issueDate[1].toLowerCase()]||''}-${String(issueDate[0]).padStart(2,'0')}`:'';
    return{
      file:file?.name||'',invoiceNumber,company:holder||'Por identificar',taxId:'',cups,period:periodInfo.label,tariff,kwh:energyDetail.kwh,energy,power,excess,reactive,compensation,social,rental,integratorAdjustment,regularizationReactive,other,tax,vat,igic,distributorCharges,distributorDescription:'',total,accounted,diff,balanced,readOk,
      readMessage:missing.length?`Falta o revisar: ${missing.join(', ')}`:balanced?'Lectura correcta':`Descuadre: ${money(diff)} €`,readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',avg:energyDetail.kwh&&total!=null?total/energyDetail.kwh:0,opportunity:alerts.length?alerts.join(' · '):'Sin alertas',periods:energyDetail.periods,contracted,maximeters,parserVersion:options.parserVersion||'',powerDetail,
      sourceFormat:'iberdrola',supplier:'IBERDROLA CLIENTES, S.A.U.',retailer:'IBERDROLA CLIENTES, S.A.U.',commercializer:'IBERDROLA CLIENTES, S.A.U.',supplyAddress,supplyCity:place.city,supplyProvince:place.province,contract,contractNumber:contract,accessContract,distributor,contractType:'',renewalDate,permanence,meterNumber,issueDate:normalizedIssueDate,billingStart:periodInfo.start,billingEnd:periodInfo.end,billingDays:periodInfo.days,discounts,reactivePeriods:reactiveReadings,capacitivePeriods:capacitiveReadings,activeReadings
    };
  }

  return Object.freeze({detect,parse});
});
