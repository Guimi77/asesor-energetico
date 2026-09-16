(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTFenieImageFallback=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const FIRST_PAGE_TEXT_LIMIT=120;
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const compact=v=>String(v??'').replace(/\s+/g,'').trim();
  const pageText=page=>(page||[]).map(clean).filter(Boolean).join('\n');
  const joinPages=pages=>(pages||[]).map(pageText).join('\n');
  const cupsFrom=text=>(String(text||'').match(/\bES[A-Z0-9]{18,22}\b/i)||[])[0]||'';
  const tariffFrom=text=>(String(text||'').match(/\b(?:2\.0TD|3\.0TD|6\.[1-4]TD)\b/i)||[])[0]?.toUpperCase()||'';

  function continuationFacts(pages){
    const text=joinPages((pages||[]).slice(1));
    return {text,cups:cupsFrom(text),tariff:tariffFrom(text)};
  }

  function strongContinuationSignature(pages){
    const {text,cups,tariff}=continuationFacts(pages);
    if(!cups||!tariff)return false;
    const headers=[/Raz[oó]n\s+Social\s*:/i,/CUPS\s*:/i,/Contrato\s+Acceso\s*:/i,/Empresa\s+Distribuidora\s*:/i]
      .filter(re=>re.test(text)).length;
    const reading=/Lecturas\s+desde/i.test(text);
    const meter=/Max[ií]metro\s*\(kW\)/i.test(text);
    const fenie=/FENIE\s+ENERG[IÍ]A|fenieenergia\.es|Fenie\s+Energ[ií]a/i.test(text);
    return headers>=3&&reading&&meter&&fenie;
  }

  function needsOcr(pages){
    const first=pageText((pages||[])[0]);
    if(compact(first).length>=FIRST_PAGE_TEXT_LIMIT)return false;
    return strongContinuationSignature(pages);
  }

  function normalizeLabel(line,label){
    const s=clean(line);
    if(!s)return s;
    if(/^[A-Z0-9?¡|]{1,4}\s*:/i.test(s))return s.replace(/^[A-Z0-9?¡|]{1,4}\s*:/i,`${label}:`);
    return `${label}: ${s}`;
  }

  function relabelSection(lines,startRe,endRe,rowRe,maxRows=6){
    const start=lines.findIndex(line=>startRe.test(line));
    if(start<0)return;
    let end=lines.length;
    for(let i=start+1;i<lines.length;i++){
      if(endRe.test(lines[i])){end=i;break;}
    }
    const indexes=[];
    for(let i=start+1;i<end&&indexes.length<maxRows;i++)if(rowRe.test(lines[i]))indexes.push(i);
    indexes.forEach((idx,pos)=>{lines[idx]=normalizeLabel(lines[idx],`P${pos+1}`);});
  }

  function normalizeRecoveredText(rawText,totalText,pages){
    const facts=continuationFacts(pages);
    const lines=String(rawText||'').split(/\r?\n/).map(clean).filter(Boolean).map(line=>line
      .replace(/\bC[uU]{1,2}PS\s*:/i,'CUPS:')
      .replace(/Factura\s+N\s*[2º°o.]\s*:/i,'Nº Factura:')
      .replace(/N\s*[?2º°o.]\s+de\s+Contrato\s*:/i,'Nº de Contrato:')
      .replace(/\bkwWh\b/gi,'kWh')
      .replace(/\bkvArh\b/gi,'kVArh')
    );

    if(facts.cups){
      const idx=lines.findIndex(line=>/^CUPS\s*:/i.test(line));
      if(idx>=0)lines[idx]=`CUPS: ${facts.cups}`;
      else lines.unshift(`CUPS: ${facts.cups}`);
    }
    if(facts.tariff){
      const idx=lines.findIndex(line=>/Tarifa\s*:/i.test(line));
      if(idx>=0)lines[idx]=lines[idx].replace(/Tarifa\s*:\s*\S+/i,`Tarifa: ${facts.tariff}`);
      else lines.unshift(`Tarifa: ${facts.tariff}`);
    }

    relabelSection(lines,/T[eé]rmino\s+(?:de\s+)?energ[ií]a(?:\s+variable)?/i,/T[eé]rmino\s+de\s+potencia/i,/€\s*\/\s*kWh/i,6);
    relabelSection(lines,/T[eé]rmino\s+de\s+potencia/i,/Excesos?\s+de\s+Potencia/i,/€\s*\/\s*kW\s*d[ií]a/i,6);
    relabelSection(lines,/Excesos?\s+de\s+Potencia/i,/Energ[ií]a\s+reactiva/i,/\bx\b.*\d[\d.,]*\s*(?:€|$)/i,6);
    relabelSection(lines,/Energ[ií]a\s+reactiva/i,/(?:Ajuste\s+por\s+Integrador|Bono\s+social|Impuesto\s+electricidad)/i,/kVArh/i,6);

    const totalCandidate=String(totalText||'').match(/TOTAL\s+FACTURA\s*:\s*([\d.]+,\d{2})\s*€/i);
    if(!lines.some(line=>/TOTAL\s+FACTURA/i.test(line))&&totalCandidate){
      lines.push(`TOTAL FACTURA: ${totalCandidate[1]} €`);
    }
    return lines;
  }

  function criticalShape(lines,pages){
    const text=(lines||[]).join('\n');
    const facts=continuationFacts(pages);
    return Boolean(
      facts.cups&&facts.tariff&&
      /Raz[oó]n\s+Social\s*:/i.test(text)&&
      /N[º°o.]?\s*Factura\s*:\s*[A-Z0-9]/i.test(text)&&
      /Periodo\s+Facturaci[oó]n\s*:\s*\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/i.test(text)&&
      /T[eé]rmino\s+(?:de\s+)?energ[ií]a/i.test(text)&&
      /T[eé]rmino\s+de\s+potencia/i.test(text)&&
      /TOTAL\s+FACTURA\s*:\s*[\d.]+,\d{2}\s*€/i.test(text)
    );
  }

  function loadTesseract(){
    if(root.Tesseract?.createWorker)return Promise.resolve(root.Tesseract);
    if(root.__ibtTesseractPromise)return root.__ibtTesseractPromise;
    root.__ibtTesseractPromise=new Promise((resolve,reject)=>{
      if(!root.document){reject(new Error('document_unavailable'));return;}
      const existing=root.document.querySelector('script[data-ibt-tesseract]');
      if(existing){
        existing.addEventListener('load',()=>resolve(root.Tesseract),{once:true});
        existing.addEventListener('error',()=>reject(new Error('tesseract_load_failed')),{once:true});
        return;
      }
      const script=root.document.createElement('script');
      script.src=TESSERACT_URL;
      script.async=true;
      script.crossOrigin='anonymous';
      script.dataset.ibtTesseract='1';
      script.onload=()=>root.Tesseract?.createWorker?resolve(root.Tesseract):reject(new Error('tesseract_unavailable'));
      script.onerror=()=>reject(new Error('tesseract_load_failed'));
      root.document.head.appendChild(script);
    });
    return root.__ibtTesseractPromise;
  }

  function thresholdCrop(source){
    const canvas=root.document.createElement('canvas');
    const sx=Math.round(source.width*.40),sy=Math.round(source.height*.685);
    const sw=Math.round(source.width*.59),sh=Math.round(source.height*.105);
    canvas.width=sw;canvas.height=sh;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(source,sx,sy,sw,sh,0,0,sw,sh);
    const image=ctx.getImageData(0,0,sw,sh),data=image.data;
    for(let i=0;i<data.length;i+=4){
      const lum=.299*data[i]+.587*data[i+1]+.114*data[i+2];
      const v=lum>165?255:0;data[i]=v;data[i+1]=v;data[i+2]=v;
    }
    ctx.putImageData(image,0,0);
    return canvas;
  }

  async function recoverFirstPage(pdfPage,pages){
    if(!needsOcr(pages))return {ok:false,reason:'not_needed'};
    if(!root.document)return {ok:false,reason:'document_unavailable'};
    let worker=null,canvas=null,totalCanvas=null;
    try{
      const Tesseract=await loadTesseract();
      const base=pdfPage.getViewport({scale:1});
      const scale=Math.min(4,2350/Math.max(1,base.width));
      const viewport=pdfPage.getViewport({scale});
      canvas=root.document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport}).promise;

      worker=await Tesseract.createWorker('spa');
      if(worker.setParameters)await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
      const full=await worker.recognize(canvas);
      totalCanvas=thresholdCrop(canvas);
      const total=await worker.recognize(totalCanvas);
      const normalized=normalizeRecoveredText(full?.data?.text||'',total?.data?.text||'',pages);
      if(!criticalShape(normalized,pages))return {ok:false,reason:'critical_fields_missing'};
      return {ok:true,lines:normalized,source:'local_ocr_first_page'};
    }catch(error){
      console.warn('No se pudo recuperar localmente la primera página FENIE',error);
      return {ok:false,reason:'ocr_failed'};
    }finally{
      try{await worker?.terminate?.();}catch(_error){}
      if(canvas){canvas.width=1;canvas.height=1;}
      if(totalCanvas){totalCanvas.width=1;totalCanvas.height=1;}
    }
  }

  return {
    __v1:true,
    needsOcr,
    strongContinuationSignature,
    continuationFacts,
    normalizeRecoveredText,
    criticalShape,
    recoverFirstPage,
  };
});