(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTFenieParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REVISION='fenie-2026.09.27.1';
  const RETAILER='FENIE ENERGIA';

  const money=n=>(Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const num=s=>{if(s==null)return 0;let x=String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(x)||0};
  const euros=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1]));
  const lastEuro=s=>{const a=euros(s);return a.length?a.at(-1):0};
  const find=(a,re)=>a.find(x=>re.test(x))||'';

  function textOf(value){
    if(typeof value==='string')return value;
    if(value?.text)return String(value.text);
    if(Array.isArray(value?.pages))return value.pages.flat().join('\n');
    return '';
  }

  function detect(value){
    const s=textOf(value);
    if(/Endesa\s+Energ[ií]a/i.test(s)||/\bP\d{2}CON\d{6,}\b/i.test(s))return false;
    return /FENIE\s+ENERG[IÍ]A/i.test(s)
      || (/Raz[oó]n\s+Social\s*:/i.test(s)
        && /Periodo\s+Facturaci[oó]n\s*:/i.test(s)
        && /T[eé]rmino\s+(?:de\s+)?potencia/i.test(s));
  }

  function section(a,start,ends){
    const i=a.findIndex(x=>start.test(x));
    if(i<0)return[];
    let j=a.length;
    for(let k=i+1;k<a.length;k++)if(ends.some(r=>r.test(a[k]))){j=k;break}
    return a.slice(i,j);
  }

  function prow(a,p){
    return a.find(x=>new RegExp(`^\\s*P${p}:?\\b`,'i').test(x))||'';
  }

  function sectionTotal(a){
    let n=0;
    for(let p=1;p<=6;p++){
      const ev=euros(prow(a,p));
      if(!ev.length)continue;
      n+=p===1&&ev.length>=2?ev.at(-2):ev.at(-1);
    }
    return round2(n);
  }

  function powerSectionDetails(a,expectedPeriods=0){
    const text=(a||[]).join('\n');
    const expression=/([\d.,]+)\s*kW\s*[x×]\s*(\d+)\s*d[ií]as?\s*=\s*(-?[\d.]+,\d{2})\s*€(?!\s*\/)/gi;
    const entries=[...text.matchAll(expression)].map(m=>({contractedKw:num(m[1]),days:Number(m[2]),amount:num(m[3])}));
    const sum=round2(entries.reduce((s,e)=>s+e.amount,0));
    const remaining=text.replace(expression,'');
    const subtotals=[...remaining.matchAll(/(-?[\d.]+,\d{2})\s*€(?!\s*\/)/g)].map(m=>num(m[1]));
    const labels=[...text.matchAll(/\bP([1-6])\s*:/g)].map(m=>Number(m[1])),uniqueLabels=[...new Set(labels)];
    const expected=Number(expectedPeriods)||0;
    const complete=entries.length>0&&(expected?entries.length===expected:entries.length===uniqueLabels.length);
    const printedTotal=subtotals.length===1?subtotals[0]:null;
    const roundingBound=(entries.length+1)*0.005+0.000001;
    const agrees=printedTotal==null||Math.abs(printedTotal-sum)<=roundingBound;
    const reliable=complete&&subtotals.length<=1&&agrees;
    return {value:reliable&&printedTotal!=null?printedTotal:sum,sum,printedTotal,entries,reliable,
      message:!complete?'Potencia: faltan importes individuales':subtotals.length>1?'Potencia: subtotal ambiguo':!agrees?'Potencia: subtotal y periodos no coinciden':''};
  }

  function maximeters(items){
    const out={};
    if(!items?.length)return out;
    const anchor=items.find(i=>/Max[ií]metro\s*\(kW\)/i.test(String(i.str||'')));
    if(!anchor)return out;
    const ay=anchor.transform?.[5],ax=anchor.transform?.[4]??0;
    if(!Number.isFinite(ay))return out;
    let vals=items
      .filter(i=>i!==anchor&&Math.abs((i.transform?.[5]??9999)-ay)<=3.2&&(i.transform?.[4]??0)>ax&&/^\s*-?[\d.]+,\d{2}\s*$/.test(String(i.str||'')))
      .sort((a,b)=>(a.transform?.[4]??0)-(b.transform?.[4]??0))
      .map(i=>num(i.str));
    if(vals.length<2)return out;
    vals=vals.slice(0,6);
    for(let p=1;p<=vals.length;p++)out[`P${p}`]=vals[p-1];
    out._reliable=true;
    return out;
  }

  function parse(d,file,options={}){
    const a=d?.pages?.[0]||[],text=String(d?.text||a.join('\n')),
      companyLine=find(a,/Raz[oó]n Social:/i),
      company=(companyLine.match(/Raz[oó]n Social:\s*(.+)$/i)||[])[1]?.trim()||'',
      invoiceLine=find(a,/(?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)/i),
      invoiceNumber=((invoiceLine.match(/(?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)\s*:?\s*([A-Z0-9][A-Z0-9._\/-]*)/i)
        ||text.match(/(?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)\s*:?\s*([A-Z0-9][A-Z0-9._\/-]*)/i)||[])[1])||'Por identificar',
      cups=((find(a,/CUPS:/i).match(/ES[A-Z0-9]{16,24}/i)||text.match(/ES[A-Z0-9]{16,24}/i)||[])[0])||'',
      tariff=((find(a,/Tarifa:/i).match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||text.match(/(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)||[])[1])||'—',
      period=((find(a,/Periodo Facturaci[oó]n:/i).match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}(?:\s*\(\d+\s*d[ií]as\))?/i)||[])[0])||'Por identificar',
      total=lastEuro(find(a,/TOTAL FACTURA/i));

    const es=section(a,/T[eé]rmino (?:de )?energ[ií]a(?: variable)?/i,[/T[eé]rmino de potencia/i]),periods={};
    let kwh=0;
    for(let p=1;p<=6;p++){
      const l=prow(es,p);
      if(!l)continue;
      const km=l.match(/([\d.]+,\d{2})\s*kWh/i),consumption=km?num(km[1]):0,ev=euros(l),cost=ev.length?(ev.length>1?ev.at(-2):ev[0]):0,
        pr=[...l.matchAll(/([\d.,]+)\s*€\/kWh/gi)].map(m=>num(m[1]));
      periods[`P${p}`]={consumption,cost,price:pr.at(-1)||0};
      kwh+=consumption;
    }
    const energy=round2(Object.values(periods).reduce((s,x)=>s+x.cost,0));

    const ps=section(a,/T[eé]rmino de potencia/i,[/Excesos? de Potencia/i,/Energ[ií]a reactiva/i,/Bono social/i]),contracted={};
    for(let p=1;p<=6;p++){
      const l=prow(ps,p),m=l.match(/([\d.]+,\d{3})\s*kW/i);
      if(m)contracted[`P${p}`]=num(m[1]);
    }
    const expectedPowerPeriods=/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0,
      powerDetail=powerSectionDetails(ps,expectedPowerPeriods);
    if(powerDetail.reliable&&expectedPowerPeriods&&powerDetail.entries.length===expectedPowerPeriods)
      for(let p=1;p<=expectedPowerPeriods;p++)if(contracted[`P${p}`]==null)contracted[`P${p}`]=powerDetail.entries[p-1].contractedKw;

    const power=powerDetail.value,
      excess=sectionTotal(section(a,/Excesos? de Potencia/i,[/Energ[ií]a reactiva/i,/Bono social/i,/Impuesto electricidad/i])),
      reactive=sectionTotal(section(a,/Energ[ií]a reactiva/i,[/Compensaci[oó]n Excedente/i,/Regularizaci[oó]n/i,/Bono social/i,/Impuesto electricidad/i])),
      mx=maximeters(d?.rawPages?.[1]||[]);

    let compensation=lastEuro(find(a,/Compensaci[oó]n Excedente/i));
    if(compensation>0)compensation=-compensation;
    if(!compensation){
      const m=text.match(/Compensaci[oó]n Excedente[^\n]*?(-?[\d.]+,\d{2})\s*€/i);
      if(m)compensation=num(m[1])>0?-num(m[1]):num(m[1]);
    }

    const social=lastEuro(find(a,/Bono social/i)),
      tax=lastEuro(find(a,/Impuesto electricidad/i)),
      rental=lastEuro(find(a,/Alquiler Equipo medida/i));

    let integratorAdjustment=0;
    const ii=a.findIndex(l=>/Ajuste por Integrador/i.test(l));
    if(ii>=0){
      const v=euros(a.slice(ii,ii+5).join(' ')),neg=v.find(x=>x<0);
      integratorAdjustment=neg??(v.length===1?v[0]:0);
    }

    const regularizationReactive=lastEuro(find(a,/Regularizaci[oó]n\s+Reactiva/i));
    const vat=round2(a.filter(l=>/^\s*IVA\b/i.test(l)).reduce((s,l)=>s+lastEuro(l),0)),
      igic=round2(a.filter(l=>/^\s*IGIC\b/i.test(l)).reduce((s,l)=>s+lastEuro(l),0));

    let db='';
    const rightsRe=/Derechos (?:de )?(?:Verificaci[oó]n|Extensi[oó]n|Acceso|Enganche|Actuaci[oó]n Equipos) Distribuidora/i,
      di=a.findIndex(l=>rightsRe.test(l));
    if(di>=0)for(let i=di;i<Math.min(a.length,di+6);i++){
      if(i>di&&/^(?:Impuesto electricidad|Alquiler Equipo|IVA\b|IGIC\b|TOTAL FACTURA)/i.test(a[i]))break;
      db+=' '+a[i];
    }

    const dv=euros(db),distributorCharges=dv.length?Math.max(...dv):0,
      other=round2(social+rental+integratorAdjustment+regularizationReactive),
      accounted=round2(energy+power+excess+reactive+compensation+other+tax+vat+igic+distributorCharges),
      diff=round2(total-accounted),
      balanced=total>0&&Math.abs(diff)<=.05,
      missing=[];

    if(!company)missing.push('empresa');
    if(!cups)missing.push('CUPS');
    if(period==='Por identificar')missing.push('periodo');
    if(!total)missing.push('total');
    if(!powerDetail.reliable)missing.push(powerDetail.message);

    const readOk=balanced&&!missing.length,alerts=[];
    if(excess>0)alerts.push(`Exceso de potencia: ${money(excess)} €`);
    if(reactive>0)alerts.push(`Reactiva: ${money(reactive)} €`);

    const usable=mx._reliable?Object.keys(mx).filter(k=>/^P\d$/.test(k)&&(contracted[k]||0)>0):[];
    if(usable.length){
      const mc=Math.max(...usable.map(k=>contracted[k])),md=Math.max(...usable.map(k=>mx[k])),ratio=mc?md/mc:1;
      if(mc>=10&&md>0&&ratio<=.5)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / maxímetro máx. ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);
    }else{
      const c=Object.values(contracted);
      if(c.length&&Math.max(...c)>=50)alerts.push(`Potencia contratada elevada (${money(Math.max(...c))} kW): revisar maxímetros e histórico`);
    }

    const reading=options.readingClassifier?.(text)||{status:'unknown',sourceLabel:null};

    return {
      file:file?.name||'',
      invoiceNumber,
      company:company||'Por identificar',
      cups,
      period,
      tariff,
      kwh,
      energy,
      power,
      excess,
      reactive,
      compensation,
      social,
      rental,
      integratorAdjustment,
      regularizationReactive,
      other,
      tax,
      vat,
      igic,
      distributorCharges,
      distributorDescription:db.trim(),
      total,
      accounted,
      diff,
      balanced,
      readOk,
      readMessage:missing.length?`Falta ${missing.join(', ')}`:balanced?'Lectura correcta':`Descuadre: ${money(diff)} €`,
      readingStatus:reading.status||'unknown',
      readingSourceLabel:reading.sourceLabel||'',
      avg:kwh?total/kwh:0,
      opportunity:alerts.length?alerts.join(' · '):'Sin alertas',
      periods,
      contracted,
      maximeters:mx,
      parserVersion:options.parserVersion||REVISION,
      powerDetail
    };
  }


  const norm=v=>String(v??'').trim();
  const clean=v=>norm(v).replace(/\s+/g,' ');
  const afterLabel=(line,re)=>norm(String(line||'').replace(re,'').replace(/^\s*:?\s*/,''));
  const dateIn=line=>((String(line||'').match(/\d{2}\/\d{2}\/\d{4}/)||[])[0])||'';
  const isoDate=value=>{const m=norm(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:''};
  const parseBillingPeriod=value=>{const m=norm(value).match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})(?:\s*\((\d+)\s*d[ií]as\))?/i);return m?{start:isoDate(m[1]),end:isoDate(m[2]),days:m[3]?Number(m[3]):null}:{start:'',end:'',days:null}};
  const sourceStatus=(value,present=true)=>value!==''&&value!=null?'extracted':present?'unreliable':'not_present';

  function powerPriceRows(a){
    const re=/([\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a/gi;
    return (a||[]).map(line=>[...String(line||'').matchAll(re)].map(m=>num(m[1]))).filter(values=>values.length>=4);
  }

  function excessRows(a){
    const out=[];
    for(let p=1;p<=6;p++){
      const line=prow(a,p);if(!line)continue;
      const m=line.match(/P[1-6]:?\s*([\d.,-]+)\s*[x×]\s*([\d.,-]+)\s*=\s*(-?[\d.]+,\d{2})\s*€/i);
      if(m)out.push({period:p,excess_kw:num(m[1]),unit_price:num(m[2]),amount_eur:num(m[3])});
    }
    return out;
  }

  function reactiveRows(a){
    const out=[];
    for(let p=1;p<=6;p++){
      const line=prow(a,p);if(!line)continue;
      let m=line.match(/P[1-6]:?\s*([\d.,-]+)\s*kVArh\s+([\d.,-]+)\s+([\d.,-]+)\s*kVArh\s*[x×]\s*([\d.,-]+)\s*€\s*\/\s*kVArh\s*=\s*(-?[\d.]+,\d{2})\s*€/i);
      if(m){out.push({period:p,reactive_kvarh:num(m[1]),consumption_kvarh:num(m[1]),cos_phi:num(m[2]),excess_kvarh:num(m[3]),unit_price_eur_kvarh:num(m[4]),amount_eur:num(m[5])});continue}
      m=line.match(/P[1-6]:?[\s\S]*?([\d.,-]+)\s*kVArh\s*[x×]\s*([\d.,-]+)\s*€\s*\/\s*kVArh\s*=\s*(-?[\d.]+,\d{2})\s*€/i);
      if(m)out.push({period:p,reactive_kvarh:null,consumption_kvarh:null,cos_phi:null,excess_kvarh:num(m[1]),unit_price_eur_kvarh:num(m[2]),amount_eur:num(m[3])});
    }
    return out;
  }

  function taxRows(a){
    const out=[];
    for(const line of a||[]){
      if(!/^\s*(IVA|IGIC)\b/i.test(line))continue;
      const type=/^\s*IGIC\b/i.test(line)?'IGIC':'IVA',
        label=(line.match(/^\s*((?:IVA|IGIC)(?:\s+(?:Reducido|Normal))?)/i)||[])[1]||type,
        rate=(line.match(/([\d.,]+)\s*%/)||[])[1],
        base=(line.match(/s\/\s*(-?[\d.]+,\d{2})/i)||[])[1];
      out.push({tax_type:type,label:norm(label),rate_pct:rate?num(rate):null,taxable_base_eur:base?num(base):null,amount_eur:lastEuro(line)});
    }
    return out;
  }

  function rightsDetail(a,total){
    const signal=/Derechos (?:de )?(Verificaci[oó]n|Extensi[oó]n|Acceso|Enganche|Actuaci[oó]n Equipos) Distribuidora/ig,
      block=[];let active=false;
    for(const line of a||[]){
      signal.lastIndex=0;
      if(signal.test(line)){active=true;block.push(line);continue}
      if(active){if(/^(?:Impuesto electricidad|Alquiler Equipo|IVA\b|IGIC\b|TOTAL FACTURA)/i.test(line))break;block.push(line)}
    }
    const text=clean(block.join(' '));
    if(!text)return {text:'',items:[],status:'not_present',residual:0};
    signal.lastIndex=0;
    const matches=[...text.matchAll(signal)],items=[];
    for(let i=0;i<matches.length;i++){
      const m=matches[i],start=m.index??0,end=i+1<matches.length?(matches[i+1].index??text.length):text.length,
        segment=text.slice(start,end),amountMatch=segment.match(/\((-?[\d.]+,\d{2})\s*€\)/i);
      if(!amountMatch)continue;
      const legal=(segment.match(/\(([^\)]*(?:R\.D\.|Art\.)[^\)]*)\)/i)||[])[1]||null;
      items.push({concept:`Derechos ${m[1]} Distribuidora`,amount_eur:num(amountMatch[1]),category:'distributor_right',legal_reference:legal,source_text:segment.slice(0,220)});
    }
    if(!items.length&&matches.length===1&&Number(total)!==0){
      const segment=text.slice(matches[0].index??0),legal=(segment.match(/\(([^\)]*(?:R\.D\.|Art\.)[^\)]*)\)/i)||[])[1]||null;
      items.push({concept:`Derechos ${matches[0][1]} Distribuidora`,amount_eur:Number(total),category:'distributor_right',legal_reference:legal,source_text:segment.slice(0,220)});
    }
    const known=round2(items.reduce((sum,item)=>sum+Number(item.amount_eur||0),0)),residual=round2(Number(total||0)-known);
    if(Math.abs(residual)>.05){
      items.push({concept:'Derecho distribuidora no identificado',amount_eur:residual,category:'distributor_right_unidentified',legal_reference:null,source_text:text.slice(0,220)});
      return {text,items,status:'needs_review',residual};
    }
    return {text,items,status:items.length?'extracted':'needs_review',residual:0};
  }

  function parseNormalized(d,file,options={}){
    const row=parse(d,file,options),a=d?.pages?.[0]||[],text=String(d?.text||a.join('\n')),
      period=parseBillingPeriod(row.period),tariff=norm(row.tariff),
      holderLine=find(a,/Raz[oó]n Social\s*:/i),taxIdLine=find(a,/NIF\s*\/\s*CIF\s*:/i),
      addressLine=find(a,/Dir\.\s*Suministro\s*:/i),accessLine=find(a,/Contrato Acceso\s*:/i),
      holderName=afterLabel(holderLine,/.*?Raz[oó]n Social\s*:/i),
      holderTaxId=afterLabel(taxIdLine,/.*?NIF\s*\/\s*CIF\s*:/i).split(/\s+/)[0]||'',
      supplyAddress=afterLabel(addressLine,/.*?Dir\.\s*Suministro\s*:/i),
      accessContract=((afterLabel(accessLine,/.*?Contrato Acceso\s*:/i).match(/[A-Z0-9._-]+/i)||[])[0])||'',
      issueDate=isoDate(dateIn(find(a,/Fecha de Factura\s*:/i))),
      contract=((text.match(/\b(CO-\d{4}-[A-Z0-9._-]+)\b/i)||[])[1])||'',
      contractType=afterLabel(find(a,/Tipo Contrato\s*:/i),/.*?Tipo Contrato\s*:/i),
      contractEndDate=isoDate(dateIn(find(a,/Fecha fin del contrato de suministro\s*:/i))),
      meterLine=find(a,/Alquiler Equipo medida.*N[º°o.]?\s*Contador/i),
      meterNumber=((meterLine.match(/N[º°o.]?\s*Contador\s*([A-Z0-9._-]+)/i)||[])[1])||'',
      distributor=afterLabel(find(a,/Empresa Distribuidora\s*:/i),/.*?Empresa Distribuidora\s*:/i);

    const es=section(a,/T[eé]rmino (?:de )?energ[ií]a(?: variable)?/i,[/T[eé]rmino de potencia/i]),
      energyPeriods=[];let energyPricesReliable=true;
    for(let p=1;p<=6;p++){
      const l=prow(es,p);if(!l)continue;
      const km=l.match(/([\d.]+,\d{2})\s*kWh/i),consumption=km?num(km[1]):0,ev=euros(l),cost=ev.length?(ev.length>1?ev.at(-2):ev[0]):0,
        pr=[...l.matchAll(/([\d.,]+)\s*€\s*\/\s*kWh/gi)].map(m=>num(m[1]));
      if(pr.length<4)energyPricesReliable=false;
      energyPeriods.push({period:p,consumption_kwh:consumption,energy_cost_eur:cost,unit_price_eur_kwh:pr.at(-1)??null,toll_price_eur_kwh:pr[0]??null,charges_price_eur_kwh:pr[1]??null,retailer_price_eur_kwh:pr[2]??null});
    }

    const ps=section(a,/T[eé]rmino de potencia/i,[/Excesos? de Potencia/i,/Energ[ií]a reactiva/i,/Bono social/i]),
      expectedPowerPeriods=/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0,
      priceRows=powerPriceRows(ps),powerEntries=row.powerDetail?.entries||[];
    let powerPricesReliable=!!row.powerDetail?.reliable&&priceRows.length>=powerEntries.length;
    const powerPeriods=row.powerDetail?.reliable?powerEntries.map((entry,i)=>{
      const pr=priceRows[i]||[];if(pr.length<4)powerPricesReliable=false;
      return {period:expectedPowerPeriods?i+1:i+1,contracted_kw:entry.contractedKw,billed_power_eur:entry.amount,unit_price_eur_kw_day:pr.at(-1)??null,toll_price_eur_kw_day:pr[0]??null,charges_price_eur_kw_day:pr[1]??null,retailer_price_eur_kw_day:pr[2]??null};
    }):[];

    const excessSection=section(a,/Excesos? de Potencia/i,[/Energ[ií]a reactiva/i,/Bono social/i,/Impuesto electricidad/i]),
      reactiveSection=section(a,/Energ[ií]a reactiva/i,[/Compensaci[oó]n Excedente/i,/Regularizaci[oó]n/i,/Bono social/i,/Impuesto electricidad/i]),
      excessPeriods=excessRows(excessSection),reactivePeriods=reactiveRows(reactiveSection),
      maximeterRows=Object.keys(row.maximeters||{}).filter(k=>/^P\d$/.test(k)).map(k=>({period:Number(k.slice(1)),maximeter_kw:row.maximeters[k],reliable:!!row.maximeters._reliable,source:'FENIE · tabla maxímetro'})),
      taxes=taxRows(a),rights=rightsDetail(a,row.distributorCharges),
      adjustments=[];

    if(row.integratorAdjustment)adjustments.push({concept:'Ajuste por Integrador',amount_eur:row.integratorAdjustment,category:'adjustment'});
    if(row.regularizationReactive)adjustments.push({concept:'Regularización Reactiva',amount_eur:row.regularizationReactive,category:'reactive_adjustment'});

    const reactiveApplicable=!/^2\.0TD$/i.test(tariff),
      completeness={
        version:options.completenessVersion||'energy-1',
        invoice_number:sourceStatus(row.invoiceNumber),cups:sourceStatus(row.cups),billing_period:sourceStatus(period.start&&period.end),issue_date:sourceStatus(issueDate),
        holder_name:sourceStatus(holderName),holder_tax_id:sourceStatus(holderTaxId),supply_address:sourceStatus(supplyAddress),access_contract_number:sourceStatus(accessContract),
        contract_number:sourceStatus(contract),contract_type:sourceStatus(contractType,!!find(a,/Tipo Contrato\s*:/i)),contract_end_date:sourceStatus(contractEndDate),meter_number:sourceStatus(meterNumber),
        tariff:sourceStatus(tariff),distributor:sourceStatus(distributor),energy_periods:energyPeriods.length?'extracted':'unreliable',energy_price_components:energyPricesReliable?'extracted':'unreliable',
        power_periods:row.powerDetail?.reliable?'extracted':'unreliable',power_price_components:powerPricesReliable?'extracted':'unreliable',maximeters:row.maximeters?._reliable?'extracted':'unreliable',
        excess_detail:excessSection.length?(excessPeriods.length?'extracted':'unreliable'):'not_present',
        reactive_detail:reactiveSection.length?(reactivePeriods.length?'extracted':'unreliable'):(reactiveApplicable?'unreliable':'not_applicable'),
        compensation:find(a,/Compensaci[oó]n Excedente/i)?'extracted':'not_present',social_bonus:find(a,/Bono social/i)?'extracted':'unreliable',
        meter_rental:find(a,/Alquiler Equipo medida/i)?'extracted':'unreliable',electricity_tax:find(a,/Impuesto electricidad/i)?'extracted':'unreliable',
        tax_lines:taxes.length?'extracted':'unreliable',distributor_rights:rights.status,
        integrator_adjustment:find(a,/Ajuste por Integrador/i)?'extracted':'not_present',reactive_regularization:find(a,/Regularizaci[oó]n\s+Reactiva/i)?'extracted':'not_present'
      },
      assessment=Object.values(completeness).some(v=>v==='unreliable'||v==='needs_review')?'needs_review':'complete';

    return {
      modelVersion:'ibt-energy-invoice-1',
      parser:{id:'fenie',version:row.parserVersion},
      invoice:{number:row.invoiceNumber,issueDate,billing:{text:row.period,start:period.start,end:period.end,days:period.days},tariff},
      parties:{holder:{name:holderName,taxId:holderTaxId},retailer:RETAILER,distributor,supplyAddress},
      supply:{cups:row.cups,address:supplyAddress},
      contract:{number:contract,accessNumber:accessContract,type:contractType,endDate:contractEndDate,meterNumber},
      energy:{totalKwh:row.kwh,totalEur:row.energy,periods:energyPeriods},
      power:{totalEur:row.power,periods:powerPeriods,maximeters:maximeterRows,reliable:!!row.powerDetail?.reliable},
      excess:{totalEur:row.excess,periods:excessPeriods},
      reactive:{totalEur:row.reactive,periods:reactivePeriods},
      costs:{
        compensationEur:row.compensation,socialBonusEur:row.social,meterRentalEur:row.rental,electricityTaxEur:row.tax,
        vatEur:row.vat,igicEur:row.igic,distributorChargesEur:row.distributorCharges,otherEur:row.other,totalEur:row.total,accountedEur:row.accounted,differenceEur:row.diff
      },
      taxLines:taxes,
      distributorRights:rights.items,
      adjustments,
      reading:{status:row.readingStatus,sourceLabel:row.readingSourceLabel},
      validation:{balanced:row.balanced,readOk:row.readOk,message:row.readMessage,completeness,assessment}
    };
  }

  return Object.freeze({
    detect,
    parse,
    parseNormalized,
    powerSectionDetails,
    revision:REVISION,
    retailer:RETAILER
  });
});
