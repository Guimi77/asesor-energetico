(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTIberdrolaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const REVISION='2026.09.18.6';
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const clean=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=s=>clean(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  const num=v=>{
    if(v==null||v==='')return null;
    let s=String(v).trim().replace(/\s/g,'');
    if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(','))s=s.replace(',','.');
    const n=Number(s.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:null;
  };
  const money=n=>Number(n||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const amountPattern='(-?[\\d.]+,\\d{2})\\s*€';
  const linesOf=d=>{
    const pages=(d?.pages||[]).map(p=>(p||[]).map(clean).filter(Boolean));
    if(pages.length)return pages;
    const text=String(d?.text||'');
    return [text.split(/\r?\n/).map(clean).filter(Boolean)];
  };
  const allText=d=>{
    const pages=linesOf(d);
    const a=pages.flat().join('\n');
    return a||String(d?.text||'');
  };
  const euroValues=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€(?!\s*\/)/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastEuro=s=>{const a=euroValues(s);return a.length?a.at(-1):null;};
  const lineEuro=(lines,re)=>{for(const l of lines){if(re.test(l)){const v=lastEuro(l);if(v!=null)return v;}}return null;};
  function sectionEuro(text,startRe,endRe,max=320){
    const s=String(text||''),m=s.match(startRe);if(!m)return null;const start=(m.index||0),tail=s.slice(start,start+max);let seg=tail;
    if(endRe){const j=tail.search(endRe);if(j>0)seg=tail.slice(0,j);}
    return lastEuro(seg);
  }
  const normalizeTariff=s=>{const m=String(s||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i);return m?m[1].replace(/\s+/g,'').toUpperCase():'—';};
  const normalizeCups=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const strictCups=s=>{
    const m=String(s||'').match(/(?:CUPS|punto\s+de\s+suministro)[\s\S]{0,120}?\b(ES(?:\s*\d){16}(?:\s*[A-Z]){2}(?:(?:\s*\d)(?:\s*[A-Z]))?)/i)
      ||String(s||'').match(/\bES(?:\s*\d){16}(?:\s*[A-Z]){2}(?:(?:\s*\d)(?:\s*[A-Z]))?(?![A-Z0-9])/i);
    return normalizeCups(m?.[1]||m?.[0]||'');
  };
  const toIso=s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';};
  const MONTHS={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};

  function detect(d){
    const s=norm(allText(d)).toUpperCase();
    if(/ENDESA ENERGIA|FENIE ENERGIA/.test(s))return false;
    return /\bIBERDROLA\b/.test(s)&&/\bCLIENTES\b/.test(s)&&/\bFACTURA\b/.test(s)&&(/\bELECTRICIDAD\b/.test(s)||/RESUMEN DE FACTURA/.test(s));
  }

  function recipientName(p1){
    const all=p1.map(clean).filter(Boolean),nameRe=/^[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*(?:\s+[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*){1,9}$/,banned=/IBERDROLA|CLIENTES|REMIT|FACTURA|ELECTRICIDAD|CONTRATO|EMPRESA|RESPONSABLE|SOSTENIBLE|DIGITALES/i,contract=all.findIndex(x=>/^CONTRATO$/i.test(x)),prefix=contract>=0?all.slice(0,contract):all.slice(0,25),addressRe=/^(?:C\/|CL\b|CALLE\b|CARRER\b|AV\b|AVDA\b|PASEO\b|PLAZA\b|CTRA\b)/i;
    for(let i=0;i<prefix.length;i++){if(!addressRe.test(prefix[i]))continue;for(let j=i-1;j>=Math.max(0,i-3);j--){const q=prefix[j];if(nameRe.test(q)&&!banned.test(q))return q;}}
    if(contract>=0){for(let i=contract+1;i<Math.min(all.length,contract+9);i++){const q=all[i];if(nameRe.test(q)&&!banned.test(q)){const next=all[i+1]||'';return /^[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]{2,20}$/.test(next)&&!banned.test(next)?clean(q+' '+next):q;}}}
    return'';
  }
  function contractHolder(p1){
    const text=p1.join('\n'),m=text.match(/\bCONTRATO\b[\s\S]{0,650}?\bTitular\b\s*(?:Potencia\s*:)?\s*\n?([A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*(?:\s+[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*){1,9})(?=\s+Potencia|\nDirecci[oó]n\s+de\s+suministro|\n[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ]+\nDirecci[oó]n)/i);
    return clean(m?.[1]||'');
  }
  function supplyAddress(p1){
    const text=p1.join('\n'),m=text.match(/Direcci[oó]n\s+de\s+suministro\s*:\s*\n?([\s\S]{1,260}?)(?=\nN[º°o.]?\s*DE\s*CONTRATO|\nRESUMEN\s+DE\s+FACTURA)/i);
    return clean((m?.[1]||'').replace(/\n/g,' '));
  }
  function splitPlace(address){
    const m=clean(address).match(/\b\d{5}\s+(.+?)(?:\s*\(([^()]*)\))?$/i);
    return m?{city:clean(m[1]).replace(/\s*\([^)]*\)$/,''),province:clean(m[2]||'')}:{city:'',province:''};
  }
  function periodData(text){
    const m=String(text).match(/PERIODO\s+DE\s+FACTURACI[ÓO]N\s*:[\s\S]{0,140}?(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i);
    const dm=String(text).match(/D[IÍ]AS\s+FACTURADOS\s*:[\s\S]{0,140}?\b(\d{1,3})\b/i);
    if(!m)return{label:'Por identificar',start:'',end:'',days:dm?Number(dm[1]):null};
    const days=dm?Number(dm[1]):null;
    return{label:`${m[1]} - ${m[2]}${days?` (${days} días)`:''}`,start:toIso(m[1]),end:toIso(m[2]),days};
  }
  function issueDate(text){
    const m=String(text).match(/FECHA\s+DE\s+EMISI[ÓO]N\s*:[\s\S]{0,160}?(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
    if(!m)return'';return `${m[3]}-${MONTHS[m[2].toLowerCase()]||''}-${String(m[1]).padStart(2,'0')}`;
  }
  function labelledNumber(text,re,min=6,max=22){
    const m=String(text).match(re);if(!m)return'';const tail=String(text).slice((m.index||0)+m[0].length,(m.index||0)+m[0].length+300),n=tail.match(new RegExp(`\\b(\\d{${min},${max}})\\b`));return n?n[1]:'';
  }

  function powerDetails(text,tariff){
    const entries=[],contracted={},expected=/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;
    if(expected===2){
      for(const [p,label] of [[1,'Punta'],[2,'Valle']]){
        const re=new RegExp(`(?:Potencia\\s+facturada\\s+)?${label}\\s+([\\d.,]+)\\s*kW\\s*[x×]\\s*(\\d+)\\s*d[ií]as?\\s*[x×]\\s*([\\d.,]+)\\s*€\\s*\\/\\s*kW\\s*d[ií]a\\s*(${amountPattern})`,'i');
        const m=String(text).match(re);if(m){const e={period:p,contractedKw:num(m[1]),days:Number(m[2]),price:num(m[3]),amount:num(m[4])};entries.push(e);contracted[`P${p}`]=e.contractedKw;}
      }
    }else{
      for(let p=1;p<=expected;p++){
        const re=new RegExp(`(?:Potencia\\s+facturada\\s+)?P${p}\\s+([\\d.,]+)\\s*kW\\s*[x×]\\s*(\\d+)\\s*d[ií]as?\\s*[x×]\\s*([\\d.,]+)\\s*€\\s*\\/\\s*kW\\s*d[ií]a\\s*(${amountPattern})`,'i');
        const m=String(text).match(re);if(m){const e={period:p,contractedKw:num(m[1]),days:Number(m[2]),price:num(m[3]),amount:num(m[4])};entries.push(e);contracted[`P${p}`]=e.contractedKw;}
      }
    }
    const tm=String(text).match(/Total\s+importe\s+potencia[\s\S]{0,100}?(-?[\d.]+,\d{2})\s*€/i),printedTotal=tm?num(tm[1]):null,sum=round2(entries.reduce((s,e)=>s+e.amount,0)),reliable=expected>0&&entries.length===expected&&printedTotal!=null&&Math.abs(sum-printedTotal)<=.05;
    return{value:printedTotal??sum,sum,printedTotal,entries,contracted,reliable,message:reliable?'':entries.length!==expected?'Potencia: faltan periodos facturados':'Potencia: subtotal no cuadra con el detalle'};
  }

  function activeReadings(text){
    const out={};for(let p=1;p<=6;p++){
      const re=new RegExp(`Energ[ií]a\\s+activa\\s+P${p}[\\s\\S]{0,120}?(-?[\\d.]+(?:,\\d+)?)\\s*kWh\\b`,'i');
      const m=String(text).match(re);if(m)out[`P${p}`]=num(m[1]);
    }return out;
  }
  function energyDetails(text,tariff){
    const periods={},active=activeReadings(text);
    if(/^2\.0TD$/i.test(tariff)){
      const m=String(text).match(/Energ[ií]a\s+consumida[\s\S]{0,180}?([\d.]+,\d{2})\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kWh\s*([\d.]+,\d{2})\s*€/i);
      const b=String(text).match(/consumos\s+desagregados\s+han\s+sido\s+punta\s*:\s*([\d.]+,\d{2})\s*kWh\s*;?\s*llano\s*:\s*([\d.]+,\d{2})\s*kWh\s*;?\s*valle\s*:?\s*([\d.]+,\d{2})\s*kWh/i);
      const kwh=m?num(m[1]):null,rate=m?num(m[2]):null,energy=m?num(m[3]):null;
      if(b){periods.P1={consumption:num(b[1]),cost:null,price:rate};periods.P2={consumption:num(b[2]),cost:null,price:rate};periods.P3={consumption:num(b[3]),cost:null,price:rate};}
      const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),calc=kwh!=null&&rate!=null?round2(kwh*rate):null;
      return{kwh,energy,periods,activeReadings:active,consumptionReliable:kwh!=null&&Object.keys(periods).length===3&&Math.abs(sumKwh-kwh)<=.1,costReliable:energy!=null&&calc!=null&&Math.abs(calc-energy)<=.02,pricingMode:'single_rate'};
    }
    const expected=6;
    for(let p=1;p<=expected;p++){
      const re=new RegExp(`(?:Energ[ií]a\\s+consumida\\s+)?P${p}\\s+([\\d.]+(?:,\\d+)?)\\s*kWh\\s*[x×]\\s*([\\d.,]+)\\s*€\\s*\\/\\s*kWh\\s*([\\d.]+,\\d{2})\\s*€`,'i');
      const m=String(text).match(re);if(m)periods[`P${p}`]={consumption:num(m[1]),price:num(m[2]),cost:num(m[3])};
    }
    const tm=String(text).match(/Total\s+([\d.]+(?:,\d+)?)\s*kWh\s+hasta[\s\S]{0,100}?([\d.]+,\d{2})\s*€/i),kwh=tm?num(tm[1]):null,energy=tm?num(tm[2]):null;
    for(let p=1;p<=expected;p++){const k=`P${p}`;if(!periods[k]&&active[k]===0)periods[k]={consumption:0,cost:0,price:null};}
    const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),sumCost=round2(Object.values(periods).reduce((s,q)=>s+Number(q.cost||0),0));
    return{kwh,energy,periods,activeReadings:active,consumptionReliable:kwh!=null&&Object.keys(periods).length===expected&&Math.abs(sumKwh-kwh)<=.1,costReliable:energy!=null&&Object.keys(periods).length===expected&&Math.abs(sumCost-energy)<=.05,pricingMode:'periods'};
  }

  function maximeters(text){
    const out={};for(let p=1;p<=6;p++){
      const re=new RegExp(`Max[ií]metro\\s+P${p}[\\s\\S]{0,120}?(-?[\\d.]+(?:,\\d+)?)\\s*kW\\b`,'i'),m=String(text).match(re);if(m)out[`P${p}`]=num(m[1]);
    }if(Object.keys(out).length===6)out._reliable=true;return out;
  }
  function annualDemand(text){const m=String(text).match(/potencias\s+m[aá]ximas\s+demandadas[\s\S]{0,220}?([\d.,]+)\s*kW\s+en\s+P1[\s\S]{0,100}?([\d.,]+)\s*kW\s+en\s+P2/i);return m?{P1:num(m[1]),P2:num(m[2]),_source:'annual_max_demand'}:{};}
  function reactiveMap(text,label){const out={};for(let p=1;p<=6;p++){const re=new RegExp(`${label}\\s+P${p}[\\s\\S]{0,120}?(-?[\\d.]+(?:,\\d+)?)\\s*kVArh\\b`,'i'),m=String(text).match(re);if(m)out[`P${p}`]=num(m[1]);}return out;}

  function parse(d,file,options={}){
    if(!detect(d))return null;
    const pages=linesOf(d),p1=pages[0]||[],all=allText(d),detail=pages[1]||[],tariff=normalizeTariff(all),period=periodData(all),company=recipientName(p1)||contractHolder(p1)||'Por identificar',address=supplyAddress(p1),place=splitPlace(address),cups=strictCups(all),invoiceNumber=labelledNumber(all,/N[º°o.]?\s*FACTURA\s*:/i,10,22)||'Por identificar',contract=labelledNumber(all,/N[º°o.]?\s*DE\s*CONTRATO\s*:/i,6,20),powerDetail=powerDetails(all,tariff),energyDetail=energyDetails(all,tariff);
    const discounts=sectionEuro(all,/Descuento\s+sobre\s+consumo/i,/CARGOS\s+NORMATIVOS|Financiaci[oó]n\s+bono\s+social|Impuesto\s+sobre\s+electricidad/i,260)??lineEuro(p1,/DESCUENTOS\s+ENERG[IÍ]A/i)??0;
    const socialSection=(()=>{const s=String(all),m=s.match(/Financiaci[oó]n\s+bono\s+social/i);if(!m)return null;const tail=s.slice(m.index,m.index+700),j=tail.search(/Impuesto\s+sobre\s+electricidad|TOTAL\s+ENERG[IÍ]A/i),seg=j>0?tail.slice(0,j):tail,vals=euroValues(seg);return vals.length?round2(vals.reduce((a,b)=>a+b,0)):null;})();
    const social=socialSection??lineEuro(p1,/CARGOS\s+NORMATIVOS/i)??0;
    const rental=sectionEuro(all,/Alquiler\s+equipos?\s+medida/i,/TOTAL\s+SERVICIOS|IMPORTE\s+TOTAL|^IVA/m,260)??lineEuro(p1,/SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS/i)??0;
    const tax=sectionEuro(all,/Impuesto\s+sobre\s+electricidad/i,/TOTAL\s+ENERG[IÍ]A/i,320)??0;
    const vat=sectionEuro(all,/^IVA(?:\s|\()/mi,/TOTAL\s+IMPORTE\s+FACTURA/i,220)??lineEuro(p1,/^IVA\b/i)??0;
    const total=sectionEuro(all,/TOTAL\s+IMPORTE\s+FACTURA/i,/\(\*\)|NIF\s+titular|N[º°o.]?\s*contador/i,160)??lineEuro(p1,/^TOTAL\b/i);
    const other=round2(Number(discounts)+Number(social)+Number(rental)),energy=energyDetail.energy,power=powerDetail.value,accounted=round2(Number(energy||0)+Number(power||0)+other+Number(tax||0)+Number(vat||0)),diff=total==null?null:round2(Number(total)-accounted),balanced=total!=null&&Math.abs(diff)<=.05,contracted={...powerDetail.contracted};
    const mContr=all.match(/Potencia\s+contratada\s*\(kW\)\s*:\s*([^\n]{1,120})/i);if(mContr){const vals=[...mContr[1].matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)].map(x=>num(x[1])).slice(0,6);vals.forEach((v,i)=>contracted[`P${i+1}`]=v);}
    const missing=[];if(company==='Por identificar')missing.push('titular');if(!cups)missing.push('CUPS');if(period.label==='Por identificar')missing.push('periodo');if(tariff==='—')missing.push('tarifa');if(total==null)missing.push('total');if(!powerDetail.reliable)missing.push(powerDetail.message||'potencia');if(!energyDetail.consumptionReliable)missing.push('consumo por periodos no cuadra con el consumo total');if(!energyDetail.costReliable)missing.push('coste de energía no cuadra con el detalle facturado');
    const readingActual=/[ÚU]ltima\s+lectura\s*:\s*real/i.test(all)||/siendo[\s\S]{0,100}?lecturas[\s\S]{0,50}?reales/i.test(all),readingEstimated=/[ÚU]ltima\s+lectura\s*:\s*estimada/i.test(all),reading=readingActual?{status:'actual',sourceLabel:'Lectura real indicada por Iberdrola'}:readingEstimated?{status:'estimated',sourceLabel:'Última lectura: estimada'}:(options.readingClassifier?.(all)||{status:'unknown',sourceLabel:''});
    const mx=maximeters(all),annual=annualDemand(all),alerts=[];if(mx._reliable){const ks=Object.keys(mx).filter(k=>/^P\d$/.test(k)&&(contracted[k]||0)>0);if(ks.length){const mc=Math.max(...ks.map(k=>contracted[k])),md=Math.max(...ks.map(k=>mx[k])),ratio=mc?md/mc:1;if(mc>=10&&ratio<=.5)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}}else if(annual.P1!=null&&contracted.P1){const mc=Math.max(contracted.P1||0,contracted.P2||0),md=Math.max(annual.P1||0,annual.P2||0),ratio=mc?md/mc:1;if(mc>=5&&ratio<=.7)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. anual ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}
    const readOk=balanced&&!missing.length;
    const distributor=clean((all.match(/Empresa\s+distribuidora\s*:\s*([^\n]+)/i)||[])[1]||''),accessContract=labelledNumber(all,/N[uú]mero\s+de\s+contrato\s+de\s+acceso\s*:/i,6,20),renewalDate=(all.match(/Fecha\s+final\s+del\s+contrato\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||'',permanence=clean((all.match(/Permanencia\s*:\s*([^\n]+)/i)||[])[1]||''),meterNumber=(all.match(/N[º°o.]?\s*contador\s*:\s*(\d{5,20})/i)||[])[1]||'',taxId=(all.match(/NIF\s+titular\s+del\s+contrato\s*:\s*([A-Z0-9-]+)/i)||[])[1]||'';
    return{file:file?.name||'',invoiceNumber,company,taxId,cups,period:period.label,tariff,kwh:energyDetail.kwh,energy,power,excess:0,reactive:0,compensation:0,social,rental,integratorAdjustment:0,regularizationReactive:0,other,tax,vat,igic:0,distributorCharges:0,distributorDescription:'',total,accounted,diff,balanced,readOk,readMessage:missing.length?`Falta o revisar: ${missing.join(', ')}`:balanced?'Lectura correcta':`Descuadre: ${money(diff)} €`,readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',avg:energyDetail.kwh&&total!=null?total/energyDetail.kwh:0,opportunity:alerts.length?alerts.join(' · '):'Sin alertas',periods:energyDetail.periods,contracted,maximeters:mx,maxDemandAnnual:annual,parserVersion:options.parserVersion||'',parserRevision:REVISION,powerDetail,energyPricingMode:energyDetail.pricingMode,sourceFormat:'iberdrola',supplier:'IBERDROLA CLIENTES, S.A.U.',retailer:'IBERDROLA CLIENTES, S.A.U.',commercializer:'IBERDROLA CLIENTES, S.A.U.',supplyAddress:address,supplyCity:place.city,supplyProvince:place.province,contract,contractNumber:contract,accessContract,distributor,contractType:'',renewalDate,permanence,meterNumber,issueDate:issueDate(all),billingStart:period.start,billingEnd:period.end,billingDays:period.days,discounts,reactivePeriods:reactiveMap(all,'Energ[ií]a\\s+reactiva'),capacitivePeriods:reactiveMap(all,'Energ[ií]a\\s+capacitiva'),activeReadings:energyDetail.activeReadings};
  }
  return Object.freeze({detect,parse,revision:REVISION,_test:{energyDetails,powerDetails,recipientName}});
});
