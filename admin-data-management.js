(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (value) => String(value ?? '').trim().toLowerCase();
  const isAdmin = () => window.ibtCurrentProfile?.role === 'admin';
  const STORAGE = 'ibt-energy-master-v1';

  const state = {
    clients: [],
    holders: [],
    supplies: [],
    invoiceCounts: new Map(),
    supplyDependencyCounts: new Map(),
    latestInvoiceBySupply: new Map(),
    showArchivedClients: false,
    showArchivedHolders: false,
    showArchivedSupplies: false,
    loading: false,
  };

  function injectStyles() {
    if ($('#adminDataManagementStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminDataManagementStyles';
    style.textContent = `
      .db-admin-card{display:none;margin-top:16px}.db-admin-card.visible{display:block}.db-admin-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}.db-admin-head h2{margin:2px 0 4px}.db-admin-head p{margin:0;color:#65758a}.db-admin-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.db-admin-search{min-width:260px;padding:10px 12px;border:1px solid #d8e2ef;border-radius:9px}.db-admin-list{display:grid;gap:9px;margin-top:14px}.db-admin-row{display:grid;grid-template-columns:minmax(220px,1.4fr) minmax(180px,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid #e0e7ef;border-radius:10px;background:#fff}.db-admin-row.archived{background:#f7f8fa;color:#5f6d7d}.db-admin-meta{display:block;margin-top:4px;color:#718096;font-size:12px}.db-admin-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap}.db-danger{border:1px solid #d92d20!important;color:#b42318!important;background:#fff!important}.db-warning{border:1px solid #d6a14a!important;color:#8a5a00!important;background:#fffaf0!important}.db-restore{border:1px solid #2f855a!important;color:#276749!important;background:#f0fff4!important}.db-admin-note{margin-top:12px;padding:10px 12px;border-radius:9px;background:#f7f9fc;color:#5b6c82;font-size:12px}.db-admin-msg{min-height:18px;margin-top:10px;font-size:12px;font-weight:700}.db-admin-msg.error{color:#b42318}.db-admin-msg.ok{color:#237a45}.db-empty{padding:18px;text-align:center;color:#718096;border:1px dashed #d8e2ef;border-radius:10px}.db-status{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;background:#e9f7ee;color:#237a45}.db-status.archived{background:#eef1f5;color:#65758a}.db-locked{font-size:11px;color:#8a6a2c}.db-user-actions{display:flex;gap:6px;align-items:center}.db-user-self{font-size:12px;color:#718096}.db-mismatch{display:block;margin-top:5px;color:#9a5b00;font-weight:800}.db-mismatch-ok{display:block;margin-top:5px;color:#237a45;font-weight:700}@media(max-width:900px){.db-admin-row{grid-template-columns:1fr}.db-admin-actions{justify-content:flex-start}.db-admin-search{min-width:0;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanels() {
    const clientsView = $('#clientesView');
    if (clientsView && !$('#centralClientsAdmin')) {
      const panel = document.createElement('section');
      panel.id = 'centralClientsAdmin';
      panel.className = 'card db-admin-card';
      panel.innerHTML = `
        <div class="db-admin-head">
          <div><p class="eyebrow">Base central</p><h2>Administrar clientes</h2><p>Archivar conserva todo el histórico. El borrado definitivo solo se ofrece cuando el cliente está vacío.</p></div>
          <div class="db-admin-tools"><input id="centralClientSearch" class="db-admin-search" placeholder="Buscar cliente…"><label><input id="showArchivedClients" type="checkbox"> Mostrar archivados</label></div>
        </div>
        <div id="centralClientsList" class="db-admin-list"></div>
        <div id="centralClientsMsg" class="db-admin-msg" role="status" aria-live="polite"></div>
        <div class="db-admin-note">Los clientes archivados dejan de ser accesibles para cuentas de cliente, pero el personal interno mantiene el histórico para consulta y auditoría.</div>`;
      const anchor = $('#clientEditor', clientsView) || clientsView.firstElementChild;
      anchor?.insertAdjacentElement('beforebegin', panel);
    }

    if (clientsView && !$('#centralHoldersAdmin')) {
      const panel = document.createElement('section');
      panel.id = 'centralHoldersAdmin';
      panel.className = 'card db-admin-card';
      panel.innerHTML = `
        <div class="db-admin-head">
          <div><p class="eyebrow">Base central</p><h2>Administrar titulares</h2><p>El titular actual del CUPS puede cambiar sin borrar las facturas antiguas. Editar corrige la identidad; archivar conserva la trazabilidad; eliminar solo se permite si el titular ya no tiene suministros.</p></div>
          <div class="db-admin-tools"><input id="centralHolderSearch" class="db-admin-search" placeholder="Buscar titular, NIF/CIF o cliente…"><label><input id="showArchivedHolders" type="checkbox"> Mostrar archivados</label></div>
        </div>
        <div id="centralHoldersList" class="db-admin-list"></div>
        <div id="centralHoldersMsg" class="db-admin-msg" role="status" aria-live="polite"></div>
        <div class="db-admin-note">Un cambio real de titular mueve el CUPS al nuevo titular. Las facturas históricas conservan el nombre y NIF/CIF que figuraban en cada documento.</div>`;
      const anchor = $('#clientEditor', clientsView) || clientsView.firstElementChild;
      anchor?.insertAdjacentElement('beforebegin', panel);
    }

    const cupsView = $('#cupsView');
    if (cupsView && !$('#centralSuppliesAdmin')) {
      const panel = document.createElement('section');
      panel.id = 'centralSuppliesAdmin';
      panel.className = 'card db-admin-card';
      panel.innerHTML = `
        <div class="db-admin-head">
          <div><p class="eyebrow">Base central</p><h2>Administrar suministros</h2><p>Un CUPS con histórico se archiva; no se destruye. El borrado definitivo queda reservado a registros sin datos dependientes.</p></div>
          <div class="db-admin-tools"><input id="centralSupplySearch" class="db-admin-search" placeholder="Buscar CUPS, cliente o dirección…"><label><input id="showArchivedSupplies" type="checkbox"> Mostrar archivados</label></div>
        </div>
        <div id="centralSuppliesList" class="db-admin-list"></div>
        <div id="centralSuppliesMsg" class="db-admin-msg" role="status" aria-live="polite"></div>`;
      cupsView.insertBefore(panel, cupsView.firstElementChild);
    }

    $('#centralClientSearch')?.addEventListener('input', renderClients);
    $('#centralHolderSearch')?.addEventListener('input', renderHolders);
    $('#centralSupplySearch')?.addEventListener('input', renderSupplies);
    $('#showArchivedClients')?.addEventListener('change', (e) => { state.showArchivedClients = e.target.checked; renderClients(); });
    $('#showArchivedHolders')?.addEventListener('change', (e) => { state.showArchivedHolders = e.target.checked; renderHolders(); });
    $('#showArchivedSupplies')?.addEventListener('change', (e) => { state.showArchivedSupplies = e.target.checked; renderSupplies(); });
  }

  function setMessage(target, text, type = '') {
    const el = $(target);
    if (!el) return;
    el.textContent = text || '';
    el.className = `db-admin-msg ${type}`.trim();
  }

  function holderMap() {
    return new Map(state.holders.map((h) => [h.id, h]));
  }

  function clientMap() {
    return new Map(state.clients.map((c) => [c.id, c]));
  }

  function clientCounts(clientId) {
    const holders = state.holders.filter((h) => h.client_id === clientId);
    const holderIds = new Set(holders.map((h) => h.id));
    const supplies = state.supplies.filter((s) => holderIds.has(s.holder_id));
    const invoices = supplies.reduce((sum, supply) => sum + (state.invoiceCounts.get(supply.id) || 0), 0);
    return { holders: holders.length, supplies: supplies.length, invoices };
  }

  function supplyDependencies(supplyId) {
    return state.supplyDependencyCounts.get(supplyId) || { invoices: 0, incidents: 0, recommendations: 0, supply_events: 0 };
  }

  function holderCounts(holderId) {
    const supplies = state.supplies.filter((supply) => supply.holder_id === holderId);
    const activeSupplies = supplies.filter((supply) => supply.status === 'active').length;
    const invoices = supplies.reduce((sum, supply) => sum + (state.invoiceCounts.get(supply.id) || 0), 0);
    return { supplies: supplies.length, activeSupplies, invoices };
  }

  function taxKey(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function sameHolderIdentity(holder, invoice) {
    if (!holder || !invoice) return true;
    if (norm(holder.legal_name) && norm(holder.legal_name) === norm(invoice.source_holder_name)) return true;
    const holderTax = taxKey(holder.tax_id);
    const invoiceTax = taxKey(invoice.source_holder_tax_id);
    return Boolean(holderTax && invoiceTax && holderTax === invoiceTax);
  }

  function invoiceEffectiveDate(invoice) {
    return String(invoice?.issue_date || invoice?.billing_end || invoice?.billing_start || invoice?.created_at || '');
  }

  function matchingHolderForInvoice(invoice) {
    if (!invoice) return null;
    const invoiceTax = taxKey(invoice.source_holder_tax_id);
    const exactTax = invoiceTax
      ? state.holders.filter((holder) => holder.status === 'active' && taxKey(holder.tax_id) === invoiceTax)
      : [];
    if (exactTax.length === 1) return exactTax[0];
    const byName = state.holders.filter((holder) => holder.status === 'active' && norm(holder.legal_name) === norm(invoice.source_holder_name));
    return byName.length === 1 ? byName[0] : null;
  }

  function renderClients() {
    const host = $('#centralClientsList');
    if (!host || !isAdmin()) return;
    const needle = norm($('#centralClientSearch')?.value);
    const rows = state.clients
      .filter((client) => state.showArchivedClients || client.status === 'active')
      .filter((client) => !needle || norm(client.name).includes(needle) || norm(client.tax_id).includes(needle))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));

    host.innerHTML = rows.length ? rows.map((client) => {
      const counts = clientCounts(client.id);
      const archived = client.status === 'archived';
      const empty = counts.holders === 0 && counts.supplies === 0 && counts.invoices === 0;
      const actions = archived
        ? `<button class="secondary db-restore" data-db-action="restore_client" data-id="${esc(client.id)}">Restaurar</button>${empty ? `<button class="secondary db-danger" data-db-action="delete_client" data-id="${esc(client.id)}" data-name="${esc(client.name)}">Eliminar definitivamente</button>` : '<span class="db-locked">Con datos: no se puede borrar</span>'}`
        : `<button class="secondary db-warning" data-db-action="archive_client" data-id="${esc(client.id)}" data-name="${esc(client.name)}">Archivar</button>`;
      return `<div class="db-admin-row ${archived ? 'archived' : ''}"><div><strong>${esc(client.name)}</strong><small class="db-admin-meta">${esc(client.tax_id || 'Sin NIF/CIF')} · <span class="db-status ${archived ? 'archived' : ''}">${esc(client.status)}</span></small></div><div>${counts.holders} titular${counts.holders === 1 ? '' : 'es'} · ${counts.supplies} suministro${counts.supplies === 1 ? '' : 's'} · ${counts.invoices} factura${counts.invoices === 1 ? '' : 's'}</div><div class="db-admin-actions">${actions}</div></div>`;
    }).join('') : '<div class="db-empty">No hay clientes que coincidan con este filtro.</div>';

    bindLifecycleButtons(host);
  }

  function renderHolders() {
    const host = $('#centralHoldersList');
    if (!host || !isAdmin()) return;
    const clients = clientMap();
    const needle = norm($('#centralHolderSearch')?.value);
    const rows = state.holders
      .map((holder) => ({ ...holder, clientName: clients.get(holder.client_id)?.name || '' }))
      .filter((holder) => state.showArchivedHolders || holder.status === 'active')
      .filter((holder) => !needle || [holder.legal_name, holder.tax_id, holder.clientName].some((value) => norm(value).includes(needle)))
      .sort((a, b) => String(a.clientName).localeCompare(String(b.clientName), 'es') || String(a.legal_name).localeCompare(String(b.legal_name), 'es'));

    host.innerHTML = rows.length ? rows.map((holder) => {
      const counts = holderCounts(holder.id);
      const archived = holder.status === 'archived';
      const actions = archived
        ? `<button class="secondary db-restore" data-db-action="restore_holder" data-id="${esc(holder.id)}">Restaurar</button>${counts.supplies === 0 ? `<button class="secondary db-danger" data-db-action="delete_holder" data-id="${esc(holder.id)}" data-name="${esc(holder.legal_name)}">Eliminar definitivamente</button>` : '<span class="db-locked">Con suministros: no se puede borrar</span>'}`
        : `<button class="secondary" data-db-action="edit_holder" data-id="${esc(holder.id)}" data-name="${esc(holder.legal_name)}">Editar</button>${counts.activeSupplies === 0 ? `<button class="secondary db-warning" data-db-action="archive_holder" data-id="${esc(holder.id)}" data-name="${esc(holder.legal_name)}">Archivar</button>` : '<span class="db-locked">Tiene CUPS activos</span>'}`;
      return `<div class="db-admin-row ${archived ? 'archived' : ''}"><div><strong>${esc(holder.legal_name)}</strong><small class="db-admin-meta">${esc(holder.tax_id || 'Sin NIF/CIF')} · ${esc(holder.clientName || 'Cliente sin identificar')} · <span class="db-status ${archived ? 'archived' : ''}">${esc(holder.status)}</span></small></div><div>${counts.supplies} suministro${counts.supplies === 1 ? '' : 's'} · ${counts.invoices} factura${counts.invoices === 1 ? '' : 's'}</div><div class="db-admin-actions">${actions}</div></div>`;
    }).join('') : '<div class="db-empty">No hay titulares que coincidan con este filtro.</div>';

    bindLifecycleButtons(host);
  }

  function renderSupplies() {
    const host = $('#centralSuppliesList');
    if (!host || !isAdmin()) return;
    const holders = holderMap();
    const clients = clientMap();
    const needle = norm($('#centralSupplySearch')?.value);
    const rows = state.supplies
      .map((supply) => {
        const holder = holders.get(supply.holder_id);
        const client = clients.get(holder?.client_id);
        return { ...supply, holderName: holder?.legal_name || '', clientName: client?.name || '' };
      })
      .filter((supply) => state.showArchivedSupplies || supply.status === 'active')
      .filter((supply) => !needle || [supply.cups, supply.supply_name, supply.address, supply.city, supply.holderName, supply.clientName].some((value) => norm(value).includes(needle)))
      .sort((a, b) => String(a.clientName).localeCompare(String(b.clientName), 'es') || String(a.cups).localeCompare(String(b.cups)));

    host.innerHTML = rows.length ? rows.map((supply) => {
      const deps = supplyDependencies(supply.id);
      const dependencyTotal = Object.values(deps).reduce((sum, value) => sum + value, 0);
      const archived = supply.status === 'archived';
      const latest = state.latestInvoiceBySupply.get(supply.id);
      const currentHolder = holders.get(supply.holder_id);
      const mismatch = Boolean(latest && !sameHolderIdentity(currentHolder, latest));
      const matchingHolder = mismatch ? matchingHolderForInvoice(latest) : null;
      const holderNotice = mismatch
        ? `<span class="db-mismatch">⚠ Última factura: ${esc(latest.source_holder_name || 'titular distinto')}${latest.source_holder_tax_id ? ` · ${esc(latest.source_holder_tax_id)}` : ''}</span>`
        : (latest ? '<span class="db-mismatch-ok">Titular coherente con la última factura</span>' : '');
      const holderAction = !archived && mismatch && matchingHolder && matchingHolder.id !== supply.holder_id
        ? `<button class="secondary db-warning" data-db-action="reassign_supply_holder" data-id="${esc(supply.id)}" data-target-holder="${esc(matchingHolder.id)}" data-name="${esc(supply.cups)}">Aplicar titular de última factura</button>`
        : (!archived && mismatch ? '<span class="db-locked">Titular nuevo no identificado de forma unívoca</span>' : '');
      const actions = archived
        ? `<button class="secondary db-restore" data-db-action="restore_supply" data-id="${esc(supply.id)}">Restaurar</button>${dependencyTotal === 0 ? `<button class="secondary db-danger" data-db-action="delete_supply" data-id="${esc(supply.id)}" data-name="${esc(supply.cups)}">Eliminar definitivamente</button>` : '<span class="db-locked">Con histórico: no se puede borrar</span>'}`
        : `${holderAction}<button class="secondary db-warning" data-db-action="archive_supply" data-id="${esc(supply.id)}" data-name="${esc(supply.cups)}">Archivar</button>`;
      return `<div class="db-admin-row ${archived ? 'archived' : ''}"><div><strong>${esc(supply.cups)}</strong><small class="db-admin-meta">${esc(supply.clientName || 'Cliente sin identificar')} · ${esc(supply.holderName || 'Titular sin identificar')}</small>${holderNotice}</div><div>${esc(supply.supply_name || supply.address || 'Suministro')}<small class="db-admin-meta">${esc(supply.city || '')} · ${state.invoiceCounts.get(supply.id) || 0} factura${(state.invoiceCounts.get(supply.id) || 0) === 1 ? '' : 's'} · <span class="db-status ${archived ? 'archived' : ''}">${esc(supply.status)}</span></small></div><div class="db-admin-actions">${actions}</div></div>`;
    }).join('') : '<div class="db-empty">No hay suministros que coincidan con este filtro.</div>';

    bindLifecycleButtons(host);
  }

  async function loadState() {
    if (!isAdmin() || state.loading || !window.ibtSupabase) return;
    state.loading = true;
    try {
      const supabase = window.ibtSupabase;
      const results = await Promise.all([
        supabase.from('clients').select('id,name,tax_id,status').order('name'),
        supabase.from('holders').select('id,client_id,legal_name,tax_id,status').order('legal_name'),
        supabase.from('supplies').select('id,holder_id,cups,supply_name,address,city,status').order('cups'),
        supabase.from('invoices').select('id,supply_id,billing_start,billing_end,issue_date,created_at,validation_status,superseded_by,source_holder_name,source_holder_tax_id'),
        supabase.from('incidents').select('id,supply_id'),
        supabase.from('recommendations').select('id,supply_id'),
        supabase.from('supply_events').select('id,supply_id'),
      ]);
      const error = results.find((result) => result.error)?.error;
      if (error) throw error;
      state.clients = results[0].data || [];
      state.holders = results[1].data || [];
      state.supplies = results[2].data || [];
      state.invoiceCounts = new Map();
      state.supplyDependencyCounts = new Map();
      state.latestInvoiceBySupply = new Map();
      for (const invoice of results[3].data || []) {
        if (!invoice.supply_id || invoice.validation_status !== 'valid' || invoice.superseded_by || !norm(invoice.source_holder_name)) continue;
        const current = state.latestInvoiceBySupply.get(invoice.supply_id);
        if (!current || invoiceEffectiveDate(invoice) > invoiceEffectiveDate(current)) {
          state.latestInvoiceBySupply.set(invoice.supply_id, invoice);
        }
      }
      const add = (rows, key) => {
        for (const row of rows || []) {
          if (!row.supply_id) continue;
          const current = state.supplyDependencyCounts.get(row.supply_id) || { invoices: 0, incidents: 0, recommendations: 0, supply_events: 0 };
          current[key] += 1;
          state.supplyDependencyCounts.set(row.supply_id, current);
          if (key === 'invoices') state.invoiceCounts.set(row.supply_id, (state.invoiceCounts.get(row.supply_id) || 0) + 1);
        }
      };
      add(results[3].data, 'invoices');
      add(results[4].data, 'incidents');
      add(results[5].data, 'recommendations');
      add(results[6].data, 'supply_events');
      renderClients();
      renderHolders();
      renderSupplies();
      pruneArchivedUserOptions();
      window.dispatchEvent(new CustomEvent('ibt-central-data-ready', { detail: { supplies: state.supplies.length } }));
    } catch (error) {
      console.error('Gestión central', error);
      setMessage('#centralClientsMsg', 'No se pudo cargar la base central: ' + (error?.message || error), 'error');
      setMessage('#centralHoldersMsg', 'No se pudo cargar la base central: ' + (error?.message || error), 'error');
      setMessage('#centralSuppliesMsg', 'No se pudo cargar la base central: ' + (error?.message || error), 'error');
    } finally {
      state.loading = false;
    }
  }

  async function invoke(action, id, extra = {}) {
    const supabase = window.ibtSupabase;
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase.functions.invoke('admin-data-lifecycle', { body: { action, id, ...extra } });
    if (error) {
      let payload = error.context?.body;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { /* ignore */ }
      }
      const code = payload?.error || error.message;
      const deps = payload?.dependencies;
      if (code === 'client_not_empty') throw new Error(`No se puede eliminar: tiene ${deps?.holders || 0} titulares, ${deps?.supplies || 0} suministros y ${deps?.invoices || 0} facturas.`);
      if (code === 'supply_has_history') throw new Error('No se puede eliminar este CUPS porque tiene histórico o registros relacionados. Archívalo en su lugar.');
      if (code === 'holder_has_active_supplies') throw new Error(`No se puede archivar este titular porque todavía tiene ${deps?.active_supplies || 0} CUPS activo(s). Cambia primero el titular de esos suministros.`);
      if (code === 'holder_has_supplies') throw new Error(`No se puede eliminar este titular porque todavía tiene ${deps?.supplies || 0} suministro(s) asociado(s).`);
      if (code === 'holder_tax_conflict') throw new Error('Ese NIF/CIF ya pertenece a otro titular. Revisa si debes cambiar el CUPS a ese titular en lugar de duplicarlo.');
      if (code === 'holder_name_conflict') throw new Error('Ya existe otro titular con ese nombre dentro del mismo cliente.');
      if (code === 'target_holder_not_active') throw new Error('El titular de destino no está activo.');
      if (code === 'target_client_not_active') throw new Error('El cliente del titular de destino no está activo.');
      if (code === 'cannot_delete_self') throw new Error('No puedes eliminar la cuenta con la que estás conectado.');
      if (code === 'last_admin') throw new Error('No se puede eliminar el último administrador activo.');
      throw new Error(payload?.message || code || 'Operación rechazada.');
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function localMasterRemoveCups(cupsList) {
    if (window.EnergyMaster?.removeLocal) {
      window.EnergyMaster.removeLocal(cupsList);
      return;
    }
    const keys = new Set((cupsList || []).map((cups) => String(cups || '').replace(/\s/g, '').toUpperCase()));
    if (!keys.size) return;
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      if (!Array.isArray(existing)) return;
      const filtered = existing.filter((row) => !keys.has(String(row?.cups || '').replace(/\s/g, '').toUpperCase()));
      if (filtered.length !== existing.length) localStorage.setItem(STORAGE, JSON.stringify(filtered));
    } catch (error) {
      console.warn('No se pudo limpiar la caché local tras archivar', error);
    }
  }

  function cupsForClient(clientId) {
    const holderIds = new Set(state.holders.filter((h) => h.client_id === clientId).map((h) => h.id));
    return state.supplies.filter((s) => holderIds.has(s.holder_id)).map((s) => s.cups);
  }

  async function runLifecycle(button) {
    const action = button.dataset.dbAction;
    const id = button.dataset.id;
    const name = button.dataset.name || '';
    if (!action || !id) return;

    if (action === 'edit_holder') {
      const holder = state.holders.find((item) => item.id === id);
      if (!holder) return;
      const legalName = prompt('Nombre legal del titular:', holder.legal_name || '');
      if (legalName == null || !String(legalName).trim()) return;
      const taxId = prompt('NIF/CIF del titular (puede quedar vacío):', holder.tax_id || '');
      if (taxId == null) return;
      button.disabled = true;
      setMessage('#centralHoldersMsg', 'Guardando titular…');
      try {
        await invoke('update_holder', id, { legal_name: String(legalName).trim(), tax_id: String(taxId).trim() || null });
        setMessage('#centralHoldersMsg', 'Titular actualizado correctamente.', 'ok');
        await window.CentralSupabaseMaster?.reload?.();
        await loadState();
        window.dispatchEvent(new CustomEvent('ibt-central-data-changed', { detail: { action: 'update_holder', id } }));
      } catch (error) {
        console.error('update_holder', error);
        setMessage('#centralHoldersMsg', error?.message || String(error), 'error');
      } finally {
        button.disabled = false;
      }
      return;
    }

    let extra = {};
    if (action === 'reassign_supply_holder') {
      const targetHolder = button.dataset.targetHolder;
      if (!targetHolder) return;
      const source = state.supplies.find((item) => item.id === id);
      const target = state.holders.find((item) => item.id === targetHolder);
      if (!source || !target) return;
      if (!confirm(`¿Cambiar el titular actual del CUPS ${source.cups} a ${target.legal_name}? Las facturas históricas conservarán su titular original.`)) return;
      extra = { target_holder_id: targetHolder };
    }

    const hardDelete = action.startsWith('delete_');
    const archive = action.startsWith('archive_');
    if (hardDelete) {
      const answer = prompt(`Vas a eliminar definitivamente ${name || 'este registro'}. Esta acción no se puede deshacer.\n\nEscribe ELIMINAR para continuar:`);
      if (answer !== 'ELIMINAR') return;
    } else if (archive) {
      if (!confirm(`¿Archivar ${name || 'este registro'}? El histórico se conservará.`)) return;
    }

    button.disabled = true;
    const isClientAction = action.endsWith('_client');
    const isHolderAction = action.endsWith('_holder') || action === 'reassign_supply_holder';
    const msgTarget = isClientAction ? '#centralClientsMsg' : (isHolderAction ? '#centralHoldersMsg' : '#centralSuppliesMsg');
    setMessage(msgTarget, 'Aplicando cambio…');
    try {
      const clientCups = action === 'archive_client' || action === 'delete_client' ? cupsForClient(id) : [];
      const supplyCups = action === 'archive_supply' || action === 'delete_supply'
        ? [state.supplies.find((item) => item.id === id)?.cups].filter(Boolean)
        : [];
      await invoke(action, id, extra);
      localMasterRemoveCups(clientCups);
      localMasterRemoveCups(supplyCups);
      setMessage(msgTarget, 'Cambio guardado correctamente.', 'ok');
      if (isHolderAction) await window.CentralSupabaseMaster?.reload?.();
      await loadState();
      window.dispatchEvent(new CustomEvent('ibt-central-data-changed', { detail: { action, id } }));
      if (window.ibtCurrentProfile) window.dispatchEvent(new CustomEvent('ibt-role-changed', { detail: { profile: window.ibtCurrentProfile } }));
    } catch (error) {
      console.error(action, error);
      setMessage(msgTarget, error?.message || String(error), 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function archiveSupplyByCups(cups) {
    if (!isAdmin()) throw new Error('Solo un administrador puede archivar suministros.');
    const wanted = String(cups || '').replace(/\s/g, '').toUpperCase();
    const supply = state.supplies.find((item) => String(item.cups || '').replace(/\s/g, '').toUpperCase() === wanted);

    if (!supply) {
      if (!window.EnergyMaster?.archiveLocal) {
        throw new Error('Este suministro es heredado y no está en la base central.');
      }
      const accepted = confirm(
        'Este suministro no existe en la base central de Supabase; solo está en el maestro heredado local.\n\n' +
        '¿Archivarlo igualmente? Se retirará del listado activo y se conservará una copia archivada local.'
      );
      if (!accepted) return false;

      const result = window.EnergyMaster.archiveLocal(cups);
      if (!result?.ok) throw new Error('No se ha podido archivar el suministro heredado.');
      return result;
    }

    const buttonLike = {
      dataset: { dbAction: 'archive_supply', id: supply.id, name: supply.cups },
      disabled: false,
    };
    await runLifecycle(buttonLike);
    return { ok: true, mode: 'central_archive' };
  }

  window.ibtArchiveSupplyByCups = archiveSupplyByCups;
  window.ibtCentralSupplyExists = (cups) => {
    const wanted = String(cups || '').replace(/\s/g, '').toUpperCase();
    return state.supplies.some((item) => String(item.cups || '').replace(/\s/g, '').toUpperCase() === wanted && item.status === 'active');
  };

  function bindLifecycleButtons(root) {
    $$('[data-db-action]', root).forEach((button) => {
      if (button.dataset.dbLifecycleBound === '1') return;
      button.dataset.dbLifecycleBound = '1';
      button.addEventListener('click', () => runLifecycle(button));
    });
  }

  function enhanceUsersTable() {
    if (!isAdmin()) return;
    const body = $('#usersBody');
    if (!body) return;
    const table = body.closest('table');
    const header = table?.querySelector('thead tr');
    if (header && !header.querySelector('.db-user-actions-head')) {
      const th = document.createElement('th');
      th.className = 'db-user-actions-head';
      th.textContent = 'Acciones';
      header.appendChild(th);
    }
    $$('tr', body).forEach((row) => {
      const roleSelect = row.querySelector('.role-select');
      if (!roleSelect || row.querySelector('.db-user-actions-cell')) return;
      const userId = roleSelect.dataset.id;
      const td = document.createElement('td');
      td.className = 'db-user-actions-cell';
      if (userId === window.ibtCurrentProfile?.id) {
        td.innerHTML = '<span class="db-user-self">Cuenta actual</span>';
      } else {
        const userLabel = row.querySelector('td strong')?.textContent?.trim() || 'este usuario';
        td.innerHTML = `<div class="db-user-actions"><button type="button" class="secondary db-danger db-delete-user" data-id="${esc(userId)}" data-name="${esc(userLabel)}">Eliminar</button></div>`;
        td.querySelector('.db-delete-user')?.addEventListener('click', async (event) => {
          const button = event.currentTarget;
          const answer = prompt(`Vas a eliminar definitivamente la cuenta de ${button.dataset.name}.\n\nEscribe ELIMINAR para continuar:`);
          if (answer !== 'ELIMINAR') return;
          button.disabled = true;
          try {
            await invoke('delete_user', button.dataset.id);
            row.remove();
          } catch (error) {
            alert(error?.message || String(error));
            button.disabled = false;
          }
        });
      }
      row.appendChild(td);
    });
    pruneArchivedUserOptions();
  }

  function pruneArchivedUserOptions() {
    if (!isAdmin()) return;
    const archived = new Set(state.clients.filter((client) => client.status !== 'active').map((client) => client.id));
    $$('.user-client-assign option').forEach((option) => {
      if (archived.has(option.value)) option.remove();
    });
  }

  function applyRole(profile) {
    ensurePanels();
    const admin = profile?.role === 'admin';
    $('#centralClientsAdmin')?.classList.toggle('visible', admin);
    $('#centralHoldersAdmin')?.classList.toggle('visible', admin);
    $('#centralSuppliesAdmin')?.classList.toggle('visible', admin);
    if (admin) {
      loadState();
      setTimeout(enhanceUsersTable, 0);
    }
  }

  function observeUsers() {
    const body = $('#usersBody');
    if (!body || body.dataset.dbObserver === '1') return;
    body.dataset.dbObserver = '1';
    new MutationObserver(() => enhanceUsersTable()).observe(body, { childList: true, subtree: true });
  }

  function init() {
    injectStyles();
    ensurePanels();
    observeUsers();
    applyRole(window.ibtCurrentProfile);
  }

  window.addEventListener('ibt-role-changed', (event) => applyRole(event.detail?.profile));
  window.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();