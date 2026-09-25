(() => {
  'use strict';

  const INTERNAL_ROLES = new Set(['admin','staff']);
  const PHONE_DISPLAY = '661 728 397';
  const PHONE_LINK = '661728397';
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const activeStatus = (value) => {
    const status = String(value || 'active').trim().toUpperCase();
    return status === 'ACTIVE' || status === 'ACTIVO' || status.startsWith('ACTIVO ·');
  };

  const state = {
    clients: [],
    holders: [],
    supplies: [],
    records: [],
    clientId: '',
    loading: false,
    loadToken: 0,
  };

  function ensureView() {
    let view = $('#analisisView');
    if (!view) {
      view = document.createElement('div');
      view.id = 'analisisView';
      view.className = 'app-view hidden';
      const users = $('#usersView');
      if (users?.parentNode) users.parentNode.insertBefore(view, users);
      else document.querySelector('.app-shell')?.appendChild(view);
    }
    if (!view.dataset.analysisShell) {
      view.dataset.analysisShell = '1';
      view.innerHTML = `
        <div class="analysis-app">
          <section class="card analysis-head">
            <div>
              <p class="eyebrow">Diagnóstico energético</p>
              <h2>Qué merece atención</h2>
              <p>Te mostramos solo los puntos que conviene revisar. No hacemos una propuesta económica ni calculamos ahorros automáticamente.</p>
            </div>
            <div id="analysisClientControl"></div>
          </section>
          <div id="analysisContent"><div class="analysis-loading">Cargando análisis…</div></div>
        </div>`;
    }
    injectStyles();
    return view;
  }

  function injectStyles() {
    if ($('#analysisUiStyles')) return;
    const style = document.createElement('style');
    style.id = 'analysisUiStyles';
    style.textContent = `
      .analysis-app{display:grid;gap:16px}.analysis-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.analysis-head h2{margin:0 0 6px}.analysis-head p{margin:0;color:#65758a;max-width:760px;line-height:1.45}.analysis-client-select{min-width:260px}.analysis-client-select label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#65758a}.analysis-client-select select,.analysis-client-fixed{width:100%;padding:10px 12px;border:1px solid #dce4ed;border-radius:9px;background:#fff;color:#10233f}.analysis-client-fixed{font-weight:800;background:#eef1ff;color:#1834b8}.analysis-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.analysis-kpi{padding:16px}.analysis-kpi small{display:block;color:#65758a}.analysis-kpi strong{display:block;font-size:24px;color:#061b38;margin:5px 0}.analysis-kpi span{font-size:12px;color:#65758a;line-height:1.35}.analysis-section{padding:18px}.analysis-section-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.analysis-section-head h2{margin:0}.analysis-section-head p{margin:5px 0 0;color:#65758a;font-size:13px}.analysis-count{padding:5px 9px;border-radius:999px;background:#eef1ff;color:#1834b8;font-weight:800;font-size:12px;white-space:nowrap}.analysis-list{display:grid;gap:10px}.analysis-item{border:1px solid #dce4ed;border-left:4px solid #1834b8;border-radius:10px;padding:14px;background:#fff}.analysis-item-priority{border-left-color:#b58232}.analysis-item-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start}.analysis-item h3{margin:0 0 4px;font-size:16px}.analysis-identity{display:block;color:#65758a;font-size:12px;line-height:1.35}.analysis-summary{margin:9px 0 0;color:#10233f;line-height:1.45}.analysis-check{margin:7px 0 0;color:#526176;font-size:13px;line-height:1.45}.analysis-badge{min-width:124px;max-width:170px;padding:8px 10px;border-radius:9px;background:#fff8eb;border:1px solid #efd8ad;color:#83550b;text-align:center;font-size:12px;font-weight:800}.analysis-badge span{display:block;margin-top:3px;font-size:12px}.analysis-cta{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px;border-left:4px solid #1834b8}.analysis-cta h2{margin:0 0 4px}.analysis-cta p{margin:0;color:#65758a}.analysis-call{display:inline-flex;align-items:center;justify-content:center;padding:11px 15px;border-radius:9px;background:#1834b8;color:#fff;text-decoration:none;font-weight:800;white-space:nowrap}.analysis-empty,.analysis-loading,.analysis-error{padding:26px;text-align:center;color:#65758a}.analysis-error{border:1px solid #f1c6c1;background:#fff3f1;color:#8f1f17;border-radius:9px}.analysis-note{margin:0;color:#65758a;font-size:12px;line-height:1.4}.analysis-note strong{color:#10233f}@media(max-width:1000px){.analysis-head{display:grid}.analysis-client-select{min-width:0}.analysis-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.analysis-item-top{grid-template-columns:1fr}.analysis-badge{max-width:none;text-align:left}.analysis-cta{display:grid}}@media(max-width:620px){.analysis-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function bindNav() {
    const link = [...document.querySelectorAll('.sidebar nav a')].find(a => String(a.textContent || '').trim().includes('Análisis'));
    if (!link || link.dataset.analysisBound === '1') return;
    link.dataset.analysisBound = '1';
    link.dataset.view = 'analisis';
    link.addEventListener('click', () => {
      document.querySelectorAll('.app-view').forEach(view => view.classList.add('hidden'));
      ensureView().classList.remove('hidden');
      document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.toggle('active', a === link));
      if ($('#pageTitle')) $('#pageTitle').textContent = 'Análisis';
      if ($('#pageSubtitle')) $('#pageSubtitle').textContent = 'Qué merece atención y por qué conviene revisarlo.';
      if ($('#pageEyebrow')) $('#pageEyebrow').textContent = 'Diagnóstico energético';
      initialize();
    });
  }

  async function loadClients() {
    const {data, error} = await window.ibtSupabase.from('clients').select('id,name,status').order('name');
    if (error) throw error;
    return data || [];
  }

  async function loadScope(clientId, token) {
    const supabase = window.ibtSupabase;
    const {data: holders, error: holderError} = await supabase.from('holders').select('id,client_id,legal_name,status').eq('client_id', clientId).order('legal_name');
    if (holderError) throw holderError;
    if (token !== state.loadToken) return;
    const holderIds = (holders || []).map(h => h.id);
    let supplies = [];
    if (holderIds.length) {
      const {data, error} = await supabase.from('supplies').select('id,holder_id,cups,supply_name,address,city,province,current_tariff,status').in('holder_id', holderIds).order('cups');
      if (error) throw error;
      supplies = data || [];
    }
    if (token !== state.loadToken) return;

    const activeSupplies = supplies.filter(s => activeStatus(s.status));
    const supplyIds = activeSupplies.map(s => s.id);
    let records = [];
    if (supplyIds.length) {
      const {data, error} = await supabase.from('invoices').select(`
        id,supply_id,invoice_number,billing_start,billing_end,billing_days,tariff,
        consumption_kwh,energy_cost_eur,excess_cost_eur,reactive_cost_eur,total_eur,
        validation_status,reading_status,
        invoice_power_periods(period,contracted_kw),
        invoice_maximeters(period,maximeter_kw,reliable,source),
        invoice_excesses(period,excess_kw,amount_eur),
        invoice_reactive(period,reactive_kvarh,amount_eur)
      `).in('supply_id', supplyIds).order('billing_start', {ascending:true});
      if (error) throw error;
      records = data || [];
    }
    if (token !== state.loadToken) return;
    state.holders = holders || [];
    state.supplies = supplies;
    state.records = records;
  }

  function clientControl() {
    const host = $('#analysisClientControl');
    if (!host) return;
    const role = window.ibtCurrentProfile?.role;
    const current = state.clients.find(c => c.id === state.clientId) || state.clients[0];
    if (INTERNAL_ROLES.has(role)) {
      host.innerHTML = `<div class="analysis-client-select"><label>Cliente<select id="analysisClient">${state.clients.map(c => `<option value="${esc(c.id)}" ${c.id===state.clientId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label></div>`;
      $('#analysisClient')?.addEventListener('change', event => {
        state.clientId = event.target.value;
        refresh();
      });
    } else {
      host.innerHTML = `<div class="analysis-client-select"><label>Cliente<div class="analysis-client-fixed">${esc(current?.name || 'Cliente')}</div></label></div>`;
    }
  }

  function fallbackPlain(item) {
    if (item.type === 'excess') return {title:'Estás pagando penalizaciones por superar la potencia contratada',summary:'Hemos detectado cargos por exceso de potencia.',recommendation:'Conviene revisar cuándo se producen los picos.',badge:'Revisar',badgeDetail:item.amount ? `${Number(item.amount).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} €` : ''};
    if (item.type === 'reactive') return {title:'Estás pagando un coste adicional por energía reactiva',summary:'Hemos detectado cargos por energía reactiva.',recommendation:'Conviene revisar su origen y la compensación existente.',badge:'Revisar',badgeDetail:item.amount ? `${Number(item.amount).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} €` : ''};
    if (item.type === 'power') return {title:'La potencia contratada podría estar por encima del uso observado',summary:'La demanda registrada se ha mantenido baja respecto a la potencia contratada.',recommendation:'Conviene revisar el histórico completo antes de plantear cambios.',badge:'Estudiar',badgeDetail:''};
    if (item.type === 'reading-quality') return {title:'Faltan datos fiables de consumo en algunas facturas',summary:'Hay periodos cuyo consumo no debe interpretarse todavía como real.',recommendation:'Conviene revisar las lecturas antes de sacar conclusiones.',badge:'Revisar datos',badgeDetail:''};
    if (item.type === 'consumption-up' || item.type === 'consumption-down') return {title:'El consumo ha cambiado de forma importante',summary:'Los últimos periodos se alejan claramente del comportamiento anterior.',recommendation:'Conviene confirmar qué ha cambiado en el uso del suministro.',badge:'Revisar',badgeDetail:''};
    return {title:item.title || 'Hay algo que merece revisión',summary:'Hemos detectado un comportamiento que conviene revisar.',recommendation:'Conviene revisar el suministro con más detalle.',badge:'Revisar',badgeDetail:''};
  }

  function plain(item) {
    try { return window.IBTHumanLanguage?.plain?.(item) || fallbackPlain(item); }
    catch (_) { return fallbackPlain(item); }
  }

  function card(item, priority, supplyMap, holderMap) {
    const supply = supplyMap.get(item.supplyId);
    const holder = holderMap.get(supply?.holder_id);
    const copy = plain(item);
    const name = supply?.supply_name || supply?.address || 'Suministro';
    const identity = [holder?.legal_name, supply?.cups].filter(Boolean).join(' · ');
    return `<article class="analysis-item ${priority?'analysis-item-priority':''}"><div class="analysis-item-top"><div><h3>${esc(copy.title)}</h3><span class="analysis-identity">${esc(name)}${identity ? ` · ${esc(identity)}` : ''}</span><p class="analysis-summary">${esc(copy.summary)}</p><p class="analysis-check"><strong>Qué conviene revisar:</strong> ${esc(copy.recommendation)}</p></div><div class="analysis-badge">${esc(copy.badge || 'Revisar')}${copy.badgeDetail ? `<span>${esc(copy.badgeDetail)}</span>` : ''}</div></div></article>`;
  }

  function render() {
    const host = $('#analysisContent');
    if (!host) return;
    const activeSupplies = state.supplies.filter(s => activeStatus(s.status));
    const validRecords = state.records.filter(r => r.validation_status === 'valid');
    let result;
    try {
      result = window.IBTHistoryRecommendations?.build({records:state.records, supplies:activeSupplies, holders:state.holders}) || {items:[]};
    } catch (error) {
      console.error('No se pudo preparar el análisis', error);
      host.innerHTML = '<div class="analysis-error">No se ha podido preparar el análisis. El histórico sigue disponible.</div>';
      return;
    }
    const items = Array.isArray(result.items) ? result.items : [];
    const priority = items.filter(item => item.type === 'excess' || item.type === 'reactive').sort((a,b) => (Number(b.amount)||0) - (Number(a.amount)||0));
    const other = items.filter(item => item.type !== 'excess' && item.type !== 'reactive').sort((a,b) => {
      const order = {'reading-quality':0,'power':1,'consumption-up':2,'consumption-down':2,'zero-consumption':3};
      return (order[a.type] ?? 9) - (order[b.type] ?? 9) || Math.abs(Number(b.changeRatio)||0) - Math.abs(Number(a.changeRatio)||0);
    });
    const supplyMap = new Map(activeSupplies.map(s => [s.id,s]));
    const holderMap = new Map(state.holders.map(h => [h.id,h]));
    const inactive = state.supplies.length - activeSupplies.length;

    host.innerHTML = `
      <section class="analysis-kpis">
        <article class="card analysis-kpi"><small>Suministros activos</small><strong>${activeSupplies.length}</strong><span>puntos incluidos en el diagnóstico actual</span></article>
        <article class="card analysis-kpi"><small>Facturas revisadas</small><strong>${validRecords.length}</strong><span>registros históricos validados</span></article>
        <article class="card analysis-kpi"><small>Revisar primero</small><strong>${priority.length}</strong><span>avisos con cargos detectados en las facturas</span></article>
        <article class="card analysis-kpi"><small>Otros avisos</small><strong>${other.length}</strong><span>cambios o datos que conviene comprobar</span></article>
      </section>
      ${inactive ? `<p class="analysis-note"><strong>${inactive}</strong> suministro${inactive===1?'':'s'} inactivo${inactive===1?'':'s'} se mantiene${inactive===1?'':'n'} en el histórico, pero no genera${inactive===1?'':'n'} avisos actuales.</p>` : ''}
      ${priority.length ? `<section class="card analysis-section"><div class="analysis-section-head"><div><h2>Revisar primero</h2><p>Son cargos que ya aparecen en las facturas. Aquí solo señalamos dónde merece la pena mirar.</p></div><span class="analysis-count">${priority.length} ${priority.length===1?'aviso':'avisos'}</span></div><div class="analysis-list">${priority.map(item => card(item,true,supplyMap,holderMap)).join('')}</div></section>` : ''}
      <section class="card analysis-section"><div class="analysis-section-head"><div><h2>También conviene revisar</h2><p>Cambios, lecturas o patrones que merecen comprobación antes de sacar conclusiones.</p></div><span class="analysis-count">${other.length} ${other.length===1?'aviso':'avisos'}</span></div><div class="analysis-list">${other.length ? other.map(item => card(item,false,supplyMap,holderMap)).join('') : '<div class="analysis-empty">No hemos detectado otros avisos claros con los datos disponibles.</div>'}</div></section>
      <section class="card analysis-cta"><div><h2>¿Quieres que revisemos alguno de estos puntos?</h2><p>Llámanos y estudiaremos el caso contigo antes de plantear cualquier cambio.</p></div><a class="analysis-call" href="tel:${PHONE_LINK}">Llamar · ${PHONE_DISPLAY}</a></section>`;
  }

  async function refresh() {
    if (!state.clientId || state.loading) return;
    const host = $('#analysisContent');
    if (host) host.innerHTML = '<div class="analysis-loading">Preparando análisis…</div>';
    state.loading = true;
    const token = ++state.loadToken;
    try {
      await loadScope(state.clientId, token);
      if (token === state.loadToken) render();
    } catch (error) {
      console.error('Carga de análisis', error);
      if (token === state.loadToken && host) host.innerHTML = `<div class="analysis-error">No se ha podido cargar el análisis: ${esc(error?.message || error)}</div>`;
    } finally {
      if (token === state.loadToken) state.loading = false;
    }
  }

  async function initialize() {
    ensureView();
    bindNav();
    if (!window.ibtSupabase || !window.ibtCurrentProfile || state.loading) return;
    try {
      state.clients = await loadClients();
      if (!state.clients.length) {
        $('#analysisContent').innerHTML = '<div class="analysis-empty">No hay ningún cliente asignado a esta cuenta.</div>';
        return;
      }
      if (!state.clientId || !state.clients.some(c => c.id === state.clientId)) state.clientId = state.clients[0].id;
      clientControl();
      await refresh();
    } catch (error) {
      console.error('Inicialización de análisis', error);
      $('#analysisContent').innerHTML = `<div class="analysis-error">No se ha podido iniciar el análisis: ${esc(error?.message || error)}</div>`;
    }
  }

  window.addEventListener('ibt-role-changed', () => {
    bindNav();
    if (!$('#analisisView')?.classList.contains('hidden')) initialize();
  });
  window.addEventListener('supply-lifecycle-loaded', () => {
    if (!$('#analisisView')?.classList.contains('hidden')) refresh();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { bindNav(); ensureView(); });
  else { bindNav(); ensureView(); }

  window.IBTAnalysisUI = Object.freeze({initialize,refresh});
})();