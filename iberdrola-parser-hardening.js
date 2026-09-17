(function(root,factory){
  const base=(typeof module!=='undefined'&&module.exports)?require('./iberdrola-parser.js'):root.IBTIberdrolaParser;
  const api=factory(base);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTIberdrolaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(base){
  'use strict';
  if(!base||typeof base.parse!=='function'||typeof base.detect!=='function')return base;

  const REVISION='2026.09.17.1';
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{
    if(v==null||v==='')return null;
    const s=String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');
    if(!s||s==='-'||s==='.')return null;
    const n=Number(s);return Number.isFinite(n)?n:null;
  };
  const euroValues=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastEuro=s=>{const v=euroValues(s);return v.length?v.at(-1):null;};
  const pagesOf=d=>(d?.pages||[]).map(p=>(p||[]).map(clean).filter(Boolean));
  const expectedPowerPeriods=t=>/^2\.0TD$/i.test(t)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(t)?6:0;
  const expectedEnergyPeriods=t=>/^2\.0TD$/i.test(t)?3:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(t)?6:0;
  const firstIndex=(a,re,start=0)=>{for(let i=Math.max(0,start);i<a.length;i++)if(re.test(String(a[i]||'')))return i;return-1;};
  const segment=(a,startRe,endRes,max=40)=>{
    const i=firstIndex(a,startRe);if(i<0)return'';
    let j=Math.min(a.length,i+max);
    for(let k=i+1;k<j;k++)if(endRes.some(re=>re.test(String(a[k]||'')))){j=k;break;}
    return a.slice(i,j).join('\n');
  };
  const lineAmount=(a,re)=>{const i=firstIndex(a,re);if(i<0)return null;return lastEuro(a[i]);};
  const summaryAmount=(p1,re)=>lineAmount(p1,re);
  const powerPeriod=(label,index,expected)=>{
    const q=String(label||'').toUpperCase();
    if(/^P[1-6]$/.test(q))return Number(q.slice(1));
    if(q==='PUNTA')return 1;if(q==='VALLE')return 2;
    return expected&&index<expected?index+1:null;
  };

  function activeReadings(lines){
    const out={};
    for(const line of lines){
      const m=line.match(/Energ[ií]a\s+activa[\s\S]{0,24}?\bP([1-6])\b[\s\S]*?(-?[\d.]+(?:,\d+)?)\s*kWh\b/i);
      if(m)out[`P${m[1]}`]=num(m[2]);
    }
    return out;
  }

  function robustPower(lines,tariff){
    const expected=expectedPowerPeriods(tariff),start=firstIndex(lines,/Potencia\s+facturada\b/i);
    if(start<0)return null;
    let end=firstIndex(lines,/Total\s+importe\s+potencia\b/i,start+1);if(end<0)end=Math.min(lines.length,start+16);
    const body=lines.slice(start,end),totalLine=end<lines.length?lines[end]:'';
    const markers=[];
    body.forEach((line,i)=>{
      const m=line.match(/(?:Potencia\s+facturada\s+)?\b(P[1-6]|Punta|Valle)\b/i);
      if(m)markers.push({i,label:m[1]});
    });
    const entries=[],contracted={};
    markers.forEach((mark,idx)=>{
      const next=idx+1<markers.length?markers[idx+1].i:body.length;
      const s=body.slice(mark.i,next).join(' '),period=powerPeriod(mark.label,idx,expected);
      const kw=(s.match(/([\d.,]+)\s*kW\b/i)||[])[1],days=(s.match(/(\d+)\s*d[ií]as?\b/i)||[])[1],price=(s.match(/([\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a/i)||[])[1],amount=lastEuro(s);
      if(!period||kw==null||amount==null)return;
      const entry={period,contractedKw:num(kw),days:days?Number(days):null,price:price?num(price):null,amount};
      entries.push(entry);contracted[`P${period}`]=entry.contractedKw;
    });
    entries.sort((a,b)=>a.period-b.period);
    const printed=lastEuro(totalLine),sum=round2(entries.reduce((s,e)=>s+(e.amount||0),0)),complete=expected?entries.length===expected:entries.length>0;
    const reliable=complete&&printed!=null&&Math.abs(sum-printed)<=Math.max(.05,(entries.length+1)*.005+.000001);
    return{value:printed!=null?printed:sum,sum,printedTotal:printed,entries,reliable,contracted,message:reliable?'':!complete?'Potencia: faltan periodos facturados':'Potencia: subtotal no cuadra con el detalle'};
  }

  function twoZeroBreakdown(text){
    const m=String(text||'').match(/consumos\s+desagregados\s+han\s+sido\s+punta\s*:\s*([\d.,]+)\s*kWh\s*;?\s*llano\s*:\s*([\d.,]+)\s*kWh\s*;?\s*valle\s*:?\s*([\d.,]+)\s*kWh/i);
    return m?{P1:num(m[1]),P2:num(m[2]),P3:num(m[3])}:{};
  }

  function robustEnergy(lines,tariff){
    const text=lines.join('\n'),readings=activeReadings(lines);
    if(/^2\.0TD$/i.test(tariff)){
      const s=segment(lines,/Energ[ií]a\s+consumida\b/i,[/Descuento\s+sobre\s+consumo\b/i,/CARGOS\s+NORMATIVOS\b/i],8);
      const km=(s.match(/([\d.,]+)\s*kWh\b/i)||[])[1],rate=(s.match(/([\d.,]+)\s*€\s*\/\s*kWh/i)||[])[1],amount=lastEuro(s),breakdown=twoZeroBreakdown(text),periods={};
      for(let p=1;p<=3;p++)periods[`P${p}`]={consumption:breakdown[`P${p}`]??readings[`P${p}`]??null,cost:null,price:rate?num(rate):null};
      const kwh=km?num(km):(Object.keys(breakdown).length===3?round2(Object.values(breakdown).reduce((x,v)=>x+Number(v||0),0)):null);
      const sumKwh=round2(Object.values(periods).reduce((x,q)=>x+Number(q.consumption||0),0)),calc=kwh!=null&&rate?round2(kwh*num(rate)):null;
      return{kwh,energy:amount,periods,sumKwh,sumCost:amount??0,consumptionReliable:kwh!=null&&Object.values(periods).every(q=>q.consumption!=null)&&Math.abs(sumKwh-kwh)<=.1,costReliable:amount!=null&&calc!=null&&Math.abs(calc-amount)<=.02,pricingMode:'single_rate'};
    }

    const expected=expectedEnergyPeriods(tariff)||6,periods={};for(let p=1;p<=expected;p++)periods[`P${p}`]={consumption:readings[`P${p}`]??null,cost:null,price:null};
    const start=firstIndex(lines,/Energ[ií]a\s+consumida\b/i);if(start<0)return null;
    let end=firstIndex(lines,/^\s*Total\s+[\d.,]+\s*kWh\b/i,start+1);if(end<0)end=Math.min(lines.length,start+16);
    const body=lines.slice(start,end),totalLine=end<lines.length?lines[end]:'';
    const markers=[];body.forEach((line,i)=>{const m=line.match(/(?:Energ[ií]a\s+consumida\s+)?\bP([1-6])\b/i);if(m)markers.push({i,p:Number(m[1])});});
    markers.forEach((mark,idx)=>{
      const next=idx+1<markers.length?markers[idx+1].i:body.length,s=body.slice(mark.i,next).join(' '),km=(s.match(/([\d.,]+)\s*kWh\b/i)||[])[1],rate=(s.match(/([\d.,]+)\s*€\s*\/\s*kWh/i)||[])[1],cost=lastEuro(s),key=`P${mark.p}`;
      periods[key]={consumption:km?num(km):periods[key].consumption,price:rate?num(rate):null,cost};
    });
    const totalMatch=totalLine.match(/Total\s+([\d.,]+)\s*kWh\b/i),printedKwh=totalMatch?num(totalMatch[1]):null,printedCost=lastEuro(totalLine);
    const knownCost=round2(Object.values(periods).filter(q=>q.cost!=null).reduce((x,q)=>x+Number(q.cost),0));
    for(const q of Object.values(periods))if(q.cost==null&&q.consumption===0&&printedCost!=null&&Math.abs(knownCost-printedCost)<=.05)q.cost=0;
    const sumKwh=round2(Object.values(periods).reduce((x,q)=>x+Number(q.consumption||0),0)),sumCost=round2(Object.values(periods).reduce((x,q)=>x+Number(q.cost||0),0));
    return{kwh:printedKwh!=null?printedKwh:sumKwh,energy:printedCost!=null?printedCost:sumCost,periods,sumKwh,sumCost,consumptionReliable:printedKwh!=null&&Object.values(periods).every(q=>q.consumption!=null)&&Math.abs(sumKwh-printedKwh)<=.1,costReliable:printedCost!=null&&Object.values(periods).every(q=>q.cost!=null)&&Math.abs(sumCost-printedCost)<=.05,pricingMode:'periods'};
  }

  function robustConcepts(lines,p1,power,energy){
    const summaryEnergy=summaryAmount(p1,/^\s*ENERG[IÍ]A\b/i),summaryDiscount=summaryAmount(p1,/DESCUENTOS\s+ENERG[IÍ]A/i),summaryNormative=summaryAmount(p1,/CARGOS\s+NORMATIVOS/i),summaryServices=summaryAmount(p1,/SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS/i),summaryVat=summaryAmount(p1,/^\s*IVA\b/i);
    const discountScope=segment(lines,/Descuento\s+sobre\s+consumo\b/i,[/CARGOS\s+NORMATIVOS\b/i,/Financiaci[oó]n\s+bono\s+social/i,/Impuesto\s+sobre\s+electricidad/i],5),discount=lastEuro(discountScope)??summaryDiscount??0;
    const socialScope=segment(lines,/Financiaci[oó]n\s+bono\s+social/i,[/Impuesto\s+sobre\s+electricidad/i,/TOTAL\s+ENERG[IÍ]A/i],8),socialValues=euroValues(socialScope),social=socialValues.length?round2(socialValues.reduce((s,v)=>s+v,0)):(summaryNormative??0);
    const taxScope=segment(lines,/Impuesto\s+sobre\s+electricidad/i,[/TOTAL\s+ENERG[IÍ]A/i,/SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS/i],5),taxValues=euroValues(taxScope);let tax=taxValues.length?taxValues.at(-1):null;
    if((tax==null||tax<0)&&summaryEnergy!=null&&power!=null&&energy!=null)tax=round2(summaryEnergy-power-energy);
    const rentalScope=segment(lines,/Alquiler\s+equipos?\s+medida/i,[/TOTAL\s+SERVICIOS/i,/IMPORTE\s+TOTAL/i,/^\s*IVA\b/i],5),rental=lastEuro(rentalScope)??summaryServices??0;
    const vatScope=segment(lines,/^\s*IVA(?:\s|\()/i,[/TOTAL\s+IMPORTE\s+FACTURA/i],4),vat=lastEuro(vatScope)??summaryVat??0;
    return{discount,social,tax:tax??0,rental,vat,summaryEnergy};
  }

  function harden(result,d){
    const pages=pagesOf(d),p1=pages[0]||[],lines=pages.flat(),tariff=result.tariff||'',powerDetail=robustPower(lines,tariff),energyDetail=robustEnergy(lines,tariff);
    if(!powerDetail||!energyDetail)return result;
    const power=powerDetail.value,energy=energyDetail.energy,concepts=robustConcepts(lines,p1,power,energy),contracted={...(result.contracted||{}),...(powerDetail.contracted||{})};
    const total=result.total!=null?Number(result.total):summaryAmount(p1,/^\s*TOTAL\b/i),discounts=concepts.discount,other=round2(discounts+concepts.social+concepts.rental+Number(result.integratorAdjustment||0)+Number(result.regularizationReactive||0));
    const accounted=round2(Number(energy||0)+Number(power||0)+Number(result.excess||0)+Number(result.reactive||0)+Number(result.compensation||0)+other+Number(concepts.tax||0)+Number(concepts.vat||0)+Number(result.igic||0)+Number(result.distributorCharges||0));
    const diff=total==null?null:round2(Number(total)-accounted),balanced=total!=null&&Math.abs(diff)<=.05,missing=[];
    if(!result.company||result.company==='Por identificar')missing.push('titular');if(!result.cups)missing.push('CUPS');if(!result.period||result.period==='Por identificar')missing.push('periodo');if(!tariff||tariff==='—')missing.push('tarifa');if(total==null)missing.push('total');
    if(!powerDetail.reliable)missing.push(powerDetail.message||'potencia');if(!energyDetail.consumptionReliable)missing.push('consumo por periodos no cuadra con el consumo total');if(!energyDetail.costReliable)missing.push('coste de energía no cuadra con el detalle facturado');
    const expected=expectedPowerPeriods(tariff);if(expected&&Object.keys(contracted).filter(k=>/^P\d$/.test(k)&&contracted[k]!=null).length!==expected)missing.push('potencias contratadas');
    let readingStatus=result.readingStatus||'unknown',readingSourceLabel=result.readingSourceLabel||'';const all=lines.join('\n');
    if(readingStatus==='unknown'&&/[ÚU]ltima\s+lectura\s*:\s*real/i.test(all)){readingStatus='actual';readingSourceLabel='Lectura real indicada por Iberdrola';}
    else if(readingStatus==='unknown'&&/siendo[\s\S]{0,120}?lecturas[\s\S]{0,40}?reales/i.test(all)){readingStatus='actual';readingSourceLabel='Lecturas reales indicadas por Iberdrola';}
    const readOk=balanced&&!missing.length;
    if(!readOk)return result;
    return{...result,kwh:energyDetail.kwh,energy,power,social:concepts.social,rental:concepts.rental,discounts,other,tax:concepts.tax,vat:concepts.vat,total,accounted,diff,balanced:true,readOk:true,readMessage:'Lectura correcta',periods:energyDetail.periods,contracted,powerDetail,energyPricingMode:energyDetail.pricingMode,readingStatus,readingSourceLabel,hardeningRevision:REVISION};
  }

  return Object.freeze({
    detect:base.detect,
    parse(d,file,options={}){
      const result=base.parse(d,file,options);
      if(!result||result.readOk)return result;
      return harden(result,d);
    },
    hardeningRevision:REVISION
  });
});