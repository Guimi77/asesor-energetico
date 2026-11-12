(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTSeaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REVISION='sea-2026.11.12.1';
  const RETAILER='Servicios Energ\u00e9ticos Avanzados, S.L.';
  const BRAND='Energia BT';

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
  const textOf=value=>{
    if(typeof value==='string')return value;
    if(clean(value?.text))return String(value.text);
    return pagesOf(value).flat().join('\n');
  };
  const linesOf=value=>textOf(value).split(/\r?\n/).map(clean).filter(Boolean);
  const normalizeCups=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const moneyValues=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*\u20ac/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastMoney=s=>{const values=moneyValues(s);return values.length?values.at(-1):null;};
  const lineAmount=(value,re)=>{for(const line of linesOf(value)){if(re.test(line)){const v=lastMoney(line);if(v!=null)return v;}}return null;};
  const lineAmountNear=(value,re,lookahead=2)=>{const lines=linesOf(value);for(let i=0;i<lines.length;i++){if(!re.test(lines[i]))continue;for(let j=i;j<Math.min(lines.length,i+1+lookahead);j++){const v=lastMoney(lines[j]);if(v!=null)return v;}}return null;};
  const normalizeDate=value=>{const m=String(value||'').match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);return m?`${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${m[3]}`:'';};
  const toIso=value=>{const m=String(value||'').match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);return m?`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`:'';};
  const tariffOf=value=>((String(value||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i)||[])[1]||'\u2014').replace(/\s+/g,'').toUpperCase();
  const expectedPowerPeriods=tariff=>/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;
  const expectedEnergyPeriods=tariff=>/^2\.0TD$/i.test(tariff)?3:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;

  function detect(value){
    const text=textOf(value);
    return /Servicios\s+Energ(?:e|\u00e9)ticos\s+Avanzados\s*,?\s*S\.?\s*L\.?/i.test(text)
      && /\bB13900816\b/i.test(text)
      && /Datos\s+de\s+la\s+factura/i.test(text)
      && /Desglose\s+de\s+la\s+factura/i.test(text)
      && (/(?:seravanzados\.com|info@seravanzados\.com)/i.test(text)||/Coste\s+servicios\s+de\s+ajuste\s+del\s+sistema\s*\(REE\)/i.test(text));
  }

  function capture(text,re){const m=String(text||'').match(re);return clean(m?.[1]||'');}

  function valueAfter(lines,labelRe,stopRes=[],lookahead=2){
    for(let i=0;i<(lines||[]).length;i++){
      const raw=String(lines[i]||''),m=raw.match(labelRe);
      if(!m)continue;
      let rest=clean(raw.slice((m.index||0)+m[0].length).replace(/^\s*[:;-]?\s*/,''));
      for(const stop of stopRes){const p=rest.search(stop);if(p>=0)rest=clean(rest.slice(0,p));}
      if(rest)return rest;
      for(let j=i+1;j<Math.min(lines.length,i+1+lookahead);j++){
        const q=clean(lines[j]);if(stopRes.some(re=>re.test(q)))break;if(q)return q;
      }
    }
    return'';
  }

  function parsePeriod(text){
    const m=String(text||'').match(/Periodo\s+consumo\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if(!m)return{label:'Por identificar',start:'',end:'',days:null};
    const explicit=String(text||'').match(/\bP1\s+[\d.,]+\s*kW\s+[\d.,]+\s*\u20ac\s*\/?\s*kW\s*\*\s*(\d{1,3})\s*d(?:i|\u00ed)as?/i);
    let days=explicit?Number(explicit[1]):null;
    if(days==null){
      const a=new Date(toIso(m[1])+'T00:00:00Z'),b=new Date(toIso(m[2])+'T00:00:00Z');
      if(Number.isFinite(+a)&&Number.isFinite(+b))days=Math.round((b-a)/86400000);
    }
    const start=normalizeDate(m[1]),end=normalizeDate(m[2]);
    return{label:`${start} - ${end}${days!=null?` (${days} d\u00edas)`:''}`,start:toIso(m[1]),end:toIso(m[2]),days};
  }

  function parsePlace(address){
    const s=clean(address),m=s.match(/\b(\d{5})\s+([^()]+?)(?:\s*\(([^)]+)\))?\s*$/);
    if(!m)return{postalCode:'',city:'',province:''};
    return{postalCode:m[1],city:clean(m[2]),province:clean(m[3]||'')};
  }

  function parseIdentity(pages){
    const all=pages.flat(),text=all.join('\n'),p1=pages[0]||[],p1text=p1.join('\n');
    const invoiceNumber=capture(text,/N[\u00ba\u00b0o.]?\s*Factura\s*:\s*([A-Z0-9._\/-]+)/i)||'Por identificar';
    const issue=normalizeDate(capture(text,/Emitida\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i));
    const holder=valueAfter(p1,/\bTitular\s*:/i,[/\bForma\s+de\s+pago\s*:/i,/\bNIF\s*:/i]);
    const taxId=capture(p1text,/\bNIF\s*:\s*([A-Z0-9-]+)/i).toUpperCase();
    const cups=normalizeCups(capture(text,/\bCUPS\s*:\s*(ES[A-Z0-9]{18,22})\b/i));
    const supplyAddress=valueAfter(p1,/Direcci(?:o|\u00f3)n\s+del\s+suministro\s*:/i,[/Tarifa\s+de\s+acceso/i,/Contrato\s+de\s+Acceso/i,/Contador\s*:/i]);
    const place=parsePlace(supplyAddress);
    return{invoiceNumber,issueDate:issue?toIso(issue):'',holder,taxId,cups,supplyAddress,supplyCity:place.city,supplyProvince:place.province};
  }

  function parseContract(pages){
    const p1=pages[0]||[],text=pages.flat().join('\n'),p1text=p1.join('\n');
    const tariff=tariffOf(capture(text,/Tarifa\s+de\s+acceso\s+mercado\s+libre\s*:\s*([^\n]+)/i)||text);
    const contract=capture(p1text,/N[\u00ba\u00b0o.]?\s*Contrato\s*:\s*([A-Z0-9._\/-]+)/i);
    const accessContract=capture(text,/Contrato\s+de\s+Acceso\s*:\s*([A-Z0-9._\/-]+)/i);
    const meterNumber=capture(text,/\bContador\s*:\s*([A-Z0-9._\/-]+)/i);
    const distributor=valueAfter(p1,/\bDistribuidora\s*:/i,[/\bSegmento\s+de\s+cargos\s*:/i,/\bTipo\s+de\s+contrato\s*:/i]);
    const renewal=normalizeDate(capture(text,/Fecha\s+Fin\s+contrato\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i));
    const contractDurationType=valueAfter(p1,/Tipo\s+de\s+contrato\s*:/i,[]);
    return{tariff,contract,accessContract,meterNumber,distributor,renewalDate:renewal,contractType:'Mercado libre',contractDurationType,productName:''};
  }

  function parsePower(text,printedTotal,tariff){
    const entries=[],contracted={};
    const re=/^P([1-6])\s+([\d.]+,\d{3})\s*kW\s+([\d.]+,\d{6})\s*\u20ac\s*\/?\s*kW\s*\*\s*(\d{1,3})\s*d(?:i|\u00ed)as?\b.*?(-?[\d.]+,\d{2})\s*\u20ac\s*$/i;
    for(const line of linesOf(text)){
      const m=line.match(re);if(!m)continue;
      const e={period:Number(m[1]),contractedKw:num(m[2]),price:num(m[3]),days:Number(m[4]),amount:num(m[5])};
      entries.push(e);contracted[`P${e.period}`]=e.contractedKw;
    }
    entries.sort((a,b)=>a.period-b.period);
    const expected=expectedPowerPeriods(tariff),sum=round2(entries.reduce((s,e)=>s+(e.amount||0),0));
    const complete=expected>0&&entries.length===expected,agrees=printedTotal!=null&&Math.abs(sum-printedTotal)<=.02;
    return{value:printedTotal!=null?printedTotal:sum,printedTotal,sum,entries,contracted,reliable:complete&&agrees,message:!complete?'Potencia: faltan periodos facturados':!agrees?'Potencia: subtotal no cuadra con el detalle':''};
  }

  function parseEnergy(text,printedTotal,tariff,statedKwh){
    const entries=[],periods={};
    const re=/^P([1-6])\s+([\d.]+,\d{3})\s*kWh\s+([\d.]+,\d{6})\s*\u20ac\s*\/?\s*kWh\b.*?(-?[\d.]+,\d{2})\s*\u20ac\s*$/i;
    for(const line of linesOf(text)){
      const m=line.match(re);if(!m)continue;
      const e={period:Number(m[1]),consumption:num(m[2]),price:num(m[3]),amount:num(m[4])};
      entries.push(e);periods[`P${e.period}`]={consumption:e.consumption,price:e.price,cost:e.amount};
    }
    entries.sort((a,b)=>a.period-b.period);
    const expected=expectedEnergyPeriods(tariff),kwh=Math.round(entries.reduce((s,e)=>s+(e.consumption||0),0)*1000)/1000,sum=round2(entries.reduce((s,e)=>s+(e.amount||0),0));
    const complete=expected>0&&entries.length===expected,agrees=printedTotal!=null&&Math.abs(sum-printedTotal)<=.02,kwhAgrees=statedKwh!=null&&Math.abs(kwh-statedKwh)<=.001;
    return{value:printedTotal!=null?printedTotal:sum,printedTotal,sum,kwh,entries,periods,reliable:complete&&agrees&&kwhAgrees,periodsComplete:complete,costAgrees:agrees,kwhAgrees,message:!complete?'Energ\u00eda: faltan periodos facturados':!agrees?'Energ\u00eda: subtotal no cuadra con el detalle':!kwhAgrees?'Energ\u00eda: consumo P1-P3 no cuadra con el consumo total':''};
  }

  function parseReportedMaxDemand(text,tariff){
    const m=String(text||'').match(/Las\s+potencias\s+m(?:a|\u00e1)ximas[^\n]*han\s+sido\s*:\s*([\s\S]{0,100})/i);
    const raw={};
    if(m)for(const p of m[1].matchAll(/\bP([1-6])\s+([\d.]+,\d{3})/gi))raw[`P${p[1]}`]=num(p[2]);
    if(!Object.keys(raw).length)return{};
    const inconsistent=/^2\.0TD$/i.test(tariff)&&Object.keys(raw).some(k=>!['P1','P2'].includes(k));
    return{_reliable:false,_source:'annual_max_demand_summary',_raw:raw,_reason:inconsistent?'La factura 2.0TD usa una etiqueta de periodo no compatible en el resumen anual; no se remapea automaticamente.':'Resumen anual informativo; no se usa como maximetro facturado.'};
  }

  function parseFinancials(pages,tariff){
    const text=pages.flat().join('\n');
    const printedPower=lineAmount(text,/^T(?:e|\u00e9)rmino\s+de\s+Potencia\s+Contratada\b/i);
    const printedEnergy=lineAmount(text,/^T(?:e|\u00e9)rmino\s+de\s+Energ(?:i|\u00ed)a\s+Activa\b/i);
    const statedKwh=num(capture(text,/consumo\s+en\s+el\s+periodo\s+facturado\s+ha\s+sido\s+([\d.]+,\d{3})\s*kWh/i));
    const powerDetail=parsePower(text,printedPower,tariff),energyDetail=parseEnergy(text,printedEnergy,tariff,statedKwh);
    const social=lineAmount(text,/^Financiaci(?:o|\u00f3)n\s+Bono\s+Social\s*:/i)??0;
    const systemAdjustment=lineAmountNear(text,/^Coste\s+servicios\s+de\s+ajuste\s+del\s+sistema\s*\(REE\)\s*:/i,1)??0;
    const tax=lineAmount(text,/^Impuesto\s+de\s+Electricidad\b/i)??0;
    const rental=lineAmountNear(text,/^Alquiler\s+de\s+contador\b/i,1)??0;
    const vat=lineAmount(text,/^IVA\s*:/i)??0;
    const total=lineAmount(text,/^TOTAL\s+IMPORTE\s+FACTURA\s*:/i);
    const other=round2(social+systemAdjustment+rental);
    const accounted=round2((powerDetail.value||0)+(energyDetail.value||0)+other+tax+vat);
    const diff=total==null?null:round2(total-accounted),balanced=total!=null&&Math.abs(diff)<=.05;
    return{powerDetail,energyDetail,social,systemAdjustment,rental,tax,vat,total,other,accounted,diff,balanced};
  }

  function parse(d,file,options={}){
    const pages=pagesOf(d),text=pages.flat().join('\n');
    if(!detect({pages,text}))return null;
    const identity=parseIdentity(pages),meta=parseContract(pages),period=parsePeriod(text),fin=parseFinancials(pages,meta.tariff),maximeters=parseReportedMaxDemand(text,meta.tariff);
    const missing=[];
    if(!identity.holder)missing.push('titular');
    if(!identity.taxId)missing.push('NIF/CIF titular');
    if(!identity.cups)missing.push('CUPS');
    if(identity.invoiceNumber==='Por identificar')missing.push('n\u00ba factura');
    if(period.label==='Por identificar')missing.push('periodo');
    if(meta.tariff==='\u2014')missing.push('tarifa');
    if(fin.total==null)missing.push('total');
    if(!fin.energyDetail.reliable)missing.push(fin.energyDetail.message||'energia');
    if(!fin.powerDetail.reliable)missing.push(fin.powerDetail.message||'potencia');
    if(!fin.balanced)missing.push('cuadre economico');
    const readOk=!missing.length;
    const annualIssue=maximeters?._reason||'';
    const reading=/Consumo\s+activo[\s\S]{0,900}\bREAL\b/i.test(text)?{status:'actual',sourceLabel:'Lecturas de consumo activo marcadas como REAL'}:(options.readingClassifier?.(text)||{status:'unknown',sourceLabel:''});
    const adjustments=[
      {concept:'Financiaci\u00f3n Bono Social',amount_eur:fin.social,category:'regulated'},
      {concept:'Coste servicios de ajuste del sistema (REE)',amount_eur:fin.systemAdjustment,category:'system_adjustment'},
      {concept:'Alquiler de contador',amount_eur:fin.rental,category:'meter_rental'}
    ].filter(x=>x.amount_eur);
    const incidents=annualIssue?[annualIssue]:[];
    return{
      file:file?.name||'',invoiceNumber:identity.invoiceNumber,company:identity.holder||'Por identificar',taxId:identity.taxId,cups:identity.cups,
      period:period.label,tariff:meta.tariff,kwh:fin.energyDetail.kwh,energy:fin.energyDetail.value,power:fin.powerDetail.value,
      excess:0,reactive:0,compensation:0,social:fin.social,rental:fin.rental,systemAdjustment:fin.systemAdjustment,
      integratorAdjustment:0,regularizationReactive:0,other:fin.other,tax:fin.tax,vat:fin.vat,igic:0,distributorCharges:0,
      total:fin.total,accounted:fin.accounted,diff:fin.diff,balanced:fin.balanced,readOk,
      readMessage:readOk?'Lectura correcta':`Falta o revisar: ${missing.join(', ')}`,readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',
      avg:fin.energyDetail.kwh&&fin.total?fin.total/fin.energyDetail.kwh:0,opportunity:annualIssue||'Sin alertas',periods:fin.energyDetail.periods,contracted:fin.powerDetail.contracted,
      maximeters,parserVersion:options.parserVersion||'',parserRevision:REVISION,powerDetail:fin.powerDetail,energyDetail:fin.energyDetail,energyPricingMode:'period_rates',
      sourceFormat:'sea',sourceVariant:'standard_2026',supplier:RETAILER,retailer:RETAILER,commercializer:RETAILER,brand:BRAND,
      supplyAddress:identity.supplyAddress,supplyCity:identity.supplyCity,supplyProvince:identity.supplyProvince,
      contract:meta.contract,contractNumber:meta.contract,accessContract:meta.accessContract,distributor:meta.distributor,contractType:meta.contractType,contractDurationType:meta.contractDurationType,
      productName:meta.productName,renewalDate:meta.renewalDate,meterNumber:meta.meterNumber,issueDate:identity.issueDate,billingStart:period.start,billingEnd:period.end,billingDays:period.days,
      adjustments,incidents,otherConcepts:{socialFinancing:fin.social,systemAdjustment:{name:'Coste servicios de ajuste del sistema (REE)',amount:fin.systemAdjustment},meterRental:fin.rental},
      validation:{consumptionPeriods:fin.energyDetail.periodsComplete,consumptionTotal:fin.energyDetail.kwhAgrees,energyCost:fin.energyDetail.costAgrees,power:fin.powerDetail.reliable,economicBalance:fin.balanced}
    };
  }

  return Object.freeze({detect,parse,revision:REVISION,_test:{parsePeriod,parsePower,parseEnergy,parseReportedMaxDemand}});
});
