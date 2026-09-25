(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTUenergiaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REVISION='uenergia-2026.09.24.1';
  const RETAILER='ELECTRICA SOLLERENSE SAU';
  const BRAND='U Energía';

  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const num=v=>{
    if(v==null||v==='')return null;
    let s=String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');
    if(!s||s==='-'||s==='.')return null;
    const n=Number(s);
    return Number.isFinite(n)?n:null;
  };
  const pagesOf=d=>(d?.pages||[]).map(page=>(page||[]).map(clean).filter(Boolean));
  const flat=pages=>pages.flat();
  const textOf=lines=>(lines||[]).join('\n');
  const normalizeCups=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const moneyValues=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastMoney=s=>{const a=moneyValues(s);return a.length?a.at(-1):null;};
  const normalizeDate=value=>{
    const m=String(value||'').match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    return m?`${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${m[3]}`:'';
  };
  const toIso=value=>{
    const m=String(value||'').match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    return m?`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`:'';
  };
  const tariffOf=text=>((String(text||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i)||[])[1]||'—').replace(/\s+/g,'').toUpperCase();
  const expectedPowerPeriods=tariff=>/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;
  const expectedEnergyPeriods=tariff=>/^2\.0TD$/i.test(tariff)?3:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;

  function detect(value){
    const text=Array.isArray(value)?value.flat(Infinity).join('\n'):value?.text||textOf(flat(pagesOf(value)))||String(value||'');
    return /ELECTRICA\s+SOLLERENSE\s+SAU/i.test(text)
      && /\b(?:ES)?A57048332\b/i.test(text)
      && (/(?:uenergia\.es|oficines@uenergia\.es)/i.test(text)||/Cuota\s+U\s*energ[ií]a/i.test(text))
      && /DATOS\s+DEL\s+CONTRATO/i.test(text)
      && /DETALLE\s+DE\s+CONCEPTOS/i.test(text);
  }

  function valueAfter(lines,labelRe,stopRes=[],lookahead=2){
    for(let i=0;i<(lines||[]).length;i++){
      const raw=String(lines[i]||''),m=raw.match(labelRe);
      if(!m)continue;
      let rest=clean(raw.slice((m.index||0)+m[0].length).replace(/^\s*[:;-]?\s*/,''));
      for(const stop of stopRes){
        const p=rest.search(stop);
        if(p>=0)rest=clean(rest.slice(0,p));
      }
      if(rest)return rest;
      for(let j=i+1;j<Math.min(lines.length,i+1+lookahead);j++){
        const q=clean(lines[j]);
        if(stopRes.some(re=>re.test(q)))break;
        if(q)return q;
      }
    }
    return'';
  }

  function parsePeriod(text){
    const s=String(text||'');
    const m=s.match(/\bPeriodo\s*:\s*(\d{1,2}[./]\d{1,2}[./]\d{4})\s+a\s+(\d{1,2}[./]\d{1,2}[./]\d{4})/i);
    if(!m)return{label:'Por identificar',start:'',end:'',days:null};
    const explicit=s.match(/\bP1\s*:\s*[\d.,]+\s*kW\s*[x×]\s*(\d{1,3})\s*d[ií]as?/i);
    let days=explicit?Number(explicit[1]):null;
    if(days==null){
      const a=new Date(toIso(m[1])+'T00:00:00Z'),b=new Date(toIso(m[2])+'T00:00:00Z');
      if(Number.isFinite(+a)&&Number.isFinite(+b))days=Math.round((b-a)/86400000)+1;
    }
    const startLabel=normalizeDate(m[1]),endLabel=normalizeDate(m[2]);
    return{label:`${startLabel} - ${endLabel}${days!=null?` (${days} días)`:''}`,start:toIso(m[1]),end:toIso(m[2]),days};
  }

  function parseIdentity(pages){
    const p1=pages[0]||[],p2=pages[1]||[],all=flat(pages),text=textOf(all),p1text=textOf(p1),p2text=textOf(p2);
    const invoiceNumber=clean((p1text.match(/\bN[uú]mero\s*:\s*([A-Z0-9._\/-]+)/i)||text.match(/\bN[uú]mero\s*:\s*([A-Z0-9._\/-]+)/i)||[])[1]||'Por identificar');
    const issue=String((p1text.match(/\bFecha\s*:\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i)||[])[1]||'');
    const holder=valueAfter(p2,/\bTitular\s*:/i,[/\bNIF\s*\/\s*CIF\s+Titular\s*:/i,/\bCUPS\s*:/i]);
    const taxId=clean((p2text.match(/NIF\s*\/\s*CIF\s+Titular\s*:\s*([A-Z0-9-]+)/i)||[])[1]||'').toUpperCase();
    const cups=normalizeCups((text.match(/\bES\s*\d{16}\s*[A-Z]{2}(?:\s*[A-Z0-9]{2})?\b/i)||[])[0]||'');
    const supplyAddress=valueAfter(p2,/\bDirecci[oó]n\s*:/i,[/\bPoblaci[oó]n\s*:/i,/\bCUPS\s*:/i,/\bPotencia\s*:/i,/\bContrato\s*:/i]);
    const supplyCity=valueAfter(p2,/\bPoblaci[oó]n\s*:/i,[/\bTarifa\s*:/i,/\bCUPS\s*:/i,/\bContrato\s+de\s+acceso\s*:/i]);
    const billedTaxId=clean((p1text.match(/\bNIF\s*\/\s*CIF\s*:\s*([A-Z0-9-]+)/i)||[])[1]||'').toUpperCase();

    let billedTo='';
    const invoiceLine=p1.find(l=>/\bN[uú]mero\s*:/i.test(l));
    if(invoiceLine){
      const after=clean(String(invoiceLine).replace(/^.*?\bN[uú]mero\s*:\s*[A-Z0-9._\/-]+\s*/i,''));
      if(after&&/^[A-ZÁÉÍÓÚÜÑÇ ,.'-]{5,80}$/u.test(after))billedTo=after;
    }
    if(!billedTo){
      const candidates=p1.map(clean).filter(q=>
        /^[A-ZÁÉÍÓÚÜÑÇ ,.'-]{5,80}$/u.test(q)
        && q.includes(',')
        && !/ELECTRICA\s+SOLLERENSE|BALEARS|ESPAÑA|RECIBO|DATOS|RESUMEN|HISTORIAL|DESTINO|INFORMACI[ÓO]N|CONTACTO/i.test(q)
      );
      billedTo=candidates[0]||'';
    }
    return{invoiceNumber,issueDate:toIso(issue),holder,taxId,cups,supplyAddress,supplyCity,billedTo,billedTaxId};
  }

  function parseContractMeta(pages){
    const p2=pages[1]||[],text=textOf(flat(pages)),p2text=textOf(p2);
    const productRaw=valueAfter(p2,/\bTarifa\s*:/i,[/\bTarifa\s+de\s+acceso\s*:/i,/\bTel[eé]fono\b/i,/\bDistribuidora\s*:/i]);
    const accessTariffRaw=valueAfter(p2,/\bTarifa\s+de\s+acceso\s*:/i,[/\bTel[eé]fono\b/i,/\bCUPS\s*:/i,/\(\s*https?:\/\//i,/\bVigencia\s+hasta\s*:/i]);
    const tariff=tariffOf(accessTariffRaw||text);
    const contract=clean((p2text.match(/\bContrato\s*:\s*([A-Z0-9-]+)/i)||[])[1]||'');
    const accessContract=clean((p2text.match(/\bContrato\s+de\s+acceso\s*:\s*([A-Z0-9-]+)/i)||[])[1]||'');
    const distributor=valueAfter(p2,/\bDistribuidora\s*:/i,[/\bVigencia\s+hasta\s*:/i,/https?:\/\//i]);
    const renewal=String((p2text.match(/\bVigencia\s+hasta\s*:\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i)||[])[1]||'');
    const meterNumber=clean((text.match(/Lecturas\s+del\s+contador\s+(\d{5,20})/i)||[])[1]||'');
    const contractType=/Mercado\s+libre/i.test(productRaw)?'Mercado libre':'';
    const productName=clean(productRaw.replace(/\s*\(\s*Mercado\s+libre\s*\)\s*/i,''));
    return{tariff,productName,contractType,accessTariffRaw,contract,accessContract,distributor,renewalDate:renewal?normalizeDate(renewal):'',meterNumber};
  }

  function parsePower(text,printedPower,tariff){
    const entries=[];
    const re=/\bP([1-6])\s*:\s*([\d.,]+)\s*kW\s*[x×]\s*(\d{1,3})\s*d[ií]as?\s*[x×]\s*([\d.,]+)\s*€\s*(?:\/?\s*kW\s*\/?\s*d[ií]a)?\s+(-?[\d.]+,\d{2})\s*€/gi;
    for(const m of String(text||'').matchAll(re))entries.push({period:Number(m[1]),contractedKw:num(m[2]),days:Number(m[3]),price:num(m[4]),amount:num(m[5])});
    entries.sort((a,b)=>a.period-b.period);
    const expected=expectedPowerPeriods(tariff),sum=round2(entries.reduce((s,e)=>s+(e.amount||0),0));
    const complete=expected>0&&entries.length===expected,agrees=printedPower!=null&&Math.abs(sum-printedPower)<=.02,reliable=complete&&agrees;
    const contracted={};
    entries.forEach(e=>{contracted[`P${e.period}`]=e.contractedKw;});
    return{value:printedPower!=null?printedPower:sum,sum,printedTotal:printedPower,entries,contracted,reliable,message:!complete?'Potencia: faltan periodos facturados':!agrees?'Potencia: subtotal no cuadra con el detalle':''};
  }

  function parseEnergy(text,printedEnergy,tariff){
    const entries=[],periods={};
    const re=/\bP([1-6])\s*:\s*([\d.,]+)\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/?\s*kWh\s+(-?[\d.]+,\d{2})\s*€/gi;
    for(const m of String(text||'').matchAll(re))entries.push({period:Number(m[1]),consumption:num(m[2]),price:num(m[3]),amount:num(m[4])});
    entries.sort((a,b)=>a.period-b.period);
    entries.forEach(e=>{periods[`P${e.period}`]={consumption:e.consumption,price:e.price,cost:e.amount};});
    const kwh=round2(entries.reduce((s,e)=>s+(e.consumption||0),0)),sum=round2(entries.reduce((s,e)=>s+(e.amount||0),0)),expected=expectedEnergyPeriods(tariff);
    const complete=expected>0&&entries.length===expected,agrees=printedEnergy!=null&&Math.abs(sum-printedEnergy)<=.02,reliable=complete&&agrees;
    return{value:printedEnergy!=null?printedEnergy:sum,sum,printedTotal:printedEnergy,kwh,entries,periods,reliable,message:!complete?'Energía: faltan periodos facturados':!agrees?'Energía: subtotal no cuadra con el detalle':''};
  }

  function normalizeMaximeter(raw,contractedKw){
    const n=Number(raw);
    if(!Number.isFinite(n))return null;
    if(n>Math.max(100,(Number(contractedKw)||0)*10))return Math.round(n)/1000;
    return n;
  }

  function parseMaximeters(text,contracted){
    const out={},raw={};
    const re=/Periodo\s+P([1-6])\s*,\s*Potencia\s*:\s*([\d.,]+)\s*,\s*Max[ií]metro\s*:\s*([\d.,]+)/gi;
    for(const m of String(text||'').matchAll(re)){
      const key=`P${m[1]}`,contractedKw=num(m[2]),rawValue=num(m[3]);
      if(contracted[key]==null)contracted[key]=contractedKw;
      raw[key]=rawValue;
      out[key]=normalizeMaximeter(rawValue,contracted[key]);
    }
    const keys=Object.keys(out).filter(k=>/^P\d$/.test(k));
    if(keys.length){
      out._reliable=true;
      out._source='invoice_power_section';
      out._raw=raw;
      out._normalization='raw value is divided by 1000 only when incompatible with contracted kW';
    }
    return out;
  }

  function lineAmount(text,re){
    for(const line of String(text||'').split(/\n/)){
      if(!re.test(line))continue;
      const v=lastMoney(line);
      if(v!=null)return v;
    }
    return null;
  }

  function parseFinancials(pages,tariff){
    const p1text=textOf(pages[0]||[]),p2text=textOf(pages[1]||[]);
    const printedPower=lineAmount(p1text,/^\s*Potencia\b/i);
    const printedEnergy=lineAmount(p1text,/^\s*Energ[ií]a\b/i);
    const powerDetail=parsePower(p2text,printedPower,tariff),energyDetail=parseEnergy(p2text,printedEnergy,tariff);

    const social=lineAmount(p2text,/Financiaci[oó]n\s+bono\s+social/i)??0;
    const tax=lineAmount(p2text,/Impuesto\s+sobre\s+la\s+electricidad/i)??0;
    const rental=lineAmount(p2text,/ALQ\s+Equipo\s+Medida/i)??0;

    // IMPORTANT: U Energía prints this under a generic "Otros conceptos" heading,
    // but it is a named commercial daily fee and must remain traceable as its own field.
    const commercialFee=lineAmount(p2text,/Cuota\s+U\s*energ[ií]a/i)??0;

    const vat=lineAmount(p2text,/^\s*IVA\s+\d+(?:,\d+)?%/i)??0;
    const total=lineAmount(p2text,/Importe\s+total/i)??lineAmount(p1text,/^\s*Total\b/i);
    const other=round2(social+rental+commercialFee);
    const accounted=round2((powerDetail.value||0)+(energyDetail.value||0)+other+tax+vat);
    const diff=total==null?null:round2(total-accounted),balanced=total!=null&&Math.abs(diff)<=.05;

    return{power:powerDetail.value,energy:energyDetail.value,kwh:energyDetail.kwh,periods:energyDetail.periods,contracted:powerDetail.contracted,powerDetail,energyDetail,social,rental,commercialFee,other,tax,vat,total,accounted,diff,balanced};
  }

  function parse(d,file,options={}){
    const pages=pagesOf(d),text=textOf(flat(pages));
    if(!detect({pages,text}))return null;

    const identity=parseIdentity(pages),meta=parseContractMeta(pages),period=parsePeriod(text),fin=parseFinancials(pages,meta.tariff),contracted={...fin.contracted},maximeters=parseMaximeters(text,contracted);
    const expectedEnergy=expectedEnergyPeriods(meta.tariff),periodKeys=Object.keys(fin.periods).filter(k=>/^P[1-6]$/.test(k)),consumptionComplete=expectedEnergy>0&&periodKeys.length===expectedEnergy;

    const missing=[];
    if(!identity.holder)missing.push('titular');
    if(!identity.taxId)missing.push('NIF/CIF titular');
    if(!identity.cups)missing.push('CUPS');
    if(identity.invoiceNumber==='Por identificar')missing.push('nº factura');
    if(period.label==='Por identificar')missing.push('periodo');
    if(meta.tariff==='—')missing.push('tarifa');
    if(fin.total==null)missing.push('total');
    if(!fin.energyDetail.reliable||!consumptionComplete)missing.push(fin.energyDetail.message||'consumo por periodos');
    if(!fin.powerDetail.reliable)missing.push(fin.powerDetail.message||'potencia');
    if(!fin.balanced)missing.push('cuadre económico');

    const readOk=!missing.length;
    const reading=/Origen\s+Real/i.test(text)?{status:'actual',sourceLabel:'Origen Real indicado por U Energía'}:(options.readingClassifier?.(text)||{status:'unknown',sourceLabel:''});
    const adjustments=[
      {concept:'Financiación bono social',amount_eur:fin.social,category:'regulated'},
      {concept:'Alquiler equipo medida',amount_eur:fin.rental,category:'meter_rental'},
      {concept:'Cuota U Energía',amount_eur:fin.commercialFee,category:'commercial_fee'}
    ].filter(x=>x.amount_eur);
    const opportunity=fin.commercialFee>0?`Concepto adicional identificado: Cuota U Energía ${fin.commercialFee.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} €`:'Sin alertas';

    return{
      file:file?.name||'',
      invoiceNumber:identity.invoiceNumber,
      company:identity.holder||'Por identificar',
      taxId:identity.taxId,
      cups:identity.cups,
      period:period.label,
      tariff:meta.tariff,
      kwh:fin.kwh,
      energy:fin.energy,
      power:fin.power,
      excess:0,
      reactive:0,
      compensation:0,
      social:fin.social,
      rental:fin.rental,
      commercialFee:fin.commercialFee,
      integratorAdjustment:0,
      regularizationReactive:0,
      other:fin.other,
      tax:fin.tax,
      vat:fin.vat,
      igic:0,
      distributorCharges:0,
      total:fin.total,
      accounted:fin.accounted,
      diff:fin.diff,
      balanced:fin.balanced,
      readOk,
      readMessage:readOk?'Lectura correcta':`Falta o revisar: ${missing.join(', ')}`,
      readingStatus:reading.status||'unknown',
      readingSourceLabel:reading.sourceLabel||'',
      avg:fin.kwh&&fin.total?fin.total/fin.kwh:0,
      opportunity,
      periods:fin.periods,
      contracted,
      maximeters,
      parserVersion:options.parserVersion||'',
      parserRevision:REVISION,
      powerDetail:fin.powerDetail,
      energyPricingMode:'period_rates',
      sourceFormat:'uenergia',
      sourceVariant:'standard_2026',
      supplier:RETAILER,
      retailer:RETAILER,
      commercializer:RETAILER,
      brand:BRAND,
      supplyAddress:identity.supplyAddress,
      supplyCity:identity.supplyCity,
      supplyProvince:'',
      contract:meta.contract,
      contractNumber:meta.contract,
      accessContract:meta.accessContract,
      distributor:meta.distributor,
      contractType:meta.contractType,
      productName:meta.productName,
      accessTariffRaw:meta.accessTariffRaw,
      renewalDate:meta.renewalDate,
      meterNumber:meta.meterNumber,
      issueDate:identity.issueDate,
      billingStart:period.start,
      billingEnd:period.end,
      billingDays:period.days,
      billingRecipient:identity.billedTo,
      billingTaxId:identity.billedTaxId,
      adjustments,
      otherConcepts:{
        socialFinancing:fin.social,
        meterRental:fin.rental,
        commercialFee:{name:'Cuota U Energía',amount:fin.commercialFee}
      },
      validation:{
        consumptionPeriods:fin.energyDetail.reliable&&consumptionComplete,
        energyCost:fin.energyDetail.reliable,
        power:fin.powerDetail.reliable,
        economicBalance:fin.balanced
      }
    };
  }

  return Object.freeze({detect,parse,revision:REVISION,_test:{parsePeriod,parsePower,parseEnergy,normalizeMaximeter}});
});
