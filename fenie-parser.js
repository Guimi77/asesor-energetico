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

  return Object.freeze({
    detect,
    parse,
    powerSectionDetails,
    revision:REVISION,
    retailer:RETAILER
  });
});
