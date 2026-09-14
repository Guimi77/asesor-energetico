/* Sustained consumption-change screening from validated historical invoices.
 * Compares kWh/day, not raw kWh. Estimated/missing distributor readings and
 * zero kWh without confirmed actual reading are excluded from trend evidence.
 * This module only raises review signals. It never estimates savings or changes contracts.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else {
    root.IBTConsumptionAnomalies=api;
    api.install(root);
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DAY=86400000;
  const RULES=Object.freeze({
    minimumRecords:5,
    baselineRecords:3,
    recentRecords:2,
    minimumAverageChangeRatio:0.40,
    minimumEachRecentChangeRatio:0.30,
    minimumAbsoluteDailyChange:5,
    minimumBaselineKwhDay:2,
  });
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format=(v,d=2)=>Number(v).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d});
  const activeStatus=value=>{const s=String(value||'active').trim().toUpperCase();return s==='ACTIVE'||s==='ACTIVO'||s.startsWith('ACTIVO ·');};
  function number(v){if((typeof v!=='number'&&typeof v!=='string')||String(v).trim()==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;}
  function day(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return null;const x=Date.parse(v+'T00:00:00Z');return Number.isFinite(x)&&new Date(x).toISOString().slice(0,10)===v?x/DAY:null;}
  function duration(r){const a=day(r.billing_start),b=day(r.billing_end);if(a==null||b==null||b<a)return null;const d=b-a+1;return d>=21&&d<=40?d:null;}
  function quality(r){const s=String(r.reading_status||'unknown');if(s==='estimated'||s==='no_distributor_reading')return 'exclude';return s==='actual'?'actual':'unknown';}
  function eligible(r){const d=duration(r),kwh=number(r.consumption_kwh);return r?.validation_status==='valid'&&d!=null&&kwh!=null&&kwh>0&&quality(r)!=='exclude';}
  function median(values){const a=[...values].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;}
  function ref(r){const d=duration(r),kwh=number(r.consumption_kwh);return {id:r.id,invoice:r.invoice_number||'Sin referencia',start:r.billing_start,end:r.billing_end,kwh,kwhDay:kwh/d,readingStatus:String(r.reading_status||'unknown')};}
  function contiguous(prev,cur){const a=day(prev.billing_end),b=day(cur.billing_start);return a!=null&&b!=null&&b>=a&&b<=a+1;}
  function latestRun(list){let run=[];for(const r of list){if(!eligible(r)){run=[];continue;}if(run.length&&!contiguous(run.at(-1),r))run=[];run.push(r);}return run;}
  function analyze({records=[],supplies=[]}={}){
    const activeIds=new Set((supplies||[]).filter(s=>activeStatus(s?.status)).map(s=>s.id));
    const groups=new Map();
    for(const r of records||[]){if(!r||!activeIds.has(r.supply_id))continue;if(!groups.has(r.supply_id))groups.set(r.supply_id,[]);groups.get(r.supply_id).push(r);}
    const items=[];
    for(const [supplyId,source] of groups){
      const list=[...source].sort((a,b)=>String(a.billing_start).localeCompare(String(b.billing_start))||String(a.billing_end).localeCompare(String(b.billing_end)));
      const run=latestRun(list);
      if(run.length<RULES.minimumRecords)continue;
      const window=run.slice(-RULES.minimumRecords),baseline=window.slice(0,RULES.baselineRecords),recent=window.slice(-RULES.recentRecords);
      const baseDaily=baseline.map(r=>number(r.consumption_kwh)/duration(r));
      const recentDaily=recent.map(r=>number(r.consumption_kwh)/duration(r));
      const base=median(baseDaily),recentAvg=recentDaily.reduce((s,v)=>s+v,0)/recentDaily.length;
      if(!(base>=RULES.minimumBaselineKwhDay))continue;
      const changes=recentDaily.map(v=>(v-base)/base),avgChange=(recentAvg-base)/base,absChange=Math.abs(recentAvg-base);
      if(absChange<RULES.minimumAbsoluteDailyChange)continue;
      const up=avgChange>=RULES.minimumAverageChangeRatio&&changes.every(v=>v>=RULES.minimumEachRecentChangeRatio);
      const down=avgChange<=-RULES.minimumAverageChangeRatio&&changes.every(v=>v<=-RULES.minimumEachRecentChangeRatio);
      if(!up&&!down)continue;
      const allActual=window.every(r=>quality(r)==='actual');
      const confidence=allActual?'alta':'media';
      const pct=Math.round(Math.abs(avgChange)*1000)/10;
      items.push({
        type:up?'consumption-up':'consumption-down',supplyId,confidence,amount:null,
        title:up?'Aumento sostenido de consumo':'Descenso sostenido de consumo',
        evidence:`Los 3 periodos anteriores muestran una referencia de ${format(base)} kWh/día. Los 2 últimos promedian ${format(recentAvg)} kWh/día, una variación ${up?'+':'-'}${format(pct,1)} %. Ambos periodos recientes se mueven en la misma dirección y superan el umbral interno de revisión.`,
        action:up?'Revisar si han cambiado la actividad, horarios, ocupación, climatización, equipos o hábitos de uso. Confirmar también que no exista una regularización o cambio operativo antes de considerar el aumento como problema energético.':'Revisar si han cambiado la actividad, horarios, ocupación o uso del suministro. Confirmar lecturas y contexto operativo antes de interpretar la bajada como ahorro o pérdida de actividad.',
        caveat:`Confianza ${confidence}. ${allActual?'Los cinco periodos usados tienen lectura real confirmada.':'Hay consumos positivos cuya lectura figura como no determinada; sirven como señal de tendencia, pero no como prueba definitiva.'} La estacionalidad puede explicar parte del cambio y todavía no hay un ciclo anual equivalente para comparar.`,
        baselineKwhDay:base,recentKwhDay:recentAvg,changeRatio:avgChange,
        sources:window.map(ref),detailKind:'consumption-change',
      });
    }
    return items.sort((a,b)=>Math.abs(b.changeRatio)-Math.abs(a.changeRatio)||a.supplyId.localeCompare(b.supplyId));
  }
  function render({records=[],supplies=[],holders=[]}={}){
    const items=analyze({records,supplies});
    if(!items.length)return '';
    const supplyMap=new Map((supplies||[]).map(s=>[s.id,s])),holderMap=new Map((holders||[]).map(h=>[h.id,h]));
    const cards=items.map(item=>{
      const s=supplyMap.get(item.supplyId),h=holderMap.get(s?.holder_id),name=s?.supply_name||s?.address||'Suministro',identity=[h?.legal_name,s?.cups].filter(Boolean).join(' · ');
      const rows=item.sources.map((r,i)=>`<tr><td>${i<RULES.baselineRecords?'Referencia':'Reciente'}</td><td>${esc(r.invoice)}</td><td>${esc(String(r.start||'').split('-').reverse().join('/'))} – ${esc(String(r.end||'').split('-').reverse().join('/'))}</td><td>${format(r.kwh,2)} kWh</td><td>${format(r.kwhDay,2)} kWh/día</td><td>${r.readingStatus==='actual'?'Real confirmada':'No determinada'}</td></tr>`).join('');
      return `<details class="history-rec"><summary><span><strong>${esc(item.title)}</strong><span class="history-rec-name">${esc(name)}</span><span class="history-scope">${esc(identity)}</span></span><span class="history-rec-status">Confianza ${esc(item.confidence)}<span>${item.changeRatio>0?'+':''}${format(item.changeRatio*100,1)} %</span></span></summary><div class="history-rec-body"><h4>Por qué aparece</h4><p>${esc(item.evidence)}</p><div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Grupo</th><th>Factura</th><th>Periodo</th><th>Consumo</th><th>Consumo diario</th><th>Lectura</th></tr></thead><tbody>${rows}</tbody></table></div><h4>Qué proponemos revisar</h4><p>${esc(item.action)}</p><p class="history-rec-caution">${esc(item.caveat)} No es una estimación de ahorro.</p></div></details>`;
    }).join('');
    return `<section class="card history-recommendations" id="historyConsumptionChanges" aria-labelledby="historyConsumptionChangesTitle"><div class="history-section-head"><div><p class="eyebrow">Comportamiento del consumo · señal de revisión</p><h2 id="historyConsumptionChangesTitle">Cambios sostenidos de consumo</h2></div><span class="history-pill">${items.length} señal(es)</span></div><p class="history-scope">Comparamos kWh/día para evitar que la duración distinta de las facturas distorsione el resultado. Exigimos 5 periodos consecutivos: 3 como referencia y 2 recientes en la misma dirección. Las lecturas estimadas, la ausencia de lectura de distribuidora y los 0 kWh sin lectura real confirmada no forman parte de esta comparación.</p><div class="history-rec-list">${cards}</div></section>`;
  }
  function install(root){
    const base=root.IBTHistoryRecommendations;
    if(!base||base.__consumptionAnomalies)return false;
    const wrapped={...base,
      build(options={}){const result=base.build(options),signals=analyze(options);return {...result,items:[...(result.items||[]),...signals],consumptionAnomalies:signals};},
      render(options={}){return base.render(options)+render(options);},
      __consumptionAnomalies:true,
    };
    root.IBTHistoryRecommendations=Object.freeze(wrapped);return true;
  }
  return Object.freeze({analyze,render,install,rules:RULES});
});
