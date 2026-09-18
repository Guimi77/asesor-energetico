(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTIberdrolaParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REVISION='2026.09.18.2';
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
