(()=>{'use strict';
function wrap(){
  const master=window.EnergyMaster;
  if(!master?.learnInvoice||master.__sourceGuard)return;
  const original=master.learnInvoice.bind(master);
  master.learnInvoice=function(data,...args){
    const explicit=String(data?.retailer||data?.commercializer||'').trim();
    const result=original(data,...args);
    if(explicit&&result?.ok&&result.supply&&String(result.supply.retailer||'').trim()!==explicit){
      result.supply.retailer=explicit;
      result.enriched=true;
      master.refresh?.();
    }
    return result;
  };
  master.__sourceGuard=true;
}
window.addEventListener('energy-master-ready',wrap);
wrap();
})();