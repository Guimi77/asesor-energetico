(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;

  function apply(){
    if(!root||!root.IBTInvoiceFormats?.parseEndesa)return false;
    if(root.IBTInvoiceFormats.__statusConsistencyVersion===api.version)return true;
    const base=root.IBTInvoiceFormats;
    const original=base.parseEndesa.bind(base);
    root.IBTInvoiceFormats=Object.freeze({...base,__statusConsistencyVersion:api.version,parseEndesa(d,file,options={}){
      const fixed=api.normalize(original(d,file,options),d);
      try{if(fixed?.readOk&&root?.EnergyMaster?.learnInvoice&&fixed.cups)root.EnergyMaster.learnInvoice(fixed);}catch(error){root?.console?.warn?.('No se pudo resincronizar el maestro Endesa tras la validacion final',error);}
      return fixed;
    }});
    return true;
  }

  apply();
  if(root?.addEventListener){
    root.addEventListener('DOMContentLoaded',apply,{once:true});
    root.addEventListener('load',apply,{once:true});
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='2026.09.15.7';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const hasNumber=v=>v!==null&&v!==''&&Number.isFinite(Number(v));
  const cleanKey=v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const close=(a,b,t)=>hasNumber(a)&&hasNumber(b)&&Math.abs(Number(a)-Number(b))<=t;
  const num=v=>{if(v==null||v==='')return null;let s=String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');if(!s||s==='-'||s==='.')return null;const n=Number(s);return Number.isFinite(n)?n:null};

  const stopRe=/^(?:Contrato\b|Referencia\b|Potencias?\b|Potencia\s+contratada\b|Fin\s+de\s+contrato\b|Permanencia\b|CUPS\b|Distribuidora\b|Peaje\b|Segmento\b|N[uú]mero\s+de\s+contador\b|N[º°o.]?\s*contador\b|Su\s+comercializadora\b|DESTINO\b|INFORMACI[ÓO]N\b)/i;
  const inlineStop=/\s+(?:Contrato\b|Referencia\b|Potencias?\b|Potencia\s+contratada\b|Fin\s+de\s+contrato\b|Permanencia\b|CUPS\b|Distribuidora\b|Peaje\b|Segmento\b|N[uú]mero\s+de\s+contador\b|N[º°o.]?\s*contador\b|Su\s+comercializadora\b)\s*:/i;

  function cleanAddressPart(v){
    let s=text(v).replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,'').replace(/\.{3,}/g,' ');
    const i=s.search(inlineStop);if(i>=0)s=s.slice(0,i);
    return text(s).replace(/\s*,\s*,+/g,',').replace(/[\s,;:-]+$/,'');
  }

  function sourceAddress(p2,fallback=''){
    const lines=p2||[],idx=lines.findIndex(l=>/Direcci[oó]n\s+de\s+suministro\s*:/i.test(String(l||'')));
    if(idx<0)return cleanAddressPart(fallback);
    const parts=[];
    const first=cleanAddressPart(lines[idx]);if(first)parts.push(first);
    for(let i=idx+1;i<Math.min(lines.length,idx+4);i++){
      const raw=text(lines[i]);
      if(!raw||stopRe.test(raw))break;
      const part=cleanAddressPart(raw);if(!part)break;
      parts.push(part);
    }
    return cleanAddressPart(parts.join(', '))||cleanAddressPart(fallback);
  }

  function placeFromAddress(address){
    const s=text(address);
    const m=s.match(/\b\d{5}[,\s]+([^,]+?)(?:,\s*([^,]+?))?\s*$/i);
    return m?{city:text(m[1]),province:text(m[2]||'')}:{city:'',province:''};
  }

  function periodEvidence(row){
    const periods=row?.periods||{};
    const keys=Object.keys(periods).filter(k=>/^P[1-6]$/.test(k));
    if(!keys.length||!hasNumber(row?.kwh))return false;
    let total=0;
    for(const key of keys){
      const value=periods[key]?.consumption;
      if(!hasNumber(value))return false;
      total+=Number(value);
    }
    if(!close(total,row.kwh,.1))return false;
    if(/^2\.0TD$/i.test(text(row?.tariff))){
      for(const key of ['P4','P5','P6']){
        const value=periods[key]?.consumption;
        if(hasNumber(value)&&Math.abs(Number(value))>.001)return false;
      }
    }
    return true;
  }

  function billedTableHasAmount(p2,heading){
    const lines=p2||[],start=lines.findIndex(l=>heading.test(String(l||'')));if(start<0)return false;
    for(let i=start+1;i<Math.min(lines.length,start+18);i++){
      const s=text(lines[i]);
      if(i>start+1&&/^(?:INFORMACI[ÓO]N|ATENCI[ÓO]N|DETALLE|ENERG[IÍ]A\s+REACTIVA|EXCESOS?\s+DE\s+POTENCIA)/i.test(s)&&!/\bP[1-6]\b/.test(s))break;
      if(!/^P[1-6]\b/i.test(s))continue;
      const body=s.replace(/^P[1-6]\s*/i,'');
      const values=[...body.matchAll(/-?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?/g)].map(m=>num(m[0])).filter(v=>v!=null);
      // Require the complete source row: measured/contracted, secondary
      // measurement and the final "A facturar" column. Fragmented two-column
      // lines must not turn demand or reactive consumption into billed euros.
      if(values.length>=3&&Math.abs(values.at(-1))>.0005)return true;
    }
    return false;
  }

  function summaryHasBilledAmount(p1,label){
    return (p1||[]).some(line=>{
      const s=text(line);if(!label.test(s))return false;
      const values=[...s.matchAll(/-?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?\s*€/g)].map(m=>num(m[0])).filter(v=>v!=null);
      return values.length>0&&Math.abs(values.at(-1))>.005;
    });
  }

  function coreEvidence(row,d){
    if(!row||row.unsupported||text(row.sourceFormat).toLowerCase()!=='endesa')return false;
    if(!text(row.company)||/por identificar/i.test(text(row.company)))return false;
    if(!/^ES[A-Z0-9]{16,24}$/.test(cleanKey(row.cups)))return false;
    if(!text(row.period)||/por identificar|^—$/.test(text(row.period)))return false;
    if(!/^(2\.0TD|3\.0TD|6\.[1-4]TD)$/i.test(text(row.tariff)))return false;
    for(const key of ['kwh','energy','power','total','accounted'])if(!hasNumber(row[key]))return false;
    if(!close(row.total,row.accounted,.05))return false;
    if(!periodEvidence(row))return false;
    const p1=d?.pages?.[0]||[];
    if((Number(row.excess)||0)===0&&summaryHasBilledAmount(p1,/^\s*Excesos?\s+de\s+potencia\b/i))return false;
    if((Number(row.reactive)||0)===0&&summaryHasBilledAmount(p1,/^\s*Energ[ií]a\s+reactiva\b/i))return false;
    return true;
  }

  function normalize(row,d){
    if(!row||text(row.sourceFormat).toLowerCase()!=='endesa')return row;
    const p2=d?.pages?.[1]||[];
    const address=sourceAddress(p2,row.supplyAddress||'');
    const place=placeFromAddress(address);
    const base={...row};
    if(address)base.supplyAddress=address;
    if(place.city)base.supplyCity=place.city;
    if(place.province)base.supplyProvince=place.province;
    if(base.readingStatus==='actual')base.readingSourceLabel='Lectura real / real';
    else if(base.readingStatus==='estimated')base.readingSourceLabel='Lectura estimada / estimada';

    const valid=coreEvidence(base,d);
    if(valid)return {...base,balanced:true,readOk:true,readMessage:'Lectura correcta'};
    return base;
  }

  return Object.freeze({version:VERSION,normalize,coreEvidence,periodEvidence,sourceAddress,placeFromAddress,billedTableHasAmount,summaryHasBilledAmount});
});
