(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTIberdrolaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const REVISION='2026.09.18.7';
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const clean=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=s=>clean(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  const num=v=>{
    if(v==null||v==='')return null;
    let s=String(v).trim().replace(/\s/g,'');
    if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(','))s=s.replace(',','.');
    const n=Number(s.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:null;
  };
  const money=n=>Number(n||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const amountPattern='(-?[\\d.]+,\\d{2})\\s*€';
  const linesOf=d=>{
    if(typeof d==='string')return [String(d).split(/\r?\n/).map(clean).filter(Boolean)];
    const pages=(d?.pages||[]).map(p=>(p||[]).map(clean).filter(Boolean));
    if(pages.length)return pages;
    const text=String(d?.text||'');
    return [text.split(/\r?\n/).map(clean).filter(Boolean)];
  };
  const allText=d=>{
    const pages=linesOf(d);
    const a=pages.flat().join('\n');
    return a||String(d?.text||'');
  };
  const euroValues=s=>[...String(s||'').matchAll(/(-?[\d.]+,\d{2})\s*€(?!\s*\/)/g)].map(m=>num(m[1])).filter(v=>v!=null);
  const lastEuro=s=>{const a=euroValues(s);return a.length?a.at(-1):null;};
  const lineEuro=(lines,re)=>{for(const l of lines){if(re.test(l)){const v=lastEuro(l);if(v!=null)return v;}}return null;};
  function sectionEuro(text,startRe,endRe,max=320){
    const s=String(text||''),m=s.match(startRe);if(!m)return null;const start=(m.index||0),tail=s.slice(start,start+max);let seg=tail;
    if(endRe){const j=tail.search(endRe);if(j>0)seg=tail.slice(0,j);}
    return lastEuro(seg);
  }
  const normalizeTariff=s=>{const m=String(s||'').match(/\b(2\.0\s*TD|3\.0\s*TD|6\.[1-4]\s*TD)\b/i);return m?m[1].replace(/\s+/g,'').toUpperCase():'—';};
  const normalizeCups=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const strictCups=s=>{
    const m=String(s||'').match(/(?:CUPS|punto\s+de\s+suministro)[\s\S]{0,120}?\b(ES(?:\s*\d){16}(?:\s*[A-Z]){2}(?:(?:\s*\d)(?:\s*[A-Z]))?)/i)
      ||String(s||'').match(/\bES(?:\s*\d){16}(?:\s*[A-Z]){2}(?:(?:\s*\d)(?:\s*[A-Z]))?(?![A-Z0-9])/i);
    return normalizeCups(m?.[1]||m?.[0]||'');
  };
  const toIso=s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';};
  const MONTHS={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};

  function groupedLines(items,tol=2.2){
    const pts=(items||[]).filter(i=>clean(i?.str)).map(i=>({s:clean(i.str),x:Number(i.transform?.[4]??0),y:Number(i.transform?.[5]??0)})).sort((a,b)=>b.y-a.y||a.x-b.x);
    const groups=[];
    for(const q of pts){let g=groups.find(v=>Math.abs(v.y-q.y)<=tol);if(!g){g={y:q.y,a:[]};groups.push(g);}g.a.push(q);}
    return groups.sort((a,b)=>b.y-a.y).map(g=>clean(g.a.sort((a,b)=>a.x-b.x).map(v=>v.s).join(' '))).filter(Boolean);
  }
  function rawCandidates(d,pageIndex){
    const items=d?.rawPages?.[pageIndex]||[];if(!items.length)return[];
    const seq=clean(items.map(i=>i?.str||'').join(' '));
    return [...new Set([2.2,3.5,5,7].map(t=>groupedLines(items,t).join('\n')).concat(seq).filter(Boolean))];
  }
  function pageSources(d,pageIndex){
    const visual=linesOf(d)[pageIndex]||[],supplied=visual.length?visual.join('\n'):'';
    return [...new Set([supplied,...rawCandidates(d,pageIndex)].filter(Boolean))];
  }
  function fullSources(d){
    if(typeof d==='string')return [String(d)];
    const visual=linesOf(d).flat().join('\n');
    const rawSeq=clean((d?.rawPages||[]).flat().map(i=>i?.str||'').join(' '));
    const rawLines=[2.2,3.5,5,7].map(t=>(d?.rawPages||[]).map(p=>groupedLines(p,t).join('\n')).join('\n'));
    return [...new Set([String(d?.text||''),visual,...rawLines,rawSeq].filter(Boolean))];
  }
  function firstFrom(sources,fn){for(const s of sources){const v=fn(s);if(v!=null&&v!==''&&v!=='—')return v;}return null;}
  function bestBy(sources,fn,score){let best=null,bestScore=-Infinity;for(const s of sources){const v=fn(s);if(v==null)continue;const n=score(v);if(n>bestScore){best=v;bestScore=n;}}return best;}

  function detect(d){
    for(const source of fullSources(d)){
      const s=norm(source).toUpperCase();
      if(/ENDESA ENERGIA|FENIE ENERGIA/.test(s))continue;
      if(/\bIBERDROLA\b/.test(s)&&/\bCLIENTES\b/.test(s)&&/\bFACTURA\b/.test(s)&&(/\bELECTRICIDAD\b/.test(s)||/RESUMEN DE FACTURA/.test(s)))return true;
    }
    return false;
  }

  function recipientName(p1){
    const all=p1.map(clean).filter(Boolean),nameRe=/^[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*(?:\s+[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*){1,9}$/,banned=/IBERDROLA|CLIENTES|REMIT|FACTURA|ELECTRICIDAD|CONTRATO|EMPRESA|RESPONSABLE|SOSTENIBLE|DIGITALES/i,contract=all.findIndex(x=>/^CONTRATO$/i.test(x)),prefix=contract>=0?all.slice(0,contract):all.slice(0,25),addressRe=/^(?:C\/|CL\b|CALLE\b|CARRER\b|AV\b|AVDA\b|PASEO\b|PLAZA\b|CTRA\b)/i;
    for(let i=0;i<prefix.length;i++){if(!addressRe.test(prefix[i]))continue;for(let j=i-1;j>=Math.max(0,i-3);j--){const q=prefix[j];if(nameRe.test(q)&&!banned.test(q))return q;}}
    if(contract>=0){for(let i=contract+1;i<Math.min(all.length,contract+9);i++){const q=all[i];if(nameRe.test(q)&&!banned.test(q)){const next=all[i+1]||'';return /^[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]{2,20}$/.test(next)&&!banned.test(next)?clean(q+' '+next):q;}}}
    return'';
  }
  function contractHolder(p1){
    const text=p1.join('\n'),m=text.match(/\bCONTRATO\b[\s\S]{0,650}?\bTitular\b\s*(?:Potencia\s*:)?\s*\n?([A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*(?:\s+[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*){1,9})(?=\s+Potencia|\nDirecci[oó]n\s+de\s+suministro|\n[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ]+\nDirecci[oó]n)/i);
    return clean(m?.[1]||'');
  }
  function recipientFromText(text){
    const prefix=String(text||'').split(/\bCONTRATO\b/i)[0].replace(/\r?\n/g,' ');
    const nameToken="[A-ZÁÉÍÓÚÜÑÇÀÈÒÏ][A-ZÁÉÍÓÚÜÑÇÀÈÒÏ'&/.-]*";
    const re=new RegExp(`(${nameToken}(?:\\s+${nameToken}){1,9})\\s+(?=(?:C\\/|CL\\b|CALLE\\b|CARRER\\b|AV\\b|AVDA\\b|PASEO\\b|PLAZA\\b|CTRA\\b))`,'g');
    const banned=/IBERDROLA|CLIENTES|REMIT|FACTURA|ELECTRICIDAD|EMPRESA|RESPONSABLE|SOSTENIBLE|DIGITALES|APARTADO|MADRID|BILBAO/i;
    const found=[...prefix.matchAll(re)].map(m=>clean(m[1]).replace(/^(?:S\.?A\.?U\.?|S\.?L\.?U\.?)\s+/i,'')).filter(v=>!banned.test(v));
    return found.length?found.at(-1):'';
  }
  function companyFromSources(sources){return firstFrom(sources,s=>recipientFromText(s))||'Por identificar';}

  function supplyAddress(p1){
    const text=p1.join('\n'),m=text.match(/Direcci[oó]n\s+de\s+suministro\s*:\s*\n?([\s\S]{1,260}?)(?=\nN[º°o.]?\s*DE\s*CONTRATO|\nRESUMEN\s+DE\s+FACTURA)/i);
    return clean((m?.[1]||'').replace(/\n/g,' '));
  }
  function splitPlace(address){
    const m=clean(address).match(/\b\d{5}\s+(.+?)(?:\s*\(([^()]*)\))?$/i);
    return m?{city:clean(m[1]).replace(/\s*\([^)]*\)$/,''),province:clean(m[2]||'')}:{city:'',province:''};
  }
  function periodData(text){
    const s=String(text||''),header=s.match(/PERIODO\s+DE\s+FACTURACI[ÓO]N\s*:[\s\S]{0,600}?(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i),fallback=s.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/),m=header||fallback;
    if(!m)return null;
    const dm=s.match(/D[IÍ]AS\s+FACTURADOS\s*:[\s\S]{0,260}?\b(\d{1,3})\b/i);let days=dm?Number(dm[1]):null;
    if(days==null){const a=new Date(`${toIso(m[1])}T00:00:00Z`),b=new Date(`${toIso(m[2])}T00:00:00Z`);if(Number.isFinite(a.getTime())&&Number.isFinite(b.getTime()))days=Math.round((b-a)/86400000);}
    return{label:`${m[1]} - ${m[2]}${days!=null?` (${days} días)`:''}`,start:toIso(m[1]),end:toIso(m[2]),days};
  }
  function issueDate(text){
    const m=String(text).match(/FECHA\s+DE\s+EMISI[ÓO]N\s*:[\s\S]{0,160}?(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
    if(!m)return'';return `${m[3]}-${MONTHS[m[2].toLowerCase()]||''}-${String(m[1]).padStart(2,'0')}`;
  }
  function labelledNumber(text,re,min=6,max=22){
    const m=String(text).match(re);if(!m)return'';const tail=String(text).slice((m.index||0)+m[0].length,(m.index||0)+m[0].length+300),n=tail.match(new RegExp(`\\b(\\d{${min},${max}})\\b`));return n?n[1]:'';
  }

  function powerDetails(text,tariff){
    const s=String(text||''),expected=/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0,start=s.search(/Potencia\s+facturada\b/i);if(start<0)return null;
    const tail=s.slice(start),tm=tail.match(/Total\s+importe\s+potencia[\s\S]{0,180}?(-?[\d.]+,\d{2})\s*€/i),end=tm?(tm.index||0)+tm[0].length:Math.min(tail.length,2600),scope=tail.slice(0,end),entries=[],contracted={};
    const specs=expected===2?[[1,'Punta'],[2,'Valle']]:Array.from({length:expected},(_,i)=>[i+1,`P${i+1}`]);
    for(const [period,label] of specs){
      const re=new RegExp(`(?:Potencia\\s+facturada[\\s\\S]{0,80}?)?\\b${label}\\b[\\s\\S]{0,140}?([\\d.,]+)\\s*kW[\\s\\S]{0,120}?(\\d+)\\s*d[ií]as?[\\s\\S]{0,160}?([\\d.,]+)\\s*€\\s*\\/\\s*kW\\s*d[ií]a[\\s\\S]{0,100}?(-?[\\d.]+,\\d{2})\\s*€`,'i');
      const m=scope.match(re);if(m){const e={period,contractedKw:num(m[1]),days:Number(m[2]),price:num(m[3]),amount:num(m[4])};entries.push(e);contracted[`P${period}`]=e.contractedKw;}
    }
    entries.sort((a,b)=>a.period-b.period);const printedTotal=tm?num(tm[1]):null,sum=round2(entries.reduce((x,e)=>x+Number(e.amount||0),0)),reliable=expected>0&&entries.length===expected&&printedTotal!=null&&Math.abs(sum-printedTotal)<=.05;
    return{value:printedTotal??sum,sum,printedTotal,entries,contracted,reliable,message:reliable?'':entries.length!==expected?'Potencia: faltan periodos facturados':'Potencia: subtotal no cuadra con el detalle'};
  }
  const powerScore=p=>p?(p.reliable?1000:0)+(p.entries?.length||0)*10+(p.printedTotal!=null?1:0):-1;

  function activeReadings(text){const out={};for(let p=1;p<=6;p++){const m=String(text||'').match(new RegExp(`Energ[ií]a\\s+activa\\s+P${p}[\\s\\S]{0,180}?(-?[\\d.]+(?:,\\d+)?)\\s*kWh\\b`,'i'));if(m)out[`P${p}`]=num(m[1]);}return out;}
  function mergeMaps(...maps){const out={};for(const m of maps)for(const [k,v] of Object.entries(m||{}))if(v!=null&&out[k]==null)out[k]=v;return out;}
  function twoZeroBreakdown(text){const s=String(text||'').replace(/\s+/g,' '),m=s.match(/consumos\s+desagregados[\s\S]{0,120}?punta\s*:\s*([\d.]+(?:,\d+)?)\s*kWh[\s\S]{0,100}?llano\s*:\s*([\d.]+(?:,\d+)?)\s*kWh[\s\S]{0,100}?valle\s*:?\s*([\d.]+(?:,\d+)?)\s*kWh/i);return m?{P1:num(m[1]),P2:num(m[2]),P3:num(m[3])}:{};}
  function energyDetails(text,tariff,globalActive={}){
    const s=String(text||''),periods={};
    if(/^2\.0TD$/i.test(tariff)){
      const start=s.search(/Energ[ií]a\s+consumida\b/i),scope=start>=0?s.slice(start,start+1200):s;
      const km=(scope.match(/([\d.]+(?:,\d+)?)\s*kWh\b/i)||[])[1],rate=(scope.match(/([\d.,]+)\s*€\s*\/\s*kWh/i)||[])[1],vals=euroValues(scope.slice(0,600)),energy=vals.length?vals[0]:null,breakdown=twoZeroBreakdown(s),kwh=km?num(km):(Object.keys(breakdown).length===3?round2(Object.values(breakdown).reduce((x,v)=>x+Number(v||0),0)):null),price=rate?num(rate):null;
      for(let p=1;p<=3;p++)if(breakdown[`P${p}`]!=null)periods[`P${p}`]={consumption:breakdown[`P${p}`],cost:null,price};
      const sumKwh=round2(Object.values(periods).reduce((x,q)=>x+Number(q.consumption||0),0)),calc=kwh!=null&&price!=null?round2(kwh*price):null,costReliable=energy!=null&&calc!=null&&Math.abs(calc-energy)<=.02;
      return{kwh,energy,periods,activeReadings:globalActive,consumptionReliable:kwh!=null&&Object.keys(periods).length===3&&Math.abs(sumKwh-kwh)<=.1,costReliable,pricingMode:'single_rate'};
    }
    const start=s.search(/Energ[ií]a\s+consumida\b/i);if(start<0)return null;const tail=s.slice(start),tm=tail.match(/Total\s+([\d.]+(?:,\d+)?)\s*kWh[\s\S]{0,180}?([\d.]+,\d{2})\s*€/i);if(!tm)return null;const scope=tail.slice(0,(tm.index||0)+tm[0].length),kwh=num(tm[1]),energy=num(tm[2]);
    for(let p=1;p<=6;p++){const m=scope.match(new RegExp(`(?:Energ[ií]a\\s+consumida[\\s\\S]{0,100}?)?\\bP${p}\\b[\\s\\S]{0,120}?([\\d.]+(?:,\\d+)?)\\s*kWh[\\s\\S]{0,120}?([\\d.,]+)\\s*€\\s*\\/\\s*kWh[\\s\\S]{0,100}?([\\d.]+,\\d{2})\\s*€`,'i'));if(m)periods[`P${p}`]={consumption:num(m[1]),price:num(m[2]),cost:num(m[3])};}
    for(let p=1;p<=6;p++){const k=`P${p}`;if(!periods[k]&&globalActive[k]===0)periods[k]={consumption:0,cost:0,price:null};}
    let sumKwh=round2(Object.values(periods).reduce((x,q)=>x+Number(q.consumption||0),0)),sumCost=round2(Object.values(periods).reduce((x,q)=>x+Number(q.cost||0),0));const missing=[];for(let p=1;p<=6;p++)if(!periods[`P${p}`])missing.push(`P${p}`);
    if(missing.length===1&&Math.abs(sumKwh-kwh)<=.1&&Math.abs(sumCost-energy)<=.05){periods[missing[0]]={consumption:0,cost:0,price:null};sumKwh=round2(Object.values(periods).reduce((x,q)=>x+Number(q.consumption||0),0));sumCost=round2(Object.values(periods).reduce((x,q)=>x+Number(q.cost||0),0));}
    return{kwh,energy,periods,activeReadings:globalActive,consumptionReliable:Object.keys(periods).length===6&&Math.abs(sumKwh-kwh)<=.1,costReliable:Object.keys(periods).length===6&&Math.abs(sumCost-energy)<=.05,pricingMode:'periods'};
  }
  const energyScore=e=>e?(e.consumptionReliable?1000:0)+(e.costReliable?500:0)+Object.keys(e.periods||{}).length*10+(e.kwh!=null?3:0)+(e.energy!=null?2:0):-1;

  function maximeters(text){
    const out={};for(let p=1;p<=6;p++){
      const re=new RegExp(`Max[ií]metro\\s+P${p}[\\s\\S]{0,120}?(-?[\\d.]+(?:,\\d+)?)\\s*kW\\b`,'i'),m=String(text).match(re);if(m)out[`P${p}`]=num(m[1]);
    }if(Object.keys(out).length===6)out._reliable=true;return out;
  }
  function annualDemand(text){const m=String(text).match(/potencias\s+m[aá]ximas\s+demandadas[\s\S]{0,220}?([\d.,]+)\s*kW\s+en\s+P1[\s\S]{0,100}?([\d.,]+)\s*kW\s+en\s+P2/i);return m?{P1:num(m[1]),P2:num(m[2]),_source:'annual_max_demand'}:{};}
  function reactiveMap(text,label){const out={};for(let p=1;p<=6;p++){const re=new RegExp(`${label}\\s+P${p}[\\s\\S]{0,120}?(-?[\\d.]+(?:,\\d+)?)\\s*kVArh\\b`,'i'),m=String(text).match(re);if(m)out[`P${p}`]=num(m[1]);}return out;}

  function nearAmount(text,re,max=220){const s=String(text||''),m=s.match(re);if(!m)return null;return lastEuro(s.slice(m.index,(m.index||0)+max));}
  function summaryAmount(sources,re){for(const s of sources){for(const line of String(s).split(/\r?\n/)){if(re.test(clean(line))){const v=lastEuro(line);if(v!=null)return v;}}}return null;}
  function socialAmount(sources){for(const s of sources){const start=s.search(/Financiaci[oó]n\s+bono\s+social/i);if(start<0)continue;const tail=s.slice(start,start+1000),stop=tail.search(/Impuesto\s+sobre\s+electricidad|TOTAL\s+ENERG[IÍ]A/i),seg=stop>0?tail.slice(0,stop):tail,vals=euroValues(seg);if(vals.length)return round2(vals.reduce((a,b)=>a+b,0));}return null;}
  function totalFromSources(p1Sources,detailSources){return summaryAmount(p1Sources,/^TOTAL\b/i)??firstFrom(detailSources,s=>nearAmount(s,/TOTAL\s+IMPORTE\s+FACTURA/i,160));}
  function taxFromSources(detailSources,summaryEnergy,power,energy){const direct=firstFrom(detailSources,s=>nearAmount(s,/Impuesto\s+sobre\s+electricidad/i,180)),derived=summaryEnergy!=null&&power!=null&&energy!=null?round2(summaryEnergy-power-energy):null;if(derived!=null&&derived>=0)return derived;if(direct!=null&&direct>=0)return direct;return 0;}
  function contractedFromSources(sources,tariff,powerDetail){const out={...(powerDetail?.contracted||{})};for(const s of sources){const m=s.match(/Potencia\s+contratada\s*\(kW\)\s*:\s*([^\n]{1,160})/i);if(m){const vals=[...m[1].matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)].map(x=>num(x[1])).slice(0,6);if(vals.length){vals.forEach((v,i)=>out[`P${i+1}`]=v);break;}}}if(/^2\.0TD$/i.test(tariff)){for(const s of sources){const p=s.match(/Potencia\s+punta\s*:\s*([\d.,]+)\s*kW/i),v=s.match(/Potencia\s+valle\s*:\s*([\d.,]+)\s*kW/i);if(out.P1==null&&p)out.P1=num(p[1]);if(out.P2==null&&v)out.P2=num(v[1]);}}return out;}
  function maxMapFromSources(sources,label,unit){const out={};for(const s of sources){for(let p=1;p<=6;p++){if(out[`P${p}`]!=null)continue;const m=s.match(new RegExp(`${label}\\s+P${p}[\\s\\S]{0,160}?(-?[\\d.]+(?:,\\d+)?)\\s*${unit}\\b`,'i'));if(m)out[`P${p}`]=num(m[1]);}}return out;}
  function annualDemandSources(sources){for(const s of sources){const m=s.match(/potencias\s+m[aá]ximas\s+demandadas[\s\S]{0,260}?([\d.,]+)\s*kW\s+en\s+P1[\s\S]{0,140}?([\d.,]+)\s*kW\s+en\s+P2/i);if(m)return{P1:num(m[1]),P2:num(m[2]),_source:'annual_max_demand'};}return{};}
  function firstMatch(sources,re,group=1){for(const s of sources){const m=s.match(re);if(m)return clean(m[group]||'');}return'';}

  function parse(d,file,options={}){
    if(!detect(d))return null;
    const p1Sources=pageSources(d,0),p2Sources=pageSources(d,1),p3Sources=pageSources(d,2),allSources=fullSources(d);
    const tariff=firstFrom(allSources,normalizeTariff)||'—',period=firstFrom(p1Sources,periodData)||{label:'Por identificar',start:'',end:'',days:null},company=companyFromSources(p1Sources),address=firstFrom(p1Sources,s=>{const m=String(s).match(/Direcci[oó]n\s+de\s+suministro\s*:\s*([\s\S]{1,320}?)(?=N[º°o.]?\s*DE\s*CONTRATO|RESUMEN\s+DE\s+FACTURA)/i);return m?clean(m[1].replace(/\r?\n/g,' ')):'';})||'',place=splitPlace(address),cups=firstFrom(allSources,s=>strictCups(s))||'',invoiceNumber=firstFrom(p1Sources,s=>labelledNumber(s,/N[º°o.]?\s*FACTURA\s*:/i,10,22))||'Por identificar',contract=firstFrom(p1Sources,s=>labelledNumber(s,/N[º°o.]?\s*DE\s*CONTRATO\s*:/i,6,20))||'';
    const powerDetail=bestBy([...p2Sources,...allSources],s=>powerDetails(s,tariff),powerScore)||{value:null,sum:0,printedTotal:null,entries:[],contracted:{},reliable:false,message:'Potencia: no localizada'};
    const active=mergeMaps(...[...p2Sources,...p3Sources,...allSources].map(activeReadings));
    const energyDetail=bestBy([...p2Sources,...allSources],s=>energyDetails(s,tariff,active),energyScore)||{kwh:null,energy:null,periods:{},activeReadings:active,consumptionReliable:false,costReliable:false,pricingMode:'unknown'};

    const summaryEnergy=summaryAmount(p1Sources,/^ENERG[IÍ]A\b/i),summaryDiscount=summaryAmount(p1Sources,/DESCUENTOS\s+ENERG[IÍ]A/i),summaryNormative=summaryAmount(p1Sources,/CARGOS\s+NORMATIVOS/i),summaryServices=summaryAmount(p1Sources,/SERVICIOS\s+Y\s+OTROS\s+CONCEPTOS/i),vat=summaryAmount(p1Sources,/^IVA\b/i)??firstFrom(p2Sources,s=>nearAmount(s,/^IVA(?:\s|\()/mi,180))??0,total=totalFromSources(p1Sources,p2Sources);
    const discounts=summaryDiscount??firstFrom(p2Sources,s=>nearAmount(s,/Descuento\s+sobre\s+consumo/i,180))??0,social=summaryNormative??socialAmount(p2Sources)??0,rental=summaryServices??firstFrom(p2Sources,s=>nearAmount(s,/Alquiler\s+equipos?\s+medida/i,180))??0,power=powerDetail.value,energy=energyDetail.energy,tax=taxFromSources(p2Sources,summaryEnergy,power,energy),other=round2(Number(discounts||0)+Number(social||0)+Number(rental||0));
    const accounted=round2(Number(energy||0)+Number(power||0)+other+Number(tax||0)+Number(vat||0)),diff=total==null?null:round2(Number(total)-accounted),balanced=total!=null&&Math.abs(diff)<=.05,contracted=contractedFromSources(allSources,tariff,powerDetail);

    const missing=[];if(company==='Por identificar')missing.push('titular');if(!cups)missing.push('CUPS');if(period.label==='Por identificar')missing.push('periodo');if(tariff==='—')missing.push('tarifa');if(total==null)missing.push('total');if(!powerDetail.reliable)missing.push(powerDetail.message||'potencia');if(!energyDetail.consumptionReliable)missing.push('consumo por periodos no cuadra con el consumo total');if(!energyDetail.costReliable)missing.push('coste de energía no cuadra con el detalle facturado');
    const expectedPower=/^2\.0TD$/i.test(tariff)?2:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;if(expectedPower&&Object.keys(contracted).filter(k=>/^P\d$/.test(k)&&contracted[k]!=null).length<expectedPower)missing.push('potencias contratadas');

    const joined=allSources.join('\n'),readingActual=/[ÚU]ltima\s+lectura\s*:\s*real/i.test(joined)||/siendo[\s\S]{0,120}?lecturas[\s\S]{0,60}?reales/i.test(joined),readingEstimated=/[ÚU]ltima\s+lectura\s*:\s*estimada/i.test(joined),reading=readingActual?{status:'actual',sourceLabel:'Lectura real indicada por Iberdrola'}:readingEstimated?{status:'estimated',sourceLabel:'Última lectura: estimada'}:(options.readingClassifier?.(joined)||{status:'unknown',sourceLabel:''});
    const mx=maxMapFromSources([...p2Sources,...p3Sources,...allSources],'Max[ií]metro','kW');if(Object.keys(mx).length===6)mx._reliable=true;const annual=annualDemandSources(allSources),alerts=[];
    if(mx._reliable){const ks=Object.keys(mx).filter(k=>/^P\d$/.test(k)&&(contracted[k]||0)>0);if(ks.length){const mc=Math.max(...ks.map(k=>contracted[k])),md=Math.max(...ks.map(k=>mx[k])),ratio=mc?md/mc:1;if(mc>=10&&ratio<=.5)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}}else if(annual.P1!=null&&contracted.P1){const mc=Math.max(contracted.P1||0,contracted.P2||0),md=Math.max(annual.P1||0,annual.P2||0),ratio=mc?md/mc:1;if(mc>=5&&ratio<=.7)alerts.push(`Posible potencia sobredimensionada: ${money(mc)} kW contratados / demanda máx. anual ${money(md)} kW (${Math.round(ratio*100)}%). Validar con histórico`);}

    const readOk=balanced&&!missing.length,distributor=firstMatch(allSources,/Empresa\s+distribuidora\s*:\s*([^\n]{2,180})/i),accessContract=firstFrom(allSources,s=>labelledNumber(s,/N[uú]mero\s+de\s+contrato\s+de\s+acceso\s*:/i,6,20))||'',renewalDate=firstMatch(allSources,/Fecha\s+final\s+del\s+contrato\s*:\s*(\d{2}\/\d{2}\/\d{4})/i),permanence=firstMatch(allSources,/Permanencia\s*:\s*([^\n]+)/i),meterNumber=firstMatch(allSources,/N[º°o.]?\s*contador\s*:\s*(\d{5,20})/i),taxId=firstMatch(allSources,/NIF\s+titular\s+del\s+contrato\s*:\s*([A-Z0-9-]+)/i),issueDate=firstFrom(p1Sources,issueDate)||'';
    const reactivePeriods=maxMapFromSources([...p2Sources,...p3Sources,...allSources],'Energ[ií]a\\s+reactiva','kVArh'),capacitivePeriods=maxMapFromSources([...p2Sources,...p3Sources,...allSources],'Energ[ií]a\\s+capacitiva','kVArh');
    return{file:file?.name||'',invoiceNumber,company,taxId,cups,period:period.label,tariff,kwh:energyDetail.kwh,energy,power,excess:0,reactive:0,compensation:0,social,rental,integratorAdjustment:0,regularizationReactive:0,other,tax,vat,igic:0,distributorCharges:0,distributorDescription:'',total,accounted,diff,balanced,readOk,readMessage:missing.length?`Falta o revisar: ${missing.join(', ')}`:balanced?'Lectura correcta':`Descuadre: ${money(diff)} €`,readingStatus:reading.status||'unknown',readingSourceLabel:reading.sourceLabel||'',avg:energyDetail.kwh&&total!=null?total/energyDetail.kwh:0,opportunity:alerts.length?alerts.join(' · '):'Sin alertas',periods:energyDetail.periods,contracted,maximeters:mx,maxDemandAnnual:annual,parserVersion:options.parserVersion||'',parserRevision:REVISION,powerDetail,energyPricingMode:energyDetail.pricingMode,sourceFormat:'iberdrola',supplier:'IBERDROLA CLIENTES, S.A.U.',retailer:'IBERDROLA CLIENTES, S.A.U.',commercializer:'IBERDROLA CLIENTES, S.A.U.',supplyAddress:address,supplyCity:place.city,supplyProvince:place.province,contract,contractNumber:contract,accessContract,distributor,contractType:'',renewalDate,permanence,meterNumber,issueDate,billingStart:period.start,billingEnd:period.end,billingDays:period.days,discounts,reactivePeriods,capacitivePeriods,activeReadings:energyDetail.activeReadings};
  }

  return Object.freeze({detect,parse,revision:REVISION,_test:{groupedLines,pageSources,fullSources,energyDetails,powerDetails,recipientName,recipientFromText,periodData,taxFromSources}});
});
