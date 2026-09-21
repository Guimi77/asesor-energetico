(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTIberdrolaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const REVISION='2026.09.21.1';
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const clean=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=s=>clean(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  const num=v=>{
    if(v==null||v==='')return null;
    let s=String(v).trim().replace(/\s/g,'');
    if(s.includes(',')&&s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(',')) s=s.replace(',','.');
    const n=Number(s.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:null;
  };
  const moneyVals=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€(?!\s*\/)/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastMoney=s=>{const v=moneyVals(s);return v.length?v.at(-1):null;};
  const normalizeTariff=s=>{const m=String(s||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i);return m?m[1].replace(/\s+/g,'').toUpperCase():'—';};
  const normalizeCups=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const toIso=s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';};
  const MONTHS={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};

  function rowsFromItems(items,tol=2.8){
    const pts=(items||[]).filter(i=>clean(i?.str)).map(i=>({s:clean(i.str),x:Number(i.transform?.[4]??0),y:Number(i.transform?.[5]??0)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    pts.sort((a,b)=>b.y-a.y||a.x-b.x);
    const rows=[];
    for(const p of pts){
      let best=null,dist=Infinity;
      for(const r of rows){const d=Math.abs(r.y-p.y);if(d<=tol&&d<dist){best=r;dist=d;}}
      if(!best){best={y:p.y,items:[]};rows.push(best);}else best.y=(best.y*best.items.length+p.y)/(best.items.length+1);
      best.items.push(p);
    }
    return rows.sort((a,b)=>b.y-a.y).map((r,index)=>{const items=r.items.sort((a,b)=>a.x-b.x),text=clean(items.map(i=>i.s).join(' '));return{index,y:r.y,text,items,x0:items[0]?.x??0,x1:items.at(-1)?.x??0};});
  }
  function rowsFromLines(lines){return (lines||[]).map((text,index)=>({index,y:-index,text:clean(text),items:[{s:clean(text),x:0,y:-index}],x0:0,x1:0})).filter(r=>r.text);}
  function pageRows(d,page){
    const raw=d?.rawPages?.[page];
    if(raw?.length)return rowsFromItems(raw);
    return rowsFromLines(d?.pages?.[page]||[]);
  }
  function allRows(d){if(typeof d==='string')return [rowsFromLines(String(d).split(/\r?\n/))];const n=Math.max(d?.rawPages?.length||0,d?.pages?.length||0,1);return Array.from({length:n},(_,i)=>pageRows(d,i));}
  function allText(d){return allRows(d).flat().map(r=>r.text).join('\n');}
  function findRow(rows,re,start=0){for(let i=Math.max(0,start);i<rows.length;i++)if(re.test(rows[i].text))return i;return -1;}
  function rowAmount(row){return row?lastMoney(row.text):null;}
  function labelledAmount(rows,re){const i=findRow(rows,re);if(i<0)return null;const here=rowAmount(rows[i]);if(here!=null)return here;const next=rows[i+1];if(next&&moneyVals(next.text).length===1)return moneyVals(next.text)[0];return null;}
  function section(rows,startRe,endRe){const a=findRow(rows,startRe);if(a<0)return[];let b=rows.length;for(let i=a+1;i<rows.length;i++){if(endRe.test(rows[i].text)){b=i;break;}}return rows.slice(a,b);}

  function detect(d){
    const s=norm(allText(d)).toUpperCase();
    if(/ENDESA ENERGIA|FENIE ENERGIA/.test(s))return false;
    return /\bIBERDROLA\b/.test(s)&&/\bCLIENTES\b/.test(s)&&/\bFACTURA\b/.test(s)&&(/\bELECTRICIDAD\b/.test(s)||/RESUMEN DE FACTURA/.test(s));
  }
  function strictCups(s){const m=String(s||'').match(/(?:CUPS|punto\s+de\s+suministro)[\s\S]{0,180}?\b(ES(?:\s*\d){16}(?:\s*[A-Z]){2}(?:(?:\s*\d)(?:\s*[A-Z]))?)/i)||String(s||'').match(/\bES(?:\s*\d){16}(?:\s*[A-Z]){2}(?:(?:\s*\d)(?:\s*[A-Z]))?(?![A-Z0-9])/i);return normalizeCups(m?.[1]||m?.[0]||'');}
  function periodInfo(rows){
    const text=rows.map(r=>r.text).join('\n'),m=text.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);if(!m)return{label:'Por identificar',start:'',end:'',days:null};
    const dm=text.match(/D[IÍ]AS\s+FACTURADOS\s*:?\s*(?:\n\s*)?(\d{1,3})/i);let days=dm?Number(dm[1]):null;
    if(days==null){const a=new Date(`${toIso(m[1])}T00:00:00Z`),b=new Date(`${toIso(m[2])}T00:00:00Z`);days=Math.round((b-a)/86400000);}
    return{label:`${m[1]} - ${m[2]} (${days} días)`,start:toIso(m[1]),end:toIso(m[2]),days};
  }
  function invoiceNumber(rows){const text=rows.map(r=>r.text).join('\n'),m=text.match(/N[º°o.]?\s*FACTURA\s*:?\s*(?:\n\s*)?(\d{10,22})/i);return m?.[1]||'Por identificar';}
  function contractNumber(rows){const text=rows.map(r=>r.text).join('\n'),m=text.match(/N[º°o.]?\s*DE\s*CONTRATO\s*:?\s*(?:\n\s*)?(\d{6,20})/i);return m?.[1]||'';}
  function holder(rows){
    const texts=rows.map(r=>r.text), banned=/IBERDROLA|CLIENTES|FACTURA|ELECTRICIDAD|CONTRATO|REMIT|TITULAR|DIRECCI[ÓO]N|POTENCIA|RESPONSABLE|SOSTENIBLE/i;
    const nameRe=/^[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*(?:\s+[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*){1,9}$/;
    for(let i=0;i<Math.min(texts.length,18);i++){
      const t=clean(texts[i]);if(!t||banned.test(t)||/\d/.test(t))continue;if(nameRe.test(t))return t;
    }
    return'Por identificar';
  }
  function address(rows){const texts=rows.map(r=>r.text),i=findRow(rows,/Direcci[oó]n\s+de\s+suministro\s*:/i);if(i<0)return'';const out=[];for(let n=i;n<Math.min(rows.length,i+6);n++){let t=texts[n].replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,'').trim();if(!t)continue;if(/N[º°o.]?\s*DE\s*CONTRATO|RESUMEN\s+DE\s+FACTURA/i.test(t))break;out.push(t);}return clean(out.join(' '));}
  function splitPlace(a){const m=clean(a).match(/\b\d{5}\s+(.+?)(?:\s*\(([^()]*)\))?$/i);return m?{city:clean(m[1]).replace(/\s*\([^)]*\)$/,''),province:clean(m[2]||'')}:{city:'',province:''};}

  function parsePower(rows,tariff){
    const start=findRow(rows,/Potencia\s+facturada\b/i),end=findRow(rows,/Total\s+importe\s+potencia\b/i,start+1),expected=/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0,entries=[],contracted={};
    if(start<0||end<0)return{value:null,sum:0,printedTotal:null,entries,contracted,reliable:false,message:'Potencia: bloque no localizado'};
    for(let i=start;i<end;i++){
      const t=rows[i].text,m=t.match(/(?:Potencia\s+facturada\s+)?(P[1-6]|Punta|Valle)?\s*([\d.,]+)\s*kW\s*[x×]\s*(\d+)\s*d[ií]as?\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a\s*(-?[\d.]+,\d{2})\s*€/i);
      if(!m)continue;let p;if(/^P[1-6]$/i.test(m[1]||''))p=Number(m[1].slice(1));else if(/Punta/i.test(m[1]||''))p=1;else if(/Valle/i.test(m[1]||''))p=2;else p=entries.length+1;
      if(entries.some(e=>e.period===p))continue;const e={period:p,contractedKw:num(m[2]),days:Number(m[3]),price:num(m[4]),amount:num(m[5])};entries.push(e);contracted[`P${p}`]=e.contractedKw;
    }
    entries.sort((a,b)=>a.period-b.period);const printedTotal=rowAmount(rows[end]),sum=round2(entries.reduce((s,e)=>s+e.amount,0)),reliable=expected>0&&entries.length===expected&&printedTotal!=null&&Math.abs(sum-printedTotal)<=.05;
    return{value:printedTotal,sum,printedTotal,entries,contracted,reliable,message:reliable?'':`Potencia: ${entries.length}/${expected} periodos facturados`};
  }

  function parseActiveReadings(all){const out={};for(const row of all.flat()){const m=row.text.match(/Energ[ií]a\s+activa\s+P([1-6])[\s\S]*?(-?[\d.]+(?:,\d+)?)\s*kWh\b/i);if(m)out[`P${m[1]}`]=num(m[2]);}return out;}
  function parseEnergy(rows,tariff,active,all){
    const start=findRow(rows,/Energ[ií]a\s+consumida\b/i);if(start<0)return{kwh:null,energy:null,periods:{},consumptionReliable:false,costReliable:false,pricingMode:'unknown'};
    if(/^2\.0TD$/i.test(tariff)){
      const t=rows[start].text,m=t.match(/Energ[ií]a\s+consumida\s+([\d.]+(?:,\d+)?)\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kWh\s*([\d.]+,\d{2})\s*€/i);const periods={};
      let breakdown=null;for(const row of all.flat()){const b=row.text.match(/consumos\s+desagregados\s+han\s+sido\s+punta\s*:\s*([\d.]+(?:,\d+)?)\s*kWh\s*;?\s*llano\s*:\s*([\d.]+(?:,\d+)?)\s*kWh\s*;?\s*valle\s*:?\s*([\d.]+(?:,\d+)?)\s*kWh/i);if(b){breakdown={P1:num(b[1]),P2:num(b[2]),P3:num(b[3])};break;}}
      if(!m)return{kwh:null,energy:null,periods,consumptionReliable:false,costReliable:false,pricingMode:'single_rate'};
      const kwh=num(m[1]),price=num(m[2]),energy=num(m[3]);if(breakdown)for(let p=1;p<=3;p++)periods[`P${p}`]={consumption:breakdown[`P${p}`],cost:null,price};const sum=round2(Object.values(periods).reduce((s,q)=>s+q.consumption,0));
      return{kwh,energy,periods,consumptionReliable:Object.keys(periods).length===3&&Math.abs(sum-kwh)<=.1,costReliable:Math.abs(round2(kwh*price)-energy)<=.02,pricingMode:'single_rate'};
    }
    const total=findRow(rows,/^Total\s+[\d.]+(?:,\d+)?\s*kWh\s+hasta/i,start+1),periods={};if(total<0)return{kwh:null,energy:null,periods,consumptionReliable:false,costReliable:false,pricingMode:'periods'};
    for(let i=start;i<total;i++){
      const t=rows[i].text,m=t.match(/(?:Energ[ií]a\s+consumida\s+)?P([1-6])\s+([\d.]+(?:,\d+)?)\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kWh\s*([\d.]+,\d{2})\s*€/i);if(m)periods[`P${m[1]}`]={consumption:num(m[2]),price:num(m[3]),cost:num(m[4])};
    }
    const tm=rows[total].text.match(/Total\s+([\d.]+(?:,\d+)?)\s*kWh[\s\S]*?([\d.]+,\d{2})\s*€/i),kwh=tm?num(tm[1]):null,energy=tm?num(tm[2]):null;
    for(let p=1;p<=6;p++){const k=`P${p}`;if(!periods[k]&&active[k]===0)periods[k]={consumption:0,cost:0,price:null};}
    const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),sumCost=round2(Object.values(periods).reduce((s,q)=>s+Number(q.cost||0),0));
    return{kwh,energy,periods,consumptionReliable:kwh!=null&&Object.keys(periods).length===6&&Math.abs(sumKwh-kwh)<=.1,costReliable:energy!=null&&Object.keys(periods).length===6&&Math.abs(sumCost-energy)<=.05,pricingMode:'periods'};
  }

  function parseSummary(p1){return{energy:labelledAmount(p1,/^ENERG[IÍ]A\b/i),discount:labelledAmount(p1,/DESCUENTOS\s+ENERG[IÍ]A/i),normative:labelledAmount(p1,/CARGOS\s+NORMATIVOS/i),services:labelledAmount(p1,/SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS/i),vat:labelledAmount(p1,/^IVA\b/i),total:labelledAmount(p1,/^TOTAL\b/i)};}
  function parseDetailConcepts(p2){
    const discount=labelledAmount(p2,/Descuento\s+sobre\s+consumo/i),tax=labelledAmount(p2,/Impuesto\s+sobre\s+electricidad/i),rental=labelledAmount(p2,/Alquiler\s+equipos?\s+medida/i),vat=labelledAmount(p2,/^IVA(?:\s|\()/i),total=labelledAmount(p2,/TOTAL\s+IMPORTE\s+FACTURA/i),socialRows=section(p2,/CARGOS\s+NORMATIVOS/i,/Impuesto\s+sobre\s+electricidad/i).filter(r=>/Financiaci[oó]n\s+bono\s+social/i.test(r.text)),social=round2(socialRows.reduce((s,r)=>s+Number(rowAmount(r)||0),0));
    return{discount,social,tax,rental,vat,total};
  }
  function parseContracted(all,tariff,power){const out={...(power.contracted||{})},text=all.flat().map(r=>r.text).join('\n');if(/^2\.0TD$/i.test(tariff)){const p=text.match(/Potencia\s+punta\s*:\s*([\d.,]+)\s*kW/i),v=text.match(/Potencia\s+valle\s*:\s*([\d.,]+)\s*kW/i);if(p)out.P1=num(p[1]);if(v)out.P2=num(v[1]);}else{const m=text.match(/Potencia\s+contratada\s*\(kW\)\s*:\s*([^\n]{1,160})/i);if(m){[...m[1].matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)].map(x=>num(x[1])).slice(0,6).forEach((v,i)=>out[`P${i+1}`]=v);}}return out;}
  function parseMaximeters(all){const out={};for(const row of all.flat()){const m=row.text.match(/Max[ií]metro\s+P([1-6])[\s\S]*?(-?[\d.]+(?:,\d+)?)\s*kW\b/i);if(m)out[`P${m[1]}`]=num(m[2]);}if(Object.keys(out).length===6)out._reliable=true;return out;}
  function parseReactive(all,label){const out={};for(const row of all.flat()){const m=row.text.match(new RegExp(`${label}\\s+P([1-6])[\\s\\S]*?(-?[\\d.]+(?:,\\d+)?)\\s*kVArh\\b`,'i'));if(m)out[`P${m[1]}`]=num(m[2]);}return out;}

  function parse(d,file,options={}){
    if(!detect(d))return null;const all=allRows(d),p1=all[0]||[],p2=all[1]||[],text=all.flat().map(r=>r.text).join('\n'),tariff=normalizeTariff(text),period=periodInfo(p1),company=holder(p1),cups=strictCups(text),contract=contractNumber(p1),invoice=invoiceNumber(p1),addr=address(p1),place=splitPlace(addr),summary=parseSummary(p1),power=parsePower(p2,tariff),active=parseActiveReadings(all),energy=parseEnergy(p2,tariff,active,all),detail=parseDetailConcepts(p2),contracted=parseContracted(all,tariff,power),mx=parseMaximeters(all);
    const discounts=detail.discount, social=detail.social, rental=detail.rental, tax=detail.tax, vat=detail.vat, total=detail.total??summary.total, other=round2(Number(discounts||0)+Number(social||0)+Number(rental||0)), accounted=round2(Number(energy.energy||0)+Number(power.value||0)+other+Number(tax||0)+Number(vat||0)), diff=total==null?null:round2(total-accounted), balanced=total!=null&&Math.abs(diff)<=.05;
    const checks={summaryEnergy:summary.energy!=null&&energy.energy!=null&&power.value!=null&&tax!=null&&Math.abs(summary.energy-(energy.energy+power.value+tax))<=.05,discount:summary.discount!=null&&discounts!=null&&Math.abs(summary.discount-discounts)<=.05,normative:summary.normative!=null&&Math.abs(summary.normative-social)<=.05,services:summary.services!=null&&rental!=null&&Math.abs(summary.services-rental)<=.05,vat:summary.vat!=null&&vat!=null&&Math.abs(summary.vat-vat)<=.05,total:summary.total!=null&&total!=null&&Math.abs(summary.total-total)<=.05};
    const missing=[];if(company==='Por identificar')missing.push('titular');if(!cups)missing.push('CUPS');if(period.label==='Por identificar')missing.push('periodo');if(tariff==='—')missing.push('tarifa');if(!power.reliable)missing.push(power.message);if(!energy.consumptionReliable)missing.push('consumo por periodos');if(!energy.costReliable)missing.push('coste de energía');for(const [k,v] of Object.entries(checks))if(!v)missing.push(`validación ${k}`);if(!balanced)missing.push('cuadre económico');
    const readOk=!missing.length;const readingActual=/[ÚU]ltima\s+lectura\s*:\s*real/i.test(text)||/siendo[\s\S]{0,120}?lecturas[\s\S]{0,60}?reales/i.test(text),reading=readingActual?{status:'actual',sourceLabel:'Lectura real indicada por Iberdrola'}:(options.readingClassifier?.(text)||{status:'unknown',sourceLabel:''});
    return{file:file?.name||'',invoiceNumber:invoice,company,cups,period:period.label,tariff,kwh:energy.kwh,energy:energy.energy,power:power.value,excess:0,reactive:0,compensation:0,social,rental,integratorAdjustment:0,regularizationReactive:0,other,tax,vat,igic:0,distributorCharges:0,total,accounted,diff,balanced,readOk,readMessage:readOk?'Lectura correcta':`Falta o revisar: ${missing.join(', ')}`,readingStatus:reading.status,readingSourceLabel:reading.sourceLabel||'',avg:energy.kwh&&total?total/energy.kwh:0,opportunity:'Sin alertas',periods:energy.periods,contracted,maximeters:mx,parserVersion:options.parserVersion||'',parserRevision:REVISION,powerDetail:power,energyPricingMode:energy.pricingMode,sourceFormat:'iberdrola',supplier:'IBERDROLA CLIENTES, S.A.U.',retailer:'IBERDROLA CLIENTES, S.A.U.',commercializer:'IBERDROLA CLIENTES, S.A.U.',supplyAddress:addr,supplyCity:place.city,supplyProvince:place.province,contract,contractNumber:contract,accessContract:'',distributor:'',renewalDate:'',permanence:'',meterNumber:'',issueDate:'',billingStart:period.start,billingEnd:period.end,billingDays:period.days,discounts,reactivePeriods:parseReactive(all,'Energ[ií]a\\s+reactiva'),capacitivePeriods:parseReactive(all,'Energ[ií]a\\s+capacitiva'),activeReadings:active,validation:checks};
  }
  return Object.freeze({detect,parse,revision:REVISION,_test:{rowsFromItems,parsePower,parseEnergy,parseSummary,parseDetailConcepts}});
});
