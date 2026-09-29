(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTSomEnergiaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REVISION='som-2026.09.29.2';
  const RETAILER='Som Energia, SCCL';

  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const round3=n=>Math.round((Number(n)||0)*1000)/1000;
  const round2=n=>Math.round((Number(n)||0)*100)/100;

  function textOf(value){
    if(typeof value==='string')return value;
    if(value?.text)return String(value.text);
    if(Array.isArray(value?.pages))return value.pages.flat().join('\n');
    return '';
  }

  function linesOf(value){
    if(Array.isArray(value?.pages))return value.pages.flat().map(clean).filter(Boolean);
    return textOf(value).split(/\r?\n/).map(clean).filter(Boolean);
  }

  function numEs(value){
    if(value==null||value==='')return null;
    let s=String(value).trim().replace(/\s/g,'').replace(/[^0-9,.-]/g,'');
    if(!s||s==='-'||s==='.'||s===',')return null;
    if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
    else if(!/^-?0\.\d+$/.test(s)&&/^-?\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
    const n=Number(s);
    return Number.isFinite(n)?n:null;
  }

  function euroValues(value){
    return [...String(value||'').matchAll(/(-?[\d.]+,\d{1,2})\s*€/g)].map(m=>numEs(m[1])).filter(v=>v!=null);
  }

  function moneyAfterLabel(lines,re){
    for(const line of lines){
      if(!re.test(line))continue;
      const vals=euroValues(line);
      if(vals.length)return vals.at(-1);
    }
    return null;
  }

  function sectionText(text,startRe,endRe,max=2200){
    const i=String(text||'').search(startRe);
    if(i<0)return'';
    let chunk=String(text||'').slice(i,i+max);
    if(endRe){
      const rest=chunk.slice(1),j=rest.search(endRe);
      if(j>=0)chunk=chunk.slice(0,j+1);
    }
    return chunk;
  }

  function normalizeCups(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function isoDate(v){const m=String(v||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:'';}
  function daysBetweenInclusive(start,end){
    const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z');
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return null;
    return Math.round((b-a)/86400000)+1;
  }

  function detect(value){
    const s=textOf(value);
    const provider=/\bSom\s+Energia\s*,?\s*SCCL\b/i.test(s);
    const invoice=/\bDADES\s+DE\s+LA\s+FACTURA\b/i.test(s)&&/\bN[uú]m\.?\s+de\s+factura\s*:/i.test(s);
    const detail=/\bDETALL\s+DE\s+LA\s+FACTURA\b/i.test(s);
    const supply=/\bCUPS\s*:\s*ES[A-Z0-9\s]{18,28}\b/i.test(s);
    if(/\b(?:Endesa|Naturgy|Iberdrola|Repsol|FENIE\s+ENERG[IÍ]A|ELECTRICA\s+SOLLERENSE)\b/i.test(s)&&!provider)return false;
    return provider&&invoice&&detail&&supply;
  }

  function parseIdentity(text,lines){
    const invoice=(text.match(/N[uú]m\.?\s+de\s+factura\s*:\s*([A-Z0-9._\/-]+)/i)||[])[1]||'Por identificar';
    const issueDateRaw=(text.match(/Data\s+de\s+la\s+factura\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||'';
    const periodMatch=text.match(/Per[ií]ode\s+facturat\s*:\s*del\s*(\d{2}\/\d{2}\/\d{4})\s+al\s*(\d{2}\/\d{2}\/\d{4})/i);
    const billingStart=periodMatch?isoDate(periodMatch[1]):'';
    const billingEnd=periodMatch?isoDate(periodMatch[2]):'';
    const billingDays=billingStart&&billingEnd?daysBetweenInclusive(billingStart,billingEnd):null;
    const contract=(text.match(/N[uú]m\.?\s+de\s+contracte\s*:\s*([A-Z0-9._\/-]+)/i)||[])[1]||'';
    const address=clean((text.match(/Adre[cç]a\s+de\s+subministrament\s*:\s*([^\n]+)/i)||[])[1]||'');
    const holder=clean((text.match(/Nom\s+del\s*\/\s*de\s+la\s+titular\s+del\s+contracte\s*:\s*([^\n]+)/i)||[])[1]||'');
    let taxId='';
    const holderIndex=lines.findIndex(line=>/Nom\s+del\s*\/\s*de\s+la\s+titular\s+del\s+contracte/i.test(line));
    if(holderIndex>=0){
      for(let i=holderIndex;i<Math.min(lines.length,holderIndex+4);i++){
        const m=lines[i].match(/NIF\/CIF\s*:\s*([A-Z0-9-]{7,15})/i);
        if(m){taxId=m[1];break;}
      }
    }
    return{invoice,issueDate:isoDate(issueDateRaw),periodMatch,billingStart,billingEnd,billingDays,contract,address,holder,taxId};
  }

  function valueAfterLabel(lines,re){
    const i=lines.findIndex(line=>re.test(line));
    if(i<0)return'';
    const own=lines[i].replace(/^.*?:\s*/,'').trim();
    if(own&&own!==lines[i])return own;
    return clean(lines[i+1]||'');
  }

  function parseContract(text,lines){
    const cups=normalizeCups((text.match(/\bCUPS\s*:\s*(ES[A-Z0-9]{18,24})\b/i)||[])[1]||'');
    const tariff=((text.match(/Peatge\s+de\s+transport\s+i\s+distribuci[oó]\s*:\s*(2\s*\.\s*0\s*TD|3\s*\.\s*0\s*TD|6\s*\.\s*[1-4]\s*TD)/i)||[])[1]||'').replace(/\s+/g,'').toUpperCase();
    let distributor=valueAfterLabel(lines,/^Empresa\s+distribu[iï]dora\s*:/i);
    if(!distributor)distributor=clean((text.match(/Empresa\s+distribu[iï]dora\s*:\s*([^\n]+)/i)||[])[1]||'');
    const accessContract=(text.match(/N[uú]m\.?\s+contracte\s+distribu[iï]dora\s*:\s*([A-Z0-9._\/-]+)/i)||[])[1]||'';
    const meterNumber=(text.match(/N[uú]mero\s+de\s+comptador\s*:\s*([A-Z0-9._\/-]+)/i)||[])[1]||'';
    const cnae=(text.match(/\bCNAE\s*:\s*(\d{3,6})/i)||[])[1]||'';
    const endDate=(text.match(/Data\s+final\s+del\s+contracte\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||'';
    const selfConsumptionType=clean((text.match(/Autoproducci[oó]\s+tipus\s*:\s*([^\n]+)/i)||[])[1]||'');
    const cau=normalizeCups((text.match(/CAU\s*\([^)]*\)\s*:\s*(ES[A-Z0-9]+)/i)||[])[1]||'');
    return{cups,tariff,distributor,accessContract,meterNumber,cnae,endDate:isoDate(endDate),selfConsumptionType,cau};
  }

  function parseContracted(text){
    const out={};
    const m=text.match(/Pot[eè]ncia\s+contractada\s*\(kW\)\s*:\s*Punta\s*:\s*([\d.,]+)\s*-\s*Vall\s*:\s*([\d.,]+)/i);
    if(m){out.P1=numEs(m[1]);out.P2=numEs(m[2]);}
    return out;
  }

  function parseEnergyPeriods(text,lines=[]){
    const anchor=text.search(/Electricitat\s+utilitzada\s*\[kWh\]\s*\(real\)/i);
    if(anchor<0)return{periods:{},kwh:null,energy:null,reliable:false,costReliable:false,message:'Falten consums P1-P3 facturats'};
    const chunk=text.slice(anchor,anchor+1200);
    const head=chunk.match(/Electricitat\s+utilitzada\s*\[kWh\]\s*\(real\)\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i);
    if(!head)return{periods:{},kwh:null,energy:null,reliable:false,costReliable:false,message:'No es poden llegir els consums P1-P3'};
    const vals=[numEs(head[1]),numEs(head[2]),numEs(head[3])];
    if(vals.some(v=>v==null))return{periods:{},kwh:null,energy:null,reliable:false,costReliable:false,message:'Consums P1-P3 incomplets'};
    const nearby=lines.slice(Math.max(0,lines.findIndex(line=>/Electricitat\s+utilitzada\s*\[kWh\]\s*\(real\)/i.test(line))),lines.length);
    const priceLine=nearby.find(line=>/Preu\s+energia\s*\[€\/kWh\]/i.test(line))||'';
    const priceVals=[...priceLine.matchAll(/(?<![\d.,])(-?[\d.]+(?:,\d+)?)(?![\d.,])/g)].map(m=>numEs(m[1])).filter(v=>v!=null);
    const costLine=nearby.find(line=>/kWh\s*x\s*€\/kWh/i.test(line)&&/€/.test(line))||'';
    const costVals=euroValues(costLine);
    const periods={};
    for(let i=0;i<3;i++)periods['P'+(i+1)]={consumption:vals[i],price:priceVals.length>=3?priceVals[i]:null,cost:costVals.length>=4?costVals[i]:null};
    const kwh=round3(vals.reduce((a,b)=>a+b,0));
    const energy=costVals.length>=4?costVals[3]:null;
    const costSum=costVals.length>=4?round2(costVals.slice(0,3).reduce((s,v)=>s+v,0)):null;
    const costReliable=energy!=null&&Math.abs(costSum-energy)<=.03;
    return{periods,kwh,energy,reliable:true,costReliable,message:costReliable?'':'Cost energia P1-P3 no quadra o falta'};
  }

  function parsePower(text,lines){
    const contracted=parseContracted(text);
    const anchor=text.search(/Facturaci[oó]\s+per\s+pot[eè]ncia\s+contractada/i);
    const chunk=anchor>=0?text.slice(anchor,anchor+1000):text;
    const row=chunk.match(/kW\s*x\s*€\/kW\s*x\s*\([^)]*\)\s*dies[^\n]*?\s(-?[\d.]+,\d{2})\s*€?\s+(-?[\d.]+,\d{2})\s*€?\s+(-?[\d.]+,\d{2})\s*€/i);
    const total=row?numEs(row[3]):moneyAfterLabel(lines,/^Pot[eè]ncia\s+contractada\b/i);
    return{contracted,total,reliable:Object.keys(contracted).length===2&&total!=null};
  }

  function parseCompensation(text,lines){
    const block=sectionText(text,/Compensaci[oó]\s*per\s*electricitat\s*excedent[aà]ria/i,/Impost\s+de\s+l['’]electricitat/i,1800);
    if(!block)return{present:false,total:null,periods:{},exportedKwh:null,reliable:true};
    const q=block.match(/Electricitat\s+excedent[aà]ria\s*\[kWh\]\s*(-?[\d.,]+)\s+(-?[\d.,]+)\s+(-?[\d.,]+)/i);
    const price=(block.match(/Preu\s+energia\s*\[€\/kWh\]\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i)||[]);
    const costLine=(lines||[]).find(line=>/kWh\s*x\s*€\/kWh/i.test(line)&&/-[\d.,]+\s*€/.test(line))||'';
    const costs=euroValues(costLine);
    const quantities=q?[numEs(q[1]),numEs(q[2]),numEs(q[3])]:[];
    const prices=price.length?[numEs(price[1]),numEs(price[2]),numEs(price[3])]:[];
    const periods={};
    for(let i=0;i<3;i++)if(quantities[i]!=null)periods['P'+(i+1)]={excessKwh:Math.abs(quantities[i]),price:prices[i]??null,amount:costs.length>=4?costs[i]:null};
    const total=costs.length>=4?costs[3]:(()=>{const vals=euroValues(block);return vals.length?vals.at(-1):null;})();
    const exportedKwh=quantities.length===3?round3(quantities.reduce((s,v)=>s+Math.abs(v||0),0)):null;
    const sum=costs.length>=4?round2(costs.slice(0,3).reduce((s,v)=>s+v,0)):null;
    const reliable=total!=null&&(sum==null||Math.abs(sum-total)<=.03);
    return{present:true,total,periods,exportedKwh,reliable};
  }

  function parseFinancials(text,lines,energy,power){
    const adjustment=moneyAfterLabel(lines,/Serveis\s+d['’]Ajust/i);
    const social=moneyAfterLabel(lines,/^Bo\s+social\b/i);
    const compensation=parseCompensation(text,lines);

    const taxBlock=sectionText(text,/Impost\s+de\s+l['’]electricitat/i,/Lloguer\s+de\s+comptador/i,1400);
    const taxEuros=euroValues(taxBlock),tax=taxEuros.length?taxEuros.at(-1):null,taxBase=taxEuros.length>=2?taxEuros[0]:null;
    const taxRateMatch=taxBlock.match(/([\d.,]+)\s*%/),taxRate=taxRateMatch?numEs(taxRateMatch[1]):null;

    const rentalBlock=sectionText(text,/Lloguer\s+de\s+comptador/i,/\bIVA\b/i,800);
    const rentalVals=euroValues(rentalBlock),rental=rentalVals.length?rentalVals.at(-1):null;

    const vatLine=lines.find(line=>/^IVA\s+\d/i.test(line))||'';
    const vatVals=euroValues(vatLine),vat=vatVals.length?vatVals.at(-1):null,vatBase=vatVals.length>=2?vatVals[0]:null;
    const vatRateMatch=vatLine.match(/^IVA\s+([\d.,]+)\s*%/i),vatRate=vatRateMatch?numEs(vatRateMatch[1]):null;

    const total=moneyAfterLabel(lines,/TOTAL\s+(?:IMPORT\s+)?FACTURA/i)??moneyAfterLabel(lines,/IMPORT\s+DE\s+LA\s+FACTURA/i);
    const cooperativeConcepts=parseCooperativeConcepts(lines);
    const cooperativeTotal=round2(cooperativeConcepts.reduce((s,x)=>s+(Number(x.amountEur)||0),0));
    const accounted=round2((energy.energy||0)+(power.total||0)+(adjustment||0)+(social||0)+(compensation.total||0)+(tax||0)+(rental||0)+(vat||0)+cooperativeTotal);
    const diff=total==null?null:round2(total-accounted);
    const balanced=total!=null&&Math.abs(diff)<=.05;
    return{adjustment,social,compensation,tax,taxBase,taxRate,rental,vat,vatBase,vatRate,total,cooperativeConcepts,cooperativeTotal,accounted,diff,balanced};
  }

  function parseCooperativeConcepts(lines){
    const out=[];
    for(const line of lines||[]){
      if(!/(?:Quota\s+(?:de\s+)?(?:soci|cooperativa)|Aportaci[oó]\s+(?:al\s+)?capital\s+social|Donaci[oó]\s+cooperativa)/i.test(line))continue;
      const vals=euroValues(line);
      if(!vals.length)continue;
      out.push({concept:clean(line.replace(/-?[\d.]+,\d{1,2}\s*€.*/,'')).trim(),amountEur:vals.at(-1),category:'cooperative'});
    }
    return out;
  }

  function parseExternalPayments(lines){
    const out=[];
    for(const line of lines||[]){
      if(!/(?:Ajuntament|Ayuntamiento)/i.test(line))continue;
      if(!/(?:pagat|pagada|abonat|abonada|subvenci[oó]|ajut|aportaci[oó])/i.test(line))continue;
      const vals=euroValues(line);
      if(!vals.length)continue;
      out.push({payer:/Ayuntamiento/i.test(line)?'Ayuntamiento':'Ajuntament',type:'public_support',amountEur:Math.abs(vals.at(-1)),sourceLabel:line});
    }
    return out;
  }

  function parseCustomerPayable(lines){
    const line=(lines||[]).find(x=>/(?:Import\s+a\s+c[aà]rrec\s+del\s+titular|Importe\s+a\s+cargo\s+del\s+titular)/i.test(x));
    if(!line)return null;
    const vals=euroValues(line);
    return vals.length?vals.at(-1):null;
  }

  function parseSolarFlow(text){
    const m=text.match(/has\s+generat\s+([\d.,]+)\s*kWh\s+d['’]excedents[\s\S]{0,160}?valor\s+de\s+([\d.,]+)\s*€/i);
    const c=text.match(/compensaci[oó]\s+simplificada[\s\S]{0,120}?compensat\s+([\d.,]+)\s*€/i);
    const noSols=/no\s+es\s+generen\s+Sols/i.test(text);
    return{generatedExcessKwh:m?numEs(m[1]):null,generatedValueEur:m?numEs(m[2]):null,compensatedEur:c?numEs(c[1]):null,solsGenerated:noSols?false:null};
  }

  function parse(value,file,options={}){
    const text=textOf(value),lines=linesOf(value);
    if(!detect(value))return null;
    const id=parseIdentity(text,lines),contract=parseContract(text,lines),energy=parseEnergyPeriods(text,lines),power=parsePower(text,lines),fin=parseFinancials(text,lines,energy,power);
    const periodLabel=id.periodMatch?id.periodMatch[1]+' - '+id.periodMatch[2]+(id.billingDays?' ('+id.billingDays+' días)':''):'Por identificar';

    const missing=[];
    if(!id.holder)missing.push('titular');
    if(!id.taxId)missing.push('NIF/CIF titular');
    if(!contract.cups)missing.push('CUPS');
    if(id.invoice==='Por identificar')missing.push('nº factura');
    if(periodLabel==='Por identificar')missing.push('periodo');
    if(!contract.tariff)missing.push('tarifa');
    if(!energy.reliable)missing.push(energy.message||'consumo P1-P3');
    if(!energy.costReliable)missing.push(energy.message||'coste energía P1-P3');
    if(!power.reliable)missing.push('potencia');
    if(/Bo\s+social/i.test(text)&&fin.social==null)missing.push('bo social');
    if(/Compensaci[oó]\s*per\s*electricitat\s*excedent[aà]ria/i.test(text)&&(!fin.compensation.present||!fin.compensation.reliable))missing.push('compensación excedentes');
    if(/Impost\s+de\s+l['’]electricitat/i.test(text)&&fin.tax==null)missing.push('impuesto electricidad');
    if(/Lloguer\s+de\s+comptador/i.test(text)&&fin.rental==null)missing.push('alquiler contador');
    if(/\bIVA\s+\d+\s*%/i.test(text)&&fin.vat==null)missing.push('IVA');
    if(fin.total==null)missing.push('total');
    if(!fin.balanced)missing.push('cuadre económico');

    const readOk=!missing.length;
    const reading={status:/Electricitat\s+utilitzada\s*\[kWh\]\s*\(real\)/i.test(text)?'actual':'unknown',sourceLabel:'Electricitat utilitzada (real) · Som Energia'};
    const externalPayments=parseExternalPayments(lines),customerPayableEur=parseCustomerPayable(lines),solarFlow=parseSolarFlow(text);
    const adjustments=[];
    if(fin.adjustment!=null)adjustments.push({concept:'Serveis d’Ajust segons preu REE',amount_eur:fin.adjustment,category:'system_adjustment'});
    if(fin.compensation.total!=null)adjustments.push({concept:'Compensació electricitat excedentària',amount_eur:fin.compensation.total,category:'self_consumption_compensation'});
    const taxLines=[];
    if(fin.tax!=null)taxLines.push({tax_type:'ELECTRICITY_TAX',label:'Impost electricitat',rate_pct:fin.taxRate,taxable_base_eur:fin.taxBase,amount_eur:fin.tax});
    if(fin.vat!=null)taxLines.push({tax_type:'IVA',label:'IVA',rate_pct:fin.vatRate,taxable_base_eur:fin.vatBase,amount_eur:fin.vat});

    return{
      file:file?.name||'',invoiceNumber:id.invoice,company:id.holder||'Por identificar',taxId:id.taxId,cups:contract.cups,
      period:periodLabel,tariff:contract.tariff||'—',kwh:energy.kwh,energy:energy.energy,power:power.total,
      excess:0,reactive:0,compensation:fin.compensation.total,social:fin.social,rental:fin.rental,integratorAdjustment:fin.adjustment,
      regularizationReactive:null,other:fin.cooperativeTotal||null,tax:fin.tax,vat:fin.vat,igic:null,distributorCharges:null,
      total:fin.total,accounted:fin.accounted,diff:fin.diff,balanced:fin.balanced,readOk,
      readMessage:readOk?'Lectura correcta':('Falta o revisar: '+missing.join(', ')),
      readingStatus:reading.status,readingSourceLabel:reading.sourceLabel,avg:energy.kwh&&fin.total?fin.total/energy.kwh:0,
      opportunity:fin.adjustment!=null?('Concepto identificado: Serveis d’Ajust '+fin.adjustment.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'):'Sin alertas',
      periods:energy.periods,contracted:power.contracted,maximeters:{},parserVersion:options.parserVersion||'',parserRevision:REVISION,powerDetail:{reliable:power.reliable},
      sourceFormat:'som-energia',sourceVariant:'som-2.0td-autoconsum-2026',supplier:RETAILER,retailer:RETAILER,commercializer:RETAILER,supplierLegalType:'cooperative',
      supplyAddress:id.address,contract:id.contract,contractNumber:id.contract,accessContract:contract.accessContract,distributor:contract.distributor,meterNumber:contract.meterNumber,
      issueDate:id.issueDate,billingStart:id.billingStart,billingEnd:id.billingEnd,billingDays:id.billingDays,cnae:contract.cnae,renewalDate:contract.endDate,selfConsumptionType:contract.selfConsumptionType,cau:contract.cau,
      compensationPeriods:fin.compensation.periods,exportedKwh:fin.compensation.exportedKwh,solarFlow,
      paymentTotal:fin.total,externalPayments,customerPayableEur,paymentAdjustments:externalPayments,
      cooperativeConcepts:fin.cooperativeConcepts,adjustments,taxLines,
      otherConcepts:{socialFinancing:fin.social,meterRental:fin.rental,systemAdjustment:fin.adjustment,cooperativeConcepts:fin.cooperativeConcepts},
      validation:{minimalIdentity:!!id.holder&&!!id.taxId&&!!contract.cups&&id.invoice!=='Por identificar',consumptionPeriods:energy.reliable,energyCost:energy.costReliable,power:power.reliable,compensation:fin.compensation.reliable,economicBalance:fin.balanced,stage:'economic_full'}
    };
  }

  return Object.freeze({detect,parse,revision:REVISION,_test:{numEs,parseIdentity,parseContract,parseContracted,parseEnergyPeriods,parsePower,parseCompensation,parseFinancials,parseExternalPayments,parseSolarFlow}});
});
