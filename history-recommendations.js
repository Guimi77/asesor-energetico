/* Read-only recommendations from the already-authorized historical selection.
 * No PDF reading, network calls, storage, timers, observers or contract changes.
 * These are review prompts, not approved advice or estimates of future savings.
 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  // Internal screening criteria, not regulatory thresholds or recommended kW.
  const RULES = Object.freeze({
    minimumPowerRecords: 3,
    minimumPowerDays: 80,
    maximumUseRatio: 0.5,
  });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  function number(v) {
    if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
    const x = Number(v); return Number.isFinite(x) ? x : null;
  }
  const format = (v, digits = 2) => v == null ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const date = v => String(v || '').slice(0, 10).split('-').reverse().join('/');
  const cents = v => Math.round(v * 100);
  function day(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return null;
    const x = Date.parse(v + 'T00:00:00Z');
    return Number.isFinite(x) && new Date(x).toISOString().slice(0, 10) === v ? x / DAY : null;
  }
  function reference(r) { return { id:r.id, invoice:r.invoice_number || 'Sin referencia', start:r.billing_start, end:r.billing_end }; }
  function periods(rows, field, reliable = false) {
    if (!Array.isArray(rows)) return null;
    const result = new Map();
    for (const row of rows) {
      const p = number(row.period), value = number(row[field]);
      if (!Number.isInteger(p) || p < 1 || p > 6 || result.has(p) || value == null || value < 0 || (reliable && row.reliable !== true)) return null;
      result.set(p, value);
    }
    return result;
  }
  function coverage(list) {
    let previous = null, days = 0, first = null, last = null;
    for (const r of list) {
      const start = day(r.billing_start), end = day(r.billing_end);
      if (start == null || end == null || end < start) return {ok:false, days:0, first:null, last:null};
      const duration = end - start + 1;
      if (duration < 21 || duration > 40) return {ok:false, days:0, first:null, last:null};
      // Non-overlapping, near-contiguous billing windows; not multiple invoices in one month.
      if (previous != null && (start <= previous || start > previous + 1)) return {ok:false, days:0, first:null, last:null};
      if (first == null) first = start;
      days += duration;
      previous = end;
      last = end;
    }
    return {ok:true, days, first, last};
  }
  function continuous(list, minDays) {
    const c = coverage(list);
    return c.ok && c.days >= minDays;
  }
  function excessPeriodMeasurements(list) {
    const byPeriod = new Map();
    for (const r of list) {
      const seenInInvoice = new Set();
      for (const row of Array.isArray(r.invoice_excesses) ? r.invoice_excesses : []) {
        const period = number(row.period), amount = number(row.amount_eur), excessKw = number(row.excess_kw);
        if (!Number.isInteger(period) || period < 1 || period > 6 || amount == null || amount <= 0) continue;
        if (!byPeriod.has(period)) byPeriod.set(period, {period, invoices:0, amount:0, maximumExcessKw:0});
        const stat = byPeriod.get(period);
        stat.amount += amount;
        if (excessKw != null && excessKw > stat.maximumExcessKw) stat.maximumExcessKw = excessKw;
        if (!seenInInvoice.has(period)) { stat.invoices++; seenInInvoice.add(period); }
      }
    }
    return [...byPeriod.values()].sort((a,b) => a.period-b.period).map(x => ({...x, amount:Math.round(x.amount*100)/100}));
  }
  function reactivePeriodMeasurements(list) {
    const byPeriod = new Map();
    for (const r of list) {
      const seenInInvoice = new Set();
      for (const row of Array.isArray(r.invoice_reactive) ? r.invoice_reactive : []) {
        const period = number(row.period), amount = number(row.amount_eur), reactiveKvarh = number(row.reactive_kvarh);
        if (!Number.isInteger(period) || period < 1 || period > 6 || amount == null || amount <= 0) continue;
        if (!byPeriod.has(period)) byPeriod.set(period, {period, invoices:0, amount:0, totalReactiveKvarh:0, maximumReactiveKvarh:0, kvarhRows:0});
        const stat = byPeriod.get(period);
        stat.amount += amount;
        if (reactiveKvarh != null && reactiveKvarh > 0) {
          stat.totalReactiveKvarh += reactiveKvarh;
          stat.maximumReactiveKvarh = Math.max(stat.maximumReactiveKvarh, reactiveKvarh);
          stat.kvarhRows++;
        }
        if (!seenInInvoice.has(period)) { stat.invoices++; seenInInvoice.add(period); }
      }
    }
    return [...byPeriod.values()].sort((a,b) => a.period-b.period).map(x => ({
      period:x.period,
      invoices:x.invoices,
      amount:Math.round(x.amount*100)/100,
      totalReactiveKvarh:x.kvarhRows ? Math.round(x.totalReactiveKvarh*100)/100 : null,
      maximumReactiveKvarh:x.kvarhRows ? Math.round(x.maximumReactiveKvarh*100)/100 : null,
    }));
  }
  function powerReview(list, supplyId, sources) {
    const tariff = String(list[0]?.tariff || '').toUpperCase();
    if (list.length < RULES.minimumPowerRecords || !/^(3\.0TD|6\.[1-4]TD)$/.test(tariff)) return null;
    if (!list.every(r => String(r.tariff || '').toUpperCase() === tariff && number(r.excess_cost_eur) === 0)) return null;
    const cov = coverage(list);
    if (!cov.ok || cov.days < RULES.minimumPowerDays) return null;

    const contracted = list.map(r=>periods(r.invoice_power_periods,'contracted_kw'));
    const demand = list.map(r=>periods(r.invoice_maximeters,'maximeter_kw',true));
    if (!contracted.every(p=>p?.size===6) || !demand.every(p=>p?.size===6)) return null;

    const measurements = [];
    for (let p=1;p<=6;p++) {
      const kw = contracted[0].get(p);
      if (!(kw>0) || contracted.some(m=>Math.abs(m.get(p)-kw)>0.0005)) return null;
      const values = demand.map(m=>m.get(p));
      const maximum = Math.max(...values);
      if (maximum>0 && maximum/kw<=RULES.maximumUseRatio) {
        measurements.push({
          period:p,
          contracted:kw,
          maximum,
          ratio:maximum/kw,
          observations:values.length,
        });
      }
    }
    if (!measurements.length) return null;

    const allPeriodsLow = measurements.length === 6;
    const lowestRatio = Math.min(...measurements.map(m=>m.ratio));
    const strongest = lowestRatio <= 0.25;
    const title = allPeriodsLow ? 'Potencia contratada claramente por encima de la demanda observada' : 'Estudiar un posible ajuste de potencia';
    const periodText = measurements.map(m=>`P${m.period}`).join(', ');
    const evidence = `${list.length} facturas comparables (${cov.days} días) sin excesos registrados. En ${periodText}, el máximo demandado de todo el periodo analizado no supera el ${Math.round(RULES.maximumUseRatio*100)} % de la potencia contratada.${allPeriodsLow ? ' La señal aparece en los seis periodos.' : ''}${strongest ? ' Al menos un periodo no alcanza el 25 %.' : ''}`;
    return {
      type:'power', supplyId, title, amount:null, evidence,
      action:'Revisar un ciclo anual completo, la curva de demanda, la estacionalidad y las necesidades reales de la instalación. Después comparar varios escenarios de potencia y su coste antes de proponer nuevos kW.',
      caveat:'Señal de revisión con criterio interno: mínimo 3 facturas, 80 días, potencia estable, maxímetros fiables y sin excesos. No es un umbral legal ni una potencia recomendada. El máximo observado no debe copiarse como potencia a contratar.',
      sources, measurements, detailKind:'power', coverageDays:cov.days,
    };
  }
  function build({ records = [], supplies = [] } = {}) {
    const allowed = new Set(supplies.map(s => s.id));
    const seen = new Set(), groups = new Map();
    let excluded = 0, duplicates = 0, used = 0;
    for (const r of records) {
      if (!r || !allowed.has(r.supply_id) || r.validation_status !== 'valid' || !r.id || day(r.billing_start) == null || day(r.billing_end) == null || r.billing_end < r.billing_start) { excluded++; continue; }
      if (seen.has(r.id)) { duplicates++; continue; }
      seen.add(r.id); used++;
      if (!groups.has(r.supply_id)) groups.set(r.supply_id, []);
      groups.get(r.supply_id).push(r);
    }
    const items = [];
    for (const [supplyId, source] of groups) {
      const list = [...source].sort((a,b) => a.billing_start.localeCompare(b.billing_start) || a.billing_end.localeCompare(b.billing_end));
      const sources = list.map(reference);

      const excessWithAmounts = list.filter(r => number(r.excess_cost_eur) != null);
      const excessEntries = excessWithAmounts.filter(r => number(r.excess_cost_eur) !== 0);
      const excessGross = excessEntries.reduce((s,r) => s + Math.max(cents(number(r.excess_cost_eur)), 0), 0);
      const excessCredits = excessEntries.reduce((s,r) => s + Math.min(cents(number(r.excess_cost_eur)), 0), 0);
      if (excessGross + excessCredits > 0) {
        const positiveInvoices = excessEntries.filter(r=>number(r.excess_cost_eur)>0).length;
        const repeated = positiveInvoices >= 2;
        const measurements = excessPeriodMeasurements(list);
        const periodText = measurements.length ? ` Periodos con coste identificado: ${measurements.map(m=>`P${m.period}`).join(', ')}.` : '';
        items.push({
          type:'excess', supplyId,
          title:repeated ? 'Excesos de potencia repetidos' : 'Revisar los excesos de potencia',
          action:repeated
            ? 'Analizar por qué se repiten los picos, en qué periodos aparecen y si conviene actuar sobre las cargas o comparar económicamente una modificación de potencia. No cambiar los kW sin calcular antes ambos escenarios.'
            : 'Analizar cuándo se produjo el pico y si fue puntual. Comparar el coste del exceso con el de cualquier posible ajuste de potencia antes de proponer nuevos kW.',
          amount:(excessGross+excessCredits)/100,
          evidence:`${positiveInvoices} factura(s) con cargo por exceso de ${excessWithAmounts.length} con dato. Cargos: ${format(excessGross/100)} €. Abonos: ${format(excessCredits/100)} €. Saldo: ${format((excessGross+excessCredits)/100)} €.${periodText}`,
          caveat:'El coste de excesos registrado no demuestra por sí solo que deba aumentarse la potencia. Puede haber picos puntuales, cambios de uso o alternativas operativas más baratas.',
          sources:excessEntries.map(r=>({...reference(r), amount:number(r.excess_cost_eur)})), measurements, detailKind:'excess', repeated,
        });
      }

      const reactiveWithAmounts = list.filter(r => number(r.reactive_cost_eur) != null);
      const reactiveEntries = reactiveWithAmounts.filter(r => number(r.reactive_cost_eur) !== 0);
      const reactiveGross = reactiveEntries.reduce((s,r) => s + Math.max(cents(number(r.reactive_cost_eur)), 0), 0);
      const reactiveCredits = reactiveEntries.reduce((s,r) => s + Math.min(cents(number(r.reactive_cost_eur)), 0), 0);
      if (reactiveGross + reactiveCredits > 0) {
        const positiveInvoices = reactiveEntries.filter(r=>number(r.reactive_cost_eur)>0).length;
        const repeated = positiveInvoices >= 2;
        const measurements = reactivePeriodMeasurements(list);
        const periodText = measurements.length
          ? ` Periodos con coste identificado: ${measurements.map(m=>`P${m.period}`).join(', ')}.`
          : ' No hay desglose por periodos suficiente para localizar el cargo dentro de P1-P6.';
        items.push({
          type:'reactive', supplyId,
          title:repeated ? 'Energía reactiva recurrente' : 'Revisar la energía reactiva',
          action:repeated
            ? 'Comprobar el origen de la reactiva, el estado y regulación de la compensación existente, si la hay, y si los cargos se concentran en periodos concretos. Si se confirma el patrón, estudiar técnicamente la compensación y su coste antes de dimensionar o sustituir equipos.'
            : 'Comprobar si el cargo corresponde a una situación puntual o a un patrón que empieza a repetirse. Revisar la instalación y la compensación existente, si la hay, antes de plantear una intervención.',
          amount:(reactiveGross+reactiveCredits)/100,
          evidence:`${positiveInvoices} factura(s) con cargo por reactiva de ${reactiveWithAmounts.length} con dato. Cargos: ${format(reactiveGross/100)} €. Abonos: ${format(reactiveCredits/100)} €. Saldo: ${format((reactiveGross+reactiveCredits)/100)} €.${periodText}`,
          caveat:'El coste de reactiva registrado no equivale a ahorro posible ni demuestra por sí solo que sea necesario instalar o sustituir una batería de condensadores. Hay que revisar la instalación y las mediciones antes de dimensionar una solución.',
          sources:reactiveEntries.map(r=>({...reference(r), amount:number(r.reactive_cost_eur)})), measurements, detailKind:'reactive', repeated,
        });
      }

      // Do not suggest a reduction when any excess exists, is unknown, or when
      // powers/tariffs changed. Never infer 2.0TD demand from a six-period table.
      const power = powerReview(list, supplyId, sources);
      if (power) items.push(power);

      if (list.length>=2 && continuous(list,42) && list.every(r=>number(r.consumption_kwh)===0 && number(r.energy_cost_eur)===0 && number(r.total_eur)>0)) {
        items.push({type:'zero-consumption',supplyId,title:'Comprobar un suministro sin consumo registrado',
          amount:list.reduce((s,r)=>s+cents(number(r.total_eur)),0)/100,
          evidence:`Los ${list.length} registros de la selección tienen 0 kWh y siguen teniendo importe facturado.`,
          action:'Confirmar si el suministro está en uso, es estacional o debe mantenerse para servicios esenciales. Revisar sus costes fijos y las condiciones del contrato antes de plantear cambios.',
          caveat:'El total facturado no equivale a ahorro posible. No se recomienda dar de baja el suministro ni reducir potencia sin comprobar su función.',
          sources:list.map(r=>({...reference(r),amount:number(r.total_eur)})),measurements:[],detailKind:'generic'});
      }
    }
    items.sort((a,b)=>(b.amount??-1)-(a.amount??-1)||a.supplyId.localeCompare(b.supplyId)||a.type.localeCompare(b.type));
    return {items, used, excluded, duplicates, supplies:groups.size};
  }
  function measurementTable(item) {
    if (!item.measurements?.length) return '';
    if (item.detailKind === 'excess') {
      return `<div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Periodo</th><th>Facturas con exceso</th><th>Máximo exceso</th><th>Coste registrado</th></tr></thead><tbody>${item.measurements.map(p=>`<tr><td>P${p.period}</td><td>${p.invoices}</td><td>${format(p.maximumExcessKw,2)} kW</td><td>${format(p.amount)} €</td></tr>`).join('')}</tbody></table></div>`;
    }
    if (item.detailKind === 'reactive') {
      return `<div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Periodo</th><th>Facturas con cargo</th><th>Reactiva registrada</th><th>Máximo por factura</th><th>Coste registrado</th></tr></thead><tbody>${item.measurements.map(p=>`<tr><td>P${p.period}</td><td>${p.invoices}</td><td>${p.totalReactiveKvarh==null?'—':format(p.totalReactiveKvarh,2)+' kVArh'}</td><td>${p.maximumReactiveKvarh==null?'—':format(p.maximumReactiveKvarh,2)+' kVArh'}</td><td>${format(p.amount)} €</td></tr>`).join('')}</tbody></table></div>`;
    }
    if (item.detailKind === 'power') {
      return `<div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Periodo</th><th>Contratada</th><th>Máximo observado</th><th>Utilización máxima</th><th>Facturas comparadas</th></tr></thead><tbody>${item.measurements.map(p=>`<tr><td>P${p.period}</td><td>${format(p.contracted,3)} kW</td><td>${format(p.maximum,3)} kW</td><td>${format(p.ratio*100,1)} %</td><td>${p.observations}</td></tr>`).join('')}</tbody></table></div>`;
    }
    return '';
  }
  function render(options = {}) {
    const result = build(options);
    const supplyMap = new Map((options.supplies||[]).map(s=>[s.id,s]));
    const holderMap = new Map((options.holders||[]).map(h=>[h.id,h]));
    const cards = result.items.map(item=>{
      const s=supplyMap.get(item.supplyId), h=holderMap.get(s?.holder_id);
      const name=s?.supply_name||s?.address||'Suministro';
      const identity=[h?.legal_name,s?.cups].filter(Boolean).join(' · ');
      const table = measurementTable(item);
      const sourceTable = `<details class="history-rec-sources"><summary>Ver ${item.sources.length} registro(s) de origen</summary><div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Referencia</th><th>Periodo facturado</th><th>Importe del concepto</th></tr></thead><tbody>${item.sources.map(r=>`<tr><td>${esc(r.invoice)}</td><td>${esc(date(r.start))} – ${esc(date(r.end))}</td><td>${r.amount==null?'—':format(r.amount)+' €'}</td></tr>`).join('')}</tbody></table></div></details>`;
      return `<details class="history-rec"><summary><span><strong>${esc(item.title)}</strong><span class="history-rec-name">${esc(name)}</span><span class="history-scope">${esc(identity)}</span></span><span class="history-rec-status">Pendiente de revisión${item.amount==null?'':`<span>${format(item.amount)} € registrados</span>`}</span></summary><div class="history-rec-body"><h4>Por qué aparece</h4><p>${esc(item.evidence)}</p>${table}<h4>Qué proponemos revisar</h4><p>${esc(item.action)}</p><p class="history-rec-caution">${esc(item.caveat)} Ahorro estimado: pendiente de estudio.</p>${sourceTable}</div></details>`;
    }).join('');
    return `<section class="card history-recommendations" id="historyRecommendations" aria-labelledby="historyRecommendationsTitle"><div class="history-section-head"><div><p class="eyebrow">Propuestas de revisión · no cambios realizados</p><h2 id="historyRecommendationsTitle">Recomendaciones</h2></div><span class="history-pill">${result.items.length} pendiente(s) de revisión técnica</span></div><p class="history-scope">Orientaciones automáticas basadas únicamente en los periodos de la selección. No son recomendaciones aprobadas ni modifican el contrato. Los importes son datos históricos, no ahorros garantizados. La situación actual puede ser distinta si el rango no incluye los últimos periodos.</p><p class="history-scope">Base analizada: ${result.used} registro(s) validado(s) de ${result.supplies} suministro(s).${result.excluded?` ${result.excluded} registro(s) fuera de alcance, sin validar o incompletos excluidos.`:''}${result.duplicates?` ${result.duplicates} duplicado(s) ignorados.`:''}</p><div class="history-rec-list">${cards||'<div class="history-empty">No se han generado propuestas con los datos disponibles. Esto no confirma que el suministro esté optimizado: puede faltar histórico o detalle fiable.</div>'}</div></section>`;
  }
  const api = Object.freeze({ build, render, rules:RULES });
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.IBTHistoryRecommendations=api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
