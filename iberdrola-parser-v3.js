(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTIberdrolaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const REVISION='2026.09.29.2';
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const clean=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  function canonicalText(value){
    let s=clean(value),prev='';
    // Iberdrola PDFs split accented glyphs into independent PDF.js items:
    // "Energ í a", "d í as", "FACTURACI Ó N", "N ú mero".
    // Repair that encoding artifact once, centrally, before any semantic parsing.
    while(s!==prev){
      prev=s;
      s=s.replace(/([A-Za-zÀ-ÿ])\s+([ÁÉÍÓÚÜÑáéíóúüñ])\s+([A-Za-zÀ-ÿ])/g,'$1$2$3');
      s=s.replace(/(^|\s)([ÁÉÍÓÚÜÑáéíóúüñ])\s+([A-Za-zÀ-ÿ]{2,})/g,'$1$2$3');
    }
    return clean(s.normalize('NFKD').replace(/[\u0300-\u036f]/g,''));
  }
  const norm=s=>canonicalText(s);
  const num=v=>{
    if(v==null||v==='')return null;
    let s=String(v).trim().replace(/\s/g,'');
    if(s.includes(',')&&s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(',')) s=s.replace(',','.');
    const n=Number(s.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:null;
  };
  const qty=v=>{
    if(v==null||v==='')return null;
    let s=String(v).trim().replace(/\s/g,'').replace(/[^0-9,.-]/g,'');
    if(!s)return null;
    // In Iberdrola meter/consumption rows a lone dot is a thousands separator.
    // Decimal quantities use a comma, e.g. 2.954,94 kWh.
    if(!s.includes(',')&&/^-?\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
    return num(s);
  };
  const optionalAmountMatch=(a,b,tol=.05)=>a==null&&b==null||(a!=null&&b!=null&&Math.abs(Number(a)-Number(b))<=tol);
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
    return rows.sort((a,b)=>b.y-a.y).map((r,index)=>{const items=r.items.sort((a,b)=>a.x-b.x),rawText=clean(items.map(i=>i.s).join(' ')),text=canonicalText(rawText);return{index,y:r.y,text,rawText,items,x0:items[0]?.x??0,x1:items.at(-1)?.x??0};});
  }
  function rowsFromLines(lines){return (lines||[]).map((value,index)=>{const rawText=clean(value),text=canonicalText(rawText);return{index,y:-index,text,rawText,items:[{s:rawText,x:0,y:-index}],x0:0,x1:0};}).filter(r=>r.text);}
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
  function invoiceNumber(rows){
    // Older layouts print "Número de factura 2124..." instead of "Nº FACTURA".
    for(const row of rows){
      const explicit=row.text.match(/N[uú]mero\s+de\s+factura\s*:?\s*(\d{10,22})\b/i);
      if(explicit)return explicit[1];
    }
    // Prefer the explicit invoice label. Depending on the PDF geometry,
    // Iberdrola can put the label and value on the same visual row or can
    // interleave unrelated marketing copy before the row that contains
    // billing period + invoice number.
    for(let i=0;i<rows.length;i++){
      if(!/N[º°o.]?\s*FACTURA\b/i.test(rows[i].text))continue;
      const direct=rows[i].text.match(/N[º°o.]?\s*FACTURA\s*:?\s*(\d{10,22})\b/i);
      if(direct)return direct[1];
      for(let n=i+1;n<Math.min(rows.length,i+6);n++){
        const dated=rows[n].text.match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}\s+(\d{10,22})\b/);
        if(dated)return dated[1];
      }
    }
    const text=rows.map(r=>r.text).join('\n');
    const dated=text.match(/PERIODO\s+DE\s+FACTURACION[\s\S]{0,420}?N[º°o.]?\s*FACTURA[\s\S]{0,420}?(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{10,22})\b/i);
    return dated?.[3]||'Por identificar';
  }
  function contractNumber(rows){const text=rows.map(r=>r.text).join('\n'),m=text.match(/N[º°o.]?\s*DE\s*CONTRATO\s*:?\s*(?:\n\s*)?(\d{6,20})/i);return m?.[1]||'';}
  function holder(rows){
    const texts=rows.map(r=>r.text);
    const banned=/IBERDROLA|CLIENTES|FACTURA|ELECTRICIDAD|CONTRATO|REMIT|TITULAR|DIRECCI[ÓO]N|POTENCIA|RESPONSABLE|SOSTENIBLE|PLAN\s+ESTABLE|CON\s+GARANTIA|ORIGEN|SIMULACION|COMPARATIVA|DATOS\s+DE\s+FACTURA|RESUMEN/i;
    const nameRe=/^[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*(?:\s+[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*){1,11}$/;
    const dedupe=t=>{
      const words=clean(t).split(/\s+/).filter(Boolean);
      if(words.length>=4&&words.length%2===0){
        const half=words.length/2,a=words.slice(0,half).join(' '),b=words.slice(half).join(' ');
        if(a===b)return a;
      }
      return clean(t);
    };
    const usable=t=>{
      const s=dedupe(t);
      return !!s&&!banned.test(s)&&!/^(?:C\/|C\.|CALLE\b|AV(?:DA)?\.?\b|P(?:L|Z)ZA\b|PSEO\b|PASEO\b|CTRA\b)/i.test(s)&&!/\d/.test(s)&&nameRe.test(s);
    };
    // Some classic invoices carry the legal name directly after the Titular label.
    for(const raw of texts){
      const m=clean(raw).match(/\bTitular\s*:?[ ]+(.+)$/i);
      if(!m)continue;
      const candidate=dedupe(m[1].replace(/\s+Potencia\s*:.*$/i,''));
      if(usable(candidate))return candidate;
    }
    // Newer layouts put the legal name immediately before a Titular/address row.
    for(let i=1;i<Math.min(texts.length,24);i++){
      if(!/\bTitular\b/i.test(texts[i]))continue;
      const candidate=dedupe(texts[i-1]);
      if(usable(candidate))return candidate;
    }
    for(let i=0;i<Math.min(texts.length,24);i++){
      const candidate=dedupe(texts[i]);
      if(usable(candidate))return candidate;
    }
    return'Por identificar';
  }
  function address(rows){const texts=rows.map(r=>r.text),i=findRow(rows,/Direcci[oó]n\s+de\s+suministro\s*:/i);if(i<0)return'';const out=[];for(let n=i;n<Math.min(rows.length,i+6);n++){let t=texts[n].replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,'').trim();if(!t)continue;if(/N[º°o.]?\s*DE\s*CONTRATO|RESUMEN\s+DE\s+FACTURA/i.test(t))break;out.push(t);}return clean(out.join(' '));}
  function splitPlace(a){const m=clean(a).match(/\b\d{5}\s+(.+?)(?:\s*\(([^()]*)\))?$/i);return m?{city:clean(m[1]).replace(/\s*\([^)]*\)$/,''),province:clean(m[2]||'')}:{city:'',province:''};}

  function parsePower(rows,tariff){
    const expected=/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0,entries=[],contracted={};
    const parseRange=(start,end,prefixRe)=>{
      const map=new Map();
      for(let i=start;i<end;i++){
        const t=rows[i].text,m=t.match(new RegExp(`(?:${prefixRe})?(P[1-6]|Punta|Valle)?\\s*([\\d.,]+)\\s*kW\\s*[x×]\\s*(\\d+)\\s*d[ií]as?\\s*[x×]\\s*([\\d.,]+)\\s*€\\s*\\/\\s*kW\\s*d[ií]a\\s*(-?[\\d.]+,\\d{2})\\s*€`,'i'));
        if(!m)continue;
        let p;if(/^P[1-6]$/i.test(m[1]||''))p=Number(m[1].slice(1));else if(/Punta/i.test(m[1]||''))p=1;else if(/Valle/i.test(m[1]||''))p=2;else p=map.size+1;
        if(!map.has(p))map.set(p,{period:p,contractedKw:num(m[2]),days:Number(m[3]),price:num(m[4]),amount:num(m[5])});
      }
      return map;
    };
    const start=findRow(rows,/Potencia\s+facturada\b/i),end=findRow(rows,/Total\s+importe\s+potencia\b/i,start+1);
    if(start>=0&&end>=0){
      const map=parseRange(start,end,'Potencia\\s+facturada\\s+');
      for(const e of map.values()){entries.push(e);contracted[`P${e.period}`]=e.contractedKw;}
      entries.sort((a,b)=>a.period-b.period);
      const printedTotal=rowAmount(rows[end]),sum=round2(entries.reduce((s,e)=>s+e.amount,0)),reliable=expected>0&&entries.length===expected&&printedTotal!=null&&Math.abs(sum-printedTotal)<=.05;
      return{value:printedTotal,sum,printedTotal,entries,contracted,reliable,message:reliable?'':`Potencia: ${entries.length}/${expected} periodos facturados`};
    }
    // Indexed/referenced business invoices split regulated power into tolls + charges.
    const tollStart=findRow(rows,/Potencia\s+facturada\s+peajes\b/i),tollEnd=findRow(rows,/Total\s+terminos\s+de\s+potencia\s+peajes/i,tollStart+1);
    const chargeStart=findRow(rows,/Potencia\s+facturada\s+\(cargos\)/i,tollEnd+1),chargeEnd=findRow(rows,/Total\s+importes\s+de\s+potencia\s+\(cargos\)/i,chargeStart+1);
    if(tollStart>=0&&tollEnd>tollStart&&chargeStart>=0&&chargeEnd>chargeStart){
      const toll=parseRange(tollStart,tollEnd,'Potencia\\s+facturada\\s+peajes\\s+'),charges=parseRange(chargeStart,chargeEnd,'Potencia\\s+facturada\\s+\\(cargos\\)\\s+');
      for(let p=1;p<=expected;p++){
        const a=toll.get(p),b=charges.get(p);if(!a||!b)continue;
        const e={period:p,contractedKw:a.contractedKw,days:a.days,price:Number((Number(a.price||0)+Number(b.price||0)).toFixed(6)),amount:round2(a.amount+b.amount),tollPrice:a.price,chargesPrice:b.price};
        entries.push(e);contracted[`P${p}`]=e.contractedKw;
      }
      const printedTotal=round2(Number(rowAmount(rows[tollEnd])||0)+Number(rowAmount(rows[chargeEnd])||0)),sum=round2(entries.reduce((s,e)=>s+e.amount,0)),reliable=expected>0&&entries.length===expected&&Math.abs(sum-printedTotal)<=.05;
      return{value:printedTotal,sum,printedTotal,entries,contracted,reliable,message:reliable?'':`Potencia: ${entries.length}/${expected} periodos regulados`};
    }
    return{value:null,sum:0,printedTotal:null,entries,contracted,reliable:false,message:'Potencia: bloque no localizado'};
  }

  function parseActiveReadings(all){const out={};for(const row of all.flat()){const m=row.text.match(/Energ[ií]a\s+activa\s+P([1-6])[\s\S]*?(-?[\d.]+(?:,\d+)?)\s*kWh\b/i);if(m)out[`P${m[1]}`]=qty(m[2]);}return out;}
  function parseEnergy(rows,tariff,active,all){
    const expected=/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:/^2\.0TD$/i.test(tariff)?3:0;
    const activeKeys=Object.keys(active||{}).filter(k=>/^P[1-6]$/.test(k));
    const singleStart=findRow(rows,/Energ[ií]a\s+consumida\b/i);
    if(singleStart>=0){
      const t=rows[singleStart].text;
      const single=t.match(/Energ[ií]a\s+consumida\s+([\d.]+(?:,\d+)?)\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kWh\s*([\d.]+,\d{2})\s*€/i);
      if(single){
        const kwh=qty(single[1]),price=num(single[2]),energy=num(single[3]),periods={};
        if(/^2\.0TD$/i.test(tariff)){
          let breakdown=null;
          for(const row of all.flat()){
            const b=row.text.match(/consumos\s+desagregados\s+han\s+sido\s+punta\s*:\s*([\d.]+(?:,\d+)?)\s*kWh\s*;?\s*llano\s*:\s*([\d.]+(?:,\d+)?)\s*kWh\s*;?\s*valle\s*:?\s*([\d.]+(?:,\d+)?)\s*kWh/i);
            if(b){breakdown={P1:qty(b[1]),P2:qty(b[2]),P3:qty(b[3])};break;}
          }
          if(breakdown)for(let p=1;p<=3;p++)periods[`P${p}`]={consumption:breakdown[`P${p}`],cost:null,price};
        }else if(expected===6&&activeKeys.length===6){
          for(let p=1;p<=6;p++){
            const consumption=active[`P${p}`];
            periods[`P${p}`]={consumption,cost:round2(Number(consumption||0)*Number(price||0)),price,costSource:'derived_from_uniform_price'};
          }
        }
        const sum=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0));
        const consumptionReliable=expected>0&&Object.keys(periods).length===expected&&kwh!=null&&Math.abs(sum-kwh)<=.1;
        const costReliable=kwh!=null&&price!=null&&energy!=null&&Math.abs(round2(kwh*price)-energy)<=.05;
        return{kwh,energy,periods,consumptionReliable,costReliable,pricingMode:'single_rate'};
      }
      // Period-priced 3.0TD / 6.xTD format.
      const total=findRow(rows,/^Total\s+[\d.]+(?:,\d+)?\s*kWh\s+hasta/i,singleStart+1),periods={};
      if(total>=0){
        for(let i=singleStart;i<total;i++){
          const m=rows[i].text.match(/(?:Energ[ií]a\s+consumida\s+)?P([1-6])\s+([\d.]+(?:,\d+)?)\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kWh\s*([\d.]+,\d{2})\s*€/i);
          if(m)periods[`P${m[1]}`]={consumption:qty(m[2]),price:num(m[3]),cost:num(m[4]),costSource:'printed'};
        }
        const tm=rows[total].text.match(/Total\s+([\d.]+(?:,\d+)?)\s*kWh[\s\S]*?([\d.]+,\d{2})\s*€/i),kwh=tm?qty(tm[1]):null,energy=tm?num(tm[2]):null;
        for(let p=1;p<=6;p++){const k=`P${p}`;if(!periods[k]&&active[k]===0)periods[k]={consumption:0,cost:0,price:null,costSource:'explicit_zero_reading'};}
        const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),sumCost=round2(Object.values(periods).reduce((s,q)=>s+Number(q.cost||0),0));
        return{kwh,energy,periods,consumptionReliable:kwh!=null&&Object.keys(periods).length===6&&Math.abs(sumKwh-kwh)<=.1,costReliable:energy!=null&&Object.keys(periods).length===6&&Math.abs(sumCost-energy)<=.05,pricingMode:'periods'};
      }
    }
    // Indexed/referenced variant: only non-zero billed periods may be printed.
    const refStart=findRow(rows,/Energ[ií]a\s+Referenciada\s+P[1-6]\b/i);
    const refEnd=findRow(rows,/Total\s+Energ[ií]a\s+Referenciada/i,refStart+1);
    if(refStart>=0&&refEnd>refStart){
      const periods={};
      for(let i=refStart;i<refEnd;i++){
        const m=rows[i].text.match(/(?:Energ[ií]a\s+Referenciada\s+)?P([1-6])\s+([\d.]+(?:,\d+)?)\s*kWh\s*[x×]\s*([\d.,]+)\s*€\s*\/\s*kWh\s*([\d.]+,\d{2})\s*€/i);
        if(m)periods[`P${m[1]}`]={consumption:qty(m[2]),price:num(m[3]),cost:num(m[4]),costSource:'printed'};
      }
      for(let p=1;p<=6;p++){const k=`P${p}`;if(!periods[k]&&active[k]===0)periods[k]={consumption:0,cost:0,price:null,costSource:'explicit_zero_reading'};}
      const energy=rowAmount(rows[refEnd]),kwh=activeKeys.length===6?round2(activeKeys.reduce((s,k)=>s+Number(active[k]||0),0)):round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0));
      const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),sumCost=round2(Object.values(periods).reduce((s,q)=>s+Number(q.cost||0),0));
      return{kwh,energy,periods,consumptionReliable:Object.keys(periods).length===6&&Math.abs(sumKwh-kwh)<=.1,costReliable:energy!=null&&Object.keys(periods).length===6&&Math.abs(sumCost-energy)<=.05,pricingMode:'referenced_periods'};
    }
    return{kwh:null,energy:null,periods:{},consumptionReliable:false,costReliable:false,pricingMode:'unknown'};
  }

  function parseSummary(p1){return{energy:labelledAmount(p1,/^ENERG[IÍ]A\b/i),discount:labelledAmount(p1,/DESCUENTOS\s+ENERG[IÍ]A/i),normative:labelledAmount(p1,/CARGOS\s+NORMATIVOS/i),services:labelledAmount(p1,/SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS/i),vat:labelledAmount(p1,/^IVA\b/i),total:labelledAmount(p1,/^TOTAL\b/i)};}
  function parseDetailConcepts(p2){
    const discountRows=p2.filter(r=>/Descuento\s+sobre\s+consumo/i.test(r.text)&&rowAmount(r)!=null),discount=discountRows.length?round2(discountRows.reduce((s,r)=>s+Number(rowAmount(r)||0),0)):null;
    const tax=labelledAmount(p2,/Impuesto\s+sobre\s+electricidad/i),rental=labelledAmount(p2,/Alquiler\s+equipos?\s+medida/i),servicesTotal=labelledAmount(p2,/TOTAL\s+SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS/i),vat=labelledAmount(p2,/^IVA(?:\s|\()/i),total=labelledAmount(p2,/TOTAL\s+IMPORTE\s+FACTURA/i);
    const socialRows=p2.filter(r=>/Financiaci[oó]n\s+bono\s+social/i.test(r.text)&&rowAmount(r)!=null),social=socialRows.length?round2(socialRows.reduce((s,r)=>s+Number(rowAmount(r)||0),0)):null;
    return{discount,social,tax,rental,services:servicesTotal??rental,vat,total};
  }
  function parseReactiveCost(rows){
    const total=labelledAmount(rows,/Total\s+energ[ií]a\s+reactiva/i);if(total!=null)return total;
    const billed=rows.filter(r=>/Energ[ií]a\s+reactiva\s+P[1-6].*€\s*\/\s*kVArh/i.test(r.text)&&rowAmount(r)!=null);
    return billed.length?round2(billed.reduce((s,r)=>s+Number(rowAmount(r)||0),0)):null;
  }
  function parseExcessCost(rows){
    const total=labelledAmount(rows,/Total\s+exceso\s+potencia/i);if(total!=null)return total;
    const billed=rows.filter(r=>/Exceso\s+de\s+potencia\s+P[1-6].*€\s*\/\s*kW/i.test(r.text)&&rowAmount(r)!=null);
    return billed.length?round2(billed.reduce((s,r)=>s+Number(rowAmount(r)||0),0)):null;
  }
  function parseContracted(all,tariff,power){const out={...(power.contracted||{})},text=all.flat().map(r=>r.text).join('\n');if(/^2\.0TD$/i.test(tariff)){const p=text.match(/Potencia\s+punta\s*:\s*([\d.,]+)\s*kW/i),v=text.match(/Potencia\s+valle\s*:\s*([\d.,]+)\s*kW/i);if(p)out.P1=num(p[1]);if(v)out.P2=num(v[1]);}else{const m=text.match(/Potencia\s+contratada\s*\(kW\)\s*:\s*([^\n]{1,160})/i);if(m){[...m[1].matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)].map(x=>num(x[1])).slice(0,6).forEach((v,i)=>out[`P${i+1}`]=v);}}return out;}
  function parseMaximeters(all){const out={};for(const row of all.flat()){const m=row.text.match(/Max[ií]metro\s+P([1-6])[\s\S]*?(-?[\d.]+(?:,\d+)?)\s*kW\b/i);if(m)out[`P${m[1]}`]=qty(m[2]);}if(Object.keys(out).length===6)out._reliable=true;return out;}
  function parseReactive(all,label){const out={};for(const row of all.flat()){const m=row.text.match(new RegExp(`${label}\\s+P([1-6])[\\s\\S]*?(-?[\\d.]+(?:,\\d+)?)\\s*kVArh\\b`,'i'));if(m)out[`P${m[1]}`]=qty(m[2]);}return out;}

  function parse(d,file,options={}){
    if(!detect(d))return null;const all=allRows(d),p1=all[0]||[],p2=all[1]||[],text=all.flat().map(r=>r.text).join('\n'),tariff=normalizeTariff(text),period=periodInfo(p1),company=holder(p1),cups=strictCups(text),contract=contractNumber(p1),invoice=invoiceNumber(p1),addr=address(p1),place=splitPlace(addr),summary=parseSummary(p1),power=parsePower(p2,tariff),active=parseActiveReadings(all),energy=parseEnergy(p2,tariff,active,all),detail=parseDetailConcepts(p2),contracted=parseContracted(all,tariff,power),mx=parseMaximeters(all),reactiveCost=parseReactiveCost(p2),excessCost=parseExcessCost(p2);
    const discounts=detail.discount, social=detail.social, rental=detail.rental, services=detail.services, tax=detail.tax, vat=detail.vat, total=detail.total??summary.total, other=round2(Number(discounts||0)+Number(social||0)+Number(services||0)), accounted=round2(Number(energy.energy||0)+Number(power.value||0)+Number(excessCost||0)+Number(reactiveCost||0)+other+Number(tax||0)+Number(vat||0)), diff=total==null?null:round2(total-accounted), balanced=total!=null&&Math.abs(diff)<=.05;
    const checks={summaryEnergy:summary.energy!=null&&energy.energy!=null&&power.value!=null&&tax!=null&&Math.abs(summary.energy-(energy.energy+power.value+Number(excessCost||0)+Number(reactiveCost||0)+tax))<=.05,discount:optionalAmountMatch(summary.discount,discounts),normative:optionalAmountMatch(summary.normative,social),services:optionalAmountMatch(summary.services,services),vat:summary.vat!=null&&vat!=null&&Math.abs(summary.vat-vat)<=.05,total:summary.total!=null&&total!=null&&Math.abs(summary.total-total)<=.05};
    const missing=[];if(company==='Por identificar')missing.push('titular');if(invoice==='Por identificar')missing.push('nº factura');if(!cups)missing.push('CUPS');if(period.label==='Por identificar')missing.push('periodo');if(tariff==='—')missing.push('tarifa');if(!power.reliable)missing.push(power.message);if(!energy.consumptionReliable)missing.push('consumo por periodos');if(!energy.costReliable)missing.push('coste de energía');for(const [k,v] of Object.entries(checks))if(!v)missing.push(`validación ${k}`);if(!balanced)missing.push('cuadre económico');
    const readOk=!missing.length;const readingActual=/Ultima\s+lectura\s*:\s*real/i.test(text)||/siendo[\s\S]{0,120}?lecturas[\s\S]{0,60}?reales/i.test(text),reading=readingActual?{status:'actual',sourceLabel:'Lectura real indicada por Iberdrola'}:(options.readingClassifier?.(text)||{status:'unknown',sourceLabel:''});
    const taxId=((text.match(/(?:NIF|CIF)\s+titular(?:\s+del\s+contrato)?\s*:?\s*([A-Z0-9-]+)/i)||text.match(/\bNIF\s*:\s*([A-Z0-9-]+)/i)||[])[1]||'').replace(/\s+/g,'');
    const distributor=clean((text.match(/Empresa\s+distribuidora\s*:\s*([^\n]+)/i)||[])[1]||'');
    const accessContract=(text.match(/Numero\s+de\s+contrato\s+de\s+acceso\s*:\s*(\d{6,20})/i)||[])[1]||'';
    const renewalDate=(text.match(/Fecha\s+final\s+del\s+contrato\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||'';
    const permanence=clean((text.match(/Permanencia\s*:\s*([^\n]+)/i)||[])[1]||'');
    const meterNumber=(text.match(/N[º°o.]?\s*contador\s*:\s*(\d{5,20})/i)||[])[1]||'';
    let issueDate='';const idate=text.match(/FECHA\s+DE\s+EMISION(?:\s+DE\s+FACTURA)?\s*:?[^\n]*?(?:\n[^\n]*?)?\b(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i);if(idate)issueDate=`${idate[3]}-${MONTHS[idate[2].toLowerCase()]||''}-${String(idate[1]).padStart(2,'0')}`;
    return{file:file?.name||'',invoiceNumber:invoice,company,cups,period:period.label,tariff,kwh:energy.kwh,energy:energy.energy,power:power.value,excess:excessCost??0,reactive:reactiveCost??0,compensation:0,social:social??0,rental,integratorAdjustment:0,regularizationReactive:0,other,tax,vat,igic:0,distributorCharges:0,total,accounted,diff,balanced,readOk,readMessage:readOk?'Lectura correcta':`Falta o revisar: ${missing.join(', ')}`,readingStatus:reading.status,readingSourceLabel:reading.sourceLabel||'',avg:energy.kwh&&total?total/energy.kwh:0,opportunity:'Sin alertas',periods:energy.periods,contracted,maximeters:mx,parserVersion:options.parserVersion||'',parserRevision:REVISION,powerDetail:power,energyPricingMode:energy.pricingMode,sourceFormat:'iberdrola',supplier:'IBERDROLA CLIENTES, S.A.U.',retailer:'IBERDROLA CLIENTES, S.A.U.',commercializer:'IBERDROLA CLIENTES, S.A.U.',taxId,supplyAddress:addr,supplyCity:place.city,supplyProvince:place.province,contract,contractNumber:contract,accessContract,distributor,renewalDate,permanence,meterNumber,issueDate,billingStart:period.start,billingEnd:period.end,billingDays:period.days,discounts,reactivePeriods:parseReactive(all,'Energ[ií]a\\s+reactiva'),capacitivePeriods:parseReactive(all,'Energ[ií]a\\s+capacitiva'),activeReadings:active,validation:checks};
  }
  return Object.freeze({detect,parse,revision:REVISION,_test:{canonicalText,rowsFromItems,rowsFromLines,parsePower,parseEnergy,parseSummary,parseDetailConcepts,invoiceNumber}});
});
