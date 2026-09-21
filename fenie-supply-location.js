(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTFenieSupplyLocation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();

  function parse(address){
    const raw=clean(address);
    const postal=raw.match(/\b(\d{5})\b\s*(.*)$/);
    if(!postal)return{postalCode:'',city:'',province:'',region:''};

    const postalCode=postal[1],tail=clean(postal[2]);
    const groups=[...tail.matchAll(/\(([^()]*)\)/g)].map(m=>clean(m[1])).filter(Boolean);
    const city=clean(tail.split(/\s*\(/,1)[0]).replace(/[\s,;:-]+$/,'');
    return{
      postalCode,
      city,
      province:groups[0]||'',
      region:groups[1]||''
    };
  }

  return Object.freeze({parse});
});
