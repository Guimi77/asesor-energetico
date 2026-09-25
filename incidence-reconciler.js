(()=>{'use strict';
const numEs=v=>{let s=String(v??'').replace(/\s/g,'').replace(/€/g,'');if(!s)return 0;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return Number(s)||0};
const money=n=>(Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const softLimit=total=>Math.max(10,Math.abs(total)*0.05);
let working=false;
function reconcileTable(){if(working)return;const body=document.querySelector('#resultsBody');if(!body)return;working=true;let total=0,ok=0,review=0;for(const tr of [...body.querySelectorAll('tr:not(.empty)')]){const td=tr.children;if(td.length<14)continue;total++;const badge=td[0].querySelector('.status');if(!badge)continue;const invoiceTotal=numEs(td[12].textContent),raw=td[13].textContent.trim();let diff=raw==='OK'?0:numEs(raw);if(badge.classList.contains('danger')&&raw!=='OK'&&Math.abs(diff)<=softLimit(invoiceTotal)){
const currentOther=numEs(td[10].textContent);td[10].textContent=money(currentOther+diff);td[13].innerHTML=`<strong>OK <span title="Diferencia incluida en Otros / regularización no clasificada">· ajuste ${money(diff)} €</span></strong>`;badge.classList.remove('danger');badge.classList.add('ok');badge.textContent='Correcta';tr.dataset.softReconciled='1';
}
if(badge.classList.contains('ok'))ok++;else review++;
}
const a=document.querySelector('#statInvoices'),b=document.querySelector('#statOk'),c=document.querySelector('#statReview');if(a)a.textContent=total;if(b)b.textContent=ok;if(c)c.textContent=review;working=false}
function reconcileWorkbook(wb){try{const ws=wb?.Sheets?.Resumen;if(!ws)return;const data=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});for(let r=3;r<data.length;r++){const row=data[r];if(!row?.[1])continue;const state=String(row[0]||''),invoiceTotal=Number(row[17])||0;if(state!=='ERROR'||!invoiceTotal)continue;const known=[7,8,9,10,11,12,13,14,15,16].reduce((s,i)=>s+(Number(row[i])||0),0),diff=Math.round((invoiceTotal-known)*100)/100;if(Math.abs(diff)<=softLimit(invoiceTotal)){
row[0]='CORRECTA';row[12]=(Number(row[12])||0)+diff;row[18]='OK';const rr=r+1;ws['A'+rr]={...(ws['A'+rr]||{}),t:'s',v:'CORRECTA'};ws['M'+rr]={...(ws['M'+rr]||{}),t:'n',v:row[12]};ws['S'+rr]={...(ws['S'+rr]||{}),t:'s',v:'OK'};
}}
}catch(e){console.warn('No se pudo reconciliar el informe interno',e)}}
window.addEventListener('DOMContentLoaded',()=>{const body=document.querySelector('#resultsBody');if(body)new MutationObserver(()=>queueMicrotask(reconcileTable)).observe(body,{childList:true,subtree:true,characterData:true});reconcileTable();const prev=XLSX.writeFile.bind(XLSX);XLSX.writeFile=function(wb,name,opt){if(name==='Informe_Energetico_Instalacions_BT.xlsx')reconcileWorkbook(wb);return prev(wb,name,opt)}});
})();