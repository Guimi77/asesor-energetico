(() => {
  'use strict';

  const INTERNAL_ROLES = new Set(['admin','staff']);
  const ACTIVE_STATUSES = new Set(['open','reviewing']);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cupsKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const dateES = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('es-ES');
  };

  const state = {
    clients: [],
    holders: [],
    supplies: [],
    incidents: [],
    clientId: '',
    status: 'active',
    loading: false,
    knownActive: new Set(),
    supplyByCups: new Map(),
  };

  function role() { return window.ibtCurrentProfile?.role || ''; }
  function isInternal() { return INTERNAL_ROLES.has(role()); }

  function injectStyles() {
    if ($('#alertsUiStyles')) return;
    const style = document.createElement('style');
    style.id = 'alertsUiStyles';
    style.textContent = `
      .alerts-app{display:grid;gap:16px}.alerts-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.alerts-head h2{margin:0 0 6px}.alerts-head p{margin:0;color:#65758a;max-width:760px;line-height:1.45}.alerts-toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.alerts-toolbar label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#65758a}.alerts-toolbar select{min-width:220px;padding:10px 12px;border:1px solid #dce4ed;border-radius:9px;background:#fff;color:#10233f}.alerts-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.alerts-kpi{padding:15px}.alerts-kpi small{display:block;color:#65758a}.alerts-kpi strong{display:block;font-size:24px;color:#061b38;margin:5px 0}.alerts-kpi span{font-size:12px;color:#65758a}.alerts-list{display:grid;gap:10px}.alert-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:14px;border:1px solid #dce4ed;border-left:4px solid #8190a5;border-radius:10px;background:#fff}.alert-card[data-severity="4"],.alert-card[data-severity="5"]{border-left-color:#b58232}.alert-card h3{margin:0 0 4px;font-size:16px}.alert-identity{display:block;color:#65758a;font-size:12px;line-height:1.4}.alert-description{white-space:pre-line;margin:9px 0 0;color:#10233f;line-height:1.45}.alert-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px;color:#65758a;font-size:12px}.alert-priority{display:inline-block;padding:3px 7px;border-radius:999px;background:#f3f5f8;color:#526176;font-weight:700}.alert-card[data-severity="4"] .alert-priority,.alert-card[data-severity="5"] .alert-priority{background:#fff4df;color:#83550b}.alert-status-box{min-width:160px}.alert-status-box label{display:grid;gap:5px;color:#65758a;font-size:11px;font-weight:700}.alert-status-box select{width:100%;padding:8px 9px;border:1px solid #dce4ed;border-radius:8px;background:#fff;color:#10233f;font-weight:700}.alerts-empty,.alerts-loading,.alerts-error{padding:28px;text-align:center;color:#65758a}.alerts-error{border:1px solid #f1c6c1;background:#fff3f1;color:#8f1f17;border-radius:9px}.alerts-note{margin:0;color:#65758a;font-size:12px;line-height:1.45}.analysis-alert-actions{margin-top:10px}.analysis-add-alert{font-size:12px;padding:7px 10px}.analysis-add-alert[disabled]{opacity:.72;cursor:default}@media(max-width:900px){.alerts-head{display:grid}.alerts-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.alert-card{grid-template-columns:1fr}.alert-status-box{min-width:0}}@media(max-width:560px){.alerts-kpis{grid-template-columns:1fr}.alerts-toolbar{display:grid}.alerts-toolbar select{min-width:0;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureView() {
    let view = $('#alertasView');
    if (!view) {
      view = document.createElement('div');
      view.id = 'alertasView';
      view.className = 'app-view hidden';
      const users = $('#usersView');
      if (users?.parentNode) users.parentNode.insertBefore(view, users);
      else document.querySelector('.app-shell')?.appendChild(view);
    }
    if (!view.dataset.alertsShell) {
      view.dataset.alertsShell = '1';
      view.innerHTML = `
        <div class="alerts-app">
          <section class="card alerts-head">
            <div>
              <p class="eyebrow">Seguimiento interno</p>
              <h2>Alertas en seguimiento</h2>
              <p>Aquí guardamos solo los puntos que ELECTRICA BT ha decidido revisar. El análisis detecta; esta pantalla sirve para no perder el seguimiento.</p>
            </div>
            <div class="alerts-toolbar">
              <label>Cliente<select id="alertsClient"></select></label>
              <label>Estado<select id="alertsStatus"><option value="active">Pendientes y en revisión</option><option value="open">Pendientes</option><option value="reviewing">En revisión</option><option value="resolved">Resueltas</option><option value="dismissed">Descartadas</option><option value="all">Todas</option></select></label>
            </div>
          </section>
          <div id="alertsContent"><div class="alerts-loading">Cargando alertas…</div></div>
        </div>`;
    }
    injectStyles();
    return view;
  }

  function bindNav() {
    const link = [...document.querySelectorAll('.sidebar nav a')].find(a => String(a.textContent || '').trim().includes('Alertas'));
    if (!link) return;
    link.dataset.view = 'alertas';
    link.classList.toggle('hidden', !isInternal());
    if (!isInternal()) {
      $('#alertasView')?.classList.add('hidden');
      return;
    }
    if (link.dataset.alertsBound === '1') return;
    link.dataset.alertsBound = '1';
    link.addEventListener('click', () => {
      if (!isInternal()) return;
      document.querySelectorAll('.app-view').forEach(view => view.classList.add('hidden'));
      ensureView().classList.remove('hidden');
      document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.toggle('active', a === link));
      if ($('#pageTitle')) $('#pageTitle').textContent = 'Alertas';
      if ($('#pageSubtitle')) $('#pageSubtitle').textContent = 'Seguimiento interno de los puntos que hemos decidido revisar.';
      if ($('#pageEyebrow')) $('#pageEyebrow').textContent = 'Trabajo pendiente';
      initialize();
    });
  }

  function priorityLabel(severity) {
    const value = Number(severity) || 1;
    if (value >= 4) return 'Prioridad alta';
    if (value === 3) return 'Prioridad media';
    return 'Prioridad normal';
  }

  function statusLabel(status) {
    return ({open:'Pendiente',reviewing:'En revisión',resolved:'Resuelta',dismissed:'Descartada'})[status] || status;
  }

  async function loadReferenceData() {
    const supabase = window.ibtSupabase;
    const [{data:clients,error:cErr},{data:holders,error:hErr},{data:supplies,error:sErr},{data:incidents,error:iErr}] = await Promise.all([
      supabase.from('clients').select('id,name,status').order('name'),
      supabase.from('holders').select('id,client_id,legal_name,status').order('legal_name'),
      supabase.from('supplies').select('id,holder_id,cups,cups_key,supply_name,address,status').order('cups'),
      supabase.from('incidents').select('id,supply_id,invoice_id,title,description,severity,status,detected_at,resolved_at,created_by').order('detected_at',{ascending:false}),
    ]);
    if (cErr) throw cErr;
    if (hErr) throw hErr;
    if (sErr) throw sErr;
    if (iErr) throw iErr;
    state.clients = clients || [];
    state.holders = holders || [];
    state.supplies = supplies || [];
    state.incidents = incidents || [];
    state.supplyByCups = new Map(state.supplies.map(s => [cupsKey(s.cups_key || s.cups), s]));
    state.knownActive = new Set(state.incidents.filter(i => ACTIVE_STATUSES.has(i.status)).map(i => `${i.supply_id}|${i.title}`));
  }

  function renderControls() {
    const client = $('#alertsClient');
    const status = $('#alertsStatus');
    if (client) {
      if (!state.clientId || !state.clients.some(c => c.id === state.clientId)) state.clientId = state.clients[0]?.id || '';
      client.innerHTML = state.clients.map(c => `<option value="${esc(c.id)}" ${c.id===state.clientId?'selected':''}>${esc(c.name)}</option>`).join('');
      client.onchange = () => { state.clientId = client.value; render(); };
    }
    if (status) {
      status.value = state.status;
      status.onchange = () => { state.status = status.value; render(); };
    }
  }

  function incidentContext(incident) {
    const supply = state.supplies.find(s => s.id === incident.supply_id);
    const holder = state.holders.find(h => h.id === supply?.holder_id);
    const client = state.clients.find(c => c.id === holder?.client_id);
    return {supply, holder, client};
  }

  function filteredIncidents() {
    const list = state.incidents.filter(incident => {
      const {holder} = incidentContext(incident);
      if (state.clientId && holder?.client_id !== state.clientId) return false;
      if (state.status === 'active') return ACTIVE_STATUSES.has(incident.status);
      if (state.status !== 'all' && incident.status !== state.status) return false;
      return true;
    });
    const statusOrder = {open:0,reviewing:1,resolved:2,dismissed:3};
    return list.sort((a,b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || (Number(b.severity)||0) - (Number(a.severity)||0) || String(b.detected_at||'').localeCompare(String(a.detected_at||'')));
  }

  function card(incident) {
    const {supply,holder} = incidentContext(incident);
    const name = supply?.supply_name || supply?.address || 'Suministro';
    const identity = [holder?.legal_name, supply?.cups].filter(Boolean).join(' · ');
    return `<article class="alert-card" data-id="${esc(incident.id)}" data-severity="${Number(incident.severity)||1}"><div><h3>${esc(incident.title)}</h3><span class="alert-identity">${esc(name)}${identity?` · ${esc(identity)}`:''}</span><p class="alert-description">${esc(incident.description || 'Pendiente de revisar.')}</p><div class="alert-meta"><span class="alert-priority">${esc(priorityLabel(incident.severity))}</span><span>Detectada ${esc(dateES(incident.detected_at))}</span></div></div><div class="alert-status-box"><label>Seguimiento<select class="alert-status" data-id="${esc(incident.id)}"><option value="open" ${incident.status==='open'?'selected':''}>Pendiente</option><option value="reviewing" ${incident.status==='reviewing'?'selected':''}>En revisión</option><option value="resolved" ${incident.status==='resolved'?'selected':''}>Resuelta</option><option value="dismissed" ${incident.status==='dismissed'?'selected':''}>Descartada</option></select></label></div></article>`;
  }

  function render() {
    const host = $('#alertsContent');
    if (!host) return;
    const clientIncidents = state.incidents.filter(i => incidentContext(i).holder?.client_id === state.clientId);
    const counts = {
      open: clientIncidents.filter(i => i.status === 'open').length,
      reviewing: clientIncidents.filter(i => i.status === 'reviewing').length,
      closed: clientIncidents.filter(i => i.status === 'resolved' || i.status === 'dismissed').length,
      total: clientIncidents.length,
    };
    const list = filteredIncidents();
    host.innerHTML = `
      <section class="alerts-kpis">
        <article class="card alerts-kpi"><small>Pendientes</small><strong>${counts.open}</strong><span>todavía sin revisar</span></article>
        <article class="card alerts-kpi"><small>En revisión</small><strong>${counts.reviewing}</strong><span>casos que ya estamos estudiando</span></article>
        <article class="card alerts-kpi"><small>Cerradas</small><strong>${counts.closed}</strong><span>resueltas o descartadas</span></article>
        <article class="card alerts-kpi"><small>Total</small><strong>${counts.total}</strong><span>alertas guardadas para este cliente</span></article>
      </section>
      <section class="card" style="padding:18px"><div class="section-head"><div><p class="eyebrow">Bandeja interna</p><h2 style="margin:0">Qué tenemos pendiente</h2></div><span class="history-pill">${list.length} visible${list.length===1?'':'s'}</span></div><p class="alerts-note">Las alertas aparecen aquí solo cuando alguien de ELECTRICA BT decide seguirlas desde la pantalla de Análisis. No se crean presupuestos ni cifras de ahorro automáticamente.</p><div class="alerts-list" style="margin-top:12px">${list.length ? list.map(card).join('') : '<div class="alerts-empty">No hay alertas en este estado. Desde <strong>Análisis</strong> puedes añadir un punto que quieras seguir.</div>'}</div></section>`;
    $$('.alert-status', host).forEach(select => select.addEventListener('change', () => updateStatus(select.dataset.id, select.value)));
  }

  async function updateStatus(id, status) {
    if (!isInternal() || !['open','reviewing','resolved','dismissed'].includes(status)) return;
    const resolvedAt = status === 'resolved' || status === 'dismissed' ? new Date().toISOString() : null;
    const {error} = await window.ibtSupabase.from('incidents').update({status,resolved_at:resolvedAt}).eq('id',id);
    if (error) {
      alert('No se pudo actualizar la alerta: ' + error.message);
      await initialize();
      return;
    }
    const incident = state.incidents.find(i => i.id === id);
    if (incident) { incident.status = status; incident.resolved_at = resolvedAt; }
    state.knownActive = new Set(state.incidents.filter(i => ACTIVE_STATUSES.has(i.status)).map(i => `${i.supply_id}|${i.title}`));
    render();
    decorateAnalysis();
    window.dispatchEvent(new CustomEvent('ibt-alerts-changed'));
  }

  function extractCardPayload(card) {
    const title = $('.analysis-item h3', card)?.textContent?.trim() || '';
    const identity = $('.analysis-identity', card)?.textContent || '';
    const cups = (identity.match(/\bES[A-Z0-9]{18,24}\b/i) || [])[0] || '';
    const summary = $('.analysis-summary', card)?.textContent?.trim() || '';
    const reviewRaw = $('.analysis-check', card)?.textContent?.trim() || '';
    const review = reviewRaw.replace(/^Qué conviene revisar:\s*/i,'');
    const priority = card.classList.contains('analysis-item-priority');
    const readingRisk = /datos fiables|lecturas/i.test(title + ' ' + summary);
    return {title,cups,summary,review,severity:priority?4:(readingRisk?3:2)};
  }

  async function addAnalysisCard(card, button) {
    if (!isInternal()) return;
    const payload = extractCardPayload(card);
    const supply = state.supplyByCups.get(cupsKey(payload.cups));
    if (!supply || !payload.title) {
      button.textContent = 'No se pudo identificar';
      return;
    }
    const key = `${supply.id}|${payload.title}`;
    if (state.knownActive.has(key)) {
      button.textContent = 'En Alertas ✓';
      button.disabled = true;
      return;
    }
    button.disabled = true;
    button.textContent = 'Añadiendo…';
    const description = [payload.summary, payload.review ? `Qué revisar: ${payload.review}` : ''].filter(Boolean).join('\n');
    const {data,error} = await window.ibtSupabase.from('incidents').insert({
      supply_id:supply.id,
      invoice_id:null,
      title:payload.title,
      description,
      severity:payload.severity,
      status:'open',
      created_by:window.ibtCurrentProfile?.id || null,
    }).select('id,supply_id,invoice_id,title,description,severity,status,detected_at,resolved_at,created_by').single();
    if (error) {
      button.disabled = false;
      button.textContent = 'Añadir a Alertas';
      alert('No se pudo guardar la alerta: ' + error.message);
      return;
    }
    state.incidents.unshift(data);
    state.knownActive.add(key);
    button.textContent = 'En Alertas ✓';
    button.disabled = true;
    window.dispatchEvent(new CustomEvent('ibt-alerts-changed'));
  }

  function decorateAnalysis() {
    if (!isInternal()) return;
    const host = $('#analysisContent');
    if (!host) return;
    $$('.analysis-item', host).forEach(card => {
      let actions = $('.analysis-alert-actions', card);
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'analysis-alert-actions';
        actions.innerHTML = '<button type="button" class="secondary analysis-add-alert">Añadir a Alertas</button>';
        card.appendChild(actions);
      }
      const button = $('.analysis-add-alert', actions);
      if (!button || button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      const payload = extractCardPayload(card);
      const supply = state.supplyByCups.get(cupsKey(payload.cups));
      if (supply && state.knownActive.has(`${supply.id}|${payload.title}`)) {
        button.textContent = 'En Alertas ✓';
        button.disabled = true;
      }
      button.addEventListener('click', () => addAnalysisCard(card, button));
    });
  }

  const observer = new MutationObserver(() => decorateAnalysis());

  async function initialize() {
    ensureView();
    bindNav();
    if (!isInternal() || !window.ibtSupabase || state.loading) return;
    state.loading = true;
    const host = $('#alertsContent');
    if (host && !$('#alertasView')?.classList.contains('hidden')) host.innerHTML = '<div class="alerts-loading">Cargando alertas…</div>';
    try {
      await loadReferenceData();
      renderControls();
      if (!$('#alertasView')?.classList.contains('hidden')) render();
      decorateAnalysis();
    } catch (error) {
      console.error('Carga de alertas', error);
      if (host && !$('#alertasView')?.classList.contains('hidden')) host.innerHTML = `<div class="alerts-error">No se pudieron cargar las alertas: ${esc(error?.message || error)}</div>`;
    } finally {
      state.loading = false;
    }
  }

  window.addEventListener('ibt-role-changed', () => { bindNav(); initialize(); });
  window.addEventListener('ibt-alerts-changed', () => {
    if (!state.loading) initialize();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindNav(); ensureView(); injectStyles();
      const analysis = $('#analysisContent');
      if (analysis) observer.observe(analysis,{childList:true,subtree:true});
    });
  } else {
    bindNav(); ensureView(); injectStyles();
    const analysis = $('#analysisContent');
    if (analysis) observer.observe(analysis,{childList:true,subtree:true});
  }

  window.IBTAlertsUI = Object.freeze({initialize,decorateAnalysis});
})();