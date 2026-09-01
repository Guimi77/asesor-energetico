(() => {
  'use strict';

  const STORAGE = 'ibt-energy-master-v1';
  const $ = (selector) => document.querySelector(selector);

  let supplies = [];
  let editingCups = '';

  const views = {
    facturas: ['Facturas procesadas', 'Carga, valida y analiza las facturas eléctricas de tus clientes.', 'Panel de análisis energético'],
    clientes: ['Clientes', 'Gestiona grupos, empresas y particulares desde un único maestro local.', 'Cartera energética'],
    cups: ['Suministros / CUPS', 'Consulta y edita todos los puntos de suministro de tus clientes.', 'Maestro energético'],
    historico: ['Histórico energético', 'Memoria de facturas, análisis, recomendaciones y actuaciones por cliente y CUPS.', 'Memoria energética'],
  };

  const norm = (value) => String(value ?? '').trim();
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
      company,
      holder: norm(raw.holder) || company,
      status: norm(raw.status) || 'ACTIVO',
      cups: norm(raw.cups).replace(/\s/g, ''),
    };
  }

  function mergeSupply(existing, incoming, { fillOnly = false, preserveIdentity = false } = {}) {
    const merged = { ...existing };
    const identityFields = new Set(['client', 'clientTaxId', 'type', 'company', 'holder']);

    for (const [field, value] of Object.entries(incoming)) {
      if (empty(value)) continue;
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
      supplies[idx] = mergeSupply(existing, incoming, { fillOnly, preserveIdentity });
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
      localStorage.setItem(STORAGE, JSON.stringify(supplies));
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
      element.textContent = 'No hay maestro guardado en este navegador.';
      return;
    }
    const clients = new Set(supplies.map((item) => key(item.client)));
    const holders = new Set(supplies.map((item) => key(item.holder)));
    element.innerHTML = `<strong>${clients.size} cliente${clients.size === 1 ? '' : 's'} · ${holders.size} titular${holders.size === 1 ? '' : 'es'} · ${supplies.length} CUPS</strong> ${source ? `actualizados desde <strong>${esc(source)}</strong> y ` : ''}guardados localmente en este navegador.`;
  }

  function holderTree(list) {
    const groups = new Map();
    for (const supply of list) {
      const holderName = supply.holder || supply.company || 'Sin titular';
      const holderKey = key(holderName) || 'SINTITULAR';
      if (!groups.has(holderKey)) groups.set(holderKey, { name: holderName, list: [] });
      groups.get(holderKey).list.push(supply);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderClients() {
    const grid = $('#companyGrid');
    if (!grid) return;
    if (!supplies.length) {
      grid.innerHTML = '';
      return;
    }

    const groups = new Map();
    for (const supply of supplies) {
      const groupKey = key(supply.clientTaxId) || key(supply.client);
      if (!groups.has(groupKey)) groups.set(groupKey, { name: supply.client, list: [] });
      groups.get(groupKey).list.push(supply);
    }

    grid.innerHTML = [...groups.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, list }) => {
        const holders = holderTree(list);
        const type = list[0]?.type || 'CLIENTE';
        const folders = holders.map((holder) => {
          const rows = holder.list.map((supply) => {
            const title = supply.name || supply.address || 'Suministro';
            const city = supply.city || 'Localidad pendiente';
            const tariff = supply.tariff || 'Tarifa pendiente';
            const contract = supply.contract || 'Contrato pendiente';
            return `<div class="holder-supply-row" data-cups="${esc(supply.cups)}"><div><b>${esc(title)}</b><small>${esc(supply.cups)} · ${esc(city)} · ${esc(tariff)} · ${esc(contract)}</small></div><button class="secondary edit-supply-tree" data-cups="${esc(supply.cups)}">Editar</button></div>`;
          }).join('');

          return `<details class="holder-folder" ${holders.length === 1 ? 'open' : ''}><summary><span class="holder-folder-icon">▸</span><strong>${esc(holder.name)}</strong><span>${holder.list.length} CUPS</span></summary><div class="holder-supplies">${rows}<button class="company-link add-supply-holder" data-client="${esc(name)}" data-holder="${esc(holder.name)}">+ Añadir suministro a este titular</button></div></details>`;
        }).join('');

        return `<article class="card company-card company-card-tree"><div class="company-card-head"><span class="company-mark">${esc(name.slice(0, 2).toUpperCase())}</span><span class="status ${type === 'PENDIENTE' ? 'review' : 'ok'}">${esc(type)}</span></div><div class="client-tree-title"><div><h3>${esc(name)}</h3><small>${holders.length} titular${holders.length === 1 ? '' : 'es'} · ${list.length} suministro${list.length === 1 ? '' : 's'}</small></div><button class="company-link add-supply" data-client="${esc(name)}">+ Nuevo suministro</button></div><div class="holder-tree">${folders}</div></article>`;
      })
      .join('');

    grid.querySelectorAll('.edit-supply-tree').forEach((button) => {
      button.onclick = () => editSupply(button.dataset.cups);
    });
    grid.querySelectorAll('.add-supply').forEach((button) => {
      button.onclick = () => openForm(button.dataset.client);
    });
    grid.querySelectorAll('.add-supply-holder').forEach((button) => {
      button.onclick = () => openForm(button.dataset.client, button.dataset.holder);
    });
  }

  function renderCups(query = '') {
    const body = $('#cupsBody');
    if (!body) return;
    const needle = norm(query).toLowerCase();
    const list = supplies.filter((supply) => Object.values(supply).join(' ').toLowerCase().includes(needle));

    body.innerHTML = list.length
      ? list.map((supply) => `<tr><td><span class="status ${String(supply.status).toUpperCase() === 'ACTIVO' ? 'ok' : 'review'}">${esc(supply.status)}</span></td><td><strong>${esc(supply.client)}</strong></td><td>${esc(supply.holder || '—')}</td><td>${esc(supply.cups)}</td><td>${esc(supply.address || supply.name || '—')}</td><td>${esc(supply.city || '—')}</td><td>${esc(supply.tariff || '—')}</td><td>${esc(supply.contract || '—')}</td><td><button class="secondary edit-supply" data-cups="${esc(supply.cups)}">Editar</button></td></tr>`).join('')
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

  function learnInvoice(data, cupsArg = '', tariffArg = '') {
    const d = typeof data === 'object' && data
      ? data
      : { company: data, cups: cupsArg, tariff: tariffArg };

    const cups = norm(d.cups || cupsArg).replace(/\s/g, '');
    if (!/^ES[A-Z0-9]{15,}$/i.test(cups)) return { ok: false, reason: 'CUPS no válido' };

    const existing = supplies.find((supply) => cupsKey(supply.cups) === cupsKey(cups));
    const company = norm(d.company || d.holder || existing?.company || existing?.holder);

    if (!company && !existing) return { ok: false, reason: 'Titular no identificado' };

    const payload = {
      client: existing?.client || company,
      clientTaxId: existing?.clientTaxId || d.clientTaxId || d.taxId || '',
      clientType: existing?.type || 'PENDIENTE',
      company: existing?.company || company,
      holder: existing?.holder || company,
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
      preserveIdentity: Boolean(existing),
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

  function fillForm(supply) {
    $('#clientType').value = supply.type || 'PENDIENTE';
    $('#clientName').value = supply.client || '';
    $('#clientTaxId').value = supply.clientTaxId || supply.holderTaxId || '';
    $('#holderName').value = supply.holder || supply.company || '';
    $('#clientCups').value = supply.cups || '';
    $('#supplyName').value = supply.name || '';
    $('#supplyAddress').value = supply.address || '';
    $('#supplyCity').value = supply.city || '';
    $('#supplyProvince').value = supply.province || '';
    $('#supplyTariff').value = supply.tariff || '';
    $('#supplyContract').value = supply.contract || '';
  }

  function openForm(client = '', holder = '') {
    editingCups = '';
    show('clientes');
    const editor = $('#clientEditor');
    editor.classList.remove('hidden');
    $('#clientForm').reset();
    $('#clientEditorTitle').textContent = 'Cliente y punto de suministro';

    const existing = supplies.find((supply) => key(supply.client) === key(client));
    if (existing) {
      $('#clientName').value = client;
      $('#clientType').value = existing.type || 'PENDIENTE';
      $('#clientTaxId').value = existing.clientTaxId || '';
      $('#holderName').value = holder || existing.holder || existing.company || client;
    } else {
      $('#clientName').value = client;
      $('#holderName').value = holder;
    }

    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#clientName').focus();
  }

  function editSupply(cups) {
    const supply = supplies.find((item) => cupsKey(item.cups) === cupsKey(cups));
    if (!supply) return;
    editingCups = supply.cups;
    show('clientes');
    $('#clientEditor').classList.remove('hidden');
    $('#clientForm').reset();
    $('#clientEditorTitle').textContent = `Editar suministro · ${supply.cups}`;
    fillForm(supply);
    $('#clientEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeForm() {
    editingCups = '';
    $('#clientEditor').classList.add('hidden');
    $('#clientForm').reset();
    $('#clientFormMsg').textContent = '';
  }

  function bindControls() {
    $('#newClient').onclick = () => openForm('');
    $('#cancelClient').onclick = closeForm;

    $('#clientForm').onsubmit = (event) => {
      event.preventDefault();
      const client = norm($('#clientName').value);
      const cups = norm($('#clientCups').value).replace(/\s/g, '');

      if (!client || !/^ES[A-Z0-9]{15,}$/i.test(cups)) {
        $('#clientFormMsg').textContent = 'Indica un nombre de cliente y un CUPS válido.';
        return;
      }

      if (editingCups && cupsKey(editingCups) !== cupsKey(cups) && supplies.some((supply) => cupsKey(supply.cups) === cupsKey(cups))) {
        $('#clientFormMsg').textContent = 'Ese CUPS ya existe. No se puede duplicar.';
        return;
      }

      const data = {
        client,
        clientTaxId: $('#clientTaxId').value,
        clientType: $('#clientType').value,
        company: $('#holderName').value || client,
        holder: $('#holderName').value || client,
        cups,
        name: $('#supplyName').value,
        address: $('#supplyAddress').value,
        city: $('#supplyCity').value,
        province: $('#supplyProvince').value,
        tariff: $('#supplyTariff').value,
        contract: $('#supplyContract').value,
        status: 'ACTIVO',
      };

      let result;
      if (editingCups) {
        const idx = supplies.findIndex((supply) => cupsKey(supply.cups) === cupsKey(editingCups));
        if (idx < 0) return;
        const old = supplies[idx];
        supplies.splice(idx, 1);
        result = upsertSupply({ ...old, ...data }, { allowMove: true });
        if (!result.ok) supplies.splice(idx, 0, old);
      } else {
        result = upsertSupply(data);
      }

      if (!result.ok) {
        $('#clientFormMsg').textContent = result.reason;
        return;
      }

      const wasEditing = Boolean(editingCups);
      closeForm();
      refresh({ message: `<strong>${wasEditing ? 'Suministro actualizado' : 'Cliente/suministro añadido'}.</strong> Cambios guardados localmente y sin duplicados.` });
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
          const result = upsertSupply(supply, { fillOnly: true, preserveIdentity: false });
          if (!result.ok) blocked += 1;
          else if (!result.updated) added += 1;
          else if (result.enriched) enriched += 1;
          else unchanged += 1;
        }

        refresh({
          message: `<strong>Maestro combinado:</strong> ${added} CUPS nuevos · ${enriched} suministros completados · ${unchanged} sin cambios · ${blocked} conflictos bloqueados.`,
        });
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
        for (const supply of saved) {
          if (!supply?.cups) continue;
          upsertSupply(normalizeSupply(supply), { allowMove: true });
        }
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

  load();
})();