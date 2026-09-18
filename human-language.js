/* Client-first presentation for energy findings.
 * Business rule: explain the conclusion first, keep technical evidence behind
 * "Ver detalle técnico", and keep the product diagnostic rather than economic.
 * Detection logic remains in the underlying recommendation modules.
 */
(function(root){
  'use strict';
  const base=root.IBTHistoryRecommendations;
  if(!base||base.__humanLanguage)return;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=2)=>Number(v).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d});
  const date=v=>String(v||'').slice(0,10).split('-').reverse().join('/');

  function plain(item){
    const amount=item.amount==null?null:Number(item.amount);
    const sources=Array.isArray(item.sources)?item.sources:[];
    if(item.type==='excess')return{
      title:item.repeated?'Estás pagando penalizaciones por superar la potencia contratada':'Has pagado una penalización por superar la potencia contratada',
      summary:item.repeated?`Se han detectado cargos repetidos por exceso. El saldo registrado es de ${fmt(amount)} € en el periodo analizado.`:`Hemos detectado un cargo de ${fmt(amount)} € por superar la potencia contratada.`,
      importance:'Es un coste adicional. Antes de cambiar la potencia conviene saber si los picos son puntuales o se repiten por el funcionamiento habitual del suministro.',
      recommendation:'Revisar cuándo se producen los picos y si responden al funcionamiento habitual del suministro.',
      badge:'Conviene revisarlo',badgeDetail:`${fmt(amount)} € detectados`
    };
    if(item.type==='reactive')return{
      title:item.repeated?'Estás pagando un coste adicional por energía reactiva':'Ha aparecido un coste adicional por energía reactiva',
      summary:item.repeated?`Este coste se repite y suma ${fmt(amount)} € en el periodo analizado.`:`Hemos detectado ${fmt(amount)} € de coste por energía reactiva.`,
      importance:'La energía reactiva puede generar cargos que no aportan consumo útil. Si se repite, merece revisar la instalación y la compensación existente.',
      recommendation:'Comprobar el origen de la reactiva y el estado de la compensación antes de proponer equipos o cambios.',
      badge:'Conviene revisarlo',badgeDetail:`${fmt(amount)} € detectados`
    };
    if(item.type==='power'){
      const periods=Array.isArray(item.measurements)?item.measurements.length:0;
      return{
        title:'Podrías tener más potencia contratada de la que necesitas',
        summary:`Durante ${item.coverageDays||'varios'} días, la potencia utilizada se ha mantenido baja en ${periods} periodo${periods===1?'':'s'} y no hemos visto penalizaciones por exceso.`,
        importance:'Si este patrón se mantiene durante un ciclo completo, conviene revisar si la potencia contratada está ajustada al uso real.',
        recommendation:'Revisar un año completo y la estacionalidad antes de plantear cualquier cambio de potencia.',
        badge:'Estudiar',badgeDetail:'Requiere revisión técnica'
      };
    }
    if(item.type==='zero-consumption')return{
      title:'Este suministro aparece sin consumo pero sigue teniendo costes',
      summary:`Hay ${sources.length} facturas consecutivas con lectura real, 0 kWh y un importe facturado.`,
      importance:'Puede ser un suministro sin uso, estacional o necesario para algún servicio que no vemos en la factura.',
      recommendation:'Confirmar para qué se utiliza antes de plantear una baja o cualquier cambio de potencia.',
      badge:'Conviene comprobarlo',badgeDetail:amount==null?'':`${fmt(amount)} € facturados`
    };
    if(item.type==='reading-quality')return{
      title:'Faltan datos fiables de consumo en algunas facturas',
      summary:`Hay ${sources.length} periodos con 0 kWh, pero no podemos confirmar que el consumo real haya sido cero.`,
      importance:'Sin una lectura fiable podríamos confundir una falta de datos con una bajada real de consumo.',
      recommendation:'Revisar las lecturas de distribuidora o comercializadora antes de usar estos periodos para tomar decisiones.',
      badge:'Revisar datos',badgeDetail:'No sacar conclusiones aún'
    };
    if(item.type==='consumption-up'||item.type==='consumption-down'){
      const up=item.type==='consumption-up',pct=Math.abs(Number(item.changeRatio)||0)*100;
      const baseline=Number(item.baselineKwhDay),recent=Number(item.recentKwhDay);
      return{
        title:`El consumo diario reciente está un ${fmt(pct,1)} % ${up?'por encima':'por debajo'} de la referencia`,
        summary:`Referencia: ${fmt(baseline,2)} kWh/día, calculada como mediana de los 3 periodos anteriores. Las 2 últimas facturas promedian ${fmt(recent,2)} kWh/día. Diferencia: ${up?'+':'-'}${fmt(pct,1)} %. Es un cálculo a partir de consumos y días facturados guardados, no un valor estimado por IA.`,
        importance:up?'Puede deberse a más actividad, horarios, climatización, nuevos equipos o un cambio de uso. Merece revisar qué ha cambiado.':'Puede deberse a menos actividad, cambios de horario, cierre parcial o un cambio de uso. Conviene confirmar la causa antes de sacar conclusiones.',
        recommendation:up?'Comprobar si han cambiado la actividad, los horarios, la climatización, la ocupación o los equipos del suministro.':'Comprobar si ha cambiado la actividad o el uso del suministro y confirmar que las lecturas sean coherentes.',
        badge:'Conviene revisarlo',badgeDetail:`${up?'+':'-'}${fmt(pct,1)} %`
      };
    }
    return{
      title:item.title||'Hay algo que merece revisión',
      summary:'Hemos detectado un dato que se sale del comportamiento habitual del suministro.',
      importance:'Conviene revisarlo antes de tomar decisiones.',
      recommendation:item.action||'Revisar el detalle y confirmar el contexto del suministro.',
      badge:'Revisar',badgeDetail:''
    };
  }

  function measurementTable(item){
    if(!Array.isArray(item.measurements)||!item.measurements.length)return'';
    if(item.detailKind==='excess')return`<div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Periodo</th><th>Facturas con exceso</th><th>Máximo exceso</th><th>Coste registrado</th></tr></thead><tbody>${item.measurements.map(p=>`<tr><td>P${p.period}</td><td>${p.invoices}</td><td>${fmt(p.maximumExcessKw,2)} kW</td><td>${fmt(p.amount)} €</td></tr>`).join('')}</tbody></table></div>`;
    if(item.detailKind==='reactive')return`<div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Periodo</th><th>Facturas con cargo</th><th>Reactiva registrada</th><th>Máximo por factura</th><th>Coste registrado</th></tr></thead><tbody>${item.measurements.map(p=>`<tr><td>P${p.period}</td><td>${p.invoices}</td><td>${p.totalReactiveKvarh==null?'—':fmt(p.totalReactiveKvarh,2)+' kVArh'}</td><td>${p.maximumReactiveKvarh==null?'—':fmt(p.maximumReactiveKvarh,2)+' kVArh'}</td><td>${fmt(p.amount)} €</td></tr>`).join('')}</tbody></table></div>`;
    if(item.detailKind==='power')return`<div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Periodo</th><th>Contratada</th><th>Máximo observado</th><th>Utilización máxima</th><th>Facturas comparadas</th></tr></thead><tbody>${item.measurements.map(p=>`<tr><td>P${p.period}</td><td>${fmt(p.contracted,3)} kW</td><td>${fmt(p.maximum,3)} kW</td><td>${fmt(p.ratio*100,1)} %</td><td>${p.observations}</td></tr>`).join('')}</tbody></table></div>`;
    return'';
  }

  function sourceTable(item){
    const sources=Array.isArray(item.sources)?item.sources:[];
    if(!sources.length)return'';
    if(item.type==='consumption-up'||item.type==='consumption-down'){
      const rows=sources.map((r,i)=>`<tr><td>${i<3?'Referencia':'Reciente'}</td><td>${esc(r.invoice)}</td><td>${esc(date(r.start))} – ${esc(date(r.end))}</td><td>${r.days??'—'}</td><td>${r.kwh==null?'—':fmt(r.kwh,2)+' kWh'}</td><td>${r.kwhDay==null?'—':fmt(r.kwhDay,2)+' kWh/día'}</td><td>${r.readingStatus==='actual'?'Real confirmada':'No determinada'}</td></tr>`).join('');
      return`<div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Grupo</th><th>Factura</th><th>Periodo</th><th>Días</th><th>Consumo</th><th>Consumo diario</th><th>Lectura</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    return`<div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Factura</th><th>Periodo facturado</th><th>Importe del concepto</th></tr></thead><tbody>${sources.map(r=>`<tr><td>${esc(r.invoice)}</td><td>${esc(date(r.start))} – ${esc(date(r.end))}</td><td>${r.amount==null?'—':fmt(r.amount)+' €'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function card(item,supplyMap,holderMap){
    const s=supplyMap.get(item.supplyId),h=holderMap.get(s?.holder_id),p=plain(item);
    const name=s?.supply_name||'Suministro eléctrico';
    const identity=[h?.legal_name,s?.cups].filter(Boolean).join(' · ');
    const techTable=measurementTable(item),sources=sourceTable(item);
    return`<details class="history-rec history-rec-human"><summary><span><strong>${esc(p.title)}</strong><span class="history-rec-name">${esc(name)}</span><span class="history-scope">${esc(identity)}</span><span class="history-rec-simple">${esc(p.summary)}</span></span><span class="history-rec-status">${esc(p.badge)}${p.badgeDetail?`<span>${esc(p.badgeDetail)}</span>`:''}</span></summary><div class="history-rec-body"><div class="history-human-answer"><h4>Por qué importa</h4><p>${esc(p.importance)}</p><h4>Qué conviene revisar</h4><p>${esc(p.recommendation)}</p></div><details class="history-tech-detail"><summary>Ver datos y cálculo</summary><div class="history-tech-body"><p><strong>Qué cambio se ha detectado:</strong> ${esc(item.title||p.title)}</p><p>${esc(item.evidence||'')}</p>${techTable}<p><strong>Criterio de revisión:</strong> ${esc(item.action||'')}</p><p class="history-rec-caution"><strong>Trazabilidad:</strong> ${esc(item.caveat||'')} Este análisis no calcula una propuesta económica ni inventa valores ausentes.</p>${sources}</div></details></div></details>`;
  }

  function overview(items){
    const byType=type=>items.filter(x=>x.type===type);
    const cost=type=>byType(type).reduce((sum,x)=>sum+(Number(x.amount)||0),0);
    const blocks=[];
    const excess=byType('excess'),reactive=byType('reactive'),power=byType('power');
    const consumption=items.filter(x=>x.type==='consumption-up'||x.type==='consumption-down');
    const reading=byType('reading-quality');
    const confirmedCost=cost('excess')+cost('reactive');
    if(confirmedCost>0)blocks.push(`<div class="history-human-kpi history-human-kpi-main"><small>Costes detectados</small><strong>${fmt(confirmedCost)} €</strong><span>Excesos y reactiva registrados</span></div>`);
    if(power.length)blocks.push(`<div class="history-human-kpi"><small>Potencia a revisar</small><strong>${power.length}</strong><span>suministro${power.length===1?'':'s'}</span></div>`);
    if(consumption.length){
      const main=[...consumption].sort((a,b)=>Math.abs(Number(b.changeRatio)||0)-Math.abs(Number(a.changeRatio)||0))[0];
      const up=main.type==='consumption-up',pct=Math.abs(Number(main.changeRatio)||0)*100;
      const baseline=Number(main.baselineKwhDay),recent=Number(main.recentKwhDay);
      const values=Number.isFinite(baseline)&&Number.isFinite(recent)?`${fmt(baseline,2)} → ${fmt(recent,2)} kWh/día`:'Cambio sobre consumo diario';
      const extra=consumption.length>1?` · ${consumption.length} cambios`:'';
      blocks.push(`<div class="history-human-kpi history-human-kpi-main"><small>Consumo diario</small><strong>${up?'+':'-'}${fmt(pct,1)} %</strong><span>${values} · últimas 2 vs 3 anteriores${extra}</span></div>`);
    }
    if(reading.length)blocks.push(`<div class="history-human-kpi"><small>Lecturas a comprobar</small><strong>${reading.length}</strong><span>suministro${reading.length===1?'':'s'}</span></div>`);
    if(!blocks.length)return'';
    return`<section class="card history-human-overview"><div class="history-section-head"><div><h2>Resumen</h2></div></div><div class="history-human-overview-grid">${blocks.join('')}</div></section>`;
  }

  function section({id,title,items,supplyMap,holderMap,limit=999}){
    if(!items.length)return'';
    const visible=items.slice(0,limit),rest=items.slice(limit);
    const cards=visible.map(x=>card(x,supplyMap,holderMap)).join('');
    const more=rest.length?`<details class="history-more-signals"><summary>Ver otros ${rest.length} avisos</summary><div class="history-rec-list">${rest.map(x=>card(x,supplyMap,holderMap)).join('')}</div></details>`:'';
    return`<section class="card history-recommendations" id="${esc(id)}"><div class="history-section-head"><div><h2>${esc(title)}</h2></div><span class="history-pill">${items.length} ${items.length===1?'aviso':'avisos'}</span></div><div class="history-rec-list">${cards}</div>${more}</section>`;
  }

  function render(options={}){
    const result=base.build(options);
    const supplyMap=new Map((options.supplies||[]).map(s=>[s.id,s]));
    const holderMap=new Map((options.holders||[]).map(h=>[h.id,h]));
    const items=Array.isArray(result.items)?result.items:[];
    const costs=items.filter(x=>x.type==='excess'||x.type==='reactive').sort((a,b)=>(Number(b.amount)||0)-(Number(a.amount)||0));
    const consumption=items.filter(x=>x.type==='consumption-up'||x.type==='consumption-down').sort((a,b)=>Math.abs(Number(b.changeRatio)||0)-Math.abs(Number(a.changeRatio)||0));
    const study=items.filter(x=>!['excess','reactive','consumption-up','consumption-down'].includes(x.type));

    const costSection=costs.length?section({
      id:'historyConfirmedCosts',title:'Costes detectados',items:costs,supplyMap,holderMap,limit:5
    }):'';
    const studySection=study.length?section({
      id:'historyRecommendations',title:'Avisos',items:study,supplyMap,holderMap,limit:5
    }):'';
    const consumptionSection=consumption.length?section({
      id:'historyConsumptionChanges',title:'Cambios de consumo',items:consumption,supplyMap,holderMap,limit:5
    }):'';
    return overview(items)+costSection+studySection+consumptionSection;
  }

  function injectStyles(){
    if(root.document?.getElementById('humanLanguageStyles'))return;
    const style=root.document?.createElement('style');if(!style)return;
    style.id='humanLanguageStyles';
    style.textContent='.history-rec-simple{display:block;margin-top:4px;font-size:13px;line-height:1.45;color:#3f5066}.history-human-answer{padding:2px 0 4px}.history-human-answer h4{font-size:14px}.history-tech-detail{margin-top:10px;border-top:1px solid #dce4ed;padding-top:8px}.history-tech-detail>summary,.history-more-signals>summary{cursor:pointer;color:#1834b8;font-size:12px;font-weight:700;padding:8px 0}.history-tech-body{margin-top:6px;padding:10px;border-radius:8px;background:#fff}.history-human-intro{font-size:13px;line-height:1.5}.history-more-signals{margin-top:12px;border-top:1px solid #e3e9f0;padding-top:4px}.history-more-signals>.history-rec-list{margin-top:6px}.history-rec-human>summary strong{font-size:16px}.history-rec-human .history-rec-status{min-width:124px}.history-human-overview{padding:18px}.history-human-overview h2{margin:0}.history-human-overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:12px}.history-human-kpi{border:1px solid #dce4ed;border-radius:10px;padding:13px;background:#fff}.history-human-kpi-main{border-left:4px solid #1834b8}.history-human-kpi small,.history-human-kpi span{display:block;color:#65758a}.history-human-kpi strong{display:block;font-size:22px;color:#061b38;margin:5px 0}.history-human-kpi span{font-size:12px;line-height:1.35}';
    root.document.head.appendChild(style);
  }

  const wrapped=Object.freeze({...base,render,__humanLanguage:true,__consumptionAnomalies:base.__consumptionAnomalies===true});
  root.IBTHistoryRecommendations=wrapped;
  root.IBTHumanLanguage=Object.freeze({plain});
  injectStyles();
})(typeof globalThis!=='undefined'?globalThis:this);