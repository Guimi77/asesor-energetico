(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTInvoiceFormats=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v==null||v==='')return null;let s=String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');if(!s||s==='-'||s==='.')return null;const n=Number(s);return Number.isFinite(n)?n:null};
  const money=n=>Number(n||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const line=(a,re)=>(a||[]).find(x=>re.test(String(x||'')))||'';
  const lastEuro=s=>{const a=[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v!=null);return a.length?a.at(-1):null};
  const amount=(a,re)=>lastEuro(line(a,re));
  const findMatch=(s,re)=>String(s||'').match(re);
  const normalizeTariff=s=>{const m=String(s||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i);return m?m[1].replace(/\s+/g,'').toUpperCase():'—';};
  function detect(value){
    const s=Array.isArray(value)?value.flat().join('\n'):String(value||'');
    if(/Endesa\s+Energ[ií]a\s*,?\s*S\.A\./i.test(s)&&/\bP\d{2}CON\d+\b/i.test(s))return'endesa';
    if(/FENIE\s+ENERG[IÍ]A/i.test(s)||(/Raz[oó]n\s+Social\s*:/i.test(s)&&/Periodo\s+Facturaci[oó]n\s*:/i.test(s)&&/T[eé]rmino\s+(?:de\s+)?potencia/i.test(s)))return'fenie';
    return'unknown';
  }
  function parsePeriod(p1){
    const s=(p1||[]).join(' '),m=s.match(/Periodo\s+de\s+facturaci[oó]n\s*:\s*del\s*(\d{2}\/\d{2}\/\d{4})\s*(?:a|al|-)\s*(\d{2}\/\d{2}\/\d{4})\s*\((\d+)\s*d[ií]as\)/i);
    return m?`${m[1]} - ${m[2]} (${m[3]} días)`:'Por identificar';
  }
  function parseReadingPeriods(p2,tariff){
    const periods={};
    if(/^2\.0TD$/i.test(tariff)){
      const map=[['P1','Punta'],['P2','Llano'],['P3','Valle']];
      for(const [key,labelName] of map){
        const l=line(p2,new RegExp(`^\\s*${labelName}\\b`,'i'));
        if(!l)continue;
        const vals=[...l.matchAll(/-?[\d.]+,\d+/g)].map(m=>num(m[0])).filter(v=>v!=null);
        if(vals.length)periods[key]={consumption:vals.at(-1),cost:null,price:null};
      }
      return periods;
    }
    for(let p=1;p<=6;p++){
      const l=line(p2,new RegExp(`^\\s*P${p}\\s+1\\.(?:18|8)\\.${p}\\b`,'i'))||line(p2,new RegExp(`^\\s*P${p}\\b.*\\bkWh\\b`,'i'));
      if(!l)continue;
      const vals=[...l.matchAll(/-?[\d.]+,\d+/g)].map(m=>num(m[0])).filter(v=>v!=null);
      if(vals.length)periods[`P${p}`]={consumption:vals.at(-1),cost:null,price:null};
    }
    return periods;
  }
  function parseContracted(p2,tariff){
    const out={},all=(p2||[]).join(' ');
    if(/^2\.0TD$/i.test(tariff)){
      const m=all.match(/Potencias?\s+contratadas?\s*:\s*(?:punta(?:-llano)?|punta\s*[-–]\s*llano)\s*([\d.,]+)\s*kW\s*;?\s*valle\s*([\d.,]+)\s*kW/i);
      if(m){out.P1=num(m[1]);out.P2=num(m[2]);}
      return out;
    }
    const m=all.match(/Potencia\s+contratada\s*\[kW\]\s*:\s*([^\.]+(?:\.|$))/i);
    const src=m?m[1]:all;
    for(let p=1;p<=6;p++){const q=src.match(new RegExp(`P${p}\\s*([\\d.,]+)`,'i'));if(q)out[`P${p}`]=num(q[1]);}
    return out;
  }
  function parseMaximeters(p2,tariff){
    const out={};
    if(!/^3\.0TD$/i.test(tariff)&&!/^6\./i.test(tariff))return out;
    for(let p=1;p<=6;p++){
      const l=line(p2,new RegExp(`^\\s*P${p}\\s+1\\.16\\.${p}\\b`,'i'));
      if(!l)continue;
      const vals=[...l.matchAll(/-?[\d.]+,\d+/g)].map(m=>num(m[0])).filter(v=>v!=null);
      if(vals.length)out[`P${p}`]=vals.at(-1);
    }
    if(Object.keys(out).length)out._reliable=true;
    return out;
  }
  function parsePowerDetail(p2,summaryPower){
    const entries=[];
    for(const l of p2||[]){
      if(!/^\s*Pot\./i.test(l)||! /\bkW\b/i.test(l)||! /\bd[ií]as\b/i.test(l))continue;
      const v=lastEuro(l);if(v!=null)entries.push({amount:v,source:l});
    }
    const sum=round2(entries.reduce((s,e)=>s+e.amount,0));
    const reliable=summaryPower!=null&&entries.length>=2&&Math.abs(sum-summaryPower)<=.05;
    return{entries,sum,printedTotal:summaryPower,reliable,message:reliable?'':'Potencia: detalle Endesa no cuadra con el resumen'};
  }
  function parseServiceInfo(pages,electricityTotal){
    const p=(pages||[]).slice(2).flat(),joined=p.join(' ');
    const has=/FACTURA\s+(?:ENDESA\s+X\s+)?(?:DE\s+)?SERVICIOS/i.test(joined);
    if(!has)return{serviceTotal:0,paymentTotal:electricityTotal,serviceInvoices:0};
    const totals=p.filter(l=>/TOTAL\s+IMPORTE\s+FACTURA/i.test(l)).map(lastEuro).filter(v=>v!=null);
    const serviceTotal=round2(totals.reduce((s,v)=>s+v,0));
    const pay=findMatch(joined,/Total\s+importe\s+a\s+pagar\s+(-?[\d.]+,\d{2})\s*€/i);
    const paymentTotal=pay?num(pay[1]):round2((electricityTotal||0)+serviceTotal);
    return{serviceTotal,paymentTotal,serviceInvoices:totals.length};
  }
  function explicitCharge(p2,labelRe){const l=line(p2,labelRe);return l?lastEuro(l):null;}
  function endesaReading(textValue){
    const s=text(textValue);
    if(/Lectura\s+Lectura\s+estimada\s+estimada/i.test(s))return{status:'estimated',sourceLabel:'Lectura estimada / estimada'};
    if(/Lectura\s+Lectura\s+real\s+real/i.test(s)||/consumo\s+horario\s+real\s+proporcionado\s+por\s+su\s+distribuidora/i.test(s))return{status:'actual',sourceLabel:'Lectura real / real'};
    return{status:'unknown',sourceLabel:null};
  }
  function nonzeroAccessTable(p2,heading){
    const start=(p2||[]).findIndex(l=>heading.test(l));if(start<0)return false;
    for(let i=start+1;i<Math.min(p2.length,start+12);i++){
      const l=p2[i];if(i>start+1&&/^(?:INFORMACI[ÓO]N|ATENCI[ÓO]N|DETALLE|EXCESOS?\s+DE\s+POTENCIA)/i.test(l))break;
      const m=l.match(/^\s*P[1-6]\s+.*?(-?[\d.]+,\d{3})\s*$/);if(m&&Math.abs(num(m[1])||0)>.0005)return true;
    }
    return false;
  }
  function parseEndesa(d,file,options={}){
    const pages=d?.pages||[],p1=pages[0]||[],p2=pages[1]||[],all=pages.flat().join('\n');
    const invoiceLine=line(p1,/N[º°o.]?\s*(?:de\s+)?factura\s*:/i),invoiceNumber=(invoiceLine.match(/\b(P\d{2}CON\d+)\b/i)||[])[1]||'Por identificar';
    const holder=line(p2,/Titular\s+del\s+contrato\s*:/i).replace(/^.*?Titular\s+del\s+contrato\s*:\s*/i,'').trim();
    const cups=(all.match(/\bES[A-Z0-9]{18,24}\b/i)||[])[0]||'';
    const tariff=normalizeTariff(all),period=parsePeriod(p1);
    const total=amount(p1,/^\s*Total\b/i)??lastEuro(line(p1,/IMPORTE\s+FACTURA\s*:/i));
    const power=amount(p1,/^\s*Potencia\b/i),energy=amount(p1,/^\s*Energ[ií]a\b/i),discounts=amount(p1,/^\s*Descuentos\b/i)??0,summaryOther=amount(p1,/^\s*Otros\b/i)??0,adjustments=amount(p1,/Ajustes?\s+de\s+peajes/i)??0,summaryTaxes=amount(p1,/^\s*Impuestos\b/i);
    const kwh=(all.match(/Consumo\s+Total\s+([\d.]+,\d+)\s*kWh/i)||[])[1],consumption=num(kwh);
    const iva=explicitCharge(p2,/^\s*IVA\b/i)??0,igic=explicitCharge(p2,/^\s*IGIC\b/i)??0,electricTax=explicitCharge(p2,/^\s*Impuesto\s+(?:de\s+)?electricidad/i),tax=electricTax!=null?electricTax:summaryTaxes!=null?round2(summaryTaxes-iva-igic):0;
    const compensationLine=line(p2,/Compensaci[oó]n.*Excedente/i);let compensation=compensationLine?lastEuro(compensationLine)??0:0;if(compensation>0)compensation=-compensation;
    const other=round2(discounts+summaryOther+adjustments);
    const periods=parseReadingPeriods(p2,tariff),contracted=parseContracted(p2,tariff),maximeters=parseMaximeters(p2,tariff),powerDetail=parsePowerDetail(p2,power);
    const excess=explicitCharge(p2,/^\s*Excesos?\s+de\s+potencia\b.*€/i)??0,reactive=explicitCharge(p2,/^\s*Energ[ií]a\s+reactiva\b.*€/i)??0;
    const unresolvedExcess=excess===0&&nonzeroAccessTable(p2,/^\s*EXCESOS\s+DE\s+POTENCIA\s+kW/i),unresolvedReactive=reactive===0&&nonzeroAccessTable(p2,/^\s*ENERG[IÍ]A\s+REACTIVA\s+INDUCTIVA/i);
    const accounted=round2((energy||0)+(power||0)+excess+reactive+compensation+other+tax+iva+igic),diff=total==null?null:round2(total-accounted),balanced=total!=null&&Math.abs(diff)<=.05;
    const missing=[];if(!holder)missing.push('titular');if(!cups)missing.push('CUPS');if(period==='Por identificar')missing.push('periodo');if(total==null)missing.push('total');if(consumption==null)missing.push('consumo');if(power==null||!powerDetail.reliable)missing.push(powerDetail.message||'potencia');if(energy==null)missing.push('energía');if(summaryTaxes==null)missing.push('impuestos');if(unresolvedExcess)missing.push('exceso de potencia sin importe monetario identificable');if(unresolvedReactive)missing.push('reactiva sin importe monetario identificable');
    const readOk=balanced&&!missing.length,alerts=[];
    if(excess>0)alerts.push(`Exceso de potencia: ${money(excess)} €`);if(reactive>0)alerts.push(`Reactiva: ${money(reactive)} €`);
    const usable=maximeters._reliable?Object.keys(maximeters).filter(k=>/^P\d$/.test(k)&&(contracted[k]||0)>0):[];
    if(usable.length){const mc=Math.max(...usable.map(k=>contracted[k])),md=Math.max(...usable.map(k=>maximeters[k])),ratio=mc?md/mc:1;if(mc>=10&&md>0&&ratio<=.5)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}
    const service=parseServiceInfo(pages,total);if(service.serviceTotal>0)alerts.push(`El PDF incluye servicios adicionales por ${money(service.serviceTotal)} € fuera de la factura eléctrica. Conviene revisarlos.`);
    const classified=options.readingClassifier?.(all),reading=classified&&classified.status&&classified.status!=='unknown'?classified:endesaReading(all);
    return{file:file?.name||'',invoiceNumber,company:holder||'Por identificar',cups,period,tariff,kwh:consumption,energy,power,excess,reactive,compensation,social:0,rental:0,integratorAdjustment:0,regularizationReactive:0,other,tax,vat:iva,igic,distributorCharges:0,distributorDescription:'',total,accounted,diff,balanced,readOk,readMessage:missing.length?`Falta o revisar: ${missing.join(', ')}`:balanced?'Lectura correcta':`Descuadre: ${money(diff)} €`,readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',avg:consumption?total/consumption:0,opportunity:alerts.length?alerts.join(' · '):'Sin alertas',periods,contracted,maximeters,parserVersion:options.parserVersion||'',powerDetail,sourceFormat:'endesa',supplier:'Endesa Energía S.A.U.',serviceTotal:service.serviceTotal,paymentTotal:service.paymentTotal,serviceInvoices:service.serviceInvoices,discounts,adjustments};
  }
  function unsupportedRow(file){return{unsupported:true,file:file?.name||'',invoiceNumber:'—',company:'Formato no compatible todavía',cups:'',period:'—',tariff:'—',kwh:null,energy:null,power:null,excess:null,reactive:null,compensation:null,social:null,rental:null,integratorAdjustment:null,regularizationReactive:null,other:null,tax:null,vat:null,igic:null,distributorCharges:null,total:null,accounted:null,diff:null,balanced:false,readOk:false,readMessage:'Factura no compatible todavía',readingStatus:'unknown',readingSourceLabel:'',avg:null,opportunity:'Factura no compatible todavía. No se ha interpretado ni guardado ningún dato.',periods:{},contracted:{},maximeters:{},powerDetail:{reliable:false},sourceFormat:'unknown'};}
  return Object.freeze({detect,parseEndesa,unsupportedRow,endesaReading});
});