(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTPdfTextNormalizer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='2026.09.21.1';
  const ACCENTED='ÁÉÍÓÚÜÑáéíóúüñ';

  function compact(value){
    return String(value??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  }

  function repair(value){
    let s=compact(value).normalize('NFC');
    let previous='';
    while(s!==previous){
      previous=s;
      // PDF.js can split a precomposed accented glyph into a standalone text item:
      // "Energ í a", "FACTURACI Ó N", "N ú mero", "Ú ltima".
      s=s.replace(new RegExp('([A-Za-zÀ-ÿ])\\s+(['+ACCENTED+'])\\s+([A-Za-zÀ-ÿ])','g'),'$1$2$3');
      s=s.replace(new RegExp('(^|\\s)(['+ACCENTED+'])\\s+([A-Za-zÀ-ÿ]{2,})','g'),'$1$2$3');
      // Also repair a detached combining accent if a PDF ever exposes it that way.
      s=s.replace(/([A-Za-z])\s+([\u0300-\u036f])\s*/g,'$1$2').normalize('NFC');
    }
    return compact(s);
  }

  function normalizePages(pages){
    return (pages||[]).map(page=>(page||[]).map(repair));
  }

  function normalizeData(data){
    if(!data||typeof data!=='object')return data;
    const pages=normalizePages(data.pages||[]);
    return {...data,pages,text:pages.flat().join('\n'),textNormalizationVersion:VERSION};
  }

  return Object.freeze({VERSION,repair,normalizeLine:repair,normalizePages,normalizeData});
});
