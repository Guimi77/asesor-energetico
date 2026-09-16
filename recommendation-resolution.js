/* Keeps resolved/dismissed alerts from resurfacing as current historical recommendations.
 * The source of truth remains Supabase incidents. A closed alert is only suppressed while
 * the recommendation is based on evidence dated on or before that closure; later evidence
 * makes it a recurrence and the recommendation becomes active again.
 */
(function(root){
  'use strict';

  const ACTIVE_STATUSES = new Set(['open','reviewing']);
  const CLOSED_STATUSES = new Set(['resolved','dismissed']);
  const clean = value => String(value ?? '').trim();
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const dateOnly = value => {
    const match = clean(value).match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
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
    const handled = [];
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

  function currentIncidents(options) {
    return Array.isArray(options?.incidents) ? options.incidents : incidents;
  }

  function build(options = {}) {
    return partitionResult(base.build(options), currentIncidents(options));
  }

  function render(options = {}) {
    const result = build(options);
    if (!base.render || typeof document === 'undefined') return base.render ? base.render(options) : '';
    const raw = base.render(options);
    if (!result.handledItems?.length) return raw;
    return raw;
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
    if (!force && loaded && scopeKey === nextKey) return incidents;
    if (loading) return loading;

    loading = (async () => {
      const {data, error} = await supabase
        .from('incidents')
        .select('id,supply_id,title,description,status,detected_at,resolved_at')
        .order('detected_at', {ascending:false});
      if (error) throw error;
      incidents = data || [];
      loaded = true;
      scopeKey = nextKey;
      return incidents;
    })();

    try {
      const rows = await loading;
      refreshViews();
      return rows;
    } catch (error) {
      console.warn('No se pudo cargar el estado de alertas para Histórico. No se ocultará ningún aviso.', error);
      loaded = false;
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

  root.IBTRecommendationResolution = Object.freeze({
    refresh:() => refreshIncidents(true),
    refreshViews,
    inferType,
    classifyItem,
    partitionResult,
    typeForCard,
    snapshot:() => ({loaded, scopeKey, incidents:[...incidents]}),
  });

  root.addEventListener('ibt-role-changed', () => { void refreshIncidents(false); });
  root.addEventListener('ibt-alerts-changed', () => { void refreshIncidents(true); });
  root.addEventListener('xtra-history-saved', refreshViews);
  if (root.ibtCurrentProfile) void refreshIncidents(false);
})(typeof globalThis !== 'undefined' ? globalThis : this);
