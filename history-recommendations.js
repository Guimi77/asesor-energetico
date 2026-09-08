/* Read-only recommendations from the already-authorized historical selection.
 * No PDF reading, network calls, storage, timers, observers or contract changes.
 * These are review prompts, not approved advice or estimates of future savings.
 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  // Internal screening criteria, not regulatory thresholds or recommended kW.
  const RULES = Object.freeze({ minimumPowerRecords: 3, minimumPowerDays: 80, maximumUseRatio: 0.5 });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  function continuous(list, minDays) {
    let previous = null, days = 0;
    for (const r of list) {
      const start = day(r.billing_start), end = day(r.billing_end);
      if (start == null || end == null || end < start) return false;
      const duration = end - start + 1;
      if (duration < 21 || duration > 40) return false;
      // Non-overlapping, near-contiguous billing windows; not multiple invoices in one month.
      if (previous != null && (start < previous || start > previous + 1)) return false;
      days += end - (previous == null ? start : Math.max(start, previous + 1)) + 1;
      previous = end;
    }
    return days >= minDays;
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
      function charge(type, field, title, action) {
        const withAmounts = list.filter(r => number(r[field]) != null);
        const entries = withAmounts.filter(r => number(r[field]) !== 0);
        const gross = entries.reduce((s,r) => s + Math.max(cents(number(r[field])), 0), 0);
        const credits = entries.reduce((s,r) => s + Math.min(cents(number(r[field])), 0), 0);
        if (gross + credits <= 0) return;
        items.push({ type, supplyId, title, action, amount:(gross+credits)/100,
          evidence:`${entries.filter(r=>number(r[field])>0).length} registro(s) con cargos de ${withAmounts.length} con dato de este concepto. Cargos: ${format(gross/100)} €. Abonos del mismo concepto: ${format(credits/100)} €. Saldo: ${format((gross+credits)/100)} €.`,
          caveat:'Importe identificado en este concepto, no ahorro previsto. Revisar también regularizaciones y el detalle de las facturas antes de valorar una actuación.',
          sources:entries.map(r=>({...reference(r), amount:number(r[field])})), measurements:[] });
      }
      charge('excess', 'excess_cost_eur', 'Revisar los excesos de potencia',
        'Analizar cuándo se producen los picos y si pueden reducirse reorganizando cargas. Comparar el coste de los excesos con el de un posible ajuste de potencia antes de proponer nuevos kW.');
      charge('reactive', 'reactive_cost_eur', 'Revisar la energía reactiva',
        'Comprobar el origen de la reactiva y el funcionamiento de la compensación existente, si la hay. Valorar una corrección tras revisar las mediciones y el coste de la intervención.');

      // Do not suggest a reduction when any excess exists, is unknown, or when
      // powers/tariffs changed. Never infer 2.0TD demand from a six-period table.
      const tariff = String(list[0]?.tariff || '').toUpperCase();
      if (list.length >= RULES.minimumPowerRecords && /^(3\.0TD|6\.[1-4]TD)$/.test(tariff)
          && list.every(r => String(r.tariff || '').toUpperCase() === tariff && number(r.excess_cost_eur) === 0)
          && continuous(list, RULES.minimumPowerDays)) {
        const contracted = list.map(r=>periods(r.invoice_power_periods,'contracted_kw'));
        const demand = list.map(r=>periods(r.invoice_maximeters,'maximeter_kw',true));
        if (contracted.every(p=>p?.size===6) && demand.every(p=>p?.size===6)) {
          const measurements = [];
          let stable = true;
          for (let p=1;p<=6;p++) {
            const kw = contracted[0].get(p);
            if (!(kw>0) || contracted.some(m=>Math.abs(m.get(p)-kw)>0.0005)) { stable=false; break; }
            const maximum = Math.max(...demand.map(m=>m.get(p)));
            if (maximum>0 && maximum/kw<=RULES.maximumUseRatio) measurements.push({ period:p, contracted:kw, maximum, ratio:maximum/kw });
          }
          if (stable && measurements.length) items.push({type:'power', supplyId, title:'Estudiar un posible ajuste de potencia', amount:null,
            evidence:`En ${list.length} periodos comparables, sin excesos registrados, hay tramos cuyo máximo demandado no supera el 50 % de la potencia contratada.`,
            action:'Revisar un ciclo anual completo, la curva de demanda, la estacionalidad y las necesidades de la instalación. Solo después calcular si conviene reducir potencia y qué valor sería adecuado en cada periodo.',
            caveat:'Señal de revisión con un criterio interno: al menos 3 registros, 80 días y utilización máxima del 50 %. No es un umbral legal ni una potencia recomendada. El maxímetro observado no debe copiarse como potencia a contratar.', sources, measurements });
        }
      }
      if (list.length>=2 && continuous(list,42) && list.every(r=>number(r.consumption_kwh)===0 && number(r.energy_cost_eur)===0 && number(r.total_eur)>0)) {
        items.push({type:'zero-consumption',supplyId,title:'Comprobar un suministro sin consumo registrado',
          amount:list.reduce((s,r)=>s+cents(number(r.total_eur)),0)/100,
          evidence:`Los ${list.length} registros de la selección tienen 0 kWh y siguen teniendo importe facturado.`,
          action:'Confirmar si el suministro está en uso, es estacional o debe mantenerse para servicios esenciales. Revisar sus costes fijos y las condiciones del contrato antes de plantear cambios.',
          caveat:'El total facturado no equivale a ahorro posible. No se recomienda dar de baja el suministro ni reducir potencia sin comprobar su función.',
          sources:list.map(r=>({...reference(r),amount:number(r.total_eur)})),measurements:[] });
      }
    }
    items.sort((a,b)=>(b.amount??-1)-(a.amount??-1)||a.supplyId.localeCompare(b.supplyId)||a.type.localeCompare(b.type));
    return {items, used, excluded, duplicates, supplies:groups.size};
  }
  function render(options = {}) {
    const result = build(options);
    const supplyMap = new Map((options.supplies||[]).map(s=>[s.id,s]));
    const holderMap = new Map((options.holders||[]).map(h=>[h.id,h]));
    const cards = result.items.map(item=>{
      const s=supplyMap.get(item.supplyId), h=holderMap.get(s?.holder_id);
      const name=s?.supply_name||s?.address||'Suministro';
      const identity=[h?.legal_name,s?.cups].filter(Boolean).join(' · ');
      const table = item.measurements.length ? `<div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Periodo</th><th>Contratada en el rango</th><th>Máximo observado</th><th>Utilización</th></tr></thead><tbody>${item.measurements.map(p=>`<tr><td>P${p.period}</td><td>${format(p.contracted,3)} kW</td><td>${format(p.maximum,3)} kW</td><td>${format(p.ratio*100,1)} %</td></tr>`).join('')}</tbody></table></div>` : '';
      const sourceTable = `<details class="history-rec-sources"><summary>Ver ${item.sources.length} registro(s) de origen</summary><div class="history-table-wrap"><table class="history-mini-table"><thead><tr><th>Referencia</th><th>Periodo facturado</th><th>Importe del concepto</th></tr></thead><tbody>${item.sources.map(r=>`<tr><td>${esc(r.invoice)}</td><td>${esc(date(r.start))} – ${esc(date(r.end))}</td><td>${r.amount==null?'—':format(r.amount)+' €'}</td></tr>`).join('')}</tbody></table></div></details>`;
      return `<details class="history-rec"><summary><span><strong>${esc(item.title)}</strong><span class="history-rec-name">${esc(name)}</span><span class="history-scope">${esc(identity)}</span></span><span class="history-rec-status">Pendiente de revisión${item.amount==null?'':`<span>${format(item.amount)} € registrados</span>`}</span></summary><div class="history-rec-body"><h4>Por qué aparece</h4><p>${esc(item.evidence)}</p>${table}<h4>Qué proponemos revisar</h4><p>${esc(item.action)}</p><p class="history-rec-caution">${esc(item.caveat)} Ahorro estimado: pendiente de estudio.</p>${sourceTable}</div></details>`;
    }).join('');
    return `<section class="card history-recommendations" id="historyRecommendations" aria-labelledby="historyRecommendationsTitle"><div class="history-section-head"><div><p class="eyebrow">Propuestas de revisión · no cambios realizados</p><h2 id="historyRecommendationsTitle">Recomendaciones</h2></div><span class="history-pill">${result.items.length} pendiente(s) de revisión técnica</span></div><p class="history-scope">Orientaciones automáticas basadas únicamente en los periodos de la selección. No son recomendaciones aprobadas ni modifican el contrato. Los importes son datos históricos, no ahorros garantizados. La situación actual puede ser distinta si el rango no incluye los últimos periodos.</p><p class="history-scope">Base analizada: ${result.used} registro(s) validado(s) de ${result.supplies} suministro(s).${result.excluded?` ${result.excluded} registro(s) fuera de alcance, sin validar o incompletos excluidos.`:''}${result.duplicates?` ${result.duplicates} duplicado(s) ignorados.`:''}</p><div class="history-rec-list">${cards||'<div class="history-empty">No se han generado propuestas con los datos disponibles. Esto no confirma que el suministro esté optimizado: puede faltar histórico o detalle fiable.</div>'}</div></section>`;
  }
  const api = Object.freeze({ build, render, rules:RULES });
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.IBTHistoryRecommendations=api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
