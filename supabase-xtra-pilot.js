(() => {
  'use strict';

  let syncing = false;
  let lastSyncKey = '';

  const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const nameKey = (v) => norm(v).toLocaleLowerCase('es');
  const taxKey = (v) => norm(v).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const cupsKey = (v) => {
    const compact = norm(v).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return compact.startsWith('ES') && compact.length >= 20 ? compact.slice(0, 20) : compact;
  };
  const roleIsInternal = (profile) => ['admin', 'staff'].includes(profile?.role);
  const naturalPersonTaxId = (value) => /^\d{8}[A-Z]$/i.test(taxKey(value));
  const esc = (value) => norm(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function legacyReasonLabel(reason = '') {
    const labels = {
      client_not_found: 'cliente no identificado en la base central',
      holder_not_found: 'titular no identificado en la base central',
      new_client_requires_tax_id: 'falta NIF/CIF para crear el cliente con seguridad',
      client_identity_insufficient: 'identidad del cliente insuficiente',
      client_tax_ambiguous: 'NIF/CIF de cliente ambiguo',
      client_name_ambiguous: 'nombre de cliente ambiguo',
      holder_tax_ambiguous: 'NIF/CIF de titular ambiguo',
      holder_name_ambiguous: 'nombre de titular ambiguo',
      holder_belongs_to_other_client: 'el titular está vinculado a otro cliente',
      not_authorized: 'sesión sin permiso interno',
      rpc_error: 'error de comunicación con Supabase',
      exception: 'error inesperado durante la migración',
    };
    return labels[reason] || reason || 'motivo no determinado';
  }

  function setStatus(message, type = 'ok') {
    const el = document.querySelector('#masterStatus');
    if (!el) return;
    el.innerHTML = `<strong>Base central · Supabase</strong> ${message}`;
    el.dataset.remoteStatus = type;
  }

  function clientType(client, holderCount) {
    if (naturalPersonTaxId(client?.tax_id)) return 'PARTICULAR';
    if (holderCount > 1 || /\bGRUPO\b/i.test(norm(client?.name))) return 'GRUPO';
    return 'EMPRESA';
  }

  async function loadActiveSupplies(supabase, holderIds) {
    if (!holderIds.length) return [];
    const { data, error } = await supabase
      .from('supplies')
      .select('id,holder_id,cups,supply_name,address,city,province,postal_code,current_tariff,current_contract_number,current_retailer,current_distributor,status')
      .in('holder_id', holderIds)
      .eq('status', 'active')
      .order('cups');
    if (error) throw error;
    return data || [];
  }

  function buildIdentityIndexes(activeClients, holders) {
    const clientsById = new Map(activeClients.map((client) => [client.id, client]));
    const clientsByName = new Map();
    const clientsByTax = new Map();
    const holdersByClientAndName = new Map();
    const holdersByClientAndTax = new Map();
    const uniqueHoldersByTax = new Map();
    const duplicateHolderTaxes = new Set();

    for (const client of activeClients) {
      const nKey = nameKey(client.name);
      const tKey = taxKey(client.tax_id);
      if (nKey) clientsByName.set(nKey, client);
      if (tKey) clientsByTax.set(tKey, client);
    }

    for (const holder of holders) {
      const nKey = nameKey(holder.legal_name);
      const tKey = taxKey(holder.tax_id);
      if (nKey) holdersByClientAndName.set(`${holder.client_id}|${nKey}`, holder);
      if (tKey) holdersByClientAndTax.set(`${holder.client_id}|${tKey}`, holder);
      if (tKey) {
        if (uniqueHoldersByTax.has(tKey)) {
          duplicateHolderTaxes.add(tKey);
          uniqueHoldersByTax.delete(tKey);
        } else if (!duplicateHolderTaxes.has(tKey)) {
          uniqueHoldersByTax.set(tKey, holder);
        }
      }
    }

    return {
      clientsById,
      clientsByName,
      clientsByTax,
      holdersByClientAndName,
      holdersByClientAndTax,
      uniqueHoldersByTax,
    };
  }

  function resolveLegacyIdentity(row, indexes) {
    const clientTax = taxKey(row?.clientTaxId);
    const holderTax = taxKey(row?.holderTaxId);
    const clientName = nameKey(row?.client);
    const holderName = nameKey(row?.company || row?.holder || row?.client);

    let client = (clientTax && indexes.clientsByTax.get(clientTax)) || indexes.clientsByName.get(clientName) || null;

    if (!client && holderTax) {
      const uniqueHolder = indexes.uniqueHoldersByTax.get(holderTax);
      if (uniqueHolder) client = indexes.clientsById.get(uniqueHolder.client_id) || null;
    }

    if (!client) return { ok: false, reason: 'client_not_found' };

    let holder = null;
    if (holderTax) holder = indexes.holdersByClientAndTax.get(`${client.id}|${holderTax}`) || null;
    if (!holder && holderName) holder = indexes.holdersByClientAndName.get(`${client.id}|${holderName}`) || null;
    if (!holder && holderTax) {
      const uniqueHolder = indexes.uniqueHoldersByTax.get(holderTax);
      if (uniqueHolder?.client_id === client.id) holder = uniqueHolder;
    }

    if (!holder) return { ok: false, reason: 'holder_not_found', client };
    return { ok: true, client, holder };
  }

  function isEligibleLegacyRow(row, centralKeys) {
    const key = cupsKey(row?.cups);
    if (key.length < 18 || !key.startsWith('ES') || centralKeys.has(key)) return false;
    if (/supabase/i.test(norm(row?.source))) return false;
    if (['BAJA', 'ARCHIVADO', 'ARCHIVED'].includes(norm(row?.status).toUpperCase())) return false;
    return true;
  }

  async function reconcileLegacyLocalSupplies({ supabase, master, activeClients, holders, supplies }) {
    if (typeof master.all !== 'function' || typeof supabase.rpc !== 'function') {
      return { migrated: 0, failed: 0, unresolved: 0, attempted: 0, candidateKeys: [], pendingDetails: {} };
    }

    const localRows = master.all() || [];
    if (!localRows.length) {
      return { migrated: 0, failed: 0, unresolved: 0, attempted: 0, candidateKeys: [], pendingDetails: {} };
    }

    const centralKeys = new Set(supplies.map((supply) => cupsKey(supply.cups)).filter(Boolean));
    const indexes = buildIdentityIndexes(activeClients, holders);
    const candidateKeys = new Set();
    const pendingDetails = {};

    let migrated = 0;
    let failed = 0;
    let unresolved = 0;
    let attempted = 0;

    for (const row of localRows) {
      if (!isEligibleLegacyRow(row, centralKeys)) continue;

      const key = cupsKey(row.cups);
      candidateKeys.add(key);
      const identity = resolveLegacyIdentity(row, indexes);
      attempted += 1;

      try {
        let data;
        let error;

        if (identity.ok) {
          ({ data, error } = await supabase.rpc('ensure_supply_from_master', {
            p_client_name: identity.client.name,
            p_holder_name: identity.holder.legal_name,
            p_cups: row.cups,
            p_supply_name: row.name || row.address || null,
            p_address: row.address || null,
            p_city: row.city || null,
            p_province: row.province || null,
            p_postal_code: row.postalCode || null,
            p_tariff: row.tariff || null,
            p_contract_number: row.contract || null,
            p_retailer: row.retailer || null,
            p_distributor: row.distributor || null,
          }));
        } else {
          ({ data, error } = await supabase.rpc('ensure_master_hierarchy_from_local', {
            p_payload: {
              client_name: row.client || null,
              client_tax_id: row.clientTaxId || null,
              holder_name: row.company || row.holder || row.client || null,
              holder_tax_id: row.holderTaxId || null,
              cups: row.cups,
              supply_name: row.name || row.address || null,
              address: row.address || null,
              city: row.city || null,
              province: row.province || null,
              postal_code: row.postalCode || null,
              tariff: row.tariff || null,
              contract_number: row.contract || null,
              retailer: row.retailer || null,
              distributor: row.distributor || null,
            },
          }));
        }

        if (error) {
          failed += 1;
          pendingDetails[key] = 'rpc_error';
          console.warn('No se pudo migrar un suministro local al maestro central', row.cups, error);
          continue;
        }

        if (!data?.ok) {
          unresolved += 1;
          const reason = data?.reason || identity.reason || 'unknown';
          pendingDetails[key] = reason;
          console.warn('Suministro heredado pendiente: no se ha podido resolver de forma segura', {
            cups: row.cups,
            client: row.client,
            company: row.company || row.holder,
            reason,
          });
          continue;
        }

        centralKeys.add(key);
        if (data.mode === 'inserted') migrated += 1;
      } catch (error) {
        failed += 1;
        pendingDetails[key] = 'exception';
        console.warn('No se pudo migrar un suministro local al maestro central', row.cups, error);
      }
    }

    return {
      migrated,
      failed,
      unresolved,
      attempted,
      candidateKeys: [...candidateKeys],
      pendingDetails,
    };
  }

  async function syncCentralMaster() {
    if (syncing) return;
    const supabase = window.ibtSupabase;
    const profile = window.ibtCurrentProfile;
    const master = window.EnergyMaster;
    if (!supabase || !master?.__v2 || !roleIsInternal(profile)) return;

    const syncKey = `${profile.id}:${profile.role}`;
    if (lastSyncKey === syncKey) return;

    syncing = true;
    try {
      setStatus('sincronizando todos los clientes activos…', 'loading');

      async function loadHierarchy() {
        const { data: clients, error: clientError } = await supabase
          .from('clients')
          .select('id,name,tax_id,status')
          .eq('status', 'active')
          .order('name');
        if (clientError) throw clientError;

        const activeClients = clients || [];
        const clientIds = activeClients.map((client) => client.id);

        let holders = [];
        if (clientIds.length) {
          const { data, error } = await supabase
            .from('holders')
            .select('id,client_id,legal_name,tax_id,status')
            .in('client_id', clientIds)
            .eq('status', 'active')
            .order('legal_name');
          if (error) throw error;
          holders = data || [];
        }

        const holderIds = holders.map((holder) => holder.id);
        const supplies = await loadActiveSupplies(supabase, holderIds);
        return { activeClients, holders, supplies };
      }

      let { activeClients, holders, supplies } = await loadHierarchy();

      const { data: aliasPayload, error: aliasError } = await supabase.rpc('get_internal_aliases');
      if (aliasError) throw aliasError;
      const clientAliases = aliasPayload?.clients || {};
      const supplyAliases = aliasPayload?.supplies || {};

      const legacy = await reconcileLegacyLocalSupplies({ supabase, master, activeClients, holders, supplies });
      if (legacy.attempted) {
        ({ activeClients, holders, supplies } = await loadHierarchy());
      }

      const activeCentralKeys = new Set(supplies.map((supply) => cupsKey(supply.cups)).filter(Boolean));
      const legacyPendingKeys = legacy.candidateKeys.filter((key) => !activeCentralKeys.has(key));
      const legacyPending = legacyPendingKeys.length;
      const legacyPendingDetails = Object.fromEntries(
        legacyPendingKeys.map((key) => [key, legacy.pendingDetails?.[key] || 'unknown'])
      );
      if (legacyPending) {
        console.error('Hay suministros heredados que siguen fuera del maestro central', legacyPendingKeys);
      }

      const clientById = new Map(activeClients.map((client) => [client.id, client]));
      const holderById = new Map(holders.map((holder) => [holder.id, holder]));
      const holderCountByClient = new Map();
      for (const holder of holders) {
        holderCountByClient.set(holder.client_id, (holderCountByClient.get(holder.client_id) || 0) + 1);
      }

      const centralRows = [];
      for (const supply of supplies) {
        const holder = holderById.get(supply.holder_id);
        const client = clientById.get(holder?.client_id);
        if (!holder || !client || !norm(supply.cups)) continue;

        const type = clientType(client, holderCountByClient.get(client.id) || 0);
        centralRows.push({
          client: client.name,
          clientAlias: clientAliases[client.id] || '',
          clientTaxId: client.tax_id || '',
          clientType: type,
          type,
          company: holder.legal_name,
          holder: holder.legal_name,
          holderTaxId: holder.tax_id || '',
          cups: supply.cups,
          alias: supplyAliases[supply.id] || '',
          name: supply.supply_name || '',
          address: supply.address || '',
          city: supply.city || '',
          province: supply.province || '',
          postalCode: supply.postal_code || '',
          tariff: supply.current_tariff || '',
          contract: supply.current_contract_number || '',
          retailer: supply.current_retailer || '',
          distributor: supply.current_distributor || '',
          status: 'ACTIVO',
          source: 'Supabase · Base central',
        });
      }

      let added = 0;
      let enriched = 0;
      let unchanged = 0;
      let blocked = 0;
      let cachePruned = 0;

      if (!legacyPending && typeof master.replaceActiveFromCentral === 'function') {
        const cacheResult = master.replaceActiveFromCentral(centralRows);
        if (!cacheResult?.ok) {
          throw new Error(cacheResult?.reason || 'central_cache_replace_failed');
        }
        added = cacheResult.added || 0;
        enriched = cacheResult.enriched || 0;
        unchanged = cacheResult.unchanged || 0;
        cachePruned = cacheResult.pruned || 0;
        blocked = cacheResult.invalid || 0;
      } else {
        for (const row of centralRows) {
          const result = master.add(row, {
            allowMove: true,
            fillOnly: false,
            preserveIdentity: false,
          });

          if (!result?.ok) blocked += 1;
          else if (!result.updated) added += 1;
          else if (result.enriched) enriched += 1;
          else unchanged += 1;
        }
      }

      lastSyncKey = syncKey;
      const legacyText = legacy.migrated ? ` · ${legacy.migrated} CUPS heredado${legacy.migrated === 1 ? '' : 's'} recuperado${legacy.migrated === 1 ? '' : 's'} en central` : '';
      const pendingText = legacyPending ? ` · ATENCIÓN: ${legacyPending} CUPS heredado${legacyPending === 1 ? '' : 's'} sigue${legacyPending === 1 ? '' : 'n'} fuera de la base central` : '';
      const pendingDetailText = legacyPending
        ? ` · Pendiente: ${legacyPendingKeys.map((key) => `${esc(key)} (${esc(legacyReasonLabel(legacyPendingDetails[key]))})`).join(' · ')}`
        : '';
      const cacheText = !legacyPending
        ? ` · caché alineada con Supabase${cachePruned ? ` · ${cachePruned} registro${cachePruned === 1 ? '' : 's'} local${cachePruned === 1 ? '' : 'es'} retirado${cachePruned === 1 ? '' : 's'} por no estar activo${cachePruned === 1 ? '' : 's'} en central` : ''}`
        : '';
      setStatus(`${activeClients.length} clientes · ${holders.length} titulares · ${supplies.length} CUPS activos leídos. ${added} nuevos en caché local · ${enriched} completados · ${unchanged} sin cambios${blocked ? ` · ${blocked} bloqueados` : ''}${legacyText}${pendingText}${pendingDetailText}${cacheText}. Fuente central: Supabase; sin almacenar PDFs.`, legacyPending ? 'error' : 'ok');

      const detail = {
        clients: activeClients.length,
        holders: holders.length,
        supplies: supplies.length,
        legacyMigrated: legacy.migrated,
        legacyMigrationFailed: legacy.failed,
        legacyIdentityUnresolved: legacy.unresolved,
        legacyPending,
        legacyPendingKeys,
        legacyPendingDetails,
        cachePruned,
        cacheAligned: !legacyPending && typeof master.replaceActiveFromCentral === 'function',
      };
      window.dispatchEvent(new CustomEvent('central-supabase-synced', { detail }));
      window.dispatchEvent(new CustomEvent('xtra-supabase-synced', {
        detail: {
          ...detail,
          clientId: activeClients.find((client) => norm(client.name).toUpperCase() === 'GRUPO XTRA')?.id || null,
        },
      }));
    } catch (error) {
      console.error('No se pudo sincronizar el maestro central desde Supabase', error);
      setStatus(`no se ha podido leer el maestro central: ${String(error?.message || error)}. La caché local continúa disponible temporalmente.`, 'error');
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    setTimeout(syncCentralMaster, 0);
  }

  window.addEventListener('ibt-role-changed', scheduleSync);
  window.addEventListener('energy-master-ready', scheduleSync);
  window.addEventListener('ibt-central-data-changed', () => { lastSyncKey = ''; scheduleSync(); });
  window.addEventListener('ibt-aliases-changed', () => { lastSyncKey = ''; scheduleSync(); });
  window.addEventListener('DOMContentLoaded', scheduleSync);
  if (document.readyState !== 'loading') scheduleSync();

  const api = {
    reload: () => { lastSyncKey = ''; return syncCentralMaster(); },
    mode: 'central-master-global-reconciliation-with-audit',
    scope: 'all-active-clients',
  };

  window.CentralSupabaseMaster = api;
  window.XtraSupabasePilot = {
    ...api,
    clientName: 'GRUPO XTRA',
  };
})();