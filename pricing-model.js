(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTPricingModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='pricing-model-2026.09.27.1';
  const MODELS=Object.freeze(['fixed','indexed','hybrid','unknown']);

  const clean=value=>String(value??'')
    .replace(/\u00a0/g,' ')
    .replace(/[ \t]+/g,' ')
    .trim();

  const fold=value=>clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase();

  function sourceText(input){
    if(typeof input==='string')return clean(input);
    if(Array.isArray(input))return clean(input.join('\n'));
    if(!input||typeof input!=='object')return'';
    const parts=[
      input.product,
      input.commercialProduct,
      input.contractType,
      input.text,
      input.sourceText,
      Array.isArray(input.lines)?input.lines.join('\n'):'',
      Array.isArray(input.pages)?input.pages.flat(2).join('\n'):''
    ];
    return clean(parts.filter(Boolean).join('\n'));
  }

  function evidenceItem(type,label,match){
    return Object.freeze({type,label,match:clean(match)});
  }

  function collectMatches(text,patterns,type){
    const out=[];
    for(const item of patterns){
      const match=text.match(item.re);
      if(match)out.push(evidenceItem(type,item.label,match[0]));
    }
    return out;
  }

  const HYBRID_PATTERNS=[
    {label:'modalidad híbrida',re:/\b(?:tarifa|precio|modalidad|producto)\s+hibrid[oa]\b/i},
    {label:'componente fijo e indexado',re:/\b(?:parte|componente)\s+fij[oa][\s\S]{0,80}\b(?:parte|componente)\s+indexad[oa]\b/i},
    {label:'componente indexado y fijo',re:/\b(?:parte|componente)\s+indexad[oa][\s\S]{0,80}\b(?:parte|componente)\s+fij[oa]\b/i}
  ];

  const FIXED_PATTERNS=[
    {label:'tarifa fija',re:/\btarifa\s+fija\b/i},
    {label:'precio fijo',re:/\bprecio\s+fijo\b/i},
    {label:'modalidad fija',re:/\bmodalidad\s+fija\b/i},
    {label:'precio estable',re:/\bprecio\s+estable\b/i},
    {label:'tarifa estable',re:/\btarifa\s+estable(?:\s+[a-z0-9._-]+){0,4}\b/i}
  ];

  const INDEXED_PATTERNS=[
    {label:'tarifa indexada',re:/\btarifa\s+indexad[ao]\b/i},
    {label:'precio indexado',re:/\bprecio\s+indexad[ao]\b/i},
    {label:'modalidad indexada',re:/\bmodalidad\s+indexad[ao]\b/i},
    {label:'indexado a mercado',re:/\bindexad[ao]\s+(?:a|al)\s+(?:omie|pool|mercado(?:\s+diario)?)\b/i}
  ];

  const MARKET_PATTERNS=[
    {label:'referencia OMIE',re:/\bOMIE\b/i},
    {label:'mercado diario',re:/\bmercado\s+diario\b/i},
    {label:'pool eléctrico',re:/\bpool(?:\s+electrico)?\b/i},
    {label:'precio de mercado',re:/\bprecio\s+(?:del|de)\s+mercado\b/i}
  ];

  const MARGIN_PATTERNS=[
    {label:'margen comercial',re:/\bmargen\s+(?:de\s+)?comercializaci[oó]n\b/i},
    {label:'fee de gestión',re:/\bfee\b[\s\S]{0,40}\b(?:gestion|gesti[oó]n|comercializaci[oó]n)\b/i},
    {label:'coste de gestión',re:/\bcoste\s+(?:de\s+)?gesti[oó]n\b/i},
    {label:'mercado más margen',re:/\b(?:omie|pool|mercado(?:\s+diario)?)[\s\S]{0,100}\b(?:margen|fee|gesti[oó]n)\b/i}
  ];

  function normalizeManualModel(value){
    const v=fold(value);
    if(['fixed','fijo','fija'].includes(v))return'fixed';
    if(['indexed','indexado','indexada'].includes(v))return'indexed';
    if(['hybrid','hibrido','hibrida'].includes(v))return'hybrid';
    if(['unknown','desconocido','desconocida'].includes(v))return'unknown';
    return null;
  }

  function classify(input={}){
    const manual=normalizeManualModel(input&&typeof input==='object'?input.manualModel:null);
    if(manual){
      return Object.freeze({
        model:manual,
        detection:'manual',
        confidence:1,
        evidence:[evidenceItem('manual','clasificación manual',input.manualModel)],
        reason:null,
        version:VERSION
      });
    }

    const raw=sourceText(input);
    const normalized=fold(raw);

    if(!normalized){
      return Object.freeze({model:'unknown',detection:'unknown',confidence:0,evidence:[],reason:'no_evidence',version:VERSION});
    }

    const hybrid=collectMatches(raw,HYBRID_PATTERNS,'hybrid');
    if(hybrid.length){
      return Object.freeze({model:'hybrid',detection:'explicit',confidence:1,evidence:hybrid,reason:null,version:VERSION});
    }

    const fixed=collectMatches(raw,FIXED_PATTERNS,'fixed');
    const indexed=collectMatches(raw,INDEXED_PATTERNS,'indexed');

    if(fixed.length&&indexed.length){
      return Object.freeze({
        model:'unknown',
        detection:'unknown',
        confidence:0.25,
        evidence:[...fixed,...indexed],
        reason:'conflicting_evidence',
        version:VERSION
      });
    }

    if(indexed.length){
      return Object.freeze({model:'indexed',detection:'explicit',confidence:1,evidence:indexed,reason:null,version:VERSION});
    }

    if(fixed.length){
      return Object.freeze({model:'fixed',detection:'explicit',confidence:1,evidence:fixed,reason:null,version:VERSION});
    }

    const market=collectMatches(raw,MARKET_PATTERNS,'indexed_market');
    const margin=collectMatches(raw,MARGIN_PATTERNS,'indexed_margin');
    if(market.length&&margin.length){
      return Object.freeze({
        model:'indexed',
        detection:'inferred',
        confidence:0.85,
        evidence:[...market,...margin],
        reason:null,
        version:VERSION
      });
    }

    return Object.freeze({
      model:'unknown',
      detection:'unknown',
      confidence:0,
      evidence:[],
      reason:'insufficient_evidence',
      version:VERSION
    });
  }

  return Object.freeze({classify,version:VERSION,models:MODELS});
});
