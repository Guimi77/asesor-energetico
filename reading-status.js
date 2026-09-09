/* Clasificación conservadora del tipo de lectura indicado en la factura.
 * No interpreta consumo ni vuelve a leer PDF. Solo clasifica texto ya extraído.
 * Telegestión Distribuidora describe el origen, no confirma una lectura real.
 */
(function(root){
  'use strict';

  const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();

  function first(text, patterns){
    for(const pattern of patterns){
      const match=text.match(pattern);
      if(match) return clean(match[0]);
    }
    return null;
  }

  function classify(value){
    const text=clean(value);
    if(!text) return {status:'unknown', sourceLabel:null};

    const noReading=first(text,[
      /\bsin\s+lectura(?:s)?(?:\s+(?:de|por)\s+(?:la\s+)?)?distribuidora\b/i,
      /\blectura(?:s)?\s+no\s+(?:disponible|disponibles|facilitada|facilitadas|aportada|aportadas)(?:\s+(?:por|de)\s+(?:la\s+)?)?distribuidora\b/i,
      /\bdistribuidora\s+no\s+(?:ha\s+)?(?:facilitado|facilitada|aportado|aportada)\s+(?:la\s+)?lectura(?:s)?\b/i,
      /\bno\s+se\s+dispone\s+de\s+lectura(?:s)?(?:\s+de\s+(?:la\s+)?)?distribuidora\b/i
    ]);
    if(noReading) return {status:'no_distributor_reading', sourceLabel:noReading};

    const estimated=first(text,[
      /\bestimada\s+distribuidora\b/i,
      /\blectura\s+estimada(?:\s+(?:por|de)\s+(?:la\s+)?)?distribuidora\b/i
    ]);
    if(estimated) return {status:'estimated', sourceLabel:estimated};

    const actual=first(text,[
      /\blectura\s+real(?:\s+(?:por|de)\s+(?:la\s+)?)?distribuidora\b/i,
      /\breal\s+distribuidora\b/i
    ]);
    if(actual) return {status:'actual', sourceLabel:actual};

    const source=first(text,[
      /\btelegesti[oó]n\s+distribuidora\b/i
    ]);
    return {status:'unknown', sourceLabel:source};
  }

  const api=Object.freeze({classify});
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.IBTReadingStatus=api;
})(typeof globalThis!=='undefined'?globalThis:this);
