(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root&&root.IBTInvoiceFormats?.parseEndesa&&root.IBTInvoiceFormats.__statusConsistencyVersion!==api.version){
    const base=root.IBTInvoiceFormats;
    const original=base.parseEndesa.bind(base);
    root.IBTInvoiceFormats=Object.freeze({...base,__statusConsistencyVersion:api.version,parseEndesa(d,file,options={}){
      return api.normalize(original(d,file,options));
    }});
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='2026.09.14.1';
  const text=v=>String(v??'').trim();
  const hasNumber=v=>v!==null&&v!==''&&Number.isFinite(Number(v));
  const cleanKey=v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const close=(a,b,t)=>Math.abs(Number(a)-Number(b))<=t;

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

  function coreEvidence(row){
    if(!row||row.unsupported||text(row.sourceFormat).toLowerCase()!=='endesa')return false;
    if(!text(row.company)||/por identificar/i.test(text(row.company)))return false;
    if(!/^ES[A-Z0-9]{16,24}$/.test(cleanKey(row.cups)))return false;
    if(!text(row.period)||/por identificar|^—$/.test(text(row.period)))return false;
    if(!/^(2\.0TD|3\.0TD|6\.[1-4]TD)$/i.test(text(row.tariff)))return false;
    for(const key of ['kwh','energy','power','total','accounted'])if(!hasNumber(row[key]))return false;
    if(!close(row.total,row.accounted,.05))return false;
    if(!periodEvidence(row))return false;
    return true;
  }

  function onlyLegacyPowerDetailIssue(row){
    const message=text(row?.readMessage);
    if(!message)return false;
    if(/^lectura correcta$/i.test(message))return true;
    if(/exceso de potencia sin importe monetario identificable|reactiva sin importe monetario identificable|consumo por periodos no cuadra|falta o revisar:\s*(?:titular|cups|periodo|total|consumo|energ[ií]a|impuestos)/i.test(message))return false;
    return /potencia/i.test(message)&&/(detalle|importes individuales|subtotal|cuadra|fragment)/i.test(message);
  }

  function normalize(row){
    if(!row||text(row.sourceFormat).toLowerCase()!=='endesa')return row;
    if(row.readOk===true)return row;
    if(!coreEvidence(row))return row;
    if(!onlyLegacyPowerDetailIssue(row))return row;
    return {...row,balanced:true,readOk:true,readMessage:'Lectura correcta'};
  }

  return Object.freeze({version:VERSION,normalize,coreEvidence,periodEvidence,onlyLegacyPowerDetailIssue});
});
