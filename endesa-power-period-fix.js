(function(root,factory){
  const tool=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=tool;
  if(root&&root.IBTInvoiceFormats?.parseEndesa&&root.IBTInvoiceFormats.__powerPeriodFixVersion!==tool.version){
    root.IBTInvoiceFormats=tool.patch(root.IBTInvoiceFormats);
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='2026.09.15.2';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const round3=n=>Math.round((Number(n)||0)*1000)/1000;
  const round6=n=>Math.round((Number(n)||0)*1000000)/1000000;
  const num=v=>{if(v==null||v==='')return null;let s=String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');if(!s||s==='-'||s==='.')return null;const n=Number(s);return Number.isFinite(n)?n:null};

  function periodFromSource(source,tariff){
    const s=text(source),t=text(tariff).toUpperCase().replace(/\s+/g,'');
    const explicit=s.match(/\bPot\.\s*P([1-6])\b/i);
    if(explicit){
      const p=Number(explicit[1]);
      // En 2.0TD Endesa denomina a veces el periodo valle como P3 en la factura,
      // mientras nuestro modelo normalizado usa P1/P2 para potencia contratada.
      if(t==='2.0TD'&&p===3)return 2;
      return p;
    }
    if(t==='2.0TD'){
      if(/\bPunta(?:\s*[-–]\s*(?:Llano|Pla))?\b/i.test(s))return 1;
      if(/\b(?:Valle|Vall)\b/i.test(s))return 2;
    }
    return null;
  }

  function aggregatePowerDetail(detail,tariff){
    const entries=Array.isArray(detail?.entries)?detail.entries:[];
    if(!entries.length)return detail;
    const classified=entries.map(e=>({...e,period:periodFromSource(e?.source,tariff)}));
    // Si alguna línea no se puede clasificar con certeza, no inventamos reparto.
    if(classified.some(e=>!e.period))return detail;
    const groups=new Map();
    for(const e of classified){
      if(!groups.has(e.period))groups.set(e.period,{period:e.period,amount:0,sources:[]});
      const g=groups.get(e.period);g.amount+=Number(e.amount)||0;if(e.source)g.sources.push(e.source);
    }
    const aggregated=[...groups.values()].sort((a,b)=>a.period-b.period).map(g=>({
      period:g.period,
      amount:round2(g.amount),
      source:g.sources.join(' | '),
      sources:g.sources
    }));
    const sum=round2(aggregated.reduce((s,e)=>s+e.amount,0));
    const printed=detail?.printedTotal==null?null:Number(detail.printedTotal);
    const reliable=detail?.reliable!==false&&(printed==null||Math.abs(sum-printed)<=.05);
    return {...detail,entries:aggregated,rawEntries:classified,sum,reliable};
  }

  function energyPeriod(label){
    const s=text(label).toUpperCase();
    const p=s.match(/^P([1-6])$/);if(p)return Number(p[1]);
    if(s==='PUNTA')return 1;
    if(s==='LLANO'||s==='PLA')return 2;
    if(s==='VALLE'||s==='VALL')return 3;
    return null;
  }

  function aggregateEnergyPeriods(lines,periods,totalKwh,summaryEnergy){
    const groups=new Map(),raw=[];
    const re=/\bConsumo\s+(P[1-6]|Punta|Llano|Valle)\s+([\d.]+,\d+)\s*kWh\s*[x×]\s*([\d.]+,\d+)\s*(?:Eur|€)\s*\/\s*kWh.*?(-?[\d.]+,\d{2})\s*€/i;
    for(const source of lines||[]){
      const m=text(source).match(re);if(!m)continue;
      const period=energyPeriod(m[1]),kwh=num(m[2]),price=num(m[3]),amount=num(m[4]);
      if(!period||kwh==null||price==null||amount==null)continue;
      const item={period,kwh,price,amount,source:text(source)};raw.push(item);
      if(!groups.has(period))groups.set(period,{period,kwh:0,cost:0,weighted:0,sources:[]});
      const g=groups.get(period);g.kwh+=kwh;g.cost+=amount;g.weighted+=kwh*price;g.sources.push(item.source);
    }
    if(!raw.length)return {periods,detail:{status:'not_present',reliable:false,entries:[]}};
    const entries=[...groups.values()].sort((a,b)=>a.period-b.period).map(g=>({
      period:g.period,kwh:round3(g.kwh),cost:round2(g.cost),price:g.kwh>0?round6(g.weighted/g.kwh):null,sources:g.sources
    }));
    const parsedKwh=round3(entries.reduce((s,e)=>s+e.kwh,0)),parsedCost=round2(entries.reduce((s,e)=>s+e.cost,0));
    const kwhOk=totalKwh==null||Math.abs(parsedKwh-Number(totalKwh))<=.02;
    const costOk=summaryEnergy==null||Math.abs(parsedCost-Number(summaryEnergy))<=.05;
    const reliable=kwhOk&&costOk;
    if(!reliable)return {periods,detail:{status:'mismatch',reliable:false,entries,parsedKwh,parsedCost,totalKwh,summaryEnergy}};
    const enriched={...(periods||{})};
    for(const e of entries){const key='P'+e.period;enriched[key]={...(enriched[key]||{}),consumption:e.kwh,cost:e.cost,price:e.price};}
    return {periods:enriched,detail:{status:'extracted',reliable:true,entries,parsedKwh,parsedCost,totalKwh,summaryEnergy}};
  }

  function patch(base){
    if(!base?.parseEndesa||base.__powerPeriodFixVersion===VERSION)return base;
    const original=base.parseEndesa.bind(base);
    const api={...base,__powerPeriodFixVersion:VERSION,parseEndesa(d,file,options={}){
      const row=original(d,file,options);if(!row||row.unsupported)return row;
      const pages=(d?.pages||[]).map(p=>typeof base.canonicalEndesaLines==='function'?base.canonicalEndesaLines(p):p||[]);
      const energy=aggregateEnergyPeriods(pages.flat(),row.periods,row.kwh,row.energy);
      return {...row,periods:energy.periods,energyDetail:energy.detail,powerDetail:aggregatePowerDetail(row.powerDetail,row.tariff)};
    }};
    return Object.freeze(api);
  }

  return Object.freeze({version:VERSION,patch,periodFromSource,aggregatePowerDetail,energyPeriod,aggregateEnergyPeriods});
});
