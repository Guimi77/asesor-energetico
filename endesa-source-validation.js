(function(root,factory){
  const tool=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=tool;
  if(root&&root.IBTInvoiceFormats&&root.IBTInvoiceFormats.parseEndesa&&!root.IBTInvoiceFormats.__sourceValidated){
    root.IBTInvoiceFormats=tool.patch(root.IBTInvoiceFormats,root);
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v==null||v==='')return null;let s=String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');if(!s||s==='-'||s==='.')return null;const n=Number(s);return Number.isFinite(n)?n:null};
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const money=n=>Number(n||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const lastEuro=s=>{const a=[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v!=null);return a.length?a.at(-1):null};
  const validRef=v=>/^\d{8,20}$/.test(text(v).replace(/\D/g,''));

  function sourcePeriod(pages,fallback){
    const s=(pages||[]).slice(0,2).flat().join('\n'),i=s.search(/Periodo\s+de\s+facturaci[oó]n\s*:/i),chunk=i>=0?s.slice(i,i+1500):s;
    const dates=[...chunk.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map(m=>m[1]);
    if(dates.length<2)return fallback;
    const days=(chunk.match(/\((\d+)\s*d[ií]as\)/i)||[])[1];
    return `${dates[0]} - ${dates[1]}${days?` (${days} días)`:''}`;
  }
  function sourceTotal(p1,fallback){
    const lines=p1||[],rules=[/IMPORTE\s+FACTURA\s*:/i,/TOTAL\s+IMPORTE\s+FACTURA/i,/\bTOTAL\b/i];
    for(const rule of rules)for(const raw of lines){if(!rule.test(String(raw||'')))continue;const v=lastEuro(raw);if(v!=null)return v;}
    return fallback;
  }
  function cleanAddressLine(v){
    let s=text(v).replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,'').replace(/\.{3,}/g,' ');
    const stop=s.search(/\s+(?:Su\s+comercializadora|Referencia\s+(?:de|del)\s+contrato|Contrato\s+de\s+mercado\s+libre|Potencias?\s+contratadas?|Potencia\s+contratada|Fin\s+de\s+contrato|Permanencia|CUPS|Distribuidora|Peaje|Segmento|N[uú]mero\s+de\s+contador|N[º°o.]?\s*contador)\s*:/i);
    if(stop>=0)s=s.slice(0,stop);
    return text(s).replace(/\s*,\s*,+/g,',').replace(/[\s,;:-]+$/,'');
  }
  function sourceAddress(p2,fallback){
    const lines=p2||[],idx=lines.findIndex(l=>/Direcci[oó]n\s+de\s+suministro\s*:/i.test(String(l||'')));
    if(idx<0)return cleanAddressLine(fallback);
    const parts=[cleanAddressLine(lines[idx])].filter(Boolean);
    for(let i=idx+1;i<Math.min(lines.length,idx+4);i++){
      const raw=text(lines[i]);
      if(/^(?:Contrato|Referencia|Potencias?|Potencia\s+contratada|Fin\s+de\s+contrato|Permanencia|CUPS|Distribuidora|Peaje|Segmento|N[uú]mero\s+de\s+contador|N[º°o.]?\s*contador|DESTINO|INFORMACI[ÓO]N)/i.test(raw))break;
      const q=cleanAddressLine(raw);if(!q)break;
      if(/\b\d{5}\b/.test(q)||/^[A-ZÁÉÍÓÚÜÑ .,'()/-]{2,45}$/i.test(q))parts.push(q);else break;
    }
    return cleanAddressLine(parts.join(' '))||cleanAddressLine(fallback);
  }
  function placeFromAddress(address){
    const m=text(address).match(/\b\d{5}\s+([^,]+?)(?:,\s*([^,]+?))?\s*$/i);
    return m?{city:text(m[1]),province:text(m[2]||'')}:{city:'',province:''};
  }
  function sourceRefs(p2,currentContract,currentAccess){
    const s=(p2||[]).join('\n');
    const c=s.match(/Referencia\s+(?:de|del)\s+contrato(?:\s+de\s+suministro)?\s*:\s*((?:\d[\s.]*){8,20})/i);
    const a=s.match(/Referencia\s+del\s+contrato\s+de\s+acceso\s*:\s*((?:\d[\s.]*){8,20})/i);
    const contract=c?c[1].replace(/\D/g,''):currentContract;
    const access=a?a[1].replace(/\D/g,''):currentAccess;
    return{contract:validRef(contract)?contract:currentContract,accessContract:validRef(access)?access:currentAccess};
  }
  function sourceContracted(p2,tariff,current){
    const out={...(current||{})},joined=(p2||[]).join(' ');
    if(/^2\.0TD$/i.test(tariff)){
      const h=joined.match(/Potencias?\s+contratadas?\s*:\s*(?:punta(?:\s*[-–]\s*llano)?|punta-llano)\s*([\d.,]+)\s*kW\s*;?\s*valle\s*([\d.,]+)\s*kW/i);
      if(h){out.P1=num(h[1]);out.P2=num(h[2]);}
      if(!(out.P1>0)){const l=(p2||[]).find(x=>/Pot\.?\s*Punta/i.test(x)&&/kW/i.test(x)),m=l&&l.match(/([\d.,]+)\s*kW/i);if(m)out.P1=num(m[1]);}
      if(!(out.P2>0)){const l=(p2||[]).find(x=>/Pot\.?\s*Valle/i.test(x)&&/kW/i.test(x)),m=l&&l.match(/([\d.,]+)\s*kW/i);if(m)out.P2=num(m[1]);}
      return out;
    }
    const start=joined.search(/Potencia\s+contratada\s*\[kW\]\s*:/i);
    if(start>=0){let segment=joined.slice(start,start+700);segment=segment.split(/(?:Fin\s+de\s+contrato|Permanencia\s*:|CUPS\s*:|Distribuidora\s*:|Peaje\s+de\s+transporte|Segmento\s+de\s+cargos)/i)[0];for(let p=1;p<=6;p++){const m=segment.match(new RegExp(`\\bP${p}\\s*([\\d.,]+)\\s*;?`,'i'));if(m)out[`P${p}`]=num(m[1]);}}
    for(let p=1;p<=6;p++)if(!(out[`P${p}`]>0)){
      const l=(p2||[]).find(x=>new RegExp(`\\bPot\\.\\s*P${p}\\b`,'i').test(x)&&/kW/i.test(x));
      const m=l&&l.match(new RegExp(`\\bP${p}\\s+([\\d.,]+)\\s*kW`,'i'));if(m)out[`P${p}`]=num(m[1]);
    }
    return out;
  }
  function tableHasBilledAmount(p2,heading){
    const lines=p2||[],start=lines.findIndex(l=>heading.test(String(l||'')));if(start<0)return false;
    for(let i=start+1;i<Math.min(lines.length,start+16);i++){
      const s=text(lines[i]);
      if(i>start+1&&/^(?:INFORMACI[ÓO]N|ATENCI[ÓO]N|DETALLE|EXCESOS?\s+DE\s+POTENCIA|ENERG[IÍ]A\s+REACTIVA)/i.test(s)&&!/\bP[1-6]\b/.test(s))break;
      if(!/^P[1-6]\b/i.test(s))continue;
      const values=[...s.matchAll(/-?[\d.]+,\d+/g)].map(m=>num(m[0])).filter(v=>v!=null);
      if(values.length&&Math.abs(values.at(-1))>.0005)return true;
    }
    return false;
  }
  function summaryHasAmount(p1,label){return (p1||[]).some(l=>label.test(String(l||''))&&lastEuro(l)!=null);}
  function diagnosticOpportunity(r,contracted){
    const alerts=[];
    if(Number(r.excess)>0)alerts.push(`Exceso de potencia: ${money(r.excess)} €`);
    if(Number(r.reactive)>0)alerts.push(`Reactiva: ${money(r.reactive)} €`);
    const mx=r.maximeters||{},usable=mx._reliable?Object.keys(mx).filter(k=>/^P\d$/.test(k)&&(Number(contracted[k])||0)>0):[];
    if(usable.length){const mc=Math.max(...usable.map(k=>Number(contracted[k])||0)),md=Math.max(...usable.map(k=>Number(mx[k])||0)),ratio=mc?md/mc:1;if(mc>=10&&md>0&&ratio<=.5)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}
    if(Number(r.serviceTotal)>0)alerts.push(`El PDF incluye servicios adicionales por ${money(r.serviceTotal)} € fuera de la factura eléctrica. Conviene revisarlos.`);
    return alerts.length?alerts.join(' · '):'Sin alertas';
  }
  function patch(base,root={}){
    if(!base?.parseEndesa||base.__sourceValidated)return base;
    const original=base.parseEndesa.bind(base);
    const api={...base,__sourceValidated:true,parseEndesa(d,file,options={}){
      const raw=original(d,file,options);if(!raw||raw.unsupported)return raw;
      const pages=d?.pages||[],p1=pages[0]||[],p2=pages[1]||[];
      const period=sourcePeriod(pages,raw.period),total=sourceTotal(p1,raw.total),contracted=sourceContracted(p2,raw.tariff,raw.contracted),address=sourceAddress(p2,raw.supplyAddress),place=placeFromAddress(address),refs=sourceRefs(p2,raw.contract,raw.accessContract);
      const accounted=round2((Number(raw.energy)||0)+(Number(raw.power)||0)+(Number(raw.excess)||0)+(Number(raw.reactive)||0)+(Number(raw.compensation)||0)+(Number(raw.other)||0)+(Number(raw.tax)||0)+(Number(raw.vat)||0)+(Number(raw.igic)||0)+(Number(raw.distributorCharges)||0));
      const diff=total==null?null:round2(total-accounted),balanced=total!=null&&Math.abs(diff)<=.05;
      const periodKwh=round2(Object.values(raw.periods||{}).reduce((s,x)=>s+(Number(x?.consumption)||0),0)),periodKwhOk=raw.kwh==null||(Object.keys(raw.periods||{}).length>0&&Math.abs(periodKwh-Number(raw.kwh))<=.1);
      const unresolvedExcess=(Number(raw.excess)||0)===0&&tableHasBilledAmount(p2,/EXCESOS\s+DE\s+POTENCIA\s+kW/i),unresolvedReactive=(Number(raw.reactive)||0)===0&&tableHasBilledAmount(p2,/ENERG[IÍ]A\s+REACTIVA\s+INDUCTIVA/i);
      const missing=[];if(!raw.company||raw.company==='Por identificar')missing.push('titular');if(!raw.cups)missing.push('CUPS');if(!period||period==='Por identificar')missing.push('periodo');if(total==null)missing.push('total');if(raw.kwh==null)missing.push('consumo');if(!periodKwhOk)missing.push('consumo por periodos no cuadra con el consumo total');if(raw.power==null||raw.powerDetail?.reliable===false)missing.push(raw.powerDetail?.message||'potencia');if(raw.energy==null)missing.push('energía');if(!summaryHasAmount(p1,/^\s*Impuestos\b/i))missing.push('impuestos');if(unresolvedExcess)missing.push('exceso de potencia sin importe monetario identificable');if(unresolvedReactive)missing.push('reactiva sin importe monetario identificable');
      const fixed={...raw,period,total,contracted,supplyAddress:address||raw.supplyAddress,supplyCity:place.city||raw.supplyCity,supplyProvince:place.province||raw.supplyProvince,contract:refs.contract,contractNumber:refs.contract,accessContract:refs.accessContract,accounted,diff,balanced,readOk:balanced&&!missing.length,readMessage:missing.length?`Falta o revisar: ${missing.join(', ')}`:balanced?'Lectura correcta':`Descuadre: ${money(diff)} €`,avg:raw.kwh&&total!=null?total/Number(raw.kwh):0};
      fixed.opportunity=diagnosticOpportunity(fixed,contracted);
      try{if(root?.EnergyMaster?.learnInvoice&&fixed.cups)root.EnergyMaster.learnInvoice(fixed);}catch(error){root?.console?.warn?.('No se pudo sincronizar el maestro Endesa desde la lectura validada',error);}
      return fixed;
    }};
    return Object.freeze(api);
  }
  return Object.freeze({patch,sourcePeriod,sourceTotal,sourceAddress,sourceContracted,tableHasBilledAmount});
});
