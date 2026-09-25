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
  const amount=(a,re)=>{for(const raw of a||[]){const s=String(raw||'');if(re.test(s)&&/(-?[\d.]+,\d{2})\s*€/.test(s)){const v=lastEuro(s);if(v!=null)return v;}}return null};
  const findMatch=(s,re)=>String(s||'').match(re);
  const canonicalEndesaLine=value=>String(value||'')
    .replace(/N[uú]m\.?(?:ero)?\s+factura/gi,'Nº factura')
    .replace(/Per[ií]ode\s+de\s+facturaci[oó]/gi,'Periodo de facturación')
    .replace(/Titular\s+del\s+contracte/gi,'Titular del contrato')
    .replace(/Adre[cç]a\s+de\s+subministrament/gi,'Dirección de suministro')
    .replace(/Refer[eè]ncia\s+de\s+contracte\s+de\s+subministrament/gi,'Referencia de contrato de suministro')
    .replace(/Refer[eè]ncia\s+del\s+contracte\s+d['’]acc[eé]s/gi,'Referencia del contrato de acceso')
    .replace(/Contracte\s+de\s+mercat\s+lliure/gi,'Contrato de mercado libre')
    .replace(/Pot[eè]ncies\s+contractades/gi,'Potencias contratadas')
    .replace(/Fi\s+de\s+contracte\s+de\s+subministrament/gi,'Fin de contrato de suministro')
    .replace(/Distribu[iï]dora/gi,'Distribuidora')
    .replace(/\bPot[eè]ncia\b/gi,'Potencia').replace(/\bEnergia\b/gi,'Energía')
    .replace(/\bImpostos\b/gi,'Impuestos').replace(/\bImpost\s+electricitat\b/gi,'Impuesto electricidad')
    .replace(/\bAltres\b/gi,'Otros').replace(/\bDiversos\b/gi,'Varios')
    .replace(/\bConsum\b/gi,'Consumo').replace(/\bPla\b/gi,'Llano').replace(/\bVall\b/gi,'Valle')
    .replace(/\bdies\b/gi,'días');
  const canonicalEndesaLines=lines=>(lines||[]).map(canonicalEndesaLine);
  const normalizeTariff=s=>{const m=String(s||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i);return m?m[1].replace(/\s+/g,'').toUpperCase():'—';};
  const numericToken='(-?[\\d.]+,\\d+)';
  const addressStop=/\s+(?:Contrato\s+de\s+mercado\s+libre|Referencia\s+(?:de|del)\s+contrato(?:\s+de\s+suministro|\s+de\s+acceso)?|Potencias?\s+contratadas?|Potencia\s+contratada|Fin\s+de\s+contrato|Permanencia|CUPS|Distribuidora|N[uú]mero\s+de\s+contador|N[º°o.]?\s*contador|Su\s+comercializadora|Peaje\s+de\s+transporte|Segmento\s+de\s+cargos|DESTINO\s+DEL\s+IMPORTE|INFORMACI[ÓO]N\s+DEL\s+CONSUMO)\s*:/i;
  const cutAddress=s=>{let v=String(s||'').replace(/\.{3,}/g,' ').trim();const i=v.search(addressStop);if(i>=0)v=v.slice(0,i);return v.replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,'').replace(/\s*,\s*,+/g,',').replace(/\s+/g,' ').replace(/[\s,;:-]+$/,'').trim();};
  const splitPlace=address=>{const s=cutAddress(address),m=s.match(/\b(\d{5})\s+([^,]+?)(?:,\s*([^,]+?))?\s*$/i);return m?{city:text(m[2]),province:text(m[3]||'')}:{city:'',province:''};};
  const digitsAfter=(a,re)=>{const l=line(a,re);if(!l)return'';const tail=l.replace(/^.*?:\s*/,'');const m=tail.match(/((?:\d[\s.]*){8,20})/);return m?m[1].replace(/\D/g,''):'';};
  const valueAfter=(a,re)=>{const l=line(a,re);if(!l)return'';return cutAddress(l.replace(/^.*?:\s*/,''));};
  function detect(value){
    const s=Array.isArray(value)?value.flat().join('\n'):String(value||'');
    if(/Endesa\s+Energ[ií]a\s*,?\s*S\.A\./i.test(s)&&/\bP\d{2}CON\d+\b/i.test(s))return'endesa';
    if(/FENIE\s+ENERG[IÍ]A/i.test(s)||(/Raz[oó]n\s+Social\s*:/i.test(s)&&/Periodo\s+Facturaci[oó]n\s*:/i.test(s)&&/T[eé]rmino\s+(?:de\s+)?potencia/i.test(s)))return'fenie';
    return'unknown';
  }
  function parsePeriod(p1){
    const s=(p1||[]).join('\n'),i=s.search(/Periodo\s+de\s+facturaci[oó]n\s*:/i),chunk=i>=0?s.slice(i,i+900):s;
    const dates=[...chunk.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map(m=>m[1]);
    if(dates.length<2)return'Por identificar';
    const days=(chunk.match(/\((\d+)\s*d[ií]as\)/i)||[])[1];
    return`${dates[0]} - ${dates[1]}${days?` (${days} días)`:''}`;
  }
  function cleanHolder(p2){
    const l=line(p2,/Titular\s+del\s+contrato\s*:/i);if(!l)return'';
    let s=l.replace(/^.*?Titular\s+del\s+contrato\s*:\s*/i,'');
    s=s.split(/\s*\.{3,}\s*|\s+(?:CUPS|N[uú]mero\s+de\s+contador|Direcci[oó]n\s+de\s+suministro|NIF)\s*:/i)[0];
    return s.trim();
  }
  function parseSupplyAddress(p2){
    const idx=(p2||[]).findIndex(l=>/Direcci[oó]n\s+de\s+suministro\s*:/i.test(String(l||'')));if(idx<0)return'';
    const parts=[];const first=cutAddress(p2[idx]);if(first)parts.push(first);
    for(let i=idx+1;i<Math.min(p2.length,idx+4);i++){
      const raw=String(p2[i]||''),part=cutAddress(raw);if(!part)break;
      if(addressStop.test(' '+raw)&&!part)break;
      if(/\b\d{5}\b/.test(part)||/^[A-ZÁÉÍÓÚÜÑ .,'()/-]{2,40}$/i.test(part))parts.push(part);else break;
      if(addressStop.test(' '+raw))break;
    }
    return cutAddress(parts.join(' '));
  }
  function parseContractMeta(p2){
    const all=(p2||[]).join('\n'),contract=digitsAfter(p2,/Referencia\s+(?:de|del)\s+contrato(?:\s+de\s+suministro)?\s*:/i),accessContract=digitsAfter(p2,/Referencia\s+del\s+contrato\s+de\s+acceso\s*:/i);
    const distLine=line(p2,/^.*?Distribuidora\s*:/i),distributor=distLine?distLine.replace(/^.*?Distribuidora\s*:\s*/i,'').split(/\s+(?:Referencia|Peaje|Segmento|N[º°o.]?\s*contador)\s*:/i)[0].replace(/\.{3,}/g,'').trim():'';
    const renewalDate=(all.match(/Fin\s+de\s+contrato\s+de\s+suministro\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||'';
    const contractType=valueAfter(p2,/Contrato\s+de\s+mercado\s+libre\s*:/i);
    const taxLine=line(p2,/^.*?NIF\s*:/i),taxId=((taxLine.match(/NIF\s*:\s*([A-Z0-9-]{7,15})/i)||[])[1])||'';
    return{contract,accessContract,distributor,renewalDate,contractType,taxId};
  }
  function parseReadingPeriods(p2,tariff){
    const periods={},all=(p2||[]).join('\n');
    if(/^2\.0TD$/i.test(tariff)){
      for(const [key,labelName] of [['P1','Punta'],['P2','Llano'],['P3','Valle']]){
        const m=all.match(new RegExp(`\\b${labelName}\\s+${numericToken}\\s+${numericToken}\\s+${numericToken}\\s+${numericToken}\\s+${numericToken}`,'i'));
        if(m)periods[key]={consumption:num(m[5]),cost:null,price:null};
      }
      return periods;
    }
    for(let p=1;p<=6;p++){
      const m=all.match(new RegExp(`\\bP${p}\\s+1\\.18\\.${p}\\s+${numericToken}\\s+${numericToken}\\s+${numericToken}\\s+${numericToken}\\s+${numericToken}`,'i'));
      if(m)periods[`P${p}`]={consumption:num(m[5]),cost:null,price:null};
    }
    return periods;
  }
  function parseContracted(p2,tariff){
    const out={},all=(p2||[]).join(' ');
    if(/^2\.0TD$/i.test(tariff)){
      const m=all.match(/Potencias?\s+contratadas?\s*:\s*(?:punta(?:\s*[-–]\s*llano)?|punta-llano)\s*([\d.,]+)\s*kW\s*;?\s*valle\s*([\d.,]+)\s*kW/i);
      if(m){out.P1=num(m[1]);out.P2=num(m[2]);}
      return out;
    }
    const start=all.search(/Potencia\s+contratada\s*\[kW\]\s*:/i);if(start<0)return out;
    let src=all.slice(start,start+420);src=src.split(/(?:Fin\s+de\s+contrato|CUPS\s*:|Peaje\s+de\s+transporte|Segmento\s+de\s+cargos)/i)[0];
    for(let p=1;p<=6;p++){const q=src.match(new RegExp(`\\bP${p}\\s*([\\d.,]+)`,'i'));if(q)out[`P${p}`]=num(q[1]);}
    return out;
  }
  function parseMaximeters(p2,tariff){
    const out={},all=(p2||[]).join('\n');
    if(!/^3\.0TD$/i.test(tariff)&&!/^6\./i.test(tariff))return out;
    for(let p=1;p<=6;p++){
      const m=all.match(new RegExp(`\\bP${p}\\s+1\\.16\\.${p}\\s+${numericToken}\\s+1(?:,0+)?\\s+${numericToken}`,'i'));
      if(m)out[`P${p}`]=num(m[2]);
    }
    if(Object.keys(out).length)out._reliable=true;
    return out;
  }
  function parsePowerDetail(p2,summaryPower){
    const entries=[];
    for(const l of p2||[]){
      if(!/\bPot\./i.test(l)||! /\bkW\b/i.test(l)||! /\bd[ií]as\b/i.test(l))continue;
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
  function explicitCharge(p2,labelRe){for(const raw of p2||[]){const s=String(raw||'').trim();if(!labelRe.test(s)||/Incluido\s+en\s+el\s+importe\s+facturado/i.test(s))continue;const v=lastEuro(s);if(v!=null)return v;}return null;}
  function endesaReading(textValue){
    const s=String(textValue||'').replace(/\s+/g,' '),m=s.search(/(?:ENERG[IÍ]A\s+ACTIVA\s+kWh|Energ[ií]a\s+kWh)/i),near=m>=0?s.slice(Math.max(0,m-500),m+80):s;
    const estimated=(near.match(/\bestimada\b/gi)||[]).length,actual=(near.match(/\breal\b/gi)||[]).length;
    if(estimated>=2)return{status:'estimated',sourceLabel:'Lectura estimada / estimada'};
    if(actual>=2)return{status:'actual',sourceLabel:'Lectura real / real'};
    if(/Lectura\s+Lectura\s+estimada\s+estimada/i.test(s))return{status:'estimated',sourceLabel:'Lectura estimada / estimada'};
    if(/Lectura\s+Lectura\s+real\s+real/i.test(s)||/consumo\s+horario\s+real\s+proporcionado\s+por\s+su\s+distribuidora/i.test(s))return{status:'actual',sourceLabel:'Lectura real / real'};
    return{status:'unknown',sourceLabel:null};
  }
  function nonzeroAccessTable(p2,heading){
    const start=(p2||[]).findIndex(l=>heading.test(l));if(start<0)return false;
    for(let i=start+1;i<Math.min(p2.length,start+14);i++){
      const l=p2[i];if(i>start+1&&/(?:INFORMACI[ÓO]N|ATENCI[ÓO]N|DETALLE|EXCESOS?\s+DE\s+POTENCIA)/i.test(l)&&!/\bP[1-6]\b/.test(l))break;
      const m=l.match(/\bP[1-6]\s+.*?(-?[\d.]+,\d{3})\s*(?:$|\s)/);if(m&&Math.abs(num(m[1])||0)>.0005)return true;
    }
    return false;
  }
  function parseEndesa(d,file,options={}){
    const pages=(d?.pages||[]).map(canonicalEndesaLines),p1=pages[0]||[],p2=pages[1]||[],all=pages.flat().join('\n'),p2text=p2.join('\n');
    const invoiceLine=line(p1,/N[º°o.]?\s*(?:de\s+)?factura\s*:/i),invoiceNumber=(invoiceLine.match(/\b(P\d{2}CON\d+)\b/i)||all.match(/\b(P\d{2}CON\d+)\b/i)||[])[1]||'Por identificar';
    const holder=cleanHolder(p2),supplyAddress=parseSupplyAddress(p2),place=splitPlace(supplyAddress),meta=parseContractMeta(p2);
    const cups=(all.match(/\bES[A-Z0-9]{18,24}\b/i)||[])[0]||'';
    const tariff=normalizeTariff(all),period=parsePeriod(p1);
    const total=amount(p1,/^\s*IMPORTE\s+FACTURA\s*:/i)??amount(p1,/^\s*Total\b/i);
    const power=amount(p1,/^\s*Potencia\b/i),energy=amount(p1,/^\s*Energ[ií]a\b/i),discounts=amount(p1,/^\s*Descuentos\b/i)??0,summaryOther=amount(p1,/^\s*(?:Otros|Varios)\b/i)??0,adjustments=amount(p1,/^\s*Ajustes?\s+de\s+peajes/i)??0,summaryTaxes=amount(p1,/^\s*Impuestos\b/i);
    const kwh=(all.match(/Consumo\s+Total\s+([\d.]+,\d+)\s*kWh/i)||[])[1],consumption=num(kwh);
    const iva=explicitCharge(p2,/^\s*IVA\s+(?:normal\s*)?(?:\(|\d|%)/i)??0,igic=explicitCharge(p2,/^\s*IGIC\b/i)??0,electricTax=explicitCharge(p2,/^\s*Impuesto\s+(?:de\s+)?electricidad/i),tax=electricTax!=null?electricTax:summaryTaxes!=null?round2(summaryTaxes-iva-igic):0;
    const compensationLine=line(p2,/Compensaci[oó]n.*Excedente/i);let compensation=compensationLine?lastEuro(compensationLine)??0:0;if(compensation>0)compensation=-compensation;
    const other=round2(discounts+summaryOther+adjustments);
    const periods=parseReadingPeriods(p2,tariff),contracted=parseContracted(p2,tariff),maximeters=parseMaximeters(p2,tariff),powerDetail=parsePowerDetail(p2,power);
    const excess=explicitCharge(p2,/^\s*Excesos?\s+de\s+potencia\b/i)??0,reactive=explicitCharge(p2,/^\s*Energ[ií]a\s+reactiva\b/i)??0;
    const unresolvedExcess=excess===0&&nonzeroAccessTable(p2,/EXCESOS\s+DE\s+POTENCIA\s+kW/i),unresolvedReactive=reactive===0&&nonzeroAccessTable(p2,/ENERG[IÍ]A\s+REACTIVA\s+INDUCTIVA/i);
    const periodKwh=round2(Object.values(periods).reduce((s,x)=>s+(Number(x?.consumption)||0),0)),periodKwhOk=consumption==null||(Object.keys(periods).length>0&&Math.abs(periodKwh-consumption)<=.1);
    const accounted=round2((energy||0)+(power||0)+excess+reactive+compensation+other+tax+iva+igic),diff=total==null?null:round2(total-accounted),balanced=total!=null&&Math.abs(diff)<=.05;
    const missing=[];if(!holder)missing.push('titular');if(!cups)missing.push('CUPS');if(period==='Por identificar')missing.push('periodo');if(total==null)missing.push('total');if(consumption==null)missing.push('consumo');if(!periodKwhOk)missing.push('consumo por periodos no cuadra con el consumo total');if(power==null||!powerDetail.reliable)missing.push(powerDetail.message||'potencia');if(energy==null)missing.push('energía');if(summaryTaxes==null)missing.push('impuestos');if(unresolvedExcess)missing.push('exceso de potencia sin importe monetario identificable');if(unresolvedReactive)missing.push('reactiva sin importe monetario identificable');
    const readOk=balanced&&!missing.length,alerts=[];
    if(excess>0)alerts.push(`Exceso de potencia: ${money(excess)} €`);if(reactive>0)alerts.push(`Reactiva: ${money(reactive)} €`);
    const usable=maximeters._reliable?Object.keys(maximeters).filter(k=>/^P\d$/.test(k)&&(contracted[k]||0)>0):[];
    if(usable.length){const mc=Math.max(...usable.map(k=>contracted[k])),md=Math.max(...usable.map(k=>maximeters[k])),ratio=mc?md/mc:1;if(mc>=10&&md>0&&ratio<=.5)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}
    const service=parseServiceInfo(pages,total);if(service.serviceTotal>0)alerts.push(`El PDF incluye servicios adicionales por ${money(service.serviceTotal)} € fuera de la factura eléctrica. Conviene revisarlos.`);
    const classified=options.readingClassifier?.(p2text),reading=classified&&classified.status&&classified.status!=='unknown'?classified:endesaReading(p2text);
    return{file:file?.name||'',invoiceNumber,company:holder||'Por identificar',taxId:meta.taxId,cups,period,tariff,kwh:consumption,energy,power,excess,reactive,compensation,social:0,rental:0,integratorAdjustment:0,regularizationReactive:0,other,tax,vat:iva,igic,distributorCharges:0,distributorDescription:'',total,accounted,diff,balanced,readOk,readMessage:missing.length?`Falta o revisar: ${missing.join(', ')}`:balanced?'Lectura correcta':`Descuadre: ${money(diff)} €`,readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',avg:consumption?total/consumption:0,opportunity:alerts.length?alerts.join(' · '):'Sin alertas',periods,contracted,maximeters,parserVersion:options.parserVersion||'',powerDetail,sourceFormat:'endesa',supplier:'Endesa Energía S.A.U.',retailer:'Endesa Energía S.A.U.',commercializer:'Endesa Energía S.A.U.',supplyAddress,supplyCity:place.city,supplyProvince:place.province,contract:meta.contract,contractNumber:meta.contract,accessContract:meta.accessContract,distributor:meta.distributor,contractType:meta.contractType,renewalDate:meta.renewalDate,serviceTotal:service.serviceTotal,paymentTotal:service.paymentTotal,serviceInvoices:service.serviceInvoices,discounts,summaryOther,adjustments};
  }
  function unsupportedRow(file){return{unsupported:true,file:file?.name||'',invoiceNumber:'—',company:'Formato no compatible todavía',cups:'',period:'—',tariff:'—',kwh:null,energy:null,power:null,excess:null,reactive:null,compensation:null,social:null,rental:null,integratorAdjustment:null,regularizationReactive:null,other:null,tax:null,vat:null,igic:null,distributorCharges:null,total:null,accounted:null,diff:null,balanced:false,readOk:false,readMessage:'Factura no compatible todavía',readingStatus:'unknown',readingSourceLabel:'',avg:null,opportunity:'Factura no compatible todavía. No se ha interpretado ni guardado ningún dato.',periods:{},contracted:{},maximeters:{},powerDetail:{reliable:false},sourceFormat:'unknown'};}
  return Object.freeze({detect,parseEndesa,unsupportedRow,endesaReading,canonicalEndesaLine,canonicalEndesaLines});
});
