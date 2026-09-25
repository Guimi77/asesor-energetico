(() => {
  'use strict';

  const INTERNAL_ROLES = new Set(['admin', 'staff']);
  const $ = (selector) => document.querySelector(selector);
  const norm = (value) => String(value ?? '').trim();
  const esc = (value) => norm(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cupsKey = (value) => norm(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  const todayLocal = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const dateES = (value) => {
    const m = norm(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : norm(value);
  };

  let supplyByCups = new Map();
  let eventsBySupply = new Map();
  let selectedSupply = null;
  let loading = false;
  let loadQueued = false;

  function isInternal(){
    return INTERNAL_ROLES.has(window.ibtCurrentProfile?.role);
  }

  function latestEvent(supplyId){
    return (eventsBySupply.get(supplyId) || [])[0] || null;
  }

  function lifecycleLabel(supply){
    if (!supply) return {text:'SIN DATOS', type:'review', title:''};
    if (supply.status === 'active') {
      const last = latestEvent(supply.id);
      if (last?.event_type === 'reactivated') {
        return {text:`ACTIVO · desde ${dateES(last.event_date)}`, type:'ok', title:last.description || ''};
      }
      return {text:'ACTIVO', type:'ok', title:''};
    }
    if (supply.status === 'archived') return {text:'ARCHIVADO', type:'review', title:'Registro archivado'};
    const last = latestEvent(supply.id);
    if (last?.event_type === 'client_exit') {
      return {text:`BAJA CLIENTE · ${dateES(last.event_date)}`, type:'review', title:last.description || ''};
    }
    if (last?.event_type === 'supply_deactivated') {
      return {text:`BAJA SUMINISTRO · ${dateES(last.event_date)}`, type:'review', title:last.description || ''};
    }
    return {text:'INACTIVO', type:'review', title:last?.description || ''};
  }

  function currentHelp(supply){
    const label = lifecycleLabel(supply);
    const last = latestEvent(supply?.id);
    if (supply?.status === 'active') return `Estado actual: ${label.text}. El histórico anterior se conserva completo.`;
    if (last?.event_type === 'client_exit') return `Este CUPS dejó la cartera del cliente el ${dateES(last.event_date)}. Sus facturas e histórico siguen conservados.`;
    if (last?.event_type === 'supply_deactivated') return `El suministro quedó dado de baja el ${dateES(last.event_date)}. Sus facturas e histórico siguen conservados.`;
    return `Estado actual: ${label.text}. El histórico se conserva completo.`;
  }

  function setMasterStatus(text, type='ok'){
    const el = $('#masterStatus');
    if (!el) return;
    el.innerHTML = `<strong>${esc(text)}</strong>`;
    el.dataset.remoteStatus = type;
  }

  async function ensureCentralSupply(cups, button){
    const existing = supplyByCups.get(cupsKey(cups));
    if (existing) return existing;
    if (!isInternal() || !window.ibtSupabase) return null;

    const local = window.EnergyMaster?.find?.(cups);
    if (!local) {
      setMasterStatus(`${cups} no está disponible en el maestro local.`, 'error');
      return null;
    }

    const client = norm(local.client || local.company);
    const holder = norm(local.holder || local.company);
    if (!client || !holder) {
      setMasterStatus(`${cups} necesita cliente y titular antes de poder gestionar su estado.`, 'error');
      return null;
    }

    const oldText = button?.textContent || 'Estado';
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparando…';
    }

    try {
      const {data,error} = await window.ibtSupabase.rpc('ensure_supply_from_master', {
        p_client_name: client,
        p_holder_name: holder,
        p_cups: cups,
        p_supply_name: norm(local.name),
        p_address: norm(local.address),
        p_city: norm(local.city),
        p_province: norm(local.province),
        p_postal_code: norm(local.postalCode || local.postal_code),
        p_tariff: norm(local.tariff),
        p_contract_number: norm(local.contract),
        p_retailer: norm(local.retailer),
        p_distributor: norm(local.distributor),
      });
      if (error) throw error;
      if (!data?.ok) {
        const messages = {
          not_authorized: 'Tu usuario no tiene permisos para sincronizar este CUPS.',
          invalid_cups: 'El CUPS no tiene un formato válido.',
          client_not_found: 'El cliente todavía no existe en el maestro central.',
          holder_not_found: 'El titular todavía no existe en el maestro central.',
        };
        setMasterStatus(`${cups} · ${messages[data?.reason] || 'No se ha podido sincronizar el suministro.'}`, 'error');
        return null;
      }

      await reloadLifecycle();
      const synced = supplyByCups.get(cupsKey(cups)) || null;
      if (synced && data.mode === 'inserted') {
        setMasterStatus(`${cups} incorporado al maestro central. Ya puede gestionarse su estado.`, 'ok');
      }
      return synced;
    } catch (error) {
      console.error('No se pudo sincronizar el CUPS antes de gestionar su estado', error);
      setMasterStatus(`${cups} · no se ha podido preparar la gestión de estado: ${String(error?.message || error)}`, 'error');
      return null;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText;
      }
    }
  }

  async function openByCups(cups, button){
    let supply = supplyByCups.get(cupsKey(cups));
    if (!supply) supply = await ensureCentralSupply(cups, button);
    if (!supply) return;
    renderModal(supply);
  }

  function decorateCupsTable(){
    const body = $('#cupsBody');
    if (!body) return;
    for (const row of body.querySelectorAll('tr')) {
      const cells = row.children;
      if (cells.length < 9) continue;
      const cups = norm(cells[3].textContent);
      if (!cups || cups === '—') continue;
      const supply = supplyByCups.get(cupsKey(cups));

      if (supply) {
        const state = lifecycleLabel(supply);
        const statusCell = cells[0];
        const current = statusCell.querySelector('.status');
        if (!current || current.dataset.lifecycleText !== state.text) {
          statusCell.innerHTML = `<span class="status ${state.type === 'ok' ? 'ok' : 'review'}" data-lifecycle-text="${esc(state.text)}" title="${esc(state.title)}">${esc(state.text)}</span>`;
        }
      }

      const actionCell = cells[8];
      let button = actionCell.querySelector('.manage-lifecycle');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary manage-lifecycle';
        button.textContent = 'Estado';
        button.style.marginLeft = '6px';
        actionCell.appendChild(button);
      }
      button.dataset.cups = cups;
      button.dataset.supplyId = supply?.id || '';
      button.title = supply ? 'Gestionar estado e historial del CUPS' : 'Este CUPS se sincronizará con el maestro central al abrir su estado';
      button.onclick = () => openByCups(cups, button);
    }
  }

  function ensureModal(){
    let modal = $('#supplyLifecycleModal');
    if (modal) return modal;

    const style = document.createElement('style');
    style.id = 'supplyLifecycleStyles';
    style.textContent = `
      #supplyLifecycleModal{position:fixed;inset:0;z-index:10000;background:rgba(4,20,43,.55);display:flex;align-items:center;justify-content:center;padding:24px}
      #supplyLifecycleModal.hidden{display:none}
      #supplyLifecycleModal .lifecycle-card{width:min(720px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.24);padding:22px}
      #supplyLifecycleModal .lifecycle-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}
      #supplyLifecycleModal .lifecycle-head h2{margin:3px 0 4px}
      #supplyLifecycleModal .lifecycle-close{min-width:auto}
      #supplyLifecycleModal .lifecycle-current{padding:10px 12px;border-radius:10px;background:#f3f6fb;margin:12px 0 16px}
      #supplyLifecycleModal .lifecycle-form{display:grid;grid-template-columns:1fr 180px;gap:12px}
      #supplyLifecycleModal .lifecycle-form label{display:flex;flex-direction:column;gap:6px;font-weight:700}
      #supplyLifecycleModal .lifecycle-form textarea{min-height:86px;resize:vertical}
      #supplyLifecycleModal .lifecycle-wide{grid-column:1/-1}
      #supplyLifecycleModal .lifecycle-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;align-items:center}
      #supplyLifecycleModal .lifecycle-message{margin-right:auto;font-weight:700}
      #supplyLifecycleModal .lifecycle-history{margin-top:20px;border-top:1px solid #e4e9f1;padding-top:14px}
      #supplyLifecycleModal .lifecycle-event{padding:9px 0;border-bottom:1px solid #edf0f5}
      #supplyLifecycleModal .lifecycle-event strong{display:block}
      #supplyLifecycleModal .lifecycle-event small{display:block;color:#64748b;margin-top:3px}
      @media(max-width:640px){#supplyLifecycleModal .lifecycle-form{grid-template-columns:1fr}#supplyLifecycleModal .lifecycle-wide{grid-column:1}}
    `;
    document.head.appendChild(style);

    modal = document.createElement('div');
    modal.id = 'supplyLifecycleModal';
    modal.className = 'hidden';
    modal.innerHTML = `
      <section class="lifecycle-card" role="dialog" aria-modal="true" aria-labelledby="lifecycleTitle">
        <div class="lifecycle-head">
          <div><p class="eyebrow">Ciclo de vida del suministro</p><h2 id="lifecycleTitle">Estado del CUPS</h2><p id="lifecycleCups" class="subtitle"></p></div>
          <button type="button" class="secondary lifecycle-close">Cerrar</button>
        </div>
        <div id="lifecycleCurrent" class="lifecycle-current"></div>
        <form id="lifecycleForm" class="lifecycle-form">
          <label>Acción<select id="lifecycleAction" required></select></label>
          <label>Fecha efectiva<input id="lifecycleDate" type="date" required></label>
          <label class="lifecycle-wide">Motivo / observación<textarea id="lifecycleReason" required maxlength="500" placeholder="Ej.: venta del local, fin de gestión con el cliente, baja definitiva del punto…"></textarea></label>
          <div class="lifecycle-actions"><span id="lifecycleMessage" class="lifecycle-message"></span><button type="button" class="secondary lifecycle-cancel">Cancelar</button><button id="lifecycleSave" type="submit" class="primary">Guardar estado</button></div>
        </form>
        <div class="lifecycle-history"><h3>Historial de cambios</h3><div id="lifecycleEvents"></div></div>
      </section>`;
    document.body.appendChild(modal);

    modal.querySelector('.lifecycle-close').onclick = closeModal;
    modal.querySelector('.lifecycle-cancel').onclick = closeModal;
    modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
    $('#lifecycleForm').addEventListener('submit', saveLifecycle);
    return modal;
  }

  function actionOptions(supply){
    const last = latestEvent(supply.id);
    if (supply.status === 'active') {
      return [
        ['client_exit', 'Baja del cliente · deja nuestra cartera'],
        ['supply_deactivated', 'Baja del suministro · punto eléctrico dado de baja'],
      ];
    }
    if (supply.status === 'inactive' && last?.event_type === 'client_exit') {
      return [
        ['reactivated', 'Reactivar suministro'],
        ['supply_deactivated', 'Registrar también la baja real del suministro'],
      ];
    }
    return [['reactivated', 'Reactivar suministro']];
  }

  function renderModal(supply){
    const modal = ensureModal();
    selectedSupply = supply;
    $('#lifecycleCups').textContent = supply.cups || '';
    const state = lifecycleLabel(supply);
    $('#lifecycleCurrent').innerHTML = `<span class="status ${state.type === 'ok' ? 'ok' : 'review'}">${esc(state.text)}</span><p>${esc(currentHelp(supply))}</p>`;
    const select = $('#lifecycleAction');
    select.innerHTML = actionOptions(supply).map(([value,label]) => `<option value="${value}">${esc(label)}</option>`).join('');
    const date = $('#lifecycleDate');
    date.value = todayLocal();
    date.max = todayLocal();
    $('#lifecycleReason').value = '';
    $('#lifecycleMessage').textContent = '';

    const events = eventsBySupply.get(supply.id) || [];
    $('#lifecycleEvents').innerHTML = events.length
      ? events.slice(0, 20).map((event) => `<div class="lifecycle-event"><strong>${esc(event.title || event.event_type)} · ${esc(dateES(event.event_date))}</strong><span>${esc(event.description || '')}</span><small>Registrado ${esc(norm(event.created_at).replace('T',' ').slice(0,16))}</small></div>`).join('')
      : '<p class="subtitle">Todavía no hay cambios de estado registrados para este CUPS.</p>';
    modal.classList.remove('hidden');
  }

  function openModal(supplyId){
    const supply = [...supplyByCups.values()].find((item) => item.id === supplyId);
    if (!supply) return;
    renderModal(supply);
  }

  function closeModal(){
    $('#supplyLifecycleModal')?.classList.add('hidden');
    selectedSupply = null;
  }

  const errorMessages = {
    supply_required: 'No se ha podido identificar el suministro.',
    event_date_required: 'Indica la fecha efectiva.',
    future_date_not_supported: 'De momento solo se pueden registrar bajas ya efectivas, no futuras.',
    description_required: 'Indica el motivo o una observación.',
    invalid_event_type: 'El tipo de cambio no es válido.',
    supply_not_found: 'El CUPS ya no existe en el maestro central.',
    archived_supply: 'El suministro está archivado y no se puede modificar desde aquí.',
  };

  async function saveLifecycle(event){
    event.preventDefault();
    if (!selectedSupply || !isInternal()) return;
    const supabase = window.ibtSupabase;
    if (!supabase) return;

    const action = $('#lifecycleAction').value;
    const effectiveDate = $('#lifecycleDate').value;
    const reason = norm($('#lifecycleReason').value);
    const message = $('#lifecycleMessage');
    const save = $('#lifecycleSave');
    if (!effectiveDate || !reason) {
      message.textContent = 'Fecha y motivo son obligatorios.';
      return;
    }

    save.disabled = true;
    message.textContent = 'Guardando…';
    try {
      const {data,error} = await supabase.rpc('set_supply_lifecycle', {
        p_supply_id: selectedSupply.id,
        p_event_type: action,
        p_event_date: effectiveDate,
        p_description: reason,
      });
      if (error) throw error;
      if (!data?.ok) {
        message.textContent = errorMessages[data?.reason] || `No se ha podido guardar el cambio (${data?.reason || 'sin detalle'}).`;
        return;
      }

      const cups = selectedSupply.cups;
      await reloadLifecycle();
      const refreshed = supplyByCups.get(cupsKey(cups));
      if (refreshed) {
        const local = window.EnergyMaster?.find?.(cups);
        if (local) {
          const state = lifecycleLabel(refreshed);
          window.EnergyMaster.add({...local, status: state.text}, {allowMove:true, fillOnly:false, preserveIdentity:true});
        }
        renderModal(refreshed);
      }
      const state = lifecycleLabel(refreshed || selectedSupply);
      setMasterStatus(`${cups} · ${state.text}. El histórico se conserva completo.`, 'ok');
      $('#lifecycleMessage').textContent = data.mode === 'existing_unchanged' ? 'Ese cambio ya estaba registrado.' : 'Cambio guardado.';
    } catch (error) {
      console.error('No se pudo actualizar el ciclo de vida del CUPS', error);
      message.textContent = `No se ha podido guardar: ${String(error?.message || error)}`;
    } finally {
      save.disabled = false;
    }
  }

  async function reloadLifecycle(){
    if (loading || !isInternal() || !window.ibtSupabase) return;
    loading = true;
    try {
      const supabase = window.ibtSupabase;
      const {data:supplies,error:supplyError} = await supabase
        .from('supplies')
        .select('id,cups,status,holder_id')
        .order('cups');
      if (supplyError) throw supplyError;

      const ids = (supplies || []).map((item) => item.id);
      let events = [];
      if (ids.length) {
        const {data,error} = await supabase
          .from('supply_events')
          .select('id,supply_id,event_date,event_type,title,description,created_at')
          .in('supply_id', ids)
          .order('event_date', {ascending:false})
          .order('created_at', {ascending:false});
        if (error) throw error;
        events = data || [];
      }

      supplyByCups = new Map((supplies || []).map((item) => [cupsKey(item.cups), item]));
      eventsBySupply = new Map();
      for (const item of events) {
        if (!eventsBySupply.has(item.supply_id)) eventsBySupply.set(item.supply_id, []);
        eventsBySupply.get(item.supply_id).push(item);
      }
      decorateCupsTable();
      window.dispatchEvent(new CustomEvent('supply-lifecycle-loaded', {detail:{supplies:supplyByCups.size,events:events.length}}));
    } catch (error) {
      console.error('No se pudo cargar el estado de los CUPS', error);
    } finally {
      loading = false;
    }
  }

  function scheduleReload(){
    if (loadQueued) return;
    loadQueued = true;
    setTimeout(() => {
      loadQueued = false;
      reloadLifecycle();
    }, 0);
  }

  function observeTable(){
    const body = $('#cupsBody');
    if (!body || body.dataset.lifecycleObserved === '1') return;
    body.dataset.lifecycleObserved = '1';
    new MutationObserver(() => decorateCupsTable()).observe(body, {childList:true, subtree:true});
    decorateCupsTable();
  }

  window.addEventListener('ibt-role-changed', () => { observeTable(); scheduleReload(); });
  window.addEventListener('xtra-supabase-synced', () => { observeTable(); scheduleReload(); });
  window.addEventListener('energy-master-ready', () => { observeTable(); scheduleReload(); });
  window.addEventListener('DOMContentLoaded', () => { observeTable(); scheduleReload(); });
  if (document.readyState !== 'loading') { observeTable(); scheduleReload(); }

  window.SupplyLifecycle = {reload:reloadLifecycle,openByCups};
})();