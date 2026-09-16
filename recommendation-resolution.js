/* Keeps resolved/dismissed alerts from resurfacing as current historical recommendations.
 * The source of truth remains Supabase incidents. A closed alert is only suppressed while
 * the recommendation is based on evidence dated on or before that closure; later evidence
 * makes it a recurrence and the recommendation becomes active again.
 */
(function(root){
  'use strict';

  const ACTIVE_STATUSES = new Set(['open','reviewing']);
  const CLOSED_STATUSES = new Set(['resolved','dismissed']);
  const INTERNAL_ROLES = new Set(['admin','staff']);
  const clean = value => String(value ?? '').trim();
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateOnly = value => {
    const match = clean(value).match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
  };
  const dateES = value => {
    const d = dateOnly(value);
    return d ? d.split('-').reverse().join('/') : '—';
  };
  const eventTime = incident => {
    const value = CLOSED_STATUSES.has(incident?.status) ? (incident?.resolved_at || incident?.detected_at) : incident?.detected_at;
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : 0;
  };
  const canonicalType = value => {
    const type = clean(value);
    if (type === 'consumption-up' || type === 'consumption-down' || type === 'consumption-change') return 'consumption-change';
    return type;
  };

  function inferType(incidentOrText) {
    const text = fold(typeof incidentOrText === 'string'
      ? incidentOrText
      : `${incidentOrText?.title || ''} ${incidentOrText?.description || ''}`);
    if (!text) return '';
    if (/energia reactiva|coste.*reactiva|cargo.*reactiva/.test(text)) return 'reactive';
    if (/penaliz.*potencia|exceso.*potencia|superar.*potencia|picos.*potencia/.test(text)) return 'excess';
    if (/potencia contratada.*(encima|alta|uso|demanda)|mas potencia contratada|ajuste de potencia/.test(text)) return 'power';
    if (/datos fiables|lectura.*distribuidora|lecturas.*comercializadora|sin lectura real|falta.*lectura/.test(text)) return 'reading-quality';
    if (/sin consumo.*coste|0 kwh.*(importe|coste)|consumo cero.*coste/.test(text)) return 'zero-consumption';
    if (/consumo diario|consumo ha cambiado|aumento.*consumo|descenso.*consumo|subid.*consumo|bajad.*consumo/.test(text)) return 'consumption-change';
    return '';
  }

  function incidentType(incident) {
    return canonicalType(incident?.recommendation_type || inferType(incident));
  }

  function itemType(item) {
    return canonicalType(item?.type);
  }

  function latestEvidenceEnd(item) {
    const values = (Array.isArray(item?.sources) ? item.sources : [])
      .map(source => dateOnly(source?.end || source?.start))
      .filter(Boolean)
      .sort();
    return values.at(-1) || '';
  }

  function classifyItem(item, incidents = []) {
    const type = itemType(item);
    if (!item?.supplyId || !type) return { state:'active', recurrence:false, incident:null };
    const related = (Array.isArray(incidents) ? incidents : [])
      .filter(incident => incident?.supply_id === item.supplyId && incidentType(incident) === type && (ACTIVE_STATUSES.has(incident?.status) || CLOSED_STATUSES.has(incident?.status)))
      .sort((a,b) => eventTime(b) - eventTime(a));
    const latest = related[0];
    if (!latest) return { state:'active', recurrence:false, incident:null };
    if (ACTIVE_STATUSES.has(latest.status)) return { state:'active', recurrence:false, incident:latest };

    const closedDate = dateOnly(latest.resolved_at || latest.detected_at);
    const evidenceEnd = latestEvidenceEnd(item);
    if (closedDate && evidenceEnd && evidenceEnd <= closedDate) {
      return { state:'handled', recurrence:false, incident:latest, closedDate, evidenceEnd };
    }
    return { state:'active', recurrence:Boolean(closedDate && evidenceEnd && evidenceEnd > closedDate), incident:latest, closedDate, evidenceEnd };
  }

  function partitionResult(result, incidents = []) {
    const active = [];
    const handled = [...(Array.isArray(result?.handledItems) ? result.handledItems : [])];
    for (const item of Array.isArray(result?.items) ? result.items : []) {
      const tracking = classifyItem(item, incidents);
      const enriched = Object.assign({}, item, { tracking });
      if (tracking.state === 'handled') handled.push(enriched);
      else active.push(enriched);
    }
    return Object.assign({}, result || {}, { items:active, handledItems:handled });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.freeze({ inferType, incidentType, canonicalType, latestEvidenceEnd, classifyItem, partitionResult });
    return;
  }

  const base = root.IBTHistoryRecommendations;
  if (!base?.build || base.__resolvedAlertsAware) return;

  let incidents = [];
  let loaded = false;
  let loading = null;
  let scopeKey = '';
  let presentationInstalled = false;

  function currentIncidents(options) {
    return Array.isArray(options?.incidents) ? options.incidents : incidents;
  }

  function build(options = {}) {
    return partitionResult(base.build(options), currentIncidents(options));
  }

  function render(options = {}) {
    return base.render ? base.render(options) : '';
  }

  const wrapped = Object.freeze({...base, build, render, __resolvedAlertsAware:true});
  root.IBTHistoryRecommendations = wrapped;

  function refreshViews() {
    try { root.IBTHistoryUI?.reload?.(); } catch (error) { console.warn('No se pudo refrescar Histórico tras actualizar alertas', error); }
    try { root.IBTAnalysisUI?.refresh?.(); } catch (error) { console.warn('No se pudo refrescar Análisis tras actualizar alertas', error); }
  }

  async function refreshIncidents(force = false) {
    const supabase = root.ibtSupabase;
    const profile = root.ibtCurrentProfile;
    if (!supabase || !profile?.id) {
      incidents = [];
      loaded = false;
      scopeKey = '';
      return incidents;
    }
    const nextKey = `${profile.id}|${profile.role || ''}`;
    if (nextKey !== scopeKey) {
      incidents = [];
      loaded = false;
      scopeKey = nextKey;
    }
    if (!force && loaded) return incidents;
    if (loading) return loading;

    loading = (async () => {
      const {data, error} = await supabase
        .from('incidents')
        .select('id,supply_id,title,description,status,detected_at,resolved_at')
        .order('detected_at', {ascending:false});
      if (error) throw error;
      incidents = data || [];
      loaded = true;
      return incidents;
    })();

    try {
      const rows = await loading;
      refreshViews();
      return rows;
    } catch (error) {
      incidents = [];
      loaded = false;
      console.warn('No se pudo cargar el estado de alertas para Histórico. No se ocultará ningún aviso.', error);
      refreshViews();
      return incidents;
    } finally {
      loading = null;
    }
  }

  function typeForCard(card) {
    const title = card?.querySelector?.('.analysis-item h3')?.textContent || card?.querySelector?.('h3')?.textContent || '';
    const summary = card?.querySelector?.('.analysis-summary')?.textContent || '';
    const review = card?.querySelector?.('.analysis-check')?.textContent || '';
    return inferType(`${title} ${summary} ${review}`);
  }

  function handledSection(result, options = {}) {
    if (!INTERNAL_ROLES.has(root.ibtCurrentProfile?.role)) return '';
    const items = Array.isArray(result?.handledItems) ? result.handledItems : [];
    if (!items.length) return '';
    const supplyMap = new Map((options.supplies || []).map(s => [s.id, s]));
    const holderMap = new Map((options.holders || []).map(h => [h.id, h]));
    const cards = items.map(item => {
      const supply = supplyMap.get(item.supplyId);
      const holder = holderMap.get(supply?.holder_id);
      const incident = item.tracking?.incident || {};
      const title = root.IBTHumanLanguage?.plain?.(item)?.title || item.title || 'Aviso atendido';
      const name = supply?.supply_name || supply?.address || 'Suministro';
      const identity = [holder?.legal_name, supply?.cups].filter(Boolean).join(' · ');
      const dismissed = incident.status === 'dismissed';
      const status = dismissed ? 'Descartada' : 'Atendida';
      const when = dateES(incident.resolved_at || incident.detected_at);
      return `<details class="history-rec history-rec-handled"><summary><span><strong>${esc(title)}</strong><span class="history-rec-name">${esc(name)}</span><span class="history-scope">${esc(identity)}</span></span><span class="history-rec-status">${status}<span>${esc(when)}</span></span></summary><div class="history-rec-body"><p><strong>Seguimiento:</strong> este aviso ya no cuenta como pendiente. Se conserva para trazabilidad.</p><p class="history-rec-caution">Si una factura posterior a ${esc(when)} vuelve a cumplir el mismo criterio para este CUPS, el aviso reaparecerá como una nueva señal a revisar.</p></div></details>`;
    }).join('');
    return `<section class="card history-recommendations history-recommendations-handled" id="historyHandledRecommendations"><div class="history-section-head"><div><h2>Avisos ya atendidos</h2></div><span class="history-pill">${items.length} cerrado${items.length===1?'':'s'}</span></div><p class="history-scope">No cuentan como avisos pendientes. Se muestran solo al personal interno para conservar la trazabilidad del seguimiento.</p><div class="history-rec-list">${cards}</div></section>`;
  }

  function installPresentation() {
    if (presentationInstalled) return true;
    const current = root.IBTHistoryRecommendations;
    if (!current?.__humanLanguage) return false;
    if (!current?.build || !current?.render || current.__resolvedAlertsPresentation) return Boolean(current?.__resolvedAlertsPresentation);
    const presentation = Object.freeze({...current,
      build(options = {}) {
        return partitionResult(current.build(options), currentIncidents(options));
      },
      render(options = {}) {
        const result = partitionResult(current.build(options), currentIncidents(options));
        const raw = current.render(options);
        return raw + handledSection(result, options);
      },
      __resolvedAlertsAware:true,
      __resolvedAlertsPresentation:true,
    });
    root.IBTHistoryRecommendations = presentation;
    presentationInstalled = true;
    return true;
  }

  root.IBTRecommendationResolution = Object.freeze({
    refresh:() => refreshIncidents(true),
    refreshViews,
    installPresentation,
    inferType,
    classifyItem,
    partitionResult,
    typeForCard,
    snapshot:() => ({loaded, scopeKey, incidents:[...incidents]}),
  });

  root.addEventListener('ibt-role-changed', () => {
    installPresentation();
    void refreshIncidents(false);
  });
  root.addEventListener('ibt-alerts-changed', () => { void refreshIncidents(true); });
  root.addEventListener('xtra-history-saved', refreshViews);
  if (root.ibtCurrentProfile) void refreshIncidents(false);
})(typeof globalThis !== 'undefined' ? globalThis : this);
