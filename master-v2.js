(() => {
  'use strict';

  const STORAGE = 'ibt-energy-master-v1';
  const LEGACY_ARCHIVE_STORAGE = 'ibt-energy-master-legacy-archive-v1';
  const $ = (selector) => document.querySelector(selector);

  let supplies = [];
  let editingCups = '';
  let lastEditorTrigger = null;

  function showEditorModal() {
    const editor = $('#clientEditor');
    const backdrop = $('#clientEditorBackdrop');
    if (!editor || !backdrop) return;
    lastEditorTrigger = document.activeElement;
    if ($('#clientesView')?.classList.contains('hidden')) show('clientes');
    editor.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    document.body.classList.add('client-editor-modal-open');
    editor.setAttribute('aria-modal','true');
    editor.scrollTop = 0;
    $('#cancelClient')?.focus({ preventScroll:true });
  }
  // UI-only state: group open/closed state must survive normal central refreshes.
  const collapsedClientGroups = new Set();

  const views = {
    facturas: ['Facturas procesadas', 'Carga, valida y analiza las facturas eléctricas de tus clientes.', 'Panel de análisis energético'],
    clientes: ['Clientes', 'Gestiona grupos, empresas y particulares desde el maestro central.', 'Cartera energética'],
    cups: ['Suministros / CUPS', 'Consulta y edita todos los puntos de suministro de tus clientes.', 'Maestro energético'],
    historico: ['Histórico energético', 'Memoria de facturas, análisis, recomendaciones y actuaciones por cliente y CUPS.', 'Memoria energética'],
    settings: ['Configuración', 'Ajustes globales del Asesor Energético.', 'Administración'],
  };

  const norm = (value) => String(value ?? '').trim();
  // Reuse the common semantic repair on structured text too. This migrates
  // old master values that were saved before detached PDF.js accents were fixed.
  const semanticText = (value) => window.IBTPdfTextNormalizer?.repair?.(value) ?? norm(value);
  const key = (value) => norm(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
  const cupsKey = (value) => {
    const normalized = key(value);
    return normalized.startsWith('ES') && normalized.length >= 20
      ? normalized.slice(0, 20)
      : normalized;
  };
  const empty = (value) => {
    const normalized = norm(value);
    return !normalized || normalized === '—' || normalized === 'Por identificar' || /pendiente$/i.test(normalized);
  };
  const esc = (value) => norm(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const maskedBankAccount = (value) => {
    const compact = norm(value).replace(/\s+/g, '');
    return compact ? `•••• ${compact.slice(-4)}` : '';
  };
  const kwValue = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
  };
  const contractedPowerObject = (supply = {}) => {
    const out = {};
    for (let p = 1; p <= 6; p += 1) {
      const value = kwValue(supply[`p${p}`] ?? supply.contractedPower?.[`P${p}`]);
      if (value !== '') out[`P${p}`] = value;
    }
    return out;
  };
  // Unknown/cleared tariffs must not hide and erase existing P3-P6 values.
  const powerPeriodCount = (tariff = '') => /^2\.0TD$/i.test(norm(tariff)) ? 2 : 6;
  const holderDefaultsFor = (supply = {}) => ({
    email: norm(supply.holderEmail),
    phone: norm(supply.holderPhone),
    bankAccount: norm(supply.holderBankAccount),
  });

  // A stored empty alias is an explicit choice, not a missing value.
  const hasSupplyAliasOverride = (supply = {}) => supply.aliasSet === true || Boolean(norm(supply.alias));
  const editableSupplyName = (supply = {}) => hasSupplyAliasOverride(supply)
    ? norm(supply.alias)
    : norm(supply.name);
  const supplyTitle = (supply, internal) => internal && hasSupplyAliasOverride(supply)
    ? [norm(supply.alias), norm(supply.address)].filter(Boolean).join(' - ') || supply.cups || 'Suministro'
    : supply.name || supply.address || 'Suministro';

  function show(name) {
    document.querySelectorAll('.app-view').forEach((view) => view.classList.add('hidden'));
    const target = $(`#${name}View`);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.sidebar nav a').forEach((link) => {
      link.classList.toggle('active', link.dataset.view === name);
    });
    const meta = views[name];
    if (meta) {
      $('#pageTitle').textContent = meta[0];
      $('#pageSubtitle').textContent = meta[1];
      $('#pageEyebrow').textContent = meta[2];
    }
  }

  document.querySelectorAll('.sidebar [data-view]').forEach((link) => {
    link.addEventListener('click', () => show(link.dataset.view));
  });

  function pick(row, names) {
    const entries = Object.entries(row || {});
    for (const name of names) {
      const wanted = key(name);
      const exact = entries.find(([column]) => key(column) === wanted);
      if (exact && norm(exact[1])) return norm(exact[1]);
    }
    for (const name of names) {
      const wanted = key(name);
      const fuzzy = entries.find(([column]) => key(column).includes(wanted));
      if (fuzzy && norm(fuzzy[1])) return norm(fuzzy[1]);
    }
    return '';
  }

  function inferClient(company, explicitClient = '') {
    if (norm(explicitClient)) return norm(explicitClient);
    return norm(company) || 'SIN CLASIFICAR';
  }

  function inferType(client, company, explicitType = '') {
    if (norm(explicitType)) return norm(explicitType).toUpperCase();
    if (key(client) === 'GRUPOXTRA') return 'GRUPO';
    return norm(company) ? 'EMPRESA' : 'PENDIENTE';
  }

  function normalizeSupply(raw = {}) {
    const company = norm(raw.company || raw.holder);
    const client = inferClient(company, raw.client);
    const type = inferType(client, company, raw.clientType || raw.type);
    return {
      ...raw,
      client,
      type,
      clientTaxId: norm(raw.clientTaxId),
      clientAlias: norm(raw.clientAlias),
      clientId: norm(raw.clientId),
      portfolioId: norm(raw.portfolioId),
      portfolioName: norm(raw.portfolioName),
      portfolioAlias: norm(raw.portfolioAlias),
      company,
      holderId: norm(raw.holderId),
      holderEmail: norm(raw.holderEmail),
      holderPhone: norm(raw.holderPhone),
      holderBankAccount: norm(raw.holderBankAccount),
      supplyId: norm(raw.supplyId),
      supplyEmailOverride: norm(raw.supplyEmailOverride ?? raw.clientEmail),
      supplyPhoneOverride: norm(raw.supplyPhoneOverride ?? raw.clientPhone),
      supplyBankAccountOverride: norm(raw.supplyBankAccountOverride ?? raw.clientBankAccount),
      effectiveEmail: norm(raw.effectiveEmail),
      effectivePhone: norm(raw.effectivePhone),
      effectiveBankAccount: norm(raw.effectiveBankAccount),
      p1: kwValue(raw.p1 ?? raw.contractedPower?.P1),
      p2: kwValue(raw.p2 ?? raw.contractedPower?.P2),
      p3: kwValue(raw.p3 ?? raw.contractedPower?.P3),
      p4: kwValue(raw.p4 ?? raw.contractedPower?.P4),
      p5: kwValue(raw.p5 ?? raw.contractedPower?.P5),
      p6: kwValue(raw.p6 ?? raw.contractedPower?.P6),
      maxContractablePower: kwValue(raw.maxContractablePower ?? raw.max_contractable_power_kw),
      powerProfileSource: norm(raw.powerProfileSource ?? raw.power_profile_source),
      company,
      holder: norm(raw.holder) || company,
      status: norm(raw.status) || 'ACTIVO',
      cups: norm(raw.cups).replace(/\s/g, ''),
      alias: norm(raw.alias ?? raw.supplyAlias),
      retailer: semanticText(raw.retailer ?? raw.commercializer),
      manualRetailer: semanticText(raw.manualRetailer),
      distributor: semanticText(raw.distributor),
    };
  }

  function mergeSupply(existing, incoming, { fillOnly = false, preserveIdentity = false, authoritative = false } = {}) {
    const merged = { ...existing };
    const identityFields = new Set(['client', 'clientTaxId', 'type', 'company', 'holder']);

    const clearableFields = new Set([
      'clientAlias',
      'holderEmail',
      'holderPhone',
      'holderBankAccount',
      'supplyEmailOverride',
      'supplyPhoneOverride',
      'supplyBankAccountOverride',
      'effectiveEmail',
      'effectivePhone',
      'effectiveBankAccount',
      'alias',
    ]);
    for (const [field, value] of Object.entries(incoming)) {
      // A central snapshot describes the current value, including explicit
      // clears. Iterate its raw keys so omitted fields keep local-only data
      // instead of being erased by defaults added during normalization.
      if (authoritative && !fillOnly) {
        if (value === undefined) continue;
        if (preserveIdentity && identityFields.has(field) && !empty(merged[field])) continue;
        merged[field] = value === null ? '' : value;
        continue;
      }
      if (empty(value)) {
        if (!fillOnly && clearableFields.has(field)) merged[field] = '';
        continue;
      }
      if (preserveIdentity && identityFields.has(field) && !empty(merged[field])) continue;
      if (fillOnly) {
        if (empty(merged[field]) || (field === 'type' && merged[field] === 'PENDIENTE')) {
          merged[field] = value;
        }
      } else {
        merged[field] = value;
      }
    }

    return normalizeSupply(merged);
  }

  function sameOwner(existing, incoming) {
    if (empty(incoming.client) && empty(incoming.clientTaxId)) return true;
    if (!empty(existing.clientTaxId) && !empty(incoming.clientTaxId)) {
      return key(existing.clientTaxId) === key(incoming.clientTaxId);
    }
    return key(existing.client) === key(incoming.client);
  }

  function upsertSupply(raw, {
    allowMove = false,
    fillOnly = false,
    preserveIdentity = false,
    authoritative = false,
  } = {}) {
    let incoming = normalizeSupply(raw);
    const idx = supplies.findIndex((item) => cupsKey(item.cups) === cupsKey(incoming.cups));

    if (idx >= 0) {
      const existing = supplies[idx];

      if (preserveIdentity) {
        incoming = {
          ...incoming,
          client: existing.client,
          clientTaxId: existing.clientTaxId,
          type: existing.type,
          company: existing.company || incoming.company,
          holder: existing.holder || incoming.holder,
        };
      }

      if (!allowMove && !sameOwner(existing, incoming)) {
        return {
          ok: false,
          reason: `El CUPS ${incoming.cups} ya pertenece al cliente ${existing.client}. No se ha duplicado ni reasignado.`,
        };
      }

      const before = JSON.stringify(existing);
      supplies[idx] = mergeSupply(existing, authoritative ? raw : incoming, { fillOnly, preserveIdentity, authoritative });
      return {
        ok: true,
        updated: true,
        enriched: before !== JSON.stringify(supplies[idx]),
        supply: supplies[idx],
      };
    }

    supplies.push(incoming);
    return { ok: true, updated: false, enriched: true, supply: incoming };
  }

  function save() {
    try {
      const safeSupplies = supplies.map(({
        clientAlias,
        clientEmail,
        clientPhone,
        clientBankAccount,
        holderEmail,
        holderPhone,
        holderBankAccount,
        supplyEmailOverride,
        supplyPhoneOverride,
        supplyBankAccountOverride,
        effectiveEmail,
        effectivePhone,
        effectiveBankAccount,
        alias,
        aliasSet,
        supplyAlias,
        ...supply
      }) => supply);
      localStorage.setItem(STORAGE, JSON.stringify(safeSupplies));
      return true;
    } catch (error) {
      console.warn('No se pudo guardar el maestro localmente', error);
      return false;
    }
  }

  function status(source = '', message = '') {
    const element = $('#masterStatus');
    if (!element) return;
    if (message) {
      element.innerHTML = message;
      return;
    }
    if (!supplies.length) {
      element.textContent = 'No hay datos de maestro disponibles en la caché de este navegador.';
      return;
    }
    const clients = new Set(supplies.map((item) => key(item.client)));
    const holders = new Set(supplies.map((item) => key(item.holder)));
    element.innerHTML = `<strong>${clients.size} cliente${clients.size === 1 ? '' : 's'} · ${holders.size} titular${holders.size === 1 ? '' : 'es'} · ${supplies.length} CUPS</strong> ${source ? `actualizados desde <strong>${esc(source)}</strong> y ` : ''}disponibles en la caché local. Fuente principal: Supabase.`;
  }

  function displaySupplyCity(supply = {}) {
    const stored = norm(supply.city);
    if (stored) return stored;
    if (!/FENIE/i.test(norm(supply.retailer))) return '';
    return norm(window.IBTFenieSupplyLocation?.parse?.(supply.address)?.city);
  }

  function holderTree(list) {
    const groups = new Map();
    for (const supply of list) {
      const holderName = supply.holder || supply.company || 'Sin titular';
      const clientIdentity = key(supply.clientTaxId) || key(supply.client) || 'SINCLIENTE';
      const holderKey = key(holderName) || 'SINTITULAR';
      const compositeKey = clientIdentity + '|' + holderKey;
      if (!groups.has(compositeKey)) {
        groups.set(compositeKey, {
          name: holderName,
          client: supply.client || 'Cliente',
          clientAlias: supply.clientAlias || '',
          clientTaxId: supply.clientTaxId || '',
          holderId: supply.holderId || '',
          holderTaxId: supply.holderTaxId || '',
          email: supply.holderEmail || '',
          phone: supply.holderPhone || '',
          bankAccount: supply.holderBankAccount || '',
          list: [],
        });
      }
      groups.get(compositeKey).list.push(supply);
    }
    return [...groups.values()].sort((a, b) =>
      a.client.localeCompare(b.client, 'es') || a.name.localeCompare(b.name, 'es')
    );
  }

  function renderClients() {
    const grid = $('#companyGrid');
    if (!grid) return;
    if (!supplies.length) {
      grid.innerHTML = '';
      return;
    }

    const internal = ['admin', 'staff'].includes(window.ibtCurrentProfile?.role);
    // Only tracked alerts in open/reviewing status are reflected in Clients.
    const activeAlerts = internal ? window.IBTAlertsUI?.activeCountsByCups?.() : null;
    const groups = new Map();

    for (const supply of supplies) {
      const legalKey = key(supply.clientTaxId) || key(supply.client);
      const portfolioId = internal ? norm(supply.portfolioId) : '';
      const alias = portfolioId ? norm(supply.portfolioAlias) : (internal ? norm(supply.clientAlias) : '');
      // A client alias is a display label, never a commercial grouping key.
      const groupKey = portfolioId ? 'PORTFOLIO|' + portfolioId : 'CLIENT|' + legalKey;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          name: portfolioId ? (alias || supply.portfolioName || supply.client) : supply.client,
          alias,
          portfolioId,
          list: [],
          members: new Map(),
        });
      }

      const group = groups.get(groupKey);
      group.list.push(supply);

      if (!group.members.has(legalKey)) {
        group.members.set(legalKey, {
          name: supply.client || 'Cliente',
          alias: supply.clientAlias || '',
          taxId: supply.clientTaxId || '',
          type: supply.type || 'CLIENTE',
        });
      }
    }

    grid.innerHTML = [...groups.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((group) => {
        const { name, alias, list, members, portfolioId } = group;
        const memberList = [...members.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
        const multiClient = internal && memberList.length > 1;
        const holders = holderTree(list);
        const type = portfolioId || multiClient ? 'GRUPO' : (list[0]?.type || 'CLIENTE');
        const primaryClient = memberList[0]?.name || list[0]?.client || name;
        const flaggedSupplies = activeAlerts ? list.filter(supply => (activeAlerts.get(cupsKey(supply.cups)) || 0) > 0) : [];
        const alertCount = flaggedSupplies.reduce((sum,supply) => sum + (activeAlerts.get(cupsKey(supply.cups)) || 0),0);
        const alertIcon = internal && alertCount
          ? `<button type="button" class="client-alert-indicator" data-alert-cups="${esc(flaggedSupplies.map(supply=>supply.cups).join(','))}" aria-label="Ver ${alertCount} aviso${alertCount===1?'':'s'} pendiente${alertCount===1?'':'s'} de ${esc(name)} en Alertas" title="${alertCount} aviso${alertCount===1?'':'s'} pendiente${alertCount===1?'':'s'} · Ver en Alertas"><span aria-hidden="true">!</span><span class="client-alert-count">${alertCount}</span></button>`
          : '';
        const isBusinessGroup = Boolean(portfolioId) || type === 'GRUPO';
        const collapsible = isBusinessGroup || multiClient;
        const groupIdentity = portfolioId ? 'PORTFOLIO|' + portfolioId : 'CLIENT|' + (key(list[0]?.clientTaxId) || key(list[0]?.client));
        const collapsed = collapsible && collapsedClientGroups.has(groupIdentity);
        const toggle = collapsible
          ? `<button type="button" class="client-group-toggle" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Desplegar' : 'Replegar'} grupo ${esc(name)}" title="${collapsed ? 'Desplegar todo el grupo' : 'Replegar todo el grupo'}" data-group-key="${esc(groupIdentity)}"><span class="client-group-toggle-chevron" aria-hidden="true">${collapsed ? '▸' : '▾'}</span></button>`
          : '';

        const folders = holders.map((holder) => {
          const rows = holder.list.map((supply) => {
            const title = supplyTitle(supply, internal);
            const city = displaySupplyCity(supply) || 'Localidad pendiente';
            const tariff = supply.tariff || 'Tarifa pendiente';
            const contract = supply.contract || 'Contrato pendiente';
            const retailer = supply.retailer || 'Comercializadora pendiente';
            const manualTag = supply.manualRetailer ? '<span class="supply-retailer-manual-tag">MANUAL</span>' : '';
            return `<div class="holder-supply-row ${supply.clientId && supply.supplyId ? 'holder-supply-history-link' : ''}" data-cups="${esc(supply.cups)}" ${supply.clientId && supply.supplyId ? `data-history-client-id="${esc(supply.clientId)}" data-history-supply-id="${esc(supply.supplyId)}" role="link" tabindex="0" aria-label="Ver histórico de ${esc(title)}"` : ''}><div><b>${esc(title)}</b><small>${esc(supply.cups)} · ${esc(city)} · ${esc(tariff)} · ${esc(contract)}</small><div class="supply-current-retailer"><span class="supply-current-retailer-label">Comercializadora:</span><strong>${esc(retailer)}</strong>${manualTag}</div></div><button class="secondary edit-supply-tree" data-cups="${esc(supply.cups)}">Editar</button></div>`;
          }).join('');

          const holderContactBits = internal ? [
            holder.email ? `<span class="holder-contact-item"><span class="holder-contact-label">Correo</span><span class="holder-contact-value">${esc(holder.email)}</span></span>` : '',
            holder.phone ? `<span class="holder-contact-item"><span class="holder-contact-label">Tel.</span><span class="holder-contact-value">${esc(holder.phone)}</span></span>` : '',
            holder.bankAccount ? `<span class="holder-contact-item"><span class="holder-contact-label">Cuenta</span><span class="holder-contact-value">${esc(maskedBankAccount(holder.bankAccount))}</span></span>` : '',
          ].filter(Boolean) : [];
          const holderContactLine = holderContactBits.length
            ? `<span class="holder-contact-line">${holderContactBits.join('')}</span>`
            : '';
          const holderLabel = internal && portfolioId && holder.clientAlias
            ? holder.name + ' (' + holder.clientAlias + ')'
            : (internal && alias && !portfolioId
              ? '(' + alias + ') ' + holder.name
              : holder.name);
          return `<details class="holder-folder" data-holder-id="${esc(holder.holderId)}" ${holders.length === 1 ? 'open' : ''}><summary><span class="holder-folder-icon">▸</span><span class="holder-title-wrap"><span class="holder-title-main"><strong>${esc(holderLabel)}</strong></span>${holderContactLine}</span>${multiClient && key(holder.name) !== key(holder.client) ? `<span class="holder-client-name">${esc(holder.client)}</span>` : ''}<span>${holder.list.length} CUPS</span></summary><div class="holder-supplies">${rows}<button class="company-link add-supply-holder" data-client="${esc(holder.client)}" data-holder="${esc(holder.name)}">+ Nuevo suministro para ${esc(holder.client)}</button></div></details>`;
        }).join('');

        const memberRows = multiClient
          ? `<div class="client-group-members">${memberList.map((member) => `<div class="client-group-member" data-client-name="${esc(member.name)}"><div><strong>${esc(member.name + (internal && member.alias ? ' (' + member.alias + ')' : ''))}</strong><small>${esc(member.taxId || 'Sin NIF/CIF')}</small></div><div class="client-group-member-actions"></div></div>`).join('')}</div>`
          : '';

        const legalLine = internal && portfolioId && alias && !multiClient
          ? `<small class="client-legal-name">${esc(primaryClient)}</small>`
          : '';

        const summary = multiClient
          ? `${memberList.length} clientes legales · ${holders.length} titular${holders.length === 1 ? '' : 'es'} · ${list.length} suministro${list.length === 1 ? '' : 's'}`
          : `${holders.length} titular${holders.length === 1 ? '' : 'es'} · ${list.length} suministro${list.length === 1 ? '' : 's'}`;

        const addTop = multiClient
          ? ''
          : `<button class="company-link add-supply" data-client="${esc(primaryClient)}"${isBusinessGroup ? ' data-new-holder="1"' : ''}>${isBusinessGroup ? '+ Nuevo titular / suministro' : '+ Nuevo suministro'}</button>`;

        return `<article class="card company-card company-card-tree ${multiClient ? 'multi-client-group' : ''} client-type-${esc(String(type).toLowerCase())}" data-client-primary="${esc(primaryClient)}" data-client-type="${esc(type)}" data-client-count="${memberList.length}"><div class="company-card-head"><span class="company-mark">${esc(name.slice(0, 2).toUpperCase())}</span><span class="status ${type === 'PENDIENTE' ? 'review' : 'ok'}">${esc(type)}</span></div><div class="client-tree-title"><div><div class="client-group-heading">${toggle}<h3>${esc(name)}</h3>${alertIcon}</div>${legalLine}<small>${summary}</small></div>${addTop}</div><div class="client-group-contents" ${collapsed ? 'hidden' : ''}>${memberRows}<div class="holder-tree">${folders}</div></div></article>`;
      })
      .join('');

    grid.querySelectorAll('.client-group-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        const groupKey = button.dataset.groupKey;
        if (!groupKey) return;
        const content = button.closest('.company-card-tree')?.querySelector('.client-group-contents');
        if (!content) return;
        const nextCollapsed = !content.hidden;
        content.hidden = nextCollapsed;
        if (nextCollapsed) collapsedClientGroups.add(groupKey);
        else collapsedClientGroups.delete(groupKey);
        button.setAttribute('aria-expanded', String(!nextCollapsed));
        button.setAttribute('aria-label', (nextCollapsed ? 'Desplegar' : 'Replegar') + ' grupo ' +
          (button.closest('.company-card-tree')?.querySelector('.client-tree-title h3')?.textContent || ''));
        button.title = nextCollapsed ? 'Desplegar todo el grupo' : 'Replegar todo el grupo';
        button.querySelector('.client-group-toggle-chevron').textContent = nextCollapsed ? '▸' : '▾';
      });
    });
    grid.querySelectorAll('.client-alert-indicator').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const cups = (button.dataset.alertCups || '').split(',').filter(Boolean);
        window.IBTAlertsUI?.openForSupplies?.(cups);
      });
    });
    // Reuse the existing history focus API; never infer IDs from holder or group names.
    async function openSupplyHistory(row) {
      const clientId = row.dataset.historyClientId;
      const supplyId = row.dataset.historySupplyId;
      if (!clientId || !supplyId) return;
      const history = window.IBTHistoryUI;
      if (typeof history?.focusSupply !== 'function') {
        console.warn('Histórico todavía no disponible para la navegación directa.');
        return;
      }
      const nav = document.querySelector('.sidebar nav a[data-view="historico"]');
      if (!nav) return;
      nav.click();
      try {
        const result = await history.focusSupply(clientId, supplyId);
        if (result?.ok === false) throw new Error(result.reason || 'history_focus_failed');
      } catch (error) {
        console.error('No se pudo abrir el histórico del suministro', error);
        const content = $('#historyContent');
        if (content) content.textContent = 'No se pudo abrir el histórico de este suministro. Comprueba los permisos y vuelve a intentarlo.';
      }
    }

    grid.querySelectorAll('.holder-supply-history-link').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('button, a, input, select, textarea')) return;
        void openSupplyHistory(row);
      });
      row.addEventListener('keydown', (event) => {
        if (event.target !== row || !['Enter',' '].includes(event.key)) return;
        event.preventDefault();
        void openSupplyHistory(row);
      });
    });
    grid.querySelectorAll('.edit-supply-tree').forEach((button) => {
      button.onclick = () => editSupply(button.dataset.cups);
    });
    grid.querySelectorAll('.add-supply').forEach((button) => {
      button.onclick = () => openForm(button.dataset.client, '', button.dataset.newHolder === '1');
    });
    grid.querySelectorAll('.add-supply-holder').forEach((button) => {
      button.onclick = () => openForm(button.dataset.client, button.dataset.holder);
    });
  }

  function renderCups(query = '') {
    const body = $('#cupsBody');
    if (!body) return;
    const internal = ['admin', 'staff'].includes(window.ibtCurrentProfile?.role);
    const needle = norm(query).toLowerCase();
    const list = supplies.filter((supply) => Object.values(supply).join(' ').toLowerCase().includes(needle));

    body.innerHTML = list.length
      ? list.map((supply) => `<tr><td><span class="status ${String(supply.status).toUpperCase() === 'ACTIVO' ? 'ok' : 'review'}">${esc(supply.status)}</span></td><td><strong>${esc(supply.client)}</strong></td><td>${esc(supply.holder || '—')}</td><td>${esc(supply.cups)}</td><td>${esc(supply.address || (internal ? editableSupplyName(supply) : supply.name) || '—')}</td><td>${esc(displaySupplyCity(supply) || '—')}</td><td>${esc(supply.tariff || '—')}</td><td>${esc(supply.contract || '—')}</td><td><button class="secondary edit-supply" data-cups="${esc(supply.cups)}">Editar</button></td></tr>`).join('')
      : `<tr class="empty"><td colspan="9">${supplies.length ? 'No hay suministros que coincidan con la búsqueda.' : 'Añade un cliente o importa el maestro.'}</td></tr>`;

    body.querySelectorAll('.edit-supply').forEach((button) => {
      button.onclick = () => editSupply(button.dataset.cups);
    });
  }

  function refresh({ source = '', message = '' } = {}) {
    save();
    publish();
    renderClients();
    renderCups($('#cupsSearch')?.value || '');
    status(source, message);
  }

  function removeLocal(cupsList = []) {
    const list = Array.isArray(cupsList) ? cupsList : [cupsList];
    const keys = new Set(list.map((cups) => cupsKey(cups)).filter(Boolean));
    if (!keys.size) return 0;
    const before = supplies.length;
    supplies = supplies.filter((supply) => !keys.has(cupsKey(supply.cups)));
    const removed = before - supplies.length;
    if (removed > 0) refresh();
    return removed;
  }

  function replaceActiveFromCentral(rows = []) {
    if (!Array.isArray(rows)) {
      return { ok: false, reason: 'central_snapshot_invalid' };
    }

    const previousByKey = new Map(
      supplies
        .map((supply) => [cupsKey(supply.cups), supply])
        .filter(([cups]) => cups)
    );
    const nextByKey = new Map();

    let added = 0;
    let enriched = 0;
    let unchanged = 0;
    let invalid = 0;

    for (const raw of rows) {
      const incoming = normalizeSupply(raw);
      const wanted = cupsKey(incoming.cups);
      if (!wanted || !wanted.startsWith('ES')) {
        invalid += 1;
        continue;
      }

      const existing = previousByKey.get(wanted);
      const merged = existing
        ? mergeSupply(existing, raw, { fillOnly: false, preserveIdentity: false, authoritative: true })
        : incoming;

      if (!existing) {
        added += 1;
      } else if (JSON.stringify(existing) !== JSON.stringify(merged)) {
        enriched += 1;
      } else {
        unchanged += 1;
      }

      nextByKey.set(wanted, merged);
    }

    const nextKeys = new Set(nextByKey.keys());
    const prunedRows = supplies.filter((supply) => !nextKeys.has(cupsKey(supply.cups)));
    const pruned = prunedRows.length;

    if (prunedRows.length) {
      try {
        const archived = JSON.parse(localStorage.getItem(LEGACY_ARCHIVE_STORAGE) || '[]');
        const currentArchive = Array.isArray(archived) ? archived : [];
        const prunedKeys = new Set(prunedRows.map((supply) => cupsKey(supply.cups)).filter(Boolean));
        const keptArchive = currentArchive.filter((supply) => !prunedKeys.has(cupsKey(supply?.cups)));
        const archivedAt = new Date().toISOString();
        for (const supply of prunedRows) {
          keptArchive.push({
            ...supply,
            status: 'ARCHIVADO',
            archivedAt,
            archiveReason: 'central_cache_alignment',
          });
        }
        localStorage.setItem(LEGACY_ARCHIVE_STORAGE, JSON.stringify(keptArchive));
      } catch (error) {
        console.warn('No se pudo conservar la copia local antes de alinear la caché central', error);
        return { ok: false, reason: 'legacy_archive_failed', error };
      }
    }

    supplies = [...nextByKey.values()];
    save();
    publish();
    renderClients();
    renderCups($('#cupsSearch')?.value || '');

    return {
      ok: true,
      count: supplies.length,
      added,
      enriched,
      unchanged,
      pruned,
      invalid,
    };
  }

  function archiveLocal(cups) {
    const wanted = cupsKey(cups);
    if (!wanted) return { ok: false, reason: 'cups_missing' };

    const index = supplies.findIndex((supply) => cupsKey(supply.cups) === wanted);
    if (index < 0) return { ok: false, reason: 'not_found' };

    const supply = { ...supplies[index], status: 'ARCHIVADO', archivedAt: new Date().toISOString() };

    try {
      const archived = JSON.parse(localStorage.getItem(LEGACY_ARCHIVE_STORAGE) || '[]');
      const list = Array.isArray(archived) ? archived : [];
      const filtered = list.filter((item) => cupsKey(item?.cups) !== wanted);
      filtered.push(supply);
      localStorage.setItem(LEGACY_ARCHIVE_STORAGE, JSON.stringify(filtered));
    } catch (error) {
      console.warn('No se pudo conservar el suministro heredado en el archivo local', error);
      return { ok: false, reason: 'archive_storage_failed', error };
    }

    supplies.splice(index, 1);
    refresh({
      message: '<strong>Suministro heredado archivado.</strong> No existía en la base central; se ha retirado del listado activo conservando una copia local archivada.',
    });
    return { ok: true, mode: 'legacy_local_archive', supply };
  }

  function learnInvoice(data, cupsArg = '', tariffArg = '') {
    const d = typeof data === 'object' && data
      ? data
      : { company: data, cups: cupsArg, tariff: tariffArg };

    const cups = norm(d.cups || cupsArg).replace(/\s/g, '');
    if (!/^ES[A-Z0-9]{15,}$/i.test(cups)) return { ok: false, reason: 'CUPS no válido' };

    const existing = supplies.find((supply) => cupsKey(supply.cups) === cupsKey(cups));
    const company = norm(d.company || d.holder || existing?.company || existing?.holder);
    const provisionalIdentity = Boolean(existing) && [existing.client, existing.company, existing.holder].every(empty);
    const naturalPerson = /^\d{8}[A-Z]$/i.test(norm(d.taxId || d.clientTaxId).replace(/[\s-]/g, ''));

    if (!company && !existing) return { ok: false, reason: 'Titular no identificado' };

    const payload = {
      client: provisionalIdentity ? company : (existing?.client || company),
      clientTaxId: existing?.clientTaxId || d.clientTaxId || d.taxId || '',
      clientType: provisionalIdentity ? (naturalPerson ? 'PARTICULAR' : 'PENDIENTE') : (existing?.type || 'PENDIENTE'),
      company: provisionalIdentity ? company : (existing?.company || company),
      holder: provisionalIdentity ? company : (existing?.holder || company),
      cups,
      name: d.supplyName || d.name || d.supplyAddress || d.address,
      address: d.supplyAddress || d.address,
      city: d.supplyCity || d.city,
      province: d.supplyProvince || d.province,
      tariff: d.tariff === '—' ? '' : (d.tariff || tariffArg),
      contract: d.contract || d.contractNumber,
      retailer: d.retailer || d.commercializer,
      distributor: d.distributor,
      accessContract: d.accessContract,
      contractType: d.contractType,
      renewalDate: d.renewalDate,
      p1: d.p1 || d.contracted?.P1,
      p2: d.p2 || d.contracted?.P2,
      p3: d.p3 || d.contracted?.P3,
      p4: d.p4 || d.contracted?.P4,
      p5: d.p5 || d.contracted?.P5,
      p6: d.p6 || d.contracted?.P6,
      status: existing?.status || 'ACTIVO',
      source: 'Actualización automática desde factura',
      lastVerified: d.periodEnd || d.invoiceDate || new Date().toISOString().slice(0, 10),
    };

    const result = upsertSupply(payload, {
      allowMove: true,
      fillOnly: true,
      preserveIdentity: Boolean(existing) && !provisionalIdentity,
    });

    if (result.ok && result.enriched) {
      refresh({
        message: `<strong>Maestro enriquecido:</strong> ${esc(result.supply.holder || company)} · ${esc(cups)}. Dirección, localidad, contrato, tarifa y potencias disponibles se han guardado.`,
      });
    }

    return result;
  }

  function publish() {
    window.EnergyMaster = {
      all: () => supplies.map((supply) => ({ ...supply })),
      find: (cups) => supplies.find((supply) => cupsKey(supply.cups) === cupsKey(cups)) || null,
      add: (supply, options) => {
        const result = upsertSupply(supply, options);
        if (result.ok && result.enriched) refresh();
        return result;
      },
      learnInvoice,
      persistPowerProfile,
      removeLocal,
      replaceActiveFromCentral,
      archiveLocal,
      refresh: () => refresh(),
      __v2: true,
    };
    window.dispatchEvent(new CustomEvent('energy-master-ready', { detail: { count: supplies.length } }));
  }

  function groupNameFromRow(row, company) {
    const group = pick(row, ['Grupo Empresarial', 'GRUPO CLIENTE', 'GRUPO']);
    if (/XTRA/i.test(group)) return 'GRUPO XTRA';
    return group || company;
  }

  function parseWorkbook(workbook) {
    const found = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

      for (const row of data) {
        const cups = pick(row, ['CUPS']).replace(/\s/g, '');
        if (!/^ES[A-Z0-9]{15,}$/i.test(cups)) continue;

        const company = pick(row, ['Razón Social/Nombre', 'RAZON SOCIAL', 'TITULAR', 'EMPRESA', 'SOCIEDAD']) || sheetName;
        const client = groupNameFromRow(row, company);
        const isGroup = key(client) !== key(company);

        found.push(normalizeSupply({
          client,
          clientTaxId: isGroup ? '' : pick(row, ['CIF Cliente', 'NIF CLIENTE', 'CIF CLIENTE', 'NIF/CIF CLIENTE']),
          clientType: isGroup ? 'GRUPO' : pick(row, ['TIPO CLIENTE', 'TIPO']) || 'EMPRESA',
          company,
          holder: company,
          holderTaxId: pick(row, ['CIF Cliente', 'NIF CLIENTE', 'CIF CLIENTE']),
          cups,
          name: pick(row, ['Alias PS', 'NOMBRE SUMINISTRO', 'SUMINISTRO', 'NOMBRE']),
          address: pick(row, ['Dirección PS', 'DIRECCION SUMINISTRO', 'DIRECCION', 'DOMICILIO']),
          city: pick(row, ['Localidad PS', 'LOCALIDAD', 'POBLACION']),
          province: pick(row, ['Provincia PS', 'PROVINCIA']),
          tariff: pick(row, ['Tarifa', 'TARIFA ACCESO']),
          contract: pick(row, ['Nombre del contrato', 'Nº CONTRATO', 'NºCONTRATO', 'N CONTRATO', 'CONTRATO', 'NUMERO CONTRATO']),
          retailer: pick(row, ['COMERCIALIZADORA']) || 'FENIE ENERGIA',
          distributor: pick(row, ['Distribuidora Electricidad', 'DISTRIBUIDORA']),
          p1: pick(row, ['Potencia Contratada P1 (kW)', 'P1 KW']),
          p2: pick(row, ['Potencia Contratada P2 (kW)', 'P2 KW']),
          p3: pick(row, ['Potencia Contratada P3 (kW)', 'P3 KW']),
          p4: pick(row, ['Potencia Contratada P4 (kW)', 'P4 KW']),
          p5: pick(row, ['Potencia Contratada P5 (kW)', 'P5 KW']),
          p6: pick(row, ['Potencia Contratada P6 (kW)', 'P6 KW']),
          maxContractablePower: pick(row, ['Potencia Máxima Contratable (kW)', 'POTENCIA MAXIMA CONTRATABLE', 'MAX CONTRATABLE KW']),
          product: pick(row, ['Producto']),
          renewalDate: pick(row, ['Fecha Renovación']),
          status: pick(row, ['Estado']) || 'ACTIVO',
        }));
      }
    }

    const deduped = new Map();
    for (const supply of found) {
      const id = cupsKey(supply.cups);
      deduped.set(id, deduped.has(id)
        ? mergeSupply(deduped.get(id), supply, { fillOnly: true })
        : supply);
    }
    return [...deduped.values()];
  }

  function configureClientGroupField(supply = null) {
    const input = $('#clientName'), select = $('#clientGroupSelect'), help = $('#clientGroupHelp');
    if (!input || !select || !help) return;
    const editing = Boolean(supply?.supplyId);
    input.classList.toggle('hidden',editing);
    input.disabled = editing;
    input.required = !editing;
    select.classList.toggle('hidden',!editing);
    select.disabled = !editing;
    help.classList.toggle('hidden',!editing);
    select.replaceChildren();
    select.add(new Option('Sin grupo comercial (cliente legal)', ''));
    for (const group of [...(window.IBTSupplyPortfolios || [])].sort((a,b) => (a.alias || a.name).localeCompare(b.alias || b.name,'es'))) {
      select.add(new Option(group.alias ? group.alias + ' (' + group.name + ')' : group.name,group.id));
    }
    select.add(new Option('+ Crear un nuevo grupo…','__new__'));
    select.value = editing ? (supply.portfolioId || '') : '';
    $('#clientPortfolioNew').classList.add('hidden');
    $('#clientPortfolioAliasEditor').classList.add('hidden');
    $('#clientPortfolioNewName').value = '';
    $('#clientPortfolioNewAlias').value = '';
    if(editing) updatePortfolioGroupChoice();
  }

  function updatePortfolioGroupChoice() {
    const chosen = $('#clientGroupSelect').value;
    const group = (window.IBTSupplyPortfolios || []).find((item) => item.id === chosen);
    $('#clientPortfolioNew').classList.toggle('hidden',chosen !== '__new__');
    $('#clientPortfolioAliasEditor').classList.toggle('hidden',!group);
    if(group) $('#clientPortfolioExistingAlias').value = group.alias || '';
    const current = supplies.find((item) => cupsKey(item.cups) === cupsKey(editingCups));
    const changed = Boolean(current && (chosen === '__new__' || chosen !== norm(current.portfolioId)));
    $('#clientForm button[type="submit"]').textContent = changed ? 'Guardar agrupación' : 'Guardar sin duplicar';
    $('#clientGroupHelp').textContent = changed
      ? 'Solo se cambiará la agrupación de este CUPS. Titular legal, contrato e histórico permanecerán intactos.'
      : 'Agrupación comercial independiente del titular y del cliente fiscal.';
  }

  async function saveCommercialPortfolio() {
    const supply = supplies.find((item) => cupsKey(item.cups) === cupsKey(editingCups));
    const chosen = $('#clientGroupSelect').value;
    const newName = chosen === '__new__' ? norm($('#clientPortfolioNewName').value) : '';
    const newAlias = chosen === '__new__' ? norm($('#clientPortfolioNewAlias').value) : '';
    const message = $('#clientFormMsg');
    if(!supply?.supplyId || !window.ibtSupabase) {
      message.textContent = 'No se ha podido identificar este suministro en Supabase.';
      return;
    }
    if(chosen === '__new__' && !newName) {
      message.textContent = 'Escribe el nombre del nuevo grupo.';
      return;
    }
    const target = (window.IBTSupplyPortfolios || []).find((g) => g.id === chosen);
    const label = newName || target?.alias || target?.name || 'sin grupo';
    if(!window.confirm('¿Agrupar únicamente el CUPS ' + supply.cups + ' en «' + label + '»? No cambiará el titular legal ni las facturas. Los demás campos sin guardar no se aplicarán.')) return;
    const button = $('#clientForm button[type="submit"]');
    button.disabled = true;
    message.textContent = 'Guardando grupo comercial…';
    try {
      const {data,error} = await window.ibtSupabase.rpc('set_internal_supply_portfolio',{
        p_supply_id:supply.supplyId,
        p_group_id:chosen && chosen !== '__new__' ? chosen : null,
        p_new_name:newName || null,p_new_alias:newAlias || null,
      });
      if(error) throw error;
      if(!data?.ok) {
        const errors={group_name_exists:'Ya existe un grupo con ese nombre. Selecciónalo.',not_authorized:'Sin permiso interno.',group_not_found:'Grupo no encontrado.'};
        message.textContent=errors[data?.reason] || 'No se ha guardado: '+(data?.reason || 'error');
        return;
      }
      closeForm();
      await window.CentralSupabaseMaster?.reload?.();
      status('','<strong>Grupo comercial guardado.</strong> Sin modificar titulares ni facturas.');
    } catch(error) {
      console.error('Error guardando grupo comercial',error);
      message.textContent='No se ha podido confirmar el cambio. La caché local sigue intacta.';
    } finally { button.disabled=false; }
  }

  async function saveCommercialPortfolioAlias() {
    const chosen=$('#clientGroupSelect').value;
    const group=(window.IBTSupplyPortfolios || []).find((item)=>item.id===chosen);
    if(!group) return;
    try {
      const {data,error}=await window.ibtSupabase.rpc('set_internal_supply_portfolio_alias',{
        p_group_id:group.id,p_alias:norm($('#clientPortfolioExistingAlias').value)||null,
      });
      if(error) throw error;
      if(!data?.ok) throw Error(data?.reason || 'error');
      await window.CentralSupabaseMaster?.reload?.();
      $('#clientFormMsg').textContent='Alias del grupo actualizado.';
    } catch(error) {
      console.warn(error);
      $('#clientFormMsg').textContent='No se ha podido actualizar el alias del grupo.';
    }
  }

  function setupGroupLinkControls(supply = null) {
    const panel = $('#holderGroupLink');
    const select = $('#holderTargetGroup');
    const action = $('#holderLinkToGroup');
    if (!panel || !select || !action) return;

    select.replaceChildren();
    select.add(new Option('Selecciona un grupo existente', ''));
    const groups = new Map();
    for (const item of supplies) {
      if (item.type !== 'GRUPO' || !item.clientId || item.clientId === supply?.clientId) continue;
      if (!groups.has(item.clientId)) groups.set(item.clientId, item.client);
    }
    for (const [id, name] of [...groups].sort((a,b) => a[1].localeCompare(b[1], 'es'))) {
      select.add(new Option(name, id));
    }
    const available = Boolean(supply?.holderId && supply?.clientId && groups.size);
    panel.classList.add('hidden'); // Selection lives in the Cliente / grupo field.
    action.disabled = !available;
    select.value = '';
    $('#holderGroupLinkStatus').textContent = '';
  }

  async function linkCurrentHolderToGroup() {
    const supply = supplies.find((item) => cupsKey(item.cups) === cupsKey(editingCups));
    const groupId = $('#clientGroupSelect')?.value || '';
    const message = $('#clientFormMsg');
    if (!supply?.holderId || !supply?.clientId || !groupId) {
      message.textContent = 'Selecciona un grupo existente para vincular este titular.';
      return;
    }
    const target = supplies.find((item) => item.clientId === groupId && item.type === 'GRUPO');
    if (!target || target.clientId === supply.clientId) {
      message.textContent = 'El grupo seleccionado no es válido.';
      return;
    }
    if (!window.confirm('¿Vincular el titular «' + supply.holder + '» a «' + target.client + '»? Se conservarán todos sus CUPS y facturas. Los cambios no guardados de esta ficha no se aplicarán.')) return;

    const button = $('#holderLinkToGroup');
    button.disabled = true;
    message.textContent = 'Vinculando titular en la base central…';
    try {
      const supabase = window.ibtSupabase;
      const {data,error} = await supabase.rpc('link_existing_holder_to_group', {
        p_holder_id: supply.holderId,
        p_target_client_id: groupId,
        p_expected_client_id: supply.clientId,
      });
      if (error) throw error;
      if (!data?.ok) {
        const failures = {
          holder_client_changed: 'Otro cambio ha modificado la relación del titular. Recarga la ficha.',
          holder_already_exists_in_group: 'Ya existe un titular con la misma identidad en ese grupo. No se ha movido ni duplicado.',
          target_group_not_found: 'El grupo de destino ya no está disponible.',
          not_authorized: 'No tienes permiso para vincular titulares.',
        };
        message.textContent = failures[data?.reason] || 'No se ha podido vincular el titular: ' + (data?.reason || 'error desconocido');
        return;
      }
      closeForm();
      await window.CentralSupabaseMaster?.reload?.();
      status('', '<strong>Titular vinculado al grupo.</strong> Los suministros y facturas mantienen sus identificadores.');
      window.dispatchEvent(new CustomEvent('ibt-central-data-changed', {detail:{action:'holder_group_linked'}}));
    } catch (error) {
      console.error('Error vinculando titular al grupo',error);
      message.textContent = 'No se ha podido confirmar la vinculación. No se ha modificado la ficha local.';
    } finally {
      button.disabled = false;
    }
  }

  function fillForm(supply) {
    setupGroupLinkControls(supply);
    configureClientGroupField(supply);
    $('#clientType').value = supply.type || 'PENDIENTE';
    $('#clientName').value = supply.client || '';
    if ($('#clientAlias')) $('#clientAlias').value = supply.clientAlias || '';
    const sameLegalIdentity = key(supply.client) === key(supply.holder || supply.company);
    $('#clientTaxId').value = supply.clientTaxId || (sameLegalIdentity ? (supply.holderTaxId || '') : '');
    const holderDefaults = holderDefaultsFor(supply);
    $('#clientEmail').value = supply.supplyEmailOverride || holderDefaults.email || '';
    $('#clientPhone').value = supply.supplyPhoneOverride || holderDefaults.phone || '';
    $('#clientBankAccount').value = supply.supplyBankAccountOverride || holderDefaults.bankAccount || '';
    $('#holderName').value = supply.holder || supply.company || '';
    $('#clientCups').value = supply.cups || '';
    if ($('#supplyAlias')) $('#supplyAlias').value = editableSupplyName(supply);
    $('#supplyAddress').value = supply.address || '';
    $('#supplyCity').value = supply.city || '';
    $('#supplyProvince').value = supply.province || '';
    $('#supplyTariff').value = supply.tariff || '';
    $('#supplyContract').value = supply.contract || '';
    for (let p = 1; p <= 6; p += 1) {
      const input = $(`#supplyPowerP${p}`);
      if (input) input.value = supply[`p${p}`] === '' || supply[`p${p}`] == null ? '' : supply[`p${p}`];
    }
    $('#supplyMaxContractablePower').value = supply.maxContractablePower === '' || supply.maxContractablePower == null ? '' : supply.maxContractablePower;
    updatePowerPeriodVisibility();
    $('#supplyRetailer').value = supply.retailer || '';
    $('#supplyRetailerSource').textContent = supply.manualRetailer
      ? 'Fijada manualmente. Las facturas no modificarán este valor.'
      : 'Se actualizará desde facturas validadas hasta que la cambies manualmente.';
  }

  function openForm(client = '', holder = '', blankHolder = false) {
    editingCups = '';
    show('clientes');
    showEditorModal();
    $('#clientForm').reset();
    setupGroupLinkControls();
    configureClientGroupField();
    $('#supplyRetailerSource').textContent = 'Si indicas una comercializadora, quedará fijada manualmente para este CUPS.';
    $('#clientEditorTitle').textContent = blankHolder ? 'Nuevo titular / suministro' : 'Cliente y punto de suministro';

    const existing = supplies.find((supply) => key(supply.client) === key(client));
    if (existing) {
      $('#clientName').value = client;
      $('#clientType').value = existing.type || 'PENDIENTE';
      $('#clientTaxId').value = existing.clientTaxId || '';
      if ($('#clientAlias')) $('#clientAlias').value = existing.clientAlias || '';
      const targetHolder = blankHolder ? '' : (holder || existing.holder || existing.company || client);
      const holderSupply = blankHolder
        ? {}
        : (supplies.find((supply) => key(supply.client) === key(client) && key(supply.holder || supply.company) === key(targetHolder)) || existing);
      const holderDefaults = holderDefaultsFor(holderSupply);
      $('#clientEmail').value = holderDefaults.email;
      $('#clientPhone').value = holderDefaults.phone;
      $('#clientBankAccount').value = holderDefaults.bankAccount;
      $('#holderName').value = targetHolder;
    } else {
      $('#clientName').value = client;
      $('#holderName').value = holder;
    }

    updatePowerPeriodVisibility();
    $('#clientName').focus({ preventScroll:true });
  }

  function editSupply(cups) {
    const supply = supplies.find((item) => cupsKey(item.cups) === cupsKey(cups));
    if (!supply) return;
    editingCups = supply.cups;
    showEditorModal();
    $('#clientForm').reset();
    $('#clientEditorTitle').textContent = `Editar suministro · ${supply.cups}`;
    fillForm(supply);
    $('#cancelClient')?.focus({ preventScroll:true });
  }

  function closeForm() {
    editingCups = '';
    $('#clientEditor').classList.add('hidden');
    $('#clientEditor').removeAttribute('aria-modal');
    $('#clientEditorBackdrop').classList.add('hidden');
    document.body.classList.remove('client-editor-modal-open');
    $('#clientForm').reset();
    $('#clientFormMsg').textContent = '';
    const submit = $('#clientForm button[type="submit"]');
    if (submit) submit.textContent = 'Guardar sin duplicar';
    if (lastEditorTrigger?.isConnected) lastEditorTrigger.focus({preventScroll:true});
    lastEditorTrigger = null;
  }

  function updatePowerPeriodVisibility() {
    const count = powerPeriodCount($('#supplyTariff')?.value || '');
    document.querySelectorAll('[data-power-period]').forEach((label) => {
      const period = Number(String(label.dataset.powerPeriod || '').replace('P', ''));
      label.hidden = period > count;
    });
    const hint = $('#contractedPowerHint');
    if (hint) hint.textContent = count === 2
      ? 'Tarifa 2.0TD: potencia contratada P1 y P2.'
      : /^(?:3\.0TD|6\.[1-4]TD)$/i.test(norm($('#supplyTariff')?.value))
        ? 'Tarifa con seis periodos de potencia: P1-P6.'
        : 'Indica la tarifa para identificar sus periodos. Se conservan las potencias P1-P6 disponibles.';
  }

  async function persistPowerProfile(cups, supply, { mode = 'manual', source = 'manual' } = {}) {
    const supabase = window.ibtSupabase;
    const role = window.ibtCurrentProfile?.role;
    if (!supabase || !['admin', 'staff'].includes(role)) return { ok: false, reason: 'not_authorized' };
    const contracted = contractedPowerObject(supply);
    const maxValue = kwValue(supply.maxContractablePower);
    try {
      const { data, error } = await supabase.rpc('set_internal_supply_power_profile', {
        p_cups: cups || null,
        p_contracted_power_kw: contracted,
        p_max_contractable_power_kw: maxValue === '' ? null : maxValue,
        p_mode: mode,
        p_source: source,
      });
      if (error) throw error;
      if (!data?.ok) return { ok: false, reason: data?.reason || 'power_profile_write_rejected', data };
      return { ok: true, data };
    } catch (error) {
      console.warn('No se pudo guardar el perfil de potencia del suministro', error);
      return { ok: false, reason: 'power_profile_write_failed', error };
    }
  }

  async function persistSupplyOverrides(supplyId, supply) {
    const supabase = window.ibtSupabase;
    const role = window.ibtCurrentProfile?.role;
    if (!supabase || !['admin', 'staff'].includes(role)) return { ok: false, reason: 'not_authorized' };
    if (!supplyId) return { ok: false, reason: 'supply_id_required' };
    try {
      const { data, error } = await supabase.rpc('set_internal_supply_contact_overrides', {
        p_supply_id: supplyId,
        p_email: norm(supply.supplyEmailOverride) || null,
        p_phone: norm(supply.supplyPhoneOverride) || null,
        p_bank_account: norm(supply.supplyBankAccountOverride) || null,
      });
      if (error) throw error;
      if (!data?.ok) return { ok: false, reason: data?.reason || 'supply_contact_write_rejected' };
      return { ok: true, data };
    } catch (error) {
      console.warn('No se pudieron guardar las excepciones de contacto/cobro del suministro', error);
      return { ok: false, reason: 'supply_contact_write_failed', error };
    }
  }

  async function persistAliases({ cups, client, clientTaxId, clientAlias, supplyAlias }) {
    const supabase = window.ibtSupabase;
    const role = window.ibtCurrentProfile?.role;
    if (!supabase || !['admin', 'staff'].includes(role)) return { ok: false, skipped: true };
    try {
      const { data, error } = await supabase.rpc('set_internal_aliases', {
        p_cups: cups || null,
        p_client_name: client || null,
        p_client_tax_id: clientTaxId || null,
        p_client_alias: norm(clientAlias) || null,
        p_supply_alias: norm(supplyAlias),
      });
      if (error) throw error;
      if (data?.ok !== true || !data.supply_id || data.supply_alias_set !== true) {
        return { ok: false, data };
      }
      window.dispatchEvent(new CustomEvent('ibt-aliases-changed', { detail: data || {} }));
      return { ok: true, data };
    } catch (error) {
      console.warn('No se pudieron guardar los alias internos', error);
      return { ok: false, error };
    }
  }

  function centralWriteMessage(reason = '') {
    const messages = {
      not_authorized: 'Tu sesión no tiene permisos internos para modificar el maestro.',
      invalid_mode: 'Modo de guardado no válido.',
      invalid_cups: 'El CUPS no es válido.',
      invalid_client_type: 'El tipo de cliente no es válido.',
      client_name_required: 'Falta el nombre del cliente.',
      duplicate_cups: 'Ese CUPS ya existe en otro suministro.',
      duplicate_or_conflicting_identity: 'Hay un conflicto de identidad o un CUPS duplicado en la base central.',
      client_tax_ambiguous: 'El NIF/CIF del cliente coincide con más de un registro. Revisa la base central.',
      client_name_ambiguous: 'El nombre del cliente coincide con más de un registro. Añade o revisa el NIF/CIF.',
      holder_tax_ambiguous: 'El NIF/CIF del titular coincide con más de un titular del mismo cliente.',
      holder_name_ambiguous: 'El nombre del titular coincide con más de un registro del mismo cliente.',
      holder_belongs_to_other_client: 'Ese titular ya está vinculado a otro cliente. No se ha duplicado ni movido automáticamente.',
      owner_conflict: 'El CUPS ya pertenece a otro cliente/titular en la base central.',
    };
    return messages[reason] || 'No se ha podido guardar el cambio en la base central.';
  }

  async function persistCentralSupply(supply, { originalCups = '', mode = 'manual' } = {}) {
    const supabase = window.ibtSupabase;
    const role = window.ibtCurrentProfile?.role;
    if (!supabase || !['admin', 'staff'].includes(role)) {
      return { ok: false, reason: 'not_authorized' };
    }

    const holderName = norm(supply.holder || supply.company || supply.client);
    const sameLegalIdentity = key(holderName) === key(supply.client);
    const holderTaxId = norm(supply.holderTaxId) || (sameLegalIdentity ? norm(supply.clientTaxId) : '');

    try {
      const { data, error } = await supabase.rpc('save_master_supply_v2', {
        p_payload: {
          mode,
          client_type: norm(supply.type || supply.clientType) || null,
          original_cups: originalCups || null,
          client_name: norm(supply.client) || null,
          client_tax_id: norm(supply.clientTaxId) || null,
          holder_name: holderName || null,
          holder_tax_id: holderTaxId || null,
          cups: norm(supply.cups) || null,
          // The editor only changes the private alias. Preserve the imported name,
          // including when the local cache does not contain it.
          ...(mode === 'fill_only' && Object.prototype.hasOwnProperty.call(supply, 'name')
            ? { supply_name: norm(supply.name) || null } : {}),
          address: norm(supply.address) || null,
          city: norm(supply.city) || null,
          province: norm(supply.province) || null,
          // The manual form does not edit these two fields. Omitting them
          // avoids sending an old/absent cache value as an intentional clear.
          ...(mode === 'fill_only' && Object.prototype.hasOwnProperty.call(supply, 'postalCode')
            ? { postal_code: norm(supply.postalCode) || null } : {}),
          tariff: norm(supply.tariff) || null,
          contract_number: norm(supply.contract) || null,
          retailer: norm(supply.retailer) || null,
          ...(mode === 'fill_only' && Object.prototype.hasOwnProperty.call(supply, 'distributor')
            ? { distributor: norm(supply.distributor) || null } : {}),
        },
      });
      if (error) throw error;
      if (!data?.ok) return { ok: false, reason: data?.reason || 'central_write_rejected', data };
      return { ok: true, data };
    } catch (error) {
      console.error('No se pudo guardar el maestro central', error);
      return { ok: false, reason: 'central_write_failed', error };
    }
  }

  function bindControls() {
    $('#newClient').onclick = () => openForm('');
    $('#cancelClient').onclick = closeForm;
    $('#clientEditorBackdrop').addEventListener('click', closeForm);
    document.addEventListener('keydown', (event) => {
      if ($('#clientEditor')?.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeForm();
      }
      // Keep keyboard focus within the modal, including on mobile keyboard navigation.
      if (event.key === 'Tab') {
        const controls = [...$('#clientEditor').querySelectorAll('button, input, select, textarea, [tabindex]')]
          .filter((item) => !item.disabled && !item.closest('[hidden], .hidden') && item.getClientRects().length);
        if (!controls.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    });
    $('#holderLinkToGroup').onclick = linkCurrentHolderToGroup;
    $('#clientGroupSelect').addEventListener('change', updatePortfolioGroupChoice);
    $('#clientPortfolioSaveAlias').addEventListener('click', saveCommercialPortfolioAlias);;
    $('#supplyTariff').addEventListener('input', updatePowerPeriodVisibility);
    $('#supplyTariff').addEventListener('change', updatePowerPeriodVisibility);
    $('#clearSupplyContactOverrides').onclick = () => {
      const current = editingCups
        ? supplies.find((supply) => cupsKey(supply.cups) === cupsKey(editingCups))
        : supplies.find((supply) => key(supply.client) === key($('#clientName').value) && key(supply.holder || supply.company) === key($('#holderName').value));
      const holderDefaults = holderDefaultsFor(current || {});
      $('#clientEmail').value = holderDefaults.email;
      $('#clientPhone').value = holderDefaults.phone;
      $('#clientBankAccount').value = holderDefaults.bankAccount;
      $('#clientFormMsg').textContent = 'Se usarán los datos actuales del titular.';
    };

    $('#clientForm').onsubmit = async (event) => {
      event.preventDefault();
      const existingSupply = editingCups
        ? supplies.find((supply) => cupsKey(supply.cups) === cupsKey(editingCups))
        : null;
      const selectedGroupId = $('#clientGroupSelect')?.value || '';
      if (existingSupply?.supplyId && (selectedGroupId === '__new__' || selectedGroupId !== norm(existingSupply.portfolioId))) {
        await saveCommercialPortfolio();
        return;
      }
      const client = existingSupply ? existingSupply.client : norm($('#clientName').value);
      const cups = norm($('#clientCups').value).replace(/\s/g, '');

      if (!client || !/^ES[A-Z0-9]{15,}$/i.test(cups)) {
        $('#clientFormMsg').textContent = 'Indica un nombre de cliente y un CUPS válido.';
        return;
      }

      if (editingCups && cupsKey(editingCups) !== cupsKey(cups) && supplies.some((supply) => cupsKey(supply.cups) === cupsKey(cups))) {
        $('#clientFormMsg').textContent = 'Ese CUPS ya existe. No se puede duplicar.';
        return;
      }

      const existingBefore = editingCups
        ? supplies.find((supply) => cupsKey(supply.cups) === cupsKey(editingCups))
        : null;
      if (existingBefore?.clientTaxId && key($('#clientTaxId').value) !== key(existingBefore.clientTaxId)) {
        $('#clientFormMsg').textContent = 'El NIF/CIF existente no se puede borrar ni sustituir desde un suministro. Revisa la identidad en «Editar titular».';
        return;
      }
      if (existingBefore?.holderId && norm($('#holderName').value) !== norm(existingBefore.holder || existingBefore.company)) {
        $('#clientFormMsg').textContent = 'El nombre del titular no se puede borrar ni cambiar desde esta ficha. Utiliza «Editar titular».';
        return;
      }
      const requestedRetailer = norm($('#supplyRetailer').value);
      const manualRetailerChanged = Boolean(requestedRetailer) &&
        (!existingBefore || requestedRetailer !== norm(existingBefore.retailer));
      if (existingBefore?.manualRetailer && !requestedRetailer) {
        $('#clientFormMsg').textContent = 'La comercializadora fijada manualmente no puede quedar vacía.';
        return;
      }

      const inheritedSupply = existingBefore || supplies.find((supply) =>
        key(supply.client) === key(client) &&
        key(supply.holder || supply.company) === key($('#holderName').value || client)
      ) || {};
      const holderDefaults = holderDefaultsFor(inheritedSupply);
      const emailValue = norm($('#clientEmail').value);
      const phoneValue = norm($('#clientPhone').value);
      const bankValue = norm($('#clientBankAccount').value);
      const visiblePowerPeriods = powerPeriodCount($('#supplyTariff').value);
      const data = {
        client,
        clientTaxId: $('#clientTaxId').value,
        clientAlias: $('#clientAlias')?.value || '',
        supplyEmailOverride: emailValue === holderDefaults.email ? '' : emailValue,
        supplyPhoneOverride: phoneValue === holderDefaults.phone ? '' : phoneValue,
        supplyBankAccountOverride: bankValue === holderDefaults.bankAccount ? '' : bankValue,
        clientType: $('#clientType').value,
        company: $('#holderName').value || client,
        holder: $('#holderName').value || client,
        cups,
        alias: $('#supplyAlias')?.value || '',
        address: $('#supplyAddress').value,
        city: $('#supplyCity').value,
        province: $('#supplyProvince').value,
        tariff: $('#supplyTariff').value,
        contract: $('#supplyContract').value,
        p1: kwValue($('#supplyPowerP1').value),
        p2: kwValue($('#supplyPowerP2').value),
        p3: visiblePowerPeriods >= 3 ? kwValue($('#supplyPowerP3').value) : '',
        p4: visiblePowerPeriods >= 4 ? kwValue($('#supplyPowerP4').value) : '',
        p5: visiblePowerPeriods >= 5 ? kwValue($('#supplyPowerP5').value) : '',
        p6: visiblePowerPeriods >= 6 ? kwValue($('#supplyPowerP6').value) : '',
        maxContractablePower: kwValue($('#supplyMaxContractablePower').value),
        // Empty clears an automatic value; nonempty changes use the manual RPC below.
        retailer: requestedRetailer ? (existingBefore?.retailer || '') : '',
        manualRetailer: existingBefore?.manualRetailer || '',
        status: 'ACTIVO',
      };

      const wasEditing = Boolean(editingCups);
      const candidate = normalizeSupply({ ...(existingBefore || {}), ...data });

      $('#clientFormMsg').textContent = 'Guardando en la base central…';
      const centralSave = await persistCentralSupply(candidate, {
        originalCups: editingCups,
        mode: 'manual',
      });

      if (!centralSave.ok) {
        $('#clientFormMsg').textContent = centralWriteMessage(centralSave.reason);
        return;
      }

      const powerSave = await persistPowerProfile(cups, data, { mode: 'manual', source: 'manual' });
      if (!powerSave.ok) {
        const powerMessages = {
          contracted_exceeds_max_contractable: 'La potencia contratada no puede superar la potencia máxima contratable.',
          invalid_contracted_power: 'Revisa las potencias contratadas.',
          invalid_max_contractable_power: 'Revisa la potencia máxima contratable.',
        };
        $('#clientFormMsg').textContent = powerMessages[powerSave.reason] || 'Los datos principales se han guardado, pero NO el perfil de potencia.';
        await window.CentralSupabaseMaster?.reload?.();
        return;
      }

      const overrideSave = await persistSupplyOverrides(centralSave.data?.id, data);
      if (!overrideSave.ok) {
        $('#clientFormMsg').textContent = 'Los datos principales se han guardado, pero NO las excepciones de contacto/cobro del suministro.';
        await window.CentralSupabaseMaster?.reload?.();
        return;
      }

      if (manualRetailerChanged) {
        const supabase = window.ibtSupabase;
        let manualResult;
        let manualError;
        try {
          ({ data: manualResult, error: manualError } = await supabase.rpc('set_supply_retailer_manual', {
            p_cups: cups,
            p_retailer: requestedRetailer,
          }));
        } catch (error) {
          manualError = error;
        }
        if (manualError || !manualResult?.ok) {
          $('#clientFormMsg').textContent = 'Los demás datos se guardaron, pero NO se ha fijado la comercializadora manual. Revisa la conexión y repite la operación.';
          await window.CentralSupabaseMaster?.reload?.();
          return;
        }
        data.retailer = requestedRetailer;
        data.manualRetailer = requestedRetailer;
      }

      const aliasSave = await persistAliases({
        cups,
        client,
        clientTaxId: data.clientTaxId,
        clientAlias: data.clientAlias,
        supplyAlias: data.alias,
      });
      if (!aliasSave.ok) {
        $('#clientFormMsg').textContent = 'Los datos principales están guardados; los alias internos quedan pendientes.';
        await window.CentralSupabaseMaster?.reload?.();
        return;
      }
      data.aliasSet = true;

      let result;
      if (editingCups) {
        const idx = supplies.findIndex((supply) => cupsKey(supply.cups) === cupsKey(editingCups));
        if (idx < 0) {
          $('#clientFormMsg').textContent = 'El suministro se guardó en Supabase, pero la caché local estaba desactualizada. Recargando…';
          await window.CentralSupabaseMaster?.reload?.();
          return;
        }
        const old = supplies[idx];
        supplies.splice(idx, 1);
        result = upsertSupply({ ...old, ...data }, { allowMove: true });
        if (!result.ok) supplies.splice(idx, 0, old);
      } else {
        result = upsertSupply(data, { allowMove: true });
      }

      if (!result.ok) {
        await window.CentralSupabaseMaster?.reload?.();
        $('#clientFormMsg').textContent = 'El cambio está guardado en Supabase. Se ha recargado la caché local para evitar inconsistencias.';
        return;
      }

      const clientIdentity = key(data.clientTaxId) || key(data.client);
      supplies.forEach((item) => {
        const itemIdentity = key(item.clientTaxId) || key(item.client);
        if (itemIdentity === clientIdentity) {
          item.clientAlias = norm(data.clientAlias);
        }
      });

      closeForm();
      refresh({
        message: `<strong>${wasEditing ? 'Suministro actualizado' : 'Cliente/suministro añadido'} en Supabase.</strong> Alias centrales guardados.`,
      });
      window.dispatchEvent(new CustomEvent('ibt-central-data-changed', {
        detail: { action: wasEditing ? 'master_supply_updated' : 'master_supply_inserted', cups },
      }));
    };

    const masterInput = $('#masterInput');
    $('#importMaster').onclick = () => {
      masterInput.value = '';
      masterInput.click();
    };

    masterInput.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const parsed = parseWorkbook(workbook);
        if (!parsed.length) {
          status('', `No se han encontrado filas con CUPS válidos en ${esc(file.name)}.`);
          return;
        }

        let added = 0;
        let enriched = 0;
        let unchanged = 0;
        let blocked = 0;

        for (const supply of parsed) {
          const centralSave = await persistCentralSupply(supply, { mode: 'fill_only' });
          if (!centralSave.ok) {
            blocked += 1;
            continue;
          }

          const powerSave = await persistPowerProfile(supply.cups, supply, { mode: 'fill_only', source: 'import' });
          if (!powerSave.ok) {
            blocked += 1;
            continue;
          }

          const result = upsertSupply(supply, { allowMove: true, fillOnly: true, preserveIdentity: false });
          if (!result.ok) {
            blocked += 1;
            continue;
          }

          if (centralSave.data?.mode === 'inserted') added += 1;
          else if (centralSave.data?.mode === 'enriched') enriched += 1;
          else unchanged += 1;
        }

        refresh({
          message: `<strong>Maestro importado en Supabase:</strong> ${added} CUPS nuevos · ${enriched} suministros completados · ${unchanged} sin cambios · ${blocked} conflictos bloqueados.`,
        });
        window.dispatchEvent(new CustomEvent('ibt-central-data-changed', {
          detail: { action: 'master_import', added, enriched, unchanged, blocked },
        }));
      } catch (error) {
        status('', `No se ha podido leer el maestro: ${esc(error.message)}`);
      }
    };

    $('#cupsSearch').oninput = (event) => renderCups(event.target.value);
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      if (Array.isArray(saved)) {
        supplies = [];
        let migratedText = false;
        for (const supply of saved) {
          if (!supply?.cups) continue;
          const normalized = normalizeSupply(supply);
          if (normalized.distributor !== norm(supply.distributor) || normalized.retailer !== norm(supply.retailer || supply.commercializer)) migratedText = true;
          upsertSupply(normalized, { allowMove: true });
        }
        // One-time, lossless migration of legacy split-accent entity names.
        if (migratedText) save();
      }
    } catch (error) {
      console.warn('No se pudo leer el maestro guardado', error);
      supplies = [];
    }

    bindControls();
    publish();
    renderClients();
    renderCups();
    status();
  }

  // Alerts load independently after authentication. Refresh indicators without altering the master.
  window.addEventListener('ibt-alerts-loaded', () => {
    if (['admin','staff'].includes(window.ibtCurrentProfile?.role)) renderClients();
  });
  load();
})();
