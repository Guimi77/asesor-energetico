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
