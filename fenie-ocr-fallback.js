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
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const euroValues=value=>[...String(value||'').matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map(m=>Number(m[1].replace(/\./g,'').replace(',','.'))||0);
  const euroText=n=>round2(n).toFixed(2).replace('.',',');

  function invoiceFromFilename(fileName){
    const m=String(fileName||'').match(/(?:^|FRA[\s_-]+)(20\d{11})(?=[^0-9]|$)/i);
    return m?.[1]||'';
  }

  function normalizeInvoiceNumber(value,fileName){
    const invoice=invoiceFromFilename(fileName);
    if(!invoice)return String(value||'');
    const pattern=/((?:N[º°o.]?\s*Factura|N[uú]mero\s+(?:de\s+)?Factura|Factura\s+n[º°o.]?)\s*:?\s*)([A-Z0-9][A-Z0-9._\/-]*)/i;
    const source=String(value||'');
    return pattern.test(source)?source.replace(pattern,`$1${invoice}`):`Factura Nº: ${invoice}\n${source}`;
  }

  function repairExcessRows(input){
    const lines=(input||[]).slice();
    const start=lines.findIndex(line=>/Excesos? de Potencia/i.test(line));
    if(start<0)return lines;
    let end=lines.length;
    for(let i=start+1;i<lines.length;i++)if(/Energ[ií]a reactiva|Bono social|Impuesto electricidad/i.test(lines[i])){end=i;break}
    const period=/^\s*P([1-6]):?\b/i;
    const periodRows=[];
    let sum=0;
    for(let i=start;i<end;i++){
      const m=lines[i].match(period);
      if(!m)continue;
      const p=Number(m[1]),values=euroValues(lines[i]);
      periodRows.push({index:i,p,values});
      if(values.length)sum+=p===1&&values.length>=2?values.at(-2):values.at(-1);
    }
    sum=round2(sum);
    if(!periodRows.length)return lines;
    const printedValues=lines.slice(start,end).flatMap(euroValues).filter(v=>v>=0);
    if(!printedValues.length)return lines;
    const printed=round2(Math.max(...printedValues));
    const delta=round2(printed-sum);
    if(delta<=0.005)return lines;

    let target=-1;
    for(let i=start+1;i<end;i++){
      if(period.test(lines[i]))continue;
      if(!euroValues(lines[i]).some(v=>Math.abs(v-delta)<=0.005))continue;
      for(let j=i-1;j>start;j--){if(period.test(lines[j])){target=j;break}}
      if(target>=0)break;
    }
    if(target<0){
      const missing=periodRows.filter(row=>row.values.length===0);
      if(missing.length===1)target=missing[0].index;
    }
    if(target>=0)lines[target]=`${lines[target]} ${euroText(delta)} €`.trim();
    return lines;
  }

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

  function mergeOcrText(data,ocrText,fileName=''){
    const later=laterText(data);
    const nativeCups=(later.match(/\bES[A-Z0-9]{16,24}\b/i)||[])[0]||'';
    const nativeTariff=(later.match(/\b(?:2\.0TD|3\.0TD|6\.[1-4]TD)\b/i)||[])[0]||'';
    let normalized=String(ocrText||'');
    if(nativeCups&&/\bES[A-Z0-9]{16,24}\b/i.test(normalized))normalized=normalized.replace(/\bES[A-Z0-9]{16,24}\b/i,nativeCups);
    if(nativeTariff&&/\b(?:2\.0TD|3\.0TD|6\.[1-4]TD)\b/i.test(normalized))normalized=normalized.replace(/\b(?:2\.0TD|3\.0TD|6\.[1-4]TD)\b/i,nativeTariff);
    normalized=normalizeInvoiceNumber(normalized,fileName);
    const lines=repairExcessRows(normalized.split(/\r?\n/).map(v=>text(v)).filter(Boolean));
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
      return {data:mergeOcrText(data,ocrText,file?.name),attempted:true,error:null,ocrText};
    }catch(error){
      return {data,attempted:true,error};
    }
  }

  return Object.freeze({shouldAttempt,isSparseFirstPage,fenieEvidence,mergeOcrText,repairExcessRows,invoiceFromFilename,criticalRowOk,criticalReason,prepare,ocrFirstPage});
});
