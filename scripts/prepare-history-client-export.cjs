'use strict';
const fs=require('node:fs');
function edit(file,old,next){const s=fs.readFileSync(file,'utf8');if(s.includes(next))return;if(s.split(old).length!==2)throw Error('Missing or non-unique target in '+file+': '+old.slice(0,70));fs.writeFileSync(file,s.replace(old,()=>next));}
edit('history-ui.js','    loading: false,','    loading: false,\n    scopeLoading: false,\n    refreshPending: false,\n    loadedScope: null,\n    exporting: false,');
const helpers=`  function exportScopeKey() {
    return JSON.stringify([window.ibtCurrentProfile?.id, window.ibtCurrentProfile?.role, state.currentClient, state.currentHolder, state.currentSupply, $('#historyFrom')?.value || '', $('#historyTo')?.value || '']);
  }
  function updateExportButton() {
    const btn = $('#historyExportClient');
    if (btn) btn.disabled = state.exporting || state.loading || state.scopeLoading || state.loadedScope !== exportScopeKey() || !state.records.length;
  }
  async function exportCurrentHistory() {
    const key = exportScopeKey();
    if (state.exporting || state.loading || state.scopeLoading || state.loadedScope !== key || !state.records.length) return;
    const status = $('#historyExportStatus');
    state.exporting = true;
    updateExportButton();
    if (status) status.textContent = 'Generando Excel de la selecci\u00f3n...';
    try {
      if (!window.IBTHistoryClientExport) throw new Error('No se ha cargado el exportador. Recarga la p\u00e1gina.');
      const input = structuredClone({client:state.clients.find(c=>c.id===state.currentClient), holders:state.holders, supplies:state.supplies, records:state.records, holderId:state.currentHolder, supplyId:state.currentSupply, from:$('#historyFrom')?.value || '', to:$('#historyTo')?.value || ''});
      const result = await window.IBTHistoryClientExport.exportSelection(input, {stillCurrent:()=>state.loadedScope===key && exportScopeKey()===key && !state.loading && !state.scopeLoading});
      if (status) status.textContent = result.records + ' periodos exportados en ' + result.files + ' libro(s).';
    } catch (error) {
      console.error('Exportaci\u00f3n del hist\u00f3rico', error);
      if (status) status.textContent = error?.message || 'No se pudo generar el Excel.';
    } finally { state.exporting = false; updateExportButton(); }
  }

`;
edit('history-ui.js','  function injectStyles() {',helpers+'  function injectStyles() {');
edit('history-ui.js','            <div class="history-mode-note" id="historyModeNote"></div>',`            <div class="history-mode-note" id="historyModeNote"></div>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px">
              <button id="historyExportClient" class="primary export" type="button" disabled>\u25a4 Descargar Excel cliente</button>
              <span id="historyExportStatus" class="history-scope" role="status" aria-live="polite"></span>
            </div>`);
edit('history-ui.js',"select('id,holder_id,cups,supply_name,address,current_tariff,status')","select('id,holder_id,cups,supply_name,address,city,province,current_contract_number,current_tariff,status')");
edit('history-ui.js','    state.holders = holders || [];','    if (clientId !== state.currentClient) return;\n    state.holders = holders || [];');
edit('history-ui.js',`        state.currentClient = e.target.value;
        state.currentHolder = '';
        state.currentSupply = '';
        await loadClientScope(state.currentClient);
        await refreshRecords();`, `        const clientId = e.target.value;
        state.currentClient = clientId;
        state.currentHolder = '';
        state.currentSupply = '';
        state.scopeLoading = true;
        state.loadedScope = null;
        updateExportButton();
        try { await loadClientScope(clientId); }
        catch (error) {
          if (state.currentClient === clientId) { state.records = []; state.supplies = []; $('#historyContent').innerHTML = '<div class="history-error">No se pudo cargar el cliente: ' + esc(error?.message || error) + '</div>'; }
          return;
        } finally { if (state.currentClient === clientId) { state.scopeLoading = false; updateExportButton(); } }
        if (state.currentClient === clientId) await refreshRecords();`);
edit('history-ui.js',`    if (state.loading) return;
    state.loading = true;
    const host = $('#historyContent');`, `    if (state.loading || state.scopeLoading) { state.refreshPending = true; state.loadedScope = null; updateExportButton(); return; }
    state.loading = true;
    state.refreshPending = false;
    state.loadedScope = null;
    updateExportButton();
    const requestScope = exportScopeKey();
    const host = $('#historyContent');`);
edit('history-ui.js',`      state.records = await fetchRecords(supplyIds);
      render(state.records);`, `      const records = await fetchRecords(supplyIds);
      if (requestScope !== exportScopeKey() || state.scopeLoading) { state.refreshPending = true; return; }
      state.records = records;
      render(state.records);
      state.loadedScope = requestScope;`);
edit('history-ui.js',`      state.loading = false;
    }
  }

  function bindFilters()`, `      state.loading = false;
      updateExportButton();
      if (state.refreshPending && !state.scopeLoading) { state.refreshPending = false; void refreshRecords(); }
    }
  }

  function bindFilters()`);
edit('history-ui.js',`  function bindFilters() {`, `  function bindFilters() {
    $('#historyExportClient')?.addEventListener('click', exportCurrentHistory);`);
edit('history-ui.js',`    state.role = profile.role;
    try {`, `    state.role = profile.role;
    state.scopeLoading = true;
    state.loadedScope = null;
    updateExportButton();
    try {`);
edit('history-ui.js',`      if (!state.initialized) { bindFilters(); state.initialized = true; }
      await refreshRecords();`, `      if (!state.initialized) { bindFilters(); state.initialized = true; }
      state.scopeLoading = false;
      await refreshRecords();`);
edit('history-ui.js',`      if (host) host.innerHTML = \x60<div class="history-error">No se ha podido iniciar el hist\u00f3rico: \x24{esc(error?.message || error)}</div>\x60;
    }
  }`, `      if (host) host.innerHTML = \x60<div class="history-error">No se ha podido iniciar el hist\u00f3rico: \x24{esc(error?.message || error)}</div>\x60;
    } finally { state.scopeLoading = false; updateExportButton(); }
  }`);
edit('auth-bootstrap.js','history-ui.js?v=20260908-chart1','history-ui.js?v=20260908-export1');
edit('index.html','<script src="auth-bootstrap.js?v=20260908-chart1"></script>','<script src="history-client-export.js?v=20260908-export1"></script><script src="auth-bootstrap.js?v=20260908-export1"></script>');
// The export intentionally adds master fields and stale-filter guards. Preserve
// the chart test's original exact checks for all untouched functions/modules.
edit('tests/history-chart-refresh.test.cjs',"[['  async function getClients','  function powerSignature'],['  function powerSignature','  function renderRecommendations']]","[['  function supplyById','  function powerSignature'],['  function powerSignature','  function renderRecommendations']]");
edit('tests/history-chart-refresh.test.cjs',"if(a.includes('getClients'))","if(a.includes('supplyById'))");
edit('tests/history-chart-refresh.test.cjs'," assert.equal(ui.slice(ui.indexOf('  async function refreshRecords')),old('history-ui.js').slice(old('history-ui.js').indexOf('  async function refreshRecords')));", " assert.equal(chunk(ui,'  async function fetchRecords','  function supplyById'),chunk(old('history-ui.js'),'  async function fetchRecords','  function supplyById'));\n // refreshRecords has reviewed export/stale-filter guards, covered by history-client-export-browser.cjs.");
console.log('Prepared history export only; legacy client exporter, parser, PDF resource cleanup, recommendations, authentication and RLS are unchanged.');
