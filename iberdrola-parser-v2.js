(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTIberdrolaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REVISION='2026.09.18.5';
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const money=n=>Number(n||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const num=v=>{
    if(v==null||v==='')return null;
    let s=String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');
    if(!s||s==='-'||s==='.')return null;
    const n=Number(s);return Number.isFinite(n)?n:null;
  };
  const euroValues=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€(?!\s*\/)/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastEuro=s=>{const values=euroValues(s);return values.length?values.at(-1):null;};
  const normalizeTariff=s=>{const m=String(s||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i);return m?m[1].replace(/\s+/g,'').toUpperCase():'—';};
  const normalizeCups=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const expectedPowerPeriods=t=>/^2\.0TD$/i.test(t)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(t)?6:0;
  const expectedEnergyPeriods=t=>/^2\.0TD$/i.test(t)?3:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(t)?6:0;
  const toIso=s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';};
  const MONTHS={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};

  function normalizeForDetect(value){
    let s='';
    if(value&&typeof value==='object'){
      const pages=(value.pages||[]).flat().join('\n');
      const raw=(value.rawPages||[]).flat().map(x=>x?.str||'').join(' ');
      s=[value.text||'',pages,raw].join('\n');
    }else s=Array.isArray(value)?value.flat().join('\n'):String(value||'');
    try{s=s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}catch(_){/* old browser */}
    return s.replace(/\u00a0/g,' ').replace(/[.,;:()]/g,' ').replace(/\s+/g,' ').toUpperCase();
  }

  function detect(value){
    const s=normalizeForDetect(value);
    if(/ENDESA ENERGIA|FENIE ENERGIA/.test(s))return false;
    const brand=/\bIBERDROLA\b/.test(s)&&(/\bCLIENTES\b/.test(s)||/A[- ]?95758389/.test(s));
    const invoice=/\bFACTURA\b/.test(s)&&(/\bELECTRICIDAD\b/.test(s)||/\bRESUMEN\b/.test(s));
    const identity=/\bCONTRATO\b/.test(s)||/\bCUPS\b/.test(s)||/PEAJE DE ACCESO/.test(s)||/TOTAL IMPORTE FACTURA/.test(s);
    return brand&&invoice&&identity;
  }

  function rawLines(items,tolerance=4.6){
    const pts=(items||[]).filter(i=>clean(i?.str)).map(i=>({s:clean(i.str),x:Number(i.transform?.[4]??0),y:Number(i.transform?.[5]??0),h:Math.abs(Number(i.height??i.transform?.[3]??0))||8}));
    pts.sort((a,b)=>b.y-a.y||a.x-b.x);
    const groups=[];
    for(const q of pts){
      let best=null,bestDist=Infinity;
      for(const g of groups){const d=Math.abs(g.y-q.y);if(d<=Math.max(tolerance,Math.min(7,(g.h+q.h)*.28))&&d<bestDist){best=g;bestDist=d;}}
      if(!best){best={y:q.y,h:q.h,a:[]};groups.push(best);}else{const n=best.a.length;best.y=(best.y*n+q.y)/(n+1);best.h=Math.max(best.h,q.h);}
      best.a.push(q);
    }
    return groups.sort((a,b)=>b.y-a.y).map(g=>clean(g.a.sort((a,b)=>a.x-b.x).map(x=>x.s).join(' '))).filter(Boolean);
  }

  function pageVariants(d,index){
    const variants=[];
    const p=(d?.pages?.[index]||[]).map(clean).filter(Boolean);if(p.length)variants.push(p);
    const raw=d?.rawPages?.[index];
    if(raw?.length){
      for(const tol of [3.2,4.6,6.2]){
        const r=rawLines(raw,tol);if(r.length&&!variants.some(v=>v.join('\n')===r.join('\n')))variants.push(r);
      }
    }
    return variants.length?variants:[[]];
  }
  function allVariants(d){
    const pageCount=Math.max(d?.pages?.length||0,d?.rawPages?.length||0,1),pages=[];
    for(let i=0;i<pageCount;i++)pages.push(pageVariants(d,i));
    const combos=[];
    const max=Math.max(...pages.map(x=>x.length));
    for(let v=0;v<max;v++)combos.push(pages.map(p=>p[Math.min(v,p.length-1)]||[]));
    return combos;
  }
  const textOf=lines=>(lines||[]).join('\n');
  const firstIndex=(a,re,start=0)=>{for(let i=Math.max(0,start);i<(a||[]).length;i++)if(re.test(String(a[i]||'')))return i;return-1;};
  function sectionLines(lines,startRe,endRes,max=80){
    const i=firstIndex(lines,startRe);if(i<0)return[];let j=Math.min(lines.length,i+max);
    for(let k=i+1;k<j;k++)if(endRes.some(re=>re.test(String(lines[k]||'')))){j=k;break;}
    return lines.slice(i,j);
  }
  function findStrictCups(text){
    const s=String(text||'');
    const labelled=s.match(/(?:CUPS|punto\s+de\s+suministro)[^\n]{0,100}?\b(ES(?:[ \t]*\d){16}(?:[ \t]*[A-Z]){2}(?:(?:[ \t]*[0-9])(?:[ \t]*[A-Z]))?)/i);
    const any=s.match(/\bES(?:[ \t]*\d){16}(?:[ \t]*[A-Z]){2}(?:(?:[ \t]*[0-9])(?:[ \t]*[A-Z]))?(?![A-Z0-9])/i);
    return normalizeCups(labelled?.[1]||any?.[0]||'');
  }
  function nextLongNumber(text,labelRe,min=6,max=22,window=420){
    const s=String(text||''),m=s.match(new RegExp(labelRe.source,labelRe.flags.replace(/g/g,'')));if(!m)return'';
    const tail=s.slice((m.index||0)+m[0].length,(m.index||0)+m[0].length+window),n=tail.match(new RegExp(`\\b(\\d{${min},${max}})\\b`));return n?n[1]:'';
  }

  function nameCandidate(raw){
    let s=clean(raw).replace(/^Titular\s*/i,'').replace(/\s+Potencia(?:\s+(?:punta|valle))?\s*:.*$/i,'').replace(/^Potencia(?:\s+(?:punta|valle))?\s*:.*$/i,'').trim();
    if(!s||/\d|[:€]/.test(s))return'';
    if(/(?:IBERDROLA|CONTRATO|CIF|TITULAR|FACTURA|DIRECCI[ÓO]N|REMIT|APARTADO|REGISTRO|MERCANTIL|BIZKAIA|FOLIO|TOMO|HOJA|EMPRESA\s+RESPONSABLE|SMART|ASISTENTE|DOMICILIO|MADRID|BILBAO|EUSKADI)/i.test(s))return'';
    if(/(?:^|\s)(?:C\/|CL\b|CALLE\b|CARRER\b|AV\b|AVDA\b|PASEO\b|PLAZA\b|CTRA\b)/i.test(s))return'';
    if(!/^[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ·' .&/-]{4,}$/i.test(s))return'';
    return s;
  }
  function parseHolder(lines){
    const start=firstIndex(lines,/\bCONTRATO\b/i,0);
    if(start>=0){
      const end=firstIndex(lines,/Direcci[oó]n\s+de\s+suministro\s*:/i,start+1),stop=end>start?end:Math.min(lines.length,start+18),runs=[];let current=[];
      for(let i=start+1;i<stop;i++){const c=nameCandidate(lines[i]);if(c){current.push(c);continue;}if(current.length){runs.push(clean(current.join(' ')));current=[];}}
      if(current.length)runs.push(clean(current.join(' ')));
      const plausible=runs.filter(s=>s.split(/\s+/).length>=2).sort((a,b)=>b.split(/\s+/).length-a.split(/\s+/).length);
      if(plausible.length)return plausible[0];
    }
    return'';
  }
  function parseRecipientHolder(text){
    const s=String(text||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ');
    const re=/([A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/-]*(?:\s+[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/-]*){1,9})\s+(?=(?:C\/|CL\b|CALLE\b|CARRER\b|AV\b|AVDA\b|PASEO\b|PLAZA\b|CTRA\b))/g;
    const banned=/(?:IBERDROLA|CLIENTES|ELECTRICIDAD|EMPRESA|RESPONSABLE|SOSTENIBLE|SMART|SOLUTIONS|NEGOCIO|FACTURA|CONTRATO)/i;
    const candidates=[...s.matchAll(re)].map(m=>clean(m[1])).filter(v=>v&&!banned.test(v)&&!/^PALMA\b/i.test(v));
    return candidates.length?candidates[0]:'';
  }
  function parseAddress(lines){
    const i=firstIndex(lines,/Direcci[oó]n\s+de\s+suministro\s*:/i);if(i<0)return'';const out=[];
    for(let n=i;n<Math.min(lines.length,i+10);n++){
      let q=clean(lines[n]).replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,'');
      q=q.replace(/^(?:de|Mercantil|Registro|Bizkaia,?|tomo|folio|hoja|inscripci[oó]n|Bilbao;?|Madrid;?)\s+/i,'').trim();
      if(!q)continue;if(/N[º°o.]?\s*DE\s*CONTRATO|RESUMEN\s+DE\s+FACTURA/i.test(q))break;
      if(!out.length&&!/(?:C\/|CL\b|CALLE\b|CARRER\b|AV\b|AVDA\b|PASEO\b|PLAZA\b|CTRA\b)/i.test(q))continue;
      if(out.length||/(?:C\/|CL\b|CALLE\b|CARRER\b|AV\b|AVDA\b|PASEO\b|PLAZA\b|CTRA\b)/i.test(q))out.push(q);
      if(out.length&&/\b\d{5}\b/.test(q)&&/\([^)]*\)/.test(q))break;
    }
    return clean(out.join(' '));
  }
  function splitPlace(address){
    const s=clean(address),m=s.match(/\b(\d{5})\s+(.+?)(?:\s*\(([^()]*)\))?\s*$/i);return m?{city:clean(m[2]).replace(/\s*\([^)]*\)\s*$/,''),province:clean(m[3]||'')}:{city:'',province:''};
  }
  function parsePeriod(lines){
    const s=textOf(lines),i=s.search(/PERIODO\s+DE\s+FACTURACI[ÓO]N\s*:/i),scope=i>=0?s.slice(i,i+700):s,m=scope.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);if(!m)return{label:'Por identificar',start:'',end:'',days:null};
    const after=scope.slice(m.index+m[0].length,m.index+m[0].length+320),dm=after.match(/(?:D[IÍ]AS\s+FACTURADOS\s*:?[^\d]{0,80})?(?:^|\s)(\d{1,3})(?:\s|$)/i),days=dm?Number(dm[1]):null;
    return{label:`${m[1]} - ${m[2]}${days?` (${days} días)`:''}`,start:toIso(m[1]),end:toIso(m[2]),days};
  }
  function parseIssueDate(lines){
    const s=textOf(lines),m=s.match(/FECHA\s+DE\s+EMISI[ÓO]N\s*:[\s\S]{0,180}?(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i)||s.match(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})\b/i);
    return m?`${m[3]}-${MONTHS[m[2].toLowerCase()]||''}-${String(m[1]).padStart(2,'0')}`:'';
  }

  function parseReadingRows(lines,label,unit){
    const out={},joined=textOf(lines),labelSource=label,markerRe=new RegExp(`${labelSource}\\s*P([1-6])\\b`,'ig'),markers=[...joined.matchAll(markerRe)];
    for(let i=0;i<markers.length;i++){
      const m=markers[i],p=m[1],start=(m.index||0)+m[0].length,end=i+1<markers.length?(markers[i+1].index||start+600):Math.min(joined.length,start+600),seg=joined.slice(start,end),um=[...seg.matchAll(new RegExp(`(-?[\\d.]+(?:,\\d+)?)\\s*${unit}\\b`,'ig'))];if(um.length)out[`P${p}`]=num(um.at(-1)[1]);
    }
    return out;
  }
  function parseReadingRowsText(text,label,unit){
    const out={},joined=String(text||''),markerRe=new RegExp(`${label}\\s*P([1-6])\\b`,'ig'),markers=[...joined.matchAll(markerRe)];
    for(let i=0;i<markers.length;i++){
      const m=markers[i],p=m[1],start=(m.index||0)+m[0].length,end=i+1<markers.length?(markers[i+1].index||start+900):Math.min(joined.length,start+900),seg=joined.slice(start,end),um=[...seg.matchAll(new RegExp(`(-?[\\d.]+(?:,\\d+)?)\\s*${unit}\\b`,'ig'))];
      if(um.length)out[`P${p}`]=num(um.at(-1)[1]);
    }
    return out;
  }
  function mergePeriodMaps(...maps){
    const out={};for(const map of maps)for(const [k,v] of Object.entries(map||{}))if(v!=null&&out[k]==null)out[k]=v;return out;
  }
  function bestPeriodMap(variants,label,unit){
    let best={};for(const lines of variants){const p=parseReadingRows(lines,label,unit);if(Object.keys(p).length>Object.keys(best).length)best=p;}return best;
  }

  function powerPeriod(label,index,expected){const q=String(label||'').toUpperCase();if(/^P[1-6]$/.test(q))return Number(q.slice(1));if(q==='PUNTA')return 1;if(q==='VALLE')return 2;return expected&&index<expected?index+1:null;}
  function parsePower(lines,tariff){
    const expected=expectedPowerPeriods(tariff),start=firstIndex(lines,/Potencia\s+facturada\b/i);if(start<0)return{value:null,sum:0,printedTotal:null,entries:[],reliable:false,contracted:{},message:'Potencia: no localizada'};
    let end=firstIndex(lines,/Total\s+importe\s+potencia\b/i,start+1);if(end<0)end=Math.min(lines.length,start+28);
    const body=lines.slice(start,end),totalLine=end<lines.length?lines[end]:'',markers=[];
    body.forEach((line,i)=>{const m=String(line).match(/(?:Potencia\s+facturada\s+)?\b(P[1-6]|Punta|Valle)\b/i);if(m)markers.push({i,label:m[1]});});
    const entries=[],contracted={};
    if(markers.length){
      markers.forEach((mark,idx)=>{
        const next=idx+1<markers.length?markers[idx+1].i:body.length,seg=body.slice(mark.i,next).join(' '),period=powerPeriod(mark.label,idx,expected),kw=(seg.match(/([\d.,]+)\s*kW\b/i)||[])[1],days=(seg.match(/(\d+)\s*d[ií]as?\b/i)||[])[1],price=(seg.match(/([\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a/i)||[])[1],amount=lastEuro(seg);
        if(period&&kw!=null&&amount!=null&&!entries.some(e=>e.period===period)){const e={period,contractedKw:num(kw),days:days?Number(days):null,price:price?num(price):null,amount};entries.push(e);contracted[`P${period}`]=e.contractedKw;}
      });
    }
    if(!entries.length){
      const rows=body.map(x=>String(x)).filter(x=>/\bkW\b/i.test(x)&&lastEuro(x)!=null);
      rows.slice(0,expected||rows.length).forEach((seg,idx)=>{const kw=(seg.match(/([\d.,]+)\s*kW\b/i)||[])[1],days=(seg.match(/(\d+)\s*d[ií]as?\b/i)||[])[1],price=(seg.match(/([\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a/i)||[])[1],amount=lastEuro(seg),period=idx+1;if(kw!=null&&amount!=null){const e={period,contractedKw:num(kw),days:days?Number(days):null,price:price?num(price):null,amount};entries.push(e);contracted[`P${period}`]=e.contractedKw;}});
    }
    entries.sort((a,b)=>a.period-b.period);const sum=round2(entries.reduce((s,e)=>s+Number(e.amount||0),0)),printed=lastEuro(totalLine),complete=expected?entries.length===expected:entries.length>0,reliable=complete&&printed!=null&&Math.abs(sum-printed)<=Math.max(.05,(entries.length+1)*.005+.000001);
    return{value:printed!=null?printed:sum,sum,printedTotal:printed,entries,reliable,contracted,message:reliable?'':!complete?'Potencia: faltan periodos facturados':'Potencia: subtotal no cuadra con el detalle'};
  }
  function bestPower(pageVariantsList,tariff){let best=null,score=-1;for(const lines of pageVariantsList){const p=parsePower(lines,tariff),s=(p.reliable?1000:0)+p.entries.length*10+(p.printedTotal!=null?1:0);if(s>score){best=p;score=s;}}return best;}

  function powerScore(p){return p?(p.reliable?1000:0)+(p.entries?.length||0)*10+(p.printedTotal!=null?1:0):-1;}
  function parsePowerText(text,tariff){
    const expected=expectedPowerPeriods(tariff),source=String(text||'').replace(/\u00a0/g,' '),start=source.search(/Potencia\s+facturada\b/i);if(start<0)return null;
    const tail=source.slice(start),totalPos=tail.search(/Total\s+importe\s+potencia\b/i),scope=(totalPos>0?tail.slice(0,totalPos):tail.slice(0,2200)).replace(/\s+/g,' '),totalScope=totalPos>=0?tail.slice(totalPos,totalPos+300):'';
    const markerRe=/\b(P[1-6]|Punta|Valle)\b/gi,markers=[...scope.matchAll(markerRe)],entries=[],contracted={};
    for(let i=0;i<markers.length;i++){
      const m=markers[i],period=powerPeriod(m[1],i,expected);if(!period||entries.some(e=>e.period===period))continue;
      const a=(m.index||0)+m[0].length,b=i+1<markers.length?(markers[i+1].index||a+500):Math.min(scope.length,a+500),seg=scope.slice(a,b),kw=(seg.match(/([\d.,]+)\s*kW\b/i)||[])[1],days=(seg.match(/(\d+)\s*d[ií]as?\b/i)||[])[1],price=(seg.match(/([\d.,]+)\s*€\s*\/\s*kW\s*d[ií]a/i)||[])[1],amount=lastEuro(seg);
      if(kw!=null&&amount!=null){const e={period,contractedKw:num(kw),days:days?Number(days):null,price:price?num(price):null,amount};entries.push(e);contracted[`P${period}`]=e.contractedKw;}
    }
    entries.sort((a,b)=>a.period-b.period);const sum=round2(entries.reduce((s,e)=>s+Number(e.amount||0),0)),printed=lastEuro(totalScope),complete=expected?entries.length===expected:entries.length>0,reliable=complete&&printed!=null&&Math.abs(sum-printed)<=Math.max(.05,(entries.length+1)*.005+.000001);
    return{value:printed!=null?printed:sum,sum,printedTotal:printed,entries,reliable,contracted,message:reliable?'':!complete?'Potencia: faltan periodos facturados':'Potencia: subtotal no cuadra con el detalle'};
  }

  function parseTwoZeroBreakdown(text){
    const s=String(text||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ');
    const m=s.match(/consumos\s+desagregados[\s\S]{0,90}?punta\s*:?\s*([\d.]+(?:,\d+)?)\s*kWh[\s\S]{0,90}?llano\s*:?\s*([\d.]+(?:,\d+)?)\s*kWh[\s\S]{0,90}?valle\s*:?\s*([\d.]+(?:,\d+)?)\s*kWh/i);
    return m?{P1:num(m[1]),P2:num(m[2]),P3:num(m[3])}:{};
  }
  function energyScore(e){
    if(!e)return-1;const informed=Object.values(e.periods||{}).filter(q=>q?.consumption!=null).length,costs=Object.values(e.periods||{}).filter(q=>q?.cost!=null).length;
    return(e.consumptionReliable?1000:0)+(e.costReliable?500:0)+informed*10+costs+(e.kwh!=null?3:0)+(e.energy!=null?2:0);
  }
  function rescueEnergyFromDocumentText(text,tariff,hints={}){
    const source=String(text||'').replace(/\u00a0/g,' ');
    if(/^2\.0TD$/i.test(tariff)){
      const km=(source.match(/Energ[ií]a\s+consumida[\s\S]{0,320}?([\d.]+(?:,\d+)?)\s*kWh/i)||[])[1];
      const rate=(source.match(/Energ[ií]a\s+consumida[\s\S]{0,520}?([\d.]+(?:,\d+)?)\s*€\s*\/\s*kWh/i)||[])[1];
      const explicitAmount=(source.match(/Energ[ií]a\s+consumida[\s\S]{0,700}?([\d.]+,\d{2})\s*€(?!\s*\/)/i)||[])[1];
      const breakdown=parseTwoZeroBreakdown(source),periods={};
      const breakdownKeys=Object.keys(breakdown);
      for(let p=1;p<=3;p++)if(breakdown[`P${p}`]!=null)periods[`P${p}`]={consumption:breakdown[`P${p}`],cost:null,price:rate?num(rate):null};
      let kwh=km?num(km):null;
      if(kwh==null&&breakdownKeys.length===3)kwh=round2(Object.values(breakdown).reduce((s,v)=>s+Number(v||0),0));
      let energy=explicitAmount?num(explicitAmount):null;
      const derivedEnergy=hints.summaryEnergy!=null&&hints.power!=null&&hints.tax!=null?round2(Number(hints.summaryEnergy)-Number(hints.power)-Number(hints.tax)):null;
      if(energy==null&&derivedEnergy!=null&&derivedEnergy>=0)energy=derivedEnergy;
      const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),calc=kwh!=null&&rate?round2(kwh*num(rate)):null;
      const consumptionReliable=kwh!=null&&breakdownKeys.length===3&&Math.abs(sumKwh-kwh)<=.1;
      const costReliable=energy!=null&&((calc!=null&&Math.abs(calc-energy)<=.02)||(derivedEnergy!=null&&Math.abs(derivedEnergy-energy)<=.02));
      return{kwh,energy,periods,sumKwh,sumCost:energy??0,consumptionReliable,costReliable,pricingMode:'single_rate',recoverySource:'document_text'};
    }
    if(/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)){
      const active={};
      for(let p=1;p<=6;p++){
        const am=source.match(new RegExp(`Energ[ií]a\\s+activa\\s+P${p}[\\s\\S]{0,220}?(-?[\\d.]+(?:,\\d+)?)\\s*kWh\\b`,'i'));
        if(am)active[`P${p}`]=num(am[1]);
      }
      const periods={};
      for(let p=1;p<=6;p++){
        const pm=source.match(new RegExp(`(?:Energ[ií]a\\s+consumida[\\s\\S]{0,100}?)?\\bP${p}\\b[\\s\\S]{0,180}?([\\d.]+(?:,\\d+)?)\\s*kWh[\\s\\S]{0,180}?([\\d.,]+)\\s*€\\s*\\/\\s*kWh[\\s\\S]{0,160}?([\\d.]+,\\d{2})\\s*€`,'i'));
        if(pm)periods[`P${p}`]={consumption:num(pm[1]),price:num(pm[2]),cost:num(pm[3])};
      }
      const tm=source.match(/Total\s+([\d.]+(?:,\d+)?)\s*kWh[\s\S]{0,220}?([\d.]+,\d{2})\s*€/i);
      if(!tm)return null;
      const kwh=num(tm[1]),energy=num(tm[2]);
      for(let p=1;p<=6;p++){const k=`P${p}`;if(!periods[k]&&active[k]===0)periods[k]={consumption:0,cost:0,price:null};}
      let knownConsumption=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),knownCost=round2(Object.values(periods).reduce((s,q)=>s+Number(q.cost||0),0));
      const missingKeys=[];for(let p=1;p<=6;p++)if(!periods[`P${p}`])missingKeys.push(`P${p}`);
      if(missingKeys.length&&Math.abs(knownConsumption-kwh)<=.1&&Math.abs(knownCost-energy)<=.05){
        for(const k of missingKeys)periods[k]={consumption:0,cost:0,price:null};
      }
      knownConsumption=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0));knownCost=round2(Object.values(periods).reduce((s,q)=>s+Number(q.cost||0),0));
      return{kwh,energy,periods,sumKwh:knownConsumption,sumCost:knownCost,consumptionReliable:Object.keys(periods).length===6&&Math.abs(knownConsumption-kwh)<=.1,costReliable:Object.keys(periods).length===6&&Math.abs(knownCost-energy)<=.05,pricingMode:'periods',recoverySource:'document_text'};
    }
    return null;
  }

  function parseEnergyText(text,tariff,activeReadings){
    const source=String(text||'').replace(/\u00a0/g,' '),start=source.search(/Energ[ií]a\s+consumida\b/i);if(start<0)return null;
    const tail=source.slice(start),stop=tail.search(/Descuento\s+sobre\s+consumo\b/i),scope=(stop>0?tail.slice(0,stop):tail.slice(0,2200)).replace(/\s+/g,' ');
    if(/^2\.0TD$/i.test(tariff)){
      const km=(scope.match(/([\d.,]+)\s*kWh\b/i)||[])[1],rate=(scope.match(/([\d.,]+)\s*€\s*\/\s*kWh/i)||[])[1],amount=lastEuro(scope),breakdown=parseTwoZeroBreakdown(source),periods={};
      for(let p=1;p<=3;p++)periods[`P${p}`]={consumption:breakdown[`P${p}`]??activeReadings?.[`P${p}`]??null,cost:null,price:rate?num(rate):null};
      const kwh=km?num(km):(Object.keys(breakdown).length===3?round2(Object.values(breakdown).reduce((s,v)=>s+Number(v||0),0)):null),sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),calc=kwh!=null&&rate?round2(kwh*num(rate)):null;
      return{kwh,energy:amount,periods,sumKwh,sumCost:amount??0,consumptionReliable:kwh!=null&&Object.values(periods).every(q=>q.consumption!=null)&&Math.abs(sumKwh-kwh)<=.1,costReliable:amount!=null&&calc!=null&&Math.abs(calc-amount)<=.02,pricingMode:'single_rate'};
    }
    const expected=expectedEnergyPeriods(tariff)||6,periods={};for(let p=1;p<=expected;p++)periods[`P${p}`]={consumption:activeReadings?.[`P${p}`]??null,cost:null,price:null};
    const markers=[...scope.matchAll(/\bP([1-6])\b/gi)],totalIndex=scope.search(/\bTotal\s+[\d.,]+\s*kWh\b/i);
    for(let i=0;i<markers.length;i++){
      const m=markers[i],p=Number(m[1]);if(!p||p>expected)continue;
      const a=(m.index||0)+m[0].length,nextMarker=i+1<markers.length?(markers[i+1].index||scope.length):scope.length,b=totalIndex>a?Math.min(nextMarker,totalIndex):nextMarker,seg=scope.slice(a,b),km=(seg.match(/([\d.,]+)\s*kWh\b/i)||[])[1],rate=(seg.match(/([\d.,]+)\s*€\s*\/\s*kWh/i)||[])[1],cost=lastEuro(seg),key=`P${p}`;
      if(km!=null||cost!=null)periods[key]={consumption:km?num(km):periods[key].consumption,price:rate?num(rate):null,cost};
    }
    const total=scope.match(/Total\s+([\d.,]+)\s*kWh\b[\s\S]{0,180}?(-?[\d.]+,\d{2})\s*€/i),printedKwh=total?num(total[1]):null,printedCost=total?num(total[2]):null;
    const knownConsumption=round2(Object.values(periods).filter(q=>q.consumption!=null).reduce((s,q)=>s+Number(q.consumption),0)),knownCosts=round2(Object.values(periods).filter(q=>q.cost!=null).reduce((s,q)=>s+Number(q.cost),0));
    if(printedKwh!=null&&Math.abs(knownConsumption-printedKwh)<=.1)for(const q of Object.values(periods))if(q.consumption==null)q.consumption=0;
    if(printedCost!=null&&Math.abs(knownCosts-printedCost)<=.05)for(const q of Object.values(periods))if(q.cost==null&&q.consumption===0)q.cost=0;
    const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),sumCost=round2(Object.values(periods).reduce((s,q)=>s+Number(q.cost||0),0));
    return{kwh:printedKwh??sumKwh,energy:printedCost??sumCost,periods,sumKwh,sumCost,consumptionReliable:printedKwh!=null&&Object.values(periods).every(q=>q.consumption!=null)&&Math.abs(sumKwh-printedKwh)<=.1,costReliable:printedCost!=null&&Object.values(periods).every(q=>q.cost!=null)&&Math.abs(sumCost-printedCost)<=.05,pricingMode:'periods'};
  }
  function parseEnergy(lines,tariff,activeReadings,allText){
    if(/^2\.0TD$/i.test(tariff)){
      const start=firstIndex(lines,/Energ[ií]a\s+consumida\b/i);if(start<0)return null;let end=firstIndex(lines,/Descuento\s+sobre\s+consumo\b/i,start+1);if(end<0)end=Math.min(lines.length,start+10);const seg=lines.slice(start,end).join(' '),km=(seg.match(/([\d.,]+)\s*kWh\b/i)||[])[1],rate=(seg.match(/([\d.,]+)\s*€\s*\/\s*kWh/i)||[])[1],amount=lastEuro(seg),breakdown=parseTwoZeroBreakdown(allText),periods={};
      for(let p=1;p<=3;p++)periods[`P${p}`]={consumption:breakdown[`P${p}`]??activeReadings[`P${p}`]??null,cost:null,price:rate?num(rate):null};
      const kwh=km?num(km):(Object.keys(breakdown).length===3?round2(Object.values(breakdown).reduce((s,v)=>s+Number(v||0),0)):null),sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),calc=kwh!=null&&rate?round2(kwh*num(rate)):null;
      return{kwh,energy:amount,periods,sumKwh,sumCost:amount??0,consumptionReliable:kwh!=null&&Object.values(periods).every(q=>q.consumption!=null)&&Math.abs(sumKwh-kwh)<=.1,costReliable:amount!=null&&calc!=null&&Math.abs(calc-amount)<=.02,pricingMode:'single_rate'};
    }
    const expected=expectedEnergyPeriods(tariff)||6,periods={};for(let p=1;p<=expected;p++)periods[`P${p}`]={consumption:activeReadings[`P${p}`]??null,cost:null,price:null};
    const start=firstIndex(lines,/Energ[ií]a\s+consumida\b/i);if(start<0)return null;let end=firstIndex(lines,/^\s*Total\s+[\d.,]+\s*kWh\b/i,start+1);if(end<0)end=Math.min(lines.length,start+24);const body=lines.slice(start,end),totalLine=end<lines.length?lines[end]:'',markers=[];
    body.forEach((line,i)=>{const m=String(line).match(/(?:Energ[ií]a\s+consumida\s+)?\bP([1-6])\b/i);if(m)markers.push({i,p:Number(m[1])});});
    markers.forEach((mark,idx)=>{const next=idx+1<markers.length?markers[idx+1].i:body.length,seg=body.slice(mark.i,next).join(' '),km=(seg.match(/([\d.,]+)\s*kWh\b/i)||[])[1],rate=(seg.match(/([\d.,]+)\s*€\s*\/\s*kWh/i)||[])[1],cost=lastEuro(seg),key=`P${mark.p}`;periods[key]={consumption:km?num(km):periods[key].consumption,price:rate?num(rate):null,cost};});
    const tm=String(totalLine).match(/Total\s+([\d.,]+)\s*kWh\b/i),printedKwh=tm?num(tm[1]):null,printedCost=lastEuro(totalLine);
    const knownConsumption=round2(Object.values(periods).filter(q=>q.consumption!=null).reduce((s,q)=>s+Number(q.consumption),0)),knownCosts=round2(Object.values(periods).filter(q=>q.cost!=null).reduce((s,q)=>s+Number(q.cost),0));
    if(printedKwh!=null&&Math.abs(knownConsumption-printedKwh)<=.1)for(const q of Object.values(periods))if(q.consumption==null)q.consumption=0;
    if(printedCost!=null&&Math.abs(knownCosts-printedCost)<=.05)for(const q of Object.values(periods))if(q.cost==null&&q.consumption===0)q.cost=0;
    const sumKwh=round2(Object.values(periods).reduce((s,q)=>s+Number(q.consumption||0),0)),sumCost=round2(Object.values(periods).reduce((s,q)=>s+Number(q.cost||0),0)),consumptionReliable=printedKwh!=null&&Object.values(periods).every(q=>q.consumption!=null)&&Math.abs(sumKwh-printedKwh)<=.1,costReliable=printedCost!=null&&Object.values(periods).every(q=>q.cost!=null)&&Math.abs(sumCost-printedCost)<=.05;
    return{kwh:printedKwh??(consumptionReliable?sumKwh:null),energy:printedCost??(costReliable?sumCost:null),periods,sumKwh,sumCost,consumptionReliable,costReliable,pricingMode:'periods'};
  }
  function bestEnergy(pageVariantsList,tariff,readingVariants,allTexts){let best=null,score=-1;for(let i=0;i<pageVariantsList.length;i++){const active=readingVariants[i]||{},e=parseEnergy(pageVariantsList[i],tariff,active,allTexts[i]||'');if(!e)continue;const informed=Object.values(e.periods||{}).filter(q=>q.consumption!=null).length,costs=Object.values(e.periods||{}).filter(q=>q.cost!=null).length,s=(e.consumptionReliable?1000:0)+(e.costReliable?500:0)+informed*10+costs;if(s>score){best=e;score=s;}}return best;}

  function summaryAmount(p1,re){for(const line of p1||[]){if(re.test(String(line||''))){const v=lastEuro(line);if(v!=null)return v;}}return null;}
  function rowAmount(lines,re){for(const line of lines||[]){if(re.test(String(line||''))){const v=lastEuro(line);if(v!=null)return v;}}return null;}
  function sumRows(lines,re){let sum=0,found=false;for(const line of lines||[]){if(!re.test(String(line||'')))continue;const v=lastEuro(line);if(v!=null){sum+=v;found=true;}}return found?round2(sum):null;}
  function parseConcepts(p1,detail,power,energy){
    const summaryEnergy=summaryAmount(p1,/^\s*ENERG[IÍ]A\b/i),summaryDiscount=summaryAmount(p1,/DESCUENTOS\s+ENERG[IÍ]A/i),summaryNormative=summaryAmount(p1,/CARGOS\s+NORMATIVOS/i),summaryServices=summaryAmount(p1,/SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS/i),summaryVat=summaryAmount(p1,/^\s*IVA\b/i),summaryTotal=summaryAmount(p1,/^\s*TOTAL\b/i);
    const discounts=rowAmount(detail,/Descuento\s+sobre\s+consumo/i)??summaryDiscount??0,social=sumRows(detail,/Financiaci[oó]n\s+bono\s+social/i)??summaryNormative??0,rental=rowAmount(detail,/Alquiler\s+equipos?\s+medida/i)??summaryServices??0;
    const taxRow=rowAmount(detail,/Impuesto\s+sobre\s+electricidad/i),taxBySummary=summaryEnergy!=null&&power!=null&&energy!=null?round2(summaryEnergy-power-energy):null,tax=taxBySummary!=null&&(taxRow==null||Math.abs(taxRow-taxBySummary)>.05)?taxBySummary:(taxRow??taxBySummary??0),vat=rowAmount(detail,/^\s*IVA(?:\s|\()/i)??summaryVat??0,total=rowAmount(detail,/TOTAL\s+IMPORTE\s+FACTURA/i)??summaryTotal;
    return{discounts,social,rental,tax,vat,total,summaryEnergy};
  }

  function parseContracted(all,tariff,fallback){
    const out={...(fallback||{})},expected=expectedPowerPeriods(tariff),m=String(all||'').match(/Potencia\s+contratada\s*\(kW\)\s*:\s*([^\n]{1,150})/i);
    if(m){const values=[...m[1].matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)].map(x=>num(x[1])).filter(v=>v!=null).slice(0,expected||6);if(!expected||values.length>=expected)values.forEach((v,i)=>{if(i<(expected||values.length))out[`P${i+1}`]=v;});}
    if(/^2\.0TD$/i.test(tariff)){const p=String(all||'').match(/Potencia\s+punta\s*:\s*([\d.,]+)\s*kW/i),v=String(all||'').match(/Potencia\s+valle\s*:\s*([\d.,]+)\s*kW/i);if(out.P1==null&&p)out.P1=num(p[1]);if(out.P2==null&&v)out.P2=num(v[1]);}
    return out;
  }
  function parseAnnualDemand(all){const m=String(all||'').match(/potencias\s+m[aá]ximas\s+demandadas[\s\S]{0,220}?([\d.,]+)\s*kW\s+en\s+P1[\s\S]{0,120}?([\d.,]+)\s*kW\s+en\s+P2/i);return m?{P1:num(m[1]),P2:num(m[2]),_source:'annual_max_demand'}:{};}
  function parseDistributor(all){const m=String(all||'').match(/Empresa\s+distribuidora\s*:\s*([^\n]{2,180})/i);return clean((m?.[1]||'').split(/N[uú]mero\s+de\s+contrato\s+de\s+acceso\s*:/i)[0]);}

  function parse(d,file,options={}){
    if(!detect(d))return null;
    const combos=allVariants(d),primary=combos[0]||[],pageCount=primary.length,p1Variants=pageVariants(d,0),detailVariants=pageVariants(d,1),p3Variants=pageVariants(d,2),allTextVariants=combos.map(pages=>pages.flat().join('\n'));
    const rawText=(d?.rawPages||[]).flat().map(x=>x?.str||'').join(' ');
    const baseAll=[String(d?.text||''),...(d?.pages||[]).flat(),rawText].join('\n');
    const tariff=normalizeTariff(baseAll)||'—',rawPageTexts=(d?.rawPages||[]).map(items=>(items||[]).map(x=>clean(x?.str)).filter(Boolean).join(' ')),pageLooseTexts=pageVariants(d,1).map(lines=>lines.join(' ')),looseAll=[...(d?.pages||[]).map(p=>(p||[]).join(' ')),...rawPageTexts].join('\n');
    const p1=p1Variants.slice().sort((a,b)=>b.length-a.length)[0]||[],holderCandidates=p1Variants.map(parseHolder).filter(Boolean).sort((a,b)=>b.length-a.length),recipientHolder=parseRecipientHolder([...(d?.pages?.[0]||[]),rawPageTexts[0]||''].join(' ')),holder=recipientHolder||holderCandidates[0]||'',addressCandidates=p1Variants.map(parseAddress).filter(Boolean).sort((a,b)=>b.length-a.length),supplyAddress=addressCandidates[0]||'',place=splitPlace(supplyAddress),periodCandidates=p1Variants.map(parsePeriod).filter(p=>p.label!=='Por identificar'),periodInfo=periodCandidates[0]||{label:'Por identificar',start:'',end:'',days:null},p1All=p1Variants.map(textOf).join('\n');
    const invoiceNumber=nextLongNumber(p1All,/N[º°o.]?\s*FACTURA\s*:/i,10,22,520)||'Por identificar',contract=nextLongNumber(p1All,/N[º°o.]?\s*DE\s*CONTRATO\s*:/i,6,20,220),cups=findStrictCups(baseAll),issueDate=parseIssueDate(p1);

    const rawActive=parseReadingRowsText(looseAll,'Energ[ií]a\\s+activa','kWh');
    const activeVariants=detailVariants.map((lines,i)=>{const p3=p3Variants[Math.min(i,p3Variants.length-1)]||[];return mergePeriodMaps(parseReadingRows([...lines,...p3],'Energ[ií]a\\s+activa','kWh'),rawActive);});
    const linePower=bestPower(detailVariants,tariff),textPowerCandidates=[...pageLooseTexts,rawPageTexts[1]||'',looseAll].map(t=>parsePowerText(t,tariff)).filter(Boolean),textPower=textPowerCandidates.sort((a,b)=>powerScore(b)-powerScore(a))[0]||null,powerDetail=powerScore(textPower)>powerScore(linePower)?textPower:(linePower||textPower);
    const lineEnergy=bestEnergy(detailVariants,tariff,activeVariants,detailVariants.map((lines,i)=>[...lines,...(p3Variants[Math.min(i,p3Variants.length-1)]||[])].join('\n'))),textEnergyCandidates=[...pageLooseTexts,rawPageTexts[1]||'',looseAll].map(t=>parseEnergyText(t,tariff,rawActive)).filter(Boolean),textEnergy=textEnergyCandidates.sort((a,b)=>energyScore(b)-energyScore(a))[0]||null;
    const selectedDetail=detailVariants.reduce((best,lines)=>{const p=parsePower(lines,tariff),e=parseEnergy(lines,tariff,activeVariants[detailVariants.indexOf(lines)]||{},[...lines,...(p3Variants[Math.min(detailVariants.indexOf(lines),p3Variants.length-1)]||[])].join('\n')),score=(p.reliable?100:0)+(e?.consumptionReliable?50:0)+(e?.costReliable?25:0);return !best||score>best.score?{lines,score}:best;},null)?.lines||detailVariants[0]||[];
    let energyDetail=[lineEnergy,textEnergy].filter(Boolean).sort((a,b)=>energyScore(b)-energyScore(a))[0]||{kwh:null,energy:null,periods:{},consumptionReliable:false,costReliable:false,pricingMode:'unknown'};
    let concepts=parseConcepts(p1,selectedDetail,powerDetail?.value,energyDetail.energy);
    const rescueSources=[String(d?.text||''),rawText,rawPageTexts[1]||'',looseAll,baseAll],rescueHints={summaryEnergy:concepts.summaryEnergy,power:powerDetail?.value,tax:concepts.tax},rescuedCandidates=rescueSources.map(t=>rescueEnergyFromDocumentText(t,tariff,rescueHints)).filter(Boolean),rescuedEnergy=rescuedCandidates.sort((a,b)=>energyScore(b)-energyScore(a))[0]||null;
    if(energyScore(rescuedEnergy)>energyScore(energyDetail))energyDetail=rescuedEnergy;
    concepts=parseConcepts(p1,selectedDetail,powerDetail?.value,energyDetail.energy);
    const contracted=parseContracted(baseAll,tariff,powerDetail?.contracted||{}),reactivePeriods=bestPeriodMap(combos.map(p=>p.flat()),'Energ[ií]a\\s+reactiva','kVArh'),capacitivePeriods=bestPeriodMap(combos.map(p=>p.flat()),'Energ[ií]a\\s+capacitiva','kVArh'),maximeters=bestPeriodMap(combos.map(p=>p.flat()),'Max[ií]metro','kW');
    if(Object.keys(maximeters).length===(expectedPowerPeriods(tariff)||0))maximeters._reliable=true;
    const maxDemandAnnual=parseAnnualDemand(baseAll),energy=energyDetail.energy,power=powerDetail?.value,discounts=concepts.discounts,social=concepts.social,rental=concepts.rental,tax=concepts.tax,vat=concepts.vat,total=concepts.total,other=round2(Number(discounts||0)+Number(social||0)+Number(rental||0)),excess=0,reactive=0,compensation=0,igic=0,distributorCharges=0,integratorAdjustment=0,regularizationReactive=0;
    const accounted=round2(Number(energy||0)+Number(power||0)+other+Number(tax||0)+Number(vat||0)),diff=total==null?null:round2(Number(total)-accounted),balanced=total!=null&&Math.abs(diff)<=.05,missing=[];
    if(!holder)missing.push('titular');if(!cups)missing.push('CUPS');if(periodInfo.label==='Por identificar')missing.push('periodo');if(tariff==='—')missing.push('tarifa');if(total==null)missing.push('total');if(!powerDetail?.reliable)missing.push(powerDetail?.message||'potencia');if(!energyDetail.consumptionReliable)missing.push('consumo por periodos no cuadra con el consumo total');if(!energyDetail.costReliable)missing.push('coste de energía no cuadra con el detalle facturado');const expected=expectedPowerPeriods(tariff);if(expected&&Object.keys(contracted).filter(k=>/^P\d$/.test(k)&&contracted[k]!=null).length!==expected)missing.push('potencias contratadas');
    const readingDirect=/[ÚU]ltima[\s\S]{0,50}?lectura[\s\S]{0,25}?real/i.test(baseAll)||/siendo[\s\S]{0,130}?lecturas[\s\S]{0,50}?reales/i.test(baseAll)?{status:'actual',sourceLabel:'Lectura real indicada por Iberdrola'}:/[ÚU]ltima[\s\S]{0,50}?lectura[\s\S]{0,25}?estimada/i.test(baseAll)?{status:'estimated',sourceLabel:'Última lectura: estimada'}:null,fallbackReading=options.readingClassifier?.(baseAll)||{status:'unknown',sourceLabel:null},reading=readingDirect||fallbackReading,alerts=[];
    const usable=maximeters._reliable?Object.keys(maximeters).filter(k=>/^P\d$/.test(k)&&(contracted[k]||0)>0):[];if(usable.length){const mc=Math.max(...usable.map(k=>contracted[k])),md=Math.max(...usable.map(k=>maximeters[k])),ratio=mc?md/mc:1;if(mc>=10&&md>=0&&ratio<=.5)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}else if(maxDemandAnnual.P1!=null&&contracted.P1){const mc=Math.max(contracted.P1||0,contracted.P2||0),md=Math.max(maxDemandAnnual.P1||0,maxDemandAnnual.P2||0),ratio=mc?md/mc:1;if(mc>=5&&md>0&&ratio<=.7)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. anual ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}
    const readOk=balanced&&!missing.length,distributor=parseDistributor(baseAll),accessContract=nextLongNumber(baseAll,/N[uú]mero\s+de\s+contrato\s+de\s+acceso\s*:/i,6,20,220),renewalDate=((baseAll.match(/Fecha\s+final\s+del\s+contrato\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1])||'',permanence=((baseAll.match(/Permanencia\s*:\s*([^\n]+)/i)||[])[1]||'').trim(),meterNumber=((baseAll.match(/N[º°o.]?\s*contador\s*:\s*(\d{5,20})/i)||[])[1])||'',taxId=((baseAll.match(/NIF\s+titular\s+del\s+contrato\s*:\s*([A-Z0-9-]+)/i)||[])[1])||'';
    return{file:file?.name||'',invoiceNumber,company:holder||'Por identificar',taxId,cups,period:periodInfo.label,tariff,kwh:energyDetail.kwh,energy,power,excess,reactive,compensation,social,rental,integratorAdjustment,regularizationReactive,other,tax,vat,igic,distributorCharges,distributorDescription:'',total,accounted,diff,balanced,readOk,readMessage:missing.length?`Falta o revisar: ${missing.join(', ')}`:balanced?'Lectura correcta':`Descuadre: ${money(diff)} €`,readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',avg:energyDetail.kwh&&total!=null?total/energyDetail.kwh:0,opportunity:alerts.length?alerts.join(' · '):'Sin alertas',periods:energyDetail.periods,contracted,maximeters,maxDemandAnnual,parserVersion:options.parserVersion||'',powerDetail,energyPricingMode:energyDetail.pricingMode,sourceFormat:'iberdrola',supplier:'IBERDROLA CLIENTES, S.A.U.',retailer:'IBERDROLA CLIENTES, S.A.U.',commercializer:'IBERDROLA CLIENTES, S.A.U.',supplyAddress,supplyCity:place.city,supplyProvince:place.province,contract,contractNumber:contract,accessContract,distributor,contractType:'',renewalDate,permanence,meterNumber,issueDate,billingStart:periodInfo.start,billingEnd:periodInfo.end,billingDays:periodInfo.days,discounts,reactivePeriods,capacitivePeriods,activeReadings:activeVariants.sort((a,b)=>Object.keys(b).length-Object.keys(a).length)[0]||{},parserRevision:REVISION};
  }

  return Object.freeze({detect,parse,revision:REVISION,_test:{rawLines,parsePower,parsePowerText,parseEnergy,parseEnergyText,rescueEnergyFromDocumentText,parseReadingRows,parseReadingRowsText,parseRecipientHolder}});
});
