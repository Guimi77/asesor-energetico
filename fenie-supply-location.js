(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTFenieSupplyLocation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const key=value=>clean(value).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,'');

  function redundantPlaceLabel(primary,secondary){
    const a=key(primary),b=key(secondary);
    if(!a||!b)return false;
    return a===b||a.includes(b)||b.includes(a);
  }

  function parse(address){
    const raw=clean(address);
    const postal=raw.match(/\b(\d{5})\b\s*(.*)$/);
    if(!postal)return{postalCode:'',city:'',province:'',region:'',displayAddress:raw};

    const postalCode=postal[1],tail=clean(postal[2]);
    const groups=[...tail.matchAll(/\(([^()]*)\)/g)].map(m=>clean(m[1])).filter(Boolean);
    const city=clean(tail.split(/\s*\(/,1)[0]).replace(/[\s,;:-]+$/,'');
    const province=groups[0]||'';
    const region=groups[1]||'';

    let displayAddress=raw;
    if(groups.length>=2&&redundantPlaceLabel(groups[0],groups[1])){
      const escaped=groups[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const duplicate=new RegExp('\\s*\\('+escaped+'\\)\\s*$','i');
      displayAddress=clean(raw.replace(duplicate,''));
    }

    return{postalCode,city,province,region,displayAddress};
  }

  return Object.freeze({parse,redundantPlaceLabel});
});
