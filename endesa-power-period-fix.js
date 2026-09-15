(function(root,factory){
  const tool=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=tool;
  if(root&&root.IBTInvoiceFormats?.parseEndesa&&root.IBTInvoiceFormats.__powerPeriodFixVersion!==tool.version){
    root.IBTInvoiceFormats=tool.patch(root.IBTInvoiceFormats);
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='2026.09.15.1';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const round2=n=>Math.round((Number(n)||0)*100)/100;

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

  function patch(base){
    if(!base?.parseEndesa||base.__powerPeriodFixVersion===VERSION)return base;
    const original=base.parseEndesa.bind(base);
    const api={...base,__powerPeriodFixVersion:VERSION,parseEndesa(d,file,options={}){
      const row=original(d,file,options);if(!row||row.unsupported)return row;
      return {...row,powerDetail:aggregatePowerDetail(row.powerDetail,row.tariff)};
    }};
    return Object.freeze(api);
  }

  return Object.freeze({version:VERSION,patch,periodFromSource,aggregatePowerDetail});
});
