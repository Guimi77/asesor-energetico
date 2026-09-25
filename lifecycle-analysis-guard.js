(() => {
  'use strict';

  const CURRENT_INACTIVE_MESSAGE = 'Suministro inactivo · histórico conservado · sin recomendación actual';

  function activeStatus(value) {
    const status = String(value || 'active').trim().toUpperCase();
    return status === 'ACTIVE' || status === 'ACTIVO' || status.startsWith('ACTIVO ·');
  }

  function filterRecommendationScope(options = {}) {
    const supplies = Array.isArray(options.supplies) ? options.supplies : [];
    const records = Array.isArray(options.records) ? options.records : [];
    const inactiveIds = new Set(supplies.filter((supply) => !activeStatus(supply?.status)).map((supply) => supply.id));
    const activeSupplies = supplies.filter((supply) => !inactiveIds.has(supply.id));
    const inactiveRecords = records.filter((record) => inactiveIds.has(record?.supply_id));
    const activeRecords = records.filter((record) => !inactiveIds.has(record?.supply_id));
    return {
      options: { ...options, supplies: activeSupplies, records: activeRecords },
      inactiveRecords: inactiveRecords.length,
      inactiveSupplies: new Set(inactiveRecords.map((record) => record.supply_id)).size,
    };
  }

  function wrapHistoryRecommendations() {
    const base = window.IBTHistoryRecommendations;
    if (!base || base.__lifecycleGuard) return;

    const guarded = {
      ...base,
      build(options = {}) {
        const scope = filterRecommendationScope(options);
        return {
          ...base.build(scope.options),
          inactiveRecords: scope.inactiveRecords,
          inactiveSupplies: scope.inactiveSupplies,
        };
      },
      render(options = {}) {
        const scope = filterRecommendationScope(options);
        let html = base.render(scope.options);
        if (scope.inactiveRecords > 0) {
          const note = `<p class="history-scope"><strong>${scope.inactiveRecords}</strong> registro(s) de <strong>${scope.inactiveSupplies}</strong> suministro(s) inactivo(s) se conservan en el histórico, pero no generan recomendaciones actuales.</p>`;
          html = html.replace('<div class="history-rec-list">', `${note}<div class="history-rec-list">`);
        }
        return html;
      },
      __lifecycleGuard: true,
    };

    window.IBTHistoryRecommendations = Object.freeze(guarded);
  }

  function masterSupply(cups) {
    try {
      return window.EnergyMaster?.find?.(cups) || null;
    } catch (_) {
      return null;
    }
  }

  function patchCurrentAnalysis() {
    const body = document.querySelector('#resultsBody');
    if (!body) return;

    for (const row of body.querySelectorAll('tr')) {
      const cells = row.children;
      if (cells.length < 16) continue;
      const cups = String(cells[2]?.textContent || '').trim();
      if (!cups || cups === '—') continue;
      const supply = masterSupply(cups);
      if (!supply) continue;

      const opportunity = cells[15];
      const inactive = !activeStatus(supply.status);
      if (inactive && opportunity.dataset.lifecycleSuppressed !== '1') {
        opportunity.dataset.lifecycleOriginal = opportunity.textContent || '';
        opportunity.dataset.lifecycleSuppressed = '1';
        opportunity.textContent = CURRENT_INACTIVE_MESSAGE;
      } else if (!inactive && opportunity.dataset.lifecycleSuppressed === '1') {
        opportunity.textContent = opportunity.dataset.lifecycleOriginal || 'Sin alertas';
        delete opportunity.dataset.lifecycleOriginal;
        delete opportunity.dataset.lifecycleSuppressed;
      }
    }
  }

  function observeCurrentAnalysis() {
    const body = document.querySelector('#resultsBody');
    if (!body || body.dataset.lifecycleAnalysisObserved === '1') return;
    body.dataset.lifecycleAnalysisObserved = '1';
    new MutationObserver(patchCurrentAnalysis).observe(body, { childList: true, subtree: true });
    patchCurrentAnalysis();
  }

  function refresh() {
    wrapHistoryRecommendations();
    observeCurrentAnalysis();
    patchCurrentAnalysis();
  }

  window.addEventListener('energy-master-ready', refresh);
  window.addEventListener('xtra-supabase-synced', refresh);
  window.addEventListener('supply-lifecycle-loaded', refresh);
  window.addEventListener('DOMContentLoaded', refresh);
  if (document.readyState !== 'loading') refresh();

  window.IBTLifecycleAnalysisGuard = Object.freeze({
    activeStatus,
    filterRecommendationScope,
    refresh,
  });
})();
