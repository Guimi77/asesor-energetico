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
  const euroValues=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastEuro=s=>{const values=euroValues(s);return values.length?values.at(-1):null;};
  const pagesOf=d=>(d?.pages||[]).map(page=>(page||[]).map(clean).filter(Boolean));
  const flat=pages=>pages.flat();
  const textOf=lines=>(lines||[]).join('\n');
  const lineIndex=(lines,re)=>lines.findIndex(line=>re.test(String(line||'')));
  const normalizeTariff=s=>{
    const m=String(s||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i);
    return m?m[1].replace(/\s+/g,'').toUpperCase():'—';
  };
  const normalizeCups=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const expectedPowerPeriods=tariff=>/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;
  const expectedEnergyPeriods=tariff=>/^2\.0TD$/i.test(tariff)?3:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;
  const toIso=s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';};

  function cutAtStops(value,stopRes=[]){
    let s=String(value||''),end=s.length;
    for(const re of stopRes||[]){
      const flags=re.flags.replace(/g/g,'');
      const m=s.match(new RegExp(re.source,flags));
      if(m&&m.index>0)end=Math.min(end,m.index);
    }
    return s.slice(0,end);
  }
  function segmentForLine(line,startRe,stopRes=[]){
    const s=String(line||''),flags=startRe.flags.replace(/g/g,''),m=s.match(new RegExp(startRe.source,flags));
    if(!m)return'';
    return cutAtStops(s.slice(m.index),stopRes);
  }
  function amountOnMatchingLine(lines,startRe,stopRes=[]){
    for(const line of lines||[]){
      const segment=segmentForLine(line,startRe,stopRes);
      if(!segment)continue;
      const value=lastEuro(segment);
      if(value!=null)return value;
    }
    return null;
  }
  function amountOnLastMatchingLine(lines,startRe,stopRes=[]){
    for(let i=(lines||[]).length-1;i>=0;i--){
      const segment=segmentForLine(lines[i],startRe,stopRes);
      if(!segment)continue;
      const value=lastEuro(segment);
      if(value!=null)return value;
    }
    return null;
  }
  function sumAmountsOnMatchingLines(lines,startRe,stopRes=[]){
    let total=0,found=false;
    for(const line of lines||[]){
      const segment=segmentForLine(line,startRe,stopRes);
      if(!segment)continue;
      const value=lastEuro(segment);
      if(value!=null){total+=value;found=true;}
    }
    return found?round2(total):null;
  }
  function nextLongNumber(text,labelRe,min=6,max=22,window=260){
    const s=String(text||''),flags=labelRe.flags.replace(/g/g,''),m=s.match(new RegExp(labelRe.source,flags));
    if(!m)return'';
    const tail=s.slice((m.index||0)+m[0].length,(m.index||0)+m[0].length+window);
    const n=tail.match(new RegExp(`\\b(\\d{${min},${max}})\\b`));
    return n?n[1]:'';
  }

  function detect(value){
    const s=Array.isArray(value)?value.flat().join('\n'):String(value||'');
    return /IBERDROLA\s+CLIENTES\s*,?\s*S\.A\.U\./i.test(s)
      && /(?:RESUMEN\s+DE\s+FACTURA|FACTURA\s+DE\s+ELECTRICIDAD)/i.test(s)
      && /(?:TOTAL\s+IMPORTE\s+FACTURA|Peaje\s+de\s+acceso\s+a\s+la\s+red\s*\(ATR\)|N[º°o.]?\s*DE\s*CONTRATO)/i.test(s);
  }

  function parseHolder(p1){
    const start=lineIndex(p1,/\bCONTRATO\b/i),end=lineIndex(p1,/Direcci[oó]n\s+de\s+suministro\s*:/i);
    const scope=p1.slice(Math.max(0,start+1),end>start?end:Math.min(p1.length,start+14));
    const blocked=/(?:IBERDROLA|CONTRATO|CIF|TITULAR|POTENCIA|FACTURA|DIRECCI[ÓO]N|REMIT[Ee]|APARTADO|REGISTRO|MERCANTIL|BIZKAIA|FOLIO|TOMO|HOJA)/i;
    const candidates=[],runs=[];let current=[];
    for(const raw of scope){
      const q=clean(raw),valid=q&&!blocked.test(q)&&!/\d|[:€]/.test(q)&&/^[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ·' .&/-]{5,}$/i.test(q)&&q.split(/\s+/).filter(Boolean).length>=1;
      if(valid){candidates.push(q);current.push(q);continue;}
      if(current.length){runs.push(clean(current.join(' ')));current=[];}
    }
    if(current.length)runs.push(clean(current.join(' ')));
    const options=[...runs,...candidates].filter(q=>q.split(/\s+/).filter(Boolean).length>=2);
    if(options.length)return options.sort((a,b)=>b.length-a.length)[0];
    const text=textOf(p1),m=text.match(/Titular\s*(?:\n|\s)+([A-ZÁÉÍÓÚÜÑÇ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ·' .&/-]{4,90}?)(?=\s+Direcci[oó]n\s+de\s+suministro)/i);
    return clean(m?.[1]||'').replace(/\bPotencia\b.*$/i,'').trim();
  }

  function cleanAddressNoise(value){
    let s=clean(value);
    for(let i=0;i<3;i++)s=s.replace(/^(?:de|Mercantil|Registro|Bizkaia,?|tomo|folio|hoja|inscripci[oó]n|Bilbao;?|Madrid;?)\s+/i,'');
    return clean(s);
  }
  function parseSupplyAddress(p1){
    const i=lineIndex(p1,/Direcci[oó]n\s+de\s+suministro\s*:/i);if(i<0)return'';
    const candidates=[];
    for(let n=i;n<Math.min(p1.length,i+9);n++){
      let q=cleanAddressNoise(p1[n]);
      q=clean(q.replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,''));
      if(!q)continue;
      if(/N[º°o.]?\s*DE\s*CONTRATO|RESUMEN\s+DE\s+FACTURA/i.test(q))break;
      if(n===i&&!/(?:C\/|CL\b|CALLE\b|CARRER\b|AV\b|AVDA\b|PASEO\b|PLAZA\b|CTRA\b)/i.test(q))continue;
      if(candidates.length===0&&!/(?:C\/|CL\b|CALLE\b|CARRER\b|AV\b|AVDA\b|PASEO\b|PLAZA\b|CTRA\b)/i.test(q))continue;
      if(/^(?:de|Mercantil|Registro|Bizkaia|tomo|folio|hoja)$/i.test(q))continue;
      candidates.push(q);
    }
    return clean(candidates.join(' '));
  }

  function splitPlace(address){
    const s=clean(address),m=s.match(/\b(\d{5})\s+(.+?)(?:\s*\(([^()]*)\))?\s*$/i);
    if(!m)return{city:'',province:''};
    return{city:clean(m[2]).replace(/\s*\([^)]*\)\s*$/,''),province:clean(m[3]||'')};
  }

  function parsePeriod(p1){
    const text=textOf(p1),label=text.search(/PERIODO\s+DE\s+FACTURACI[ÓO]N\s*:/i);
    const scope=label>=0?text.slice(label,label+420):text;
    const m=scope.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
    if(!m)return{label:'Por identificar',start:'',end:'',days:null};
    const di=text.search(/D[IÍ]AS\s+FACTURADOS\s*:/i),daysScope=di>=0?text.slice(di,di+180):'';
    const dm=daysScope.match(/D[IÍ]AS\s+FACTURADOS\s*:?[^\d]{0,100}\b(\d{1,3})\b/i);
    const days=dm?Number(dm[1]):null;
    return{label:`${m[1]} - ${m[2]}${days?` (${days} días)`:''}`,start:toIso(m[1]),end:toIso(m[2]),days};
  }

  function parseReadingRows(lines,label,unit){
    const out={},markerRe=new RegExp(`${label}\\s+P([1-6])\\b`,'i'),unitRe=new RegExp(`(-?[\\d.,]+)\\s*${unit}\\b`,'ig');
    for(const raw of lines||[]){
      const line=String(raw||''),marker=line.match(markerRe);if(!marker)continue;
      const segment=line.slice(marker.index||0),values=[...segment.matchAll(unitRe)];
      if(values.length)out[`P${marker[1]}`]=num(values.at(-1)[1]);
    }
    return out;
  }

  function parsePower(lines,tariff){
    const entries=[],contracted={},expected=expectedPowerPeriods(tariff);
    const formula=/([\d.,]+)\s*kW\s*[x×]\s*(\d+)\s*d[ií]as?\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a\s+(-?[\d.,]+)\s*€/i;
    for(const raw of lines||[]){
      const line=String(raw||''),m=line.match(formula);if(!m)continue;
      let period=null;
      const pn=line.match(/\bP([1-6])\b/i);if(pn)period=Number(pn[1]);
      else if(/\bPunta\b/i.test(line))period=1;
      else if(/\bValle\b/i.test(line))period=2;
      if(!period||entries.some(e=>e.period===period))continue;
      const entry={period,contractedKw:num(m[1]),days:Number(m[2]),price:num(m[3]),amount:num(m[4])};
      entries.push(entry);contracted[`P${period}`]=entry.contractedKw;
    }
    entries.sort((a,b)=>a.period-b.period);
    const sum=round2(entries.reduce((s,e)=>s+(e.amount||0),0));
    const printed=amountOnMatchingLine(lines,/Total\s+importe\s+potencia\b/i,[/Energ[ií]a\s+consumida/i,/Descuento\s+sobre\s+consumo/i]);
    const complete=expected?entries.length===expected:entries.length>0;
    const reliable=complete&&printed!=null&&Math.abs(sum-printed)<=Math.max(.05,(entries.length+1)*.005+.000001);
    return{value:printed!=null?printed:sum,sum,printedTotal:printed,entries,reliable,contracted,message:reliable?'':!complete?'Potencia: faltan periodos facturados':'Potencia: subtotal no cuadra con el detalle'};
  }

  function parseTwoZeroBreakdown(all){
    const m=String(all||'').match(/consumos\s+desagregados\s+han\s+sido\s+punta\s*:\s*([\d.,]+)\s*kWh\s*;?\s*llano\s*:\s*([\d.,]+)\s*kWh\s*;?\s*valle\s*:?\s*([\d.,]+)\s*kWh/i);
    if(!m)return{};
    return{P1:num(m[1]),P2:num(m[2]),P3:num(m[3])};
  }

  function parseEnergy(lines,tariff,activeReadings,all){
    if(/^2\.0TD$/i.test(tariff)){
      const formula=String(all||'').match(/Energ[ií]a\s+consumida\s+([\d.,]+)\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kWh\s+(-?[\d.,]+)\s*€/i);
      const breakdown=parseTwoZeroBreakdown(all),periods={};
      for(let p=1;p<=3;p++)periods[`P${p}`]={consumption:breakdown[`P${p}`]??null,cost:null,price:formula?num(formula[2]):null};
      const kwh=formula?num(formula[1]):round2(Object.values(breakdown).reduce((s,v)=>s+(Number(v)||0),0));
      const energy=formula?num(formula[3]):null;
      const sumKwh=round2(Object.values(breakdown).reduce((s,v)=>s+(Number(v)||0),0));
      const consumptionReliable=kwh!=null&&Object.keys(breakdown).length===3&&Math.abs(sumKwh-kwh)<=.1;
      const calc=formula?Number(formula[1].replace(/\./g,'').replace(',','.'))*Number(formula[2].replace(/\./g,'').replace(',','.')):null;
      const costReliable=energy!=null&&calc!=null&&Math.abs(round2(calc)-energy)<=.02;
      return{kwh,energy,periods,sumKwh,sumCost:energy??0,consumptionReliable,costReliable,pricingMode:'single_rate'};
    }

    const periods={},expected=expectedEnergyPeriods(tariff)||6;
    for(let p=1;p<=expected;p++)periods[`P${p}`]={consumption:activeReadings[`P${p}`]??null,cost:null,price:null};
    const formula=/\bP([1-6])\s+([\d.,]+)\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kWh\s+(-?[\d.,]+)\s*€/i;
    for(const raw of lines||[]){
      const m=String(raw||'').match(formula);if(!m)continue;
      periods[`P${m[1]}`]={consumption:num(m[2]),price:num(m[3]),cost:num(m[4])};
    }
    for(let p=1;p<=expected;p++){
      const key=`P${p}`,q=periods[key];
      if(q&&q.consumption===0&&q.cost==null)q.cost=0;
    }
    const totalLine=(lines||[]).find(x=>/^\s*Total\s+[\d.,]+\s*kWh\s+hasta\b/i.test(String(x||'')))||'';
    const subtotalKwh=(String(totalLine).match(/Total\s+([\d.,]+)\s*kWh/i)||[])[1];
    const printedKwh=num(subtotalKwh),printedCost=lastEuro(cutAtStops(totalLine,[/Descuento\s+sobre\s+consumo/i]));
    const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+(Number(q?.consumption)||0),0));
    const knownCosts=Object.values(periods).filter(q=>q?.cost!=null),sumCost=round2(knownCosts.reduce((s,q)=>s+(Number(q.cost)||0),0));
    const hasAllConsumption=Object.values(periods).every(q=>q?.consumption!=null);
    const consumptionReliable=printedKwh!=null&&hasAllConsumption&&Math.abs(sumKwh-printedKwh)<=.1;
    const costReliable=printedCost!=null&&knownCosts.length===Object.values(periods).length&&Math.abs(sumCost-printedCost)<=.05;
    return{kwh:printedKwh!=null?printedKwh:sumKwh,energy:printedCost!=null?printedCost:sumCost,periods,sumKwh,sumCost,consumptionReliable,costReliable,pricingMode:'periods'};
  }

  function parseContractedInfo(all,tariff,fallback){
    const out={...fallback},expected=expectedPowerPeriods(tariff);
    const m=String(all||'').match(/Potencia\s+contratada\s*\(kW\)\s*:\s*([^\n]{1,120})/i);
    if(m){
      const values=[...m[1].matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)].map(x=>num(x[1])).filter(v=>v!=null).slice(0,expected||6);
      if(!expected||values.length>=expected)values.forEach((v,i)=>{if(i<(expected||values.length))out[`P${i+1}`]=v;});
    }
    return out;
  }

  function parseMaxDemandAnnual(all){
    const m=String(all||'').match(/potencias\s+m[aá]ximas\s+demandadas[^.]{0,160}?([\d.,]+)\s*kW\s+en\s+P1[^.]{0,80}?([\d.,]+)\s*kW\s+en\s+P2/i);
    return m?{P1:num(m[1]),P2:num(m[2]),_source:'annual_max_demand'}:{};
  }

  function parse(d,file,options={}){
    const pages=pagesOf(d),p1=pages[0]||[],allLines=flat(pages),all=textOf(allLines),p1text=textOf(p1);
    if(!detect(all))return null;
    const holder=parseHolder(p1),supplyAddress=parseSupplyAddress(p1),place=splitPlace(supplyAddress),periodInfo=parsePeriod(p1);
    const invoiceNumber=nextLongNumber(p1text,/N[º°o.]?\s*FACTURA\s*:/i,10,22,320)||'Por identificar';
    const contract=nextLongNumber(p1text,/N[º°o.]?\s*DE\s*CONTRATO\s*:/i,6,20,120);
    const cupsLabel=all.search(/Identificaci[oó]n\s+punto\s+de\s+suministro\s*\(CUPS\)\s*:/i),cupsScope=cupsLabel>=0?all.slice(cupsLabel,cupsLabel+260):all;
    const cupsRaw=(cupsScope.match(/ES(?:[ \t]*[A-Z0-9]){18}/i)||all.match(/\bES(?:[ \t]*[A-Z0-9]){18}\b/i)||[])[0]||'';
    const cups=normalizeCups(cupsRaw),tariff=normalizeTariff(all);
    const activeReadings=parseReadingRows(allLines,'Energ[ií]a activa','kWh'),reactiveReadings=parseReadingRows(allLines,'Energ[ií]a reactiva','kVArh'),capacitiveReadings=parseReadingRows(allLines,'Energ[ií]a capacitiva','kVArh');
    const powerDetail=parsePower(allLines,tariff),energyDetail=parseEnergy(allLines,tariff,activeReadings,all),contracted=parseContractedInfo(all,tariff,powerDetail.contracted);
    const maximeters=parseReadingRows(allLines,'Max[ií]metro','kW');if(Object.keys(maximeters).length===(expectedPowerPeriods(tariff)||0))maximeters._reliable=true;
    const maxDemandAnnual=parseMaxDemandAnnual(all);
    const total=amountOnMatchingLine(allLines,/TOTAL\s+IMPORTE\s+FACTURA/i,[/^\(\*\)/i,/N[º°o.]?\s*contador/i,/INFORMACI[ÓO]N/i]),
      discounts=sumAmountsOnMatchingLines(allLines,/Descuento\s+sobre\s+consumo/i,[/CARGOS\s+NORMATIVOS/i,/Financiaci[oó]n\s+bono\s+social/i,/Impuesto\s+sobre\s+electricidad/i])??0,
      social=sumAmountsOnMatchingLines(allLines,/Financiaci[oó]n\s+bono\s+social\s+fijo/i,[/Impuesto\s+sobre\s+electricidad/i,/TOTAL\s+ENERG[IÍ]A/i])??0,
      tax=amountOnMatchingLine(allLines,/Impuesto\s+sobre\s+electricidad/i,[/TOTAL\s+ENERG[IÍ]A/i,/SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS/i,/Alquiler\s+equipos?\s+medida/i])??0,
      rental=sumAmountsOnMatchingLines(allLines,/Alquiler\s+equipos?\s+medida/i,[/TOTAL\s+SERVICIOS/i,/IMPORTE\s+TOTAL/i,/^IVA\b/i])??0,
      vat=amountOnLastMatchingLine(allLines,/^IVA(?:\s|\()/i,[/TOTAL\s+IMPORTE\s+FACTURA/i])??0;
    const energy=energyDetail.energy,power=powerDetail.value,excess=0,reactive=0,compensation=0,igic=0,distributorCharges=0,integratorAdjustment=0,regularizationReactive=0;
    const other=round2(discounts+social+rental),accounted=round2((energy||0)+(power||0)+other+tax+vat),diff=total==null?null:round2(total-accounted),balanced=total!=null&&Math.abs(diff)<=.05;
    const distributorLine=(allLines||[]).find(x=>/Empresa\s+distribuidora\s*:/i.test(String(x||'')))||'',distributor=clean(distributorLine.replace(/^.*?Empresa\s+distribuidora\s*:\s*/i,'').split(/N[uú]mero\s+de\s+contrato\s+de\s+acceso\s*:/i)[0]);
    const accessContract=nextLongNumber(all,/N[uú]mero\s+de\s+contrato\s+de\s+acceso\s*:/i,6,20,120);
    const renewalDate=((all.match(/Fecha\s+final\s+del\s+contrato\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1])||'';
    const permanence=((all.match(/Permanencia\s*:\s*([^\n]+)/i)||[])[1]||'').trim();
    const meterNumber=((all.match(/N[º°o.]?\s*contador\s*:\s*(\d{5,20})/i)||[])[1])||'';
    const taxId=((all.match(/NIF\s+titular\s+del\s+contrato\s*:\s*([A-Z0-9-]+)/i)||[])[1])||'';
    const issueMatch=p1text.match(/FECHA\s+DE\s+EMISI[ÓO]N\s*:[^\n]{0,120}\n?[^\n]{0,120}?(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i)||p1text.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
    const missing=[];
    if(!holder)missing.push('titular');if(!cups)missing.push('CUPS');if(periodInfo.label==='Por identificar')missing.push('periodo');if(tariff==='—')missing.push('tarifa');if(total==null)missing.push('total');
    if(!powerDetail.reliable)missing.push(powerDetail.message||'potencia');if(!energyDetail.consumptionReliable)missing.push('consumo por periodos no cuadra con el consumo total');if(!energyDetail.costReliable)missing.push('coste de energía no cuadra con el detalle facturado');
    const expected=expectedPowerPeriods(tariff);if(expected&&Object.keys(contracted).filter(k=>/^P\d$/.test(k)).length!==expected)missing.push('potencias contratadas');
    const readingDirect=/[ÚU]ltima\s+lectura\s*:\s*real/i.test(all)||/siendo\s+estas\s+lecturas\s+reales/i.test(all)?{status:'actual',sourceLabel:'Lectura real indicada por Iberdrola'}:/[ÚU]ltima\s+lectura\s*:\s*estimada/i.test(all)?{status:'estimated',sourceLabel:'Última lectura: estimada'}:null;
    const fallbackReading=options.readingClassifier?.(all)||{status:'unknown',sourceLabel:null},reading=readingDirect||fallbackReading;
    const alerts=[];
    const usable=maximeters._reliable?Object.keys(maximeters).filter(k=>/^P\d$/.test(k)&&(contracted[k]||0)>0):[];
    if(usable.length){const mc=Math.max(...usable.map(k=>contracted[k])),md=Math.max(...usable.map(k=>maximeters[k])),ratio=mc?md/mc:1;if(mc>=10&&md>0&&ratio<=.5)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}
    const readOk=balanced&&!missing.length;
    const months={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
    const normalizedIssueDate=issueMatch?`${issueMatch[3]}-${months[issueMatch[2].toLowerCase()]||''}-${String(issueMatch[1]).padStart(2,'0')}`:'';
    return{
      file:file?.name||'',invoiceNumber,company:holder||'Por identificar',taxId,cups,period:periodInfo.label,tariff,kwh:energyDetail.kwh,energy,power,excess,reactive,compensation,social,rental,integratorAdjustment,regularizationReactive,other,tax,vat,igic,distributorCharges,distributorDescription:'',total,accounted,diff,balanced,readOk,
      readMessage:missing.length?`Falta o revisar: ${missing.join(', ')}`:balanced?'Lectura correcta':`Descuadre: ${money(diff)} €`,readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',avg:energyDetail.kwh&&total!=null?total/energyDetail.kwh:0,opportunity:alerts.length?alerts.join(' · '):'Sin alertas',periods:energyDetail.periods,contracted,maximeters,maxDemandAnnual,parserVersion:options.parserVersion||'',powerDetail,energyPricingMode:energyDetail.pricingMode,
      sourceFormat:'iberdrola',supplier:'IBERDROLA CLIENTES, S.A.U.',retailer:'IBERDROLA CLIENTES, S.A.U.',commercializer:'IBERDROLA CLIENTES, S.A.U.',supplyAddress,supplyCity:place.city,supplyProvince:place.province,contract,contractNumber:contract,accessContract,distributor,contractType:'',renewalDate,permanence,meterNumber,issueDate:normalizedIssueDate,billingStart:periodInfo.start,billingEnd:periodInfo.end,billingDays:periodInfo.days,discounts,reactivePeriods:reactiveReadings,capacitivePeriods:capacitiveReadings,activeReadings
    };
  }

  return Object.freeze({detect,parse});
});
