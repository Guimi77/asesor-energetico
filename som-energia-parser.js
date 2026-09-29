(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTSomEnergiaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REVISION='som-2026.09.29.1';
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
    else if(/^-?\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
    const n=Number(s);
    return Number.isFinite(n)?n:null;
  }

  function moneyAfterLabel(lines,re){
    for(const line of lines){
      if(!re.test(line))continue;
      const vals=[...line.matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>numEs(m[1])).filter(v=>v!=null);
      if(vals.length)return vals.at(-1);
    }
    return null;
  }

  function normalizeCups(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function isoDate(v){const m=String(v||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';}
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
        const m=lines[i].match(/NIF\/CIF\s*:\s*([A-Z0-9-]{7,15})/i);if(m){taxId=m[1];break;}
      }
    }
    return{invoice,issueDate:isoDate(issueDateRaw),periodMatch,billingStart,billingEnd,billingDays,contract,address,holder,taxId};
  }

  function parseContract(text){
    const cups=normalizeCups((text.match(/\bCUPS\s*:\s*(ES[A-Z0-9]{18,24})\b/i)||[])[1]||'');
    const tariff=((text.match(/Peatge\s+de\s+transport\s+i\s+distribuci[oó]\s*:\s*(2\s*\.\s*0\s*TD|3\s*\.\s*0\s*TD|6\s*\.\s*[1-4]\s*TD)/i)||[])[1]||'').replace(/\s+/g,'').toUpperCase();
    const distributor=clean((text.match(/Empresa\s+distribu[iï]dora\s*:\s*([^\n]+)/i)||[])[1]||'');
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
    if(anchor<0)return{periods:{},kwh:null,reliable:false,message:'Falten consums P1-P3 facturats'};
    const chunk=text.slice(anchor,anchor+1200);
    const head=chunk.match(/Electricitat\s+utilitzada\s*\[kWh\]\s*\(real\)\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i);
    if(!head)return{periods:{},kwh:null,reliable:false,message:'No es poden llegir els consums P1-P3'};
    const vals=[numEs(head[1]),numEs(head[2]),numEs(head[3])];
    if(vals.some(v=>v==null))return{periods:{},kwh:null,reliable:false,message:'Consums P1-P3 incomplets'};
    const priceLine=(lines||[]).find(line=>/Preu\s+energia\s*\[€\/kWh\]/i.test(line))||'';
    const priceVals=[...priceLine.matchAll(/(?<![\d.,])(-?[\d.]+(?:,\d+)?)(?![\d.,])/g)].map(m=>numEs(m[1])).filter(v=>v!=null);
    const costLine=(lines||[]).find(line=>/kWh\s*x\s*€\/kWh/i.test(line)&&/€/.test(line))||'';
    const costVals=[...costLine.matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>numEs(m[1])).filter(v=>v!=null);
    const periods={};
    for(let i=0;i<3;i++)periods[`P${i+1}`]={consumption:vals[i],price:priceVals.length>=3?priceVals[i]:null,cost:costVals.length>=4?costVals[i]:null};
    const kwh=round3(vals.reduce((a,b)=>a+b,0));
    const energy=costVals.length>=4?costVals[3]:null;
    const costSum=costVals.length>=4?round2(costVals.slice(0,3).reduce((s,v)=>s+v,0)):null;
    const costReliable=energy==null||Math.abs(costSum-energy)<=.03;
    return{periods,kwh,energy,reliable:true,costReliable,message:costReliable?'':'Cost energia P1-P3 no quadra'};
  }

  function parsePower(text,lines){
    const contracted=parseContracted(text);
    const anchor=text.search(/Facturaci[oó]\s+per\s+pot[eè]ncia\s+contractada/i);
    const chunk=anchor>=0?text.slice(anchor,anchor+1000):text;
    const row=chunk.match(/kW\s*x\s*€\/kW\s*x\s*\([^)]*\)\s*dies[^\n]*?\s(-?[\d.]+,\d{2})\s*€?\s+(-?[\d.]+,\d{2})\s*€?\s+(-?[\d.]+,\d{2})\s*€/i);
    const total=row?numEs(row[3]):moneyAfterLabel(lines,/^Pot[eè]ncia\s+contractada\b/i);
    return{contracted,total,reliable:Object.keys(contracted).length===2&&total!=null};
  }

  function parse(value,file,options={}){
    const text=textOf(value),lines=linesOf(value);
    if(!detect(value))return null;
    const id=parseIdentity(text,lines),contract=parseContract(text),energy=parseEnergyPeriods(text,lines),power=parsePower(text,lines);
    const total=moneyAfterLabel(lines,/TOTAL\s+(?:IMPORT\s+)?FACTURA/i)??moneyAfterLabel(lines,/IMPORT\s+DE\s+LA\s+FACTURA/i);
    const periodLabel=id.periodMatch?`${id.periodMatch[1]} - ${id.periodMatch[2]}${id.billingDays?` (${id.billingDays} días)`:''}`:'Por identificar';
    const minimalMissing=[];
    if(!id.holder)minimalMissing.push('titular');
    if(!id.taxId)minimalMissing.push('NIF/CIF titular');
    if(!contract.cups)minimalMissing.push('CUPS');
    if(id.invoice==='Por identificar')minimalMissing.push('nº factura');
    if(periodLabel==='Por identificar')minimalMissing.push('periodo');
    if(!contract.tariff)minimalMissing.push('tarifa');
    if(!energy.reliable)minimalMissing.push(energy.message||'consumo P1-P3');
    if(!power.reliable)minimalMissing.push('potencia');
    if(total==null)minimalMissing.push('total');
    const readOk=!minimalMissing.length;
    const reading={status:/Electricitat\s+utilitzada\s*\[kWh\]\s*\(real\)/i.test(text)?'actual':'unknown',sourceLabel:'Electricitat utilitzada (real) · Som Energia'};
    return{
      file:file?.name||'',invoiceNumber:id.invoice,company:id.holder||'Por identificar',taxId:id.taxId,cups:contract.cups,
      period:periodLabel,tariff:contract.tariff||'—',kwh:energy.kwh,energy:energy.energy,power:power.total,
      excess:0,reactive:0,compensation:0,social:0,rental:0,integratorAdjustment:0,regularizationReactive:0,other:0,tax:0,vat:0,igic:0,distributorCharges:0,
      total,accounted:null,diff:null,balanced:false,readOk,readMessage:readOk?'Lectura mínima Som Energia correcta · detalle económico pendiente':`Falta o revisar: ${minimalMissing.join(', ')}`,
      readingStatus:reading.status,readingSourceLabel:reading.sourceLabel,avg:energy.kwh&&total?total/energy.kwh:0,opportunity:'Pendiente de detalle económico y validación final',
      periods:energy.periods,contracted:power.contracted,maximeters:{},parserVersion:options.parserVersion||'',parserRevision:REVISION,powerDetail:{reliable:power.reliable},
      sourceFormat:'som-energia',sourceVariant:'som-2.0td-autoconsum-2026',supplier:RETAILER,retailer:RETAILER,commercializer:RETAILER,supplierLegalType:'cooperative',
      supplyAddress:id.address,contract:id.contract,contractNumber:id.contract,accessContract:contract.accessContract,distributor:contract.distributor,meterNumber:contract.meterNumber,
      issueDate:id.issueDate,billingStart:id.billingStart,billingEnd:id.billingEnd,billingDays:id.billingDays,cnae:contract.cnae,renewalDate:contract.endDate,selfConsumptionType:contract.selfConsumptionType,cau:contract.cau,
      paymentAdjustments:[],cooperativeConcepts:[],validation:{minimalIdentity:readOk,consumptionPeriods:energy.reliable,energyCost:energy.costReliable,power:power.reliable,economicBalance:false,stage:'minimal'}
    };
  }

  return Object.freeze({detect,parse,revision:REVISION,_test:{numEs,parseIdentity,parseContract,parseContracted,parseEnergyPeriods,parsePower}});
});
