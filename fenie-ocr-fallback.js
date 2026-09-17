(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTFenieOcrFallback=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const OCR_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const ocrCache=new WeakMap();
  let scriptPromise=null;

  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const pageText=p=>text((p||[]).join(' '));
  const allText=d=>text((d?.pages||[]).flat().join(' '));
  const laterText=d=>text((d?.pages||[]).slice(1).flat().join(' '));

  function isSparseFirstPage(data){
    const first=pageText(data?.pages?.[0]);
    return first.length<=120;
  }

  function isEndesa(value){
    const s=String(value||'');
    return /Endesa\s+Energ[ií]a/i.test(s)||/\bP\d{2}CON\d{6,}\b/i.test(s);
  }

  function fenieEvidence(value){
    const s=String(value||'');
    const cups=/\bCUPS\s*:?\s*ES[A-Z0-9]{16,24}\b/i.test(s);
    const tariff=/\b(?:2\.0TD|3\.0TD|6\.[1-4]TD)\b/i.test(s);
    const named=/FENIE\s+ENERG[IÍ]A/i.test(s);
    const distributor=/Empresa\s+Distribuidora\s*:/i.test(s);
    const maximeter=/Max[ií]metro\s*\(\s*kW\s*\)/i.test(s);
    const access=/Contrato\s+Acceso\s*:/i.test(s);
    const address=/(?:Dir\.?\s*Suministro|Direcci[oó]n\s+(?:de\s+)?suministro)\s*:/i.test(s);
    const readings=/\b(?:1\.18\.[1-6]|Lectura|Consumo)\b/i.test(s);
    let score=0;
    if(named)score+=4;
    if(distributor)score+=2;
    if(maximeter)score+=2;
    if(access)score+=1;
    if(address)score+=1;
    if(readings)score+=1;
    return {cups,tariff,named,distributor,maximeter,access,address,readings,score};
  }

  function shouldAttempt(data){
    if(!data?.pages?.length||!isSparseFirstPage(data))return false;
    const first=pageText(data?.pages?.[0]),complete=allText(data),later=laterText(data);
    if(/FENIE\s+ENERG[IÍ]A/i.test(first)||(/Raz[oó]n\s+Social\s*:/i.test(first)&&/Periodo\s+Facturaci[oó]n\s*:/i.test(first)&&/TOTAL\s+FACTURA/i.test(first)))return false;
    if(isEndesa(complete))return false;
    const ev=fenieEvidence(later);
    if(!ev.cups||!ev.tariff)return false;
    const strong=ev.named||(ev.distributor&&ev.maximeter);
    return strong&&ev.score>=4;
  }

  function mergeOcrText(data,ocrText){
    const lines=String(ocrText||'').split(/\r?\n/).map(v=>text(v)).filter(Boolean);
    const pages=(data?.pages||[]).map(p=>Array.isArray(p)?p.slice():[]);
    if(!pages.length)pages.push([]);
    pages[0]=lines;
    const out={...data,pages,text:pages.flat().join('\n')};
    if(Array.isArray(data?.rawPages))out.rawPages=data.rawPages;
    if(Array.isArray(data?.raw))out.raw=data.raw;
    return out;
  }

  function validPeriod(value){
    return value&&value!=='Por identificar'&&(String(value).match(/\b\d{2}\/\d{2}\/\d{4}\b/g)||[]).length>=2;
  }

  function criticalReason(row){
    const missing=[];
    const holder=text(row?.company);
    if(!holder||/^Por identificar$/i.test(holder))missing.push('titular');
    if(!/^ES[A-Z0-9]{16,24}$/i.test(text(row?.cups)))missing.push('CUPS');
    if(!validPeriod(row?.period))missing.push('periodo');
    if(!(Number(row?.total)>0))missing.push('total');
    if(row?.balanced!==true)missing.push('cuadre económico');
    return missing.join(', ');
  }

  function criticalRowOk(row){return criticalReason(row)==='';}

  function loadTesseract(){
    if(root?.Tesseract?.recognize)return Promise.resolve(root.Tesseract);
    if(typeof document==='undefined')return Promise.reject(new Error('Tesseract no está disponible en este entorno'));
    if(scriptPromise)return scriptPromise;
    scriptPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector(`script[src="${OCR_SCRIPT}"]`);
      const done=()=>root?.Tesseract?.recognize?resolve(root.Tesseract):reject(new Error('Tesseract no se ha inicializado'));
      if(existing){existing.addEventListener('load',done,{once:true});existing.addEventListener('error',()=>reject(new Error('No se pudo cargar Tesseract')),{once:true});return;}
      const script=document.createElement('script');script.src=OCR_SCRIPT;script.async=true;script.crossOrigin='anonymous';
      script.onload=done;script.onerror=()=>reject(new Error('No se pudo cargar Tesseract'));document.head.appendChild(script);
    });
    return scriptPromise;
  }

  async function ocrFirstPage(file,pdfjsLib){
    if(!file||!pdfjsLib?.getDocument)throw new Error('No hay PDF disponible para OCR');
    const task=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});
    try{
      const pdf=await task.promise,page=await pdf.getPage(1),base=page.getViewport({scale:1});
      const scale=Math.max(1.5,Math.min(2.5,2400/Math.max(1,base.width))),viewport=page.getViewport({scale});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('No se pudo preparar la imagen para OCR');
      await page.render({canvasContext:ctx,viewport}).promise;
      const Tesseract=await loadTesseract(),result=await Tesseract.recognize(canvas,'spa');
      return String(result?.data?.text||'');
    }finally{
      await task.destroy();
    }
  }

  async function prepare(file,data,pdfjsLib,options={}){
    if(!shouldAttempt(data))return {data,attempted:false,error:null};
    try{
      let promise=ocrCache.get(file);
      if(!promise){
        const runner=typeof options.ocr==='function'?options.ocr:(f=>ocrFirstPage(f,pdfjsLib));
        promise=Promise.resolve().then(()=>runner(file,data));
        if(file&&typeof file==='object')ocrCache.set(file,promise);
      }
      const ocrText=await promise;
      if(!text(ocrText))throw new Error('OCR sin texto utilizable');
      return {data:mergeOcrText(data,ocrText),attempted:true,error:null,ocrText};
    }catch(error){
      return {data,attempted:true,error};
    }
  }

  return Object.freeze({shouldAttempt,isSparseFirstPage,fenieEvidence,mergeOcrText,criticalRowOk,criticalReason,prepare,ocrFirstPage});
});