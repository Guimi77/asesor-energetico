(()=>{'use strict';
const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
const polluted=v=>/(?:Direcci[oó]n\s+de\s+suministro|Su\s+comercializadora|Referencia\s+(?:de|del)\s+contrato|Peaje\s+de\s+transporte|CUPS\s*:|Distribuidora\s*:)/i.test(txt(v));
const cleanAddress=v=>txt(v).replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,'').split(/\s+(?:Su\s+comercializadora|Referencia\s+(?:de|del)\s+contrato|Contrato\s+de\s+mercado\s+libre|Potencias?\s+contratadas?|Potencia\s+contratada|CUPS|Distribuidora|Peaje|Segmento)\s*:/i)[0].replace(/\.{3,}/g,'').replace(/\s*,\s*,+/g,',').trim();
const validRef=v=>/^\d{8,20}$/.test(txt(v).replace(/\D/g,''));
const placeFromAddress=v=>{const m=cleanAddress(v).match(/\b\d{5}\s+([^,]+?)(?:,\s*([^,]+?))?\s*$/i);return m?{city:txt(m[1]),province:txt(m[2]||'')}:{city:'',province:''}};
function wrap(){
  const master=window.EnergyMaster;
  if(!master?.learnInvoice||master.__sourceGuard)return;
  const original=master.learnInvoice.bind(master);
  master.learnInvoice=function(data,...args){
    const explicit=txt(data?.retailer||data?.commercializer),isEndesa=/endesa/i.test(explicit),patched={...(data||{})};
    if(isEndesa){
      const address=cleanAddress(data?.supplyAddress||data?.address);
      if(address){patched.supplyAddress=address;patched.address=address;patched.supplyName=address;}
      for(const key of ['contract','contractNumber','accessContract'])if(patched[key]&&!validRef(patched[key]))delete patched[key];
    }
    const result=original(patched,...args);
    if(!explicit||!result?.ok||!result.supply)return result;
    const s=result.supply;let changed=false;
    if(txt(s.retailer)!==explicit){s.retailer=explicit;changed=true;}
    if(isEndesa){
      const address=cleanAddress(patched.supplyAddress||patched.address);
      const currentAddress=txt(s.address),currentName=txt(s.name);
      if(address&&(!currentAddress||polluted(currentAddress))&&currentAddress!==address){s.address=address;changed=true;}
      if(address&&(!currentName||polluted(currentName)||currentName===currentAddress)&&currentName!==address){s.name=address;changed=true;}
      const place=placeFromAddress(address),city=place.city||txt(patched.supplyCity||patched.city),province=place.province||txt(patched.supplyProvince||patched.province);
      if(city&&(!txt(s.city)||polluted(s.city))&&txt(s.city)!==city){s.city=city;changed=true;}
      if(province&&(!txt(s.province)||polluted(s.province))&&txt(s.province)!==province){s.province=province;changed=true;}
      const contract=txt(patched.contract||patched.contractNumber),access=txt(patched.accessContract);
      if(validRef(contract)&&(!validRef(s.contract)||txt(s.contract)!==contract)){s.contract=contract;changed=true;}
      if(validRef(access)&&(!validRef(s.accessContract)||txt(s.accessContract)!==access)){s.accessContract=access;changed=true;}
      for(const key of ['distributor','contractType','renewalDate']){
        const value=txt(patched[key]);if(value&&(!txt(s[key])||polluted(s[key]))&&txt(s[key])!==value){s[key]=value;changed=true;}
      }
    }
    if(changed){result.enriched=true;master.refresh?.();}
    return result;
  };
  master.__sourceGuard=true;
}
window.addEventListener('energy-master-ready',wrap);
wrap();
})();