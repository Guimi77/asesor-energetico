(() => {
  'use strict';

  let syncing = false;
  let lastSyncKey = '';

  const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const nameKey = (v) => norm(v).toLocaleLowerCase('es');
  const taxKey = (v) => norm(v).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const cupsKey = (v) => norm(v).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const roleIsInternal = (profile) => ['admin', 'staff'].includes(profile?.role);
  const naturalPersonTaxId = (value) => /^\d{8}[A-Z]$/i.test(taxKey(value));

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
      return { migrated: 0, failed: 0, unresolved: 0, attempted: 0, candidateKeys: [] };
    }

    const localRows = master.all() || [];
    if (!localRows.length) {
      return { migrated: 0, failed: 0, unresolved: 0, attempted: 0, candidateKeys: [] };
    }

    const centralKeys = new Set(supplies.map((supply) => cupsKey(supply.cups)).filter(Boolean));
    const indexes = buildIdentityIndexes(activeClients, holders);
    const candidateKeys = new Set();

    let migrated = 0;
    let failed = 0;
    let unresolved = 0;
    let attempted = 0;

    for (const row of localRows) {
      if (!isEligibleLegacyRow(row, centralKeys)) continue;

      const key = cupsKey(row.cups);
      candidateKeys.add(key);
      const identity = resolveLegacyIdentity(row, indexes);
      if (!identity.ok) {
        unresolved += 1;
        console.warn('Suministro heredado pendiente: no se ha podido resolver cliente/titular', {
          cups: row.cups,
          client: row.client,
          company: row.company || row.holder,
          reason: identity.reason,
        });
        continue;
      }

      attempted += 1;
      try {
        const { data, error } = await supabase.rpc('ensure_supply_from_master', {
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
        });
        if (error || !data?.ok) {
          failed += 1;
          console.warn('No se pudo migrar un suministro local al maestro central', row.cups, error || data);
          continue;
        }
        centralKeys.add(key);
        if (data.mode === 'inserted') migrated += 1;
      } catch (error) {
        failed += 1;
        console.warn('No se pudo migrar un suministro local al maestro central', row.cups, error);
      }
    }

    return {
      migrated,
      failed,
      unresolved,
      attempted,
      candidateKeys: [...candidateKeys],
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
      let supplies = await loadActiveSupplies(supabase, holderIds);
      const legacy = await reconcileLegacyLocalSupplies({ supabase, master, activeClients, holders, supplies });
      if (legacy.attempted) supplies = await loadActiveSupplies(supabase, holderIds);

      const activeCentralKeys = new Set(supplies.map((supply) => cupsKey(supply.cups)).filter(Boolean));
      const legacyPendingKeys = legacy.candidateKeys.filter((key) => !activeCentralKeys.has(key));
      const legacyPending = legacyPendingKeys.length;
      if (legacyPending) {
        console.error('Hay suministros heredados que siguen fuera del maestro central', legacyPendingKeys);
      }

      const clientById = new Map(activeClients.map((client) => [client.id, client]));
      const holderById = new Map(holders.map((holder) => [holder.id, holder]));
      const holderCountByClient = new Map();
      for (const holder of holders) {
        holderCountByClient.set(holder.client_id, (holderCountByClient.get(holder.client_id) || 0) + 1);
      }

      let added = 0;
      let enriched = 0;
      let unchanged = 0;
      let blocked = 0;

      for (const supply of supplies) {
        const holder = holderById.get(supply.holder_id);
        const client = clientById.get(holder?.client_id);
        if (!holder || !client || !norm(supply.cups)) continue;

        const type = clientType(client, holderCountByClient.get(client.id) || 0);
        const result = master.add({
          client: client.name,
          clientTaxId: client.tax_id || '',
          clientType: type,
          type,
          company: holder.legal_name,
          holder: holder.legal_name,
          holderTaxId: holder.tax_id || '',
          cups: supply.cups,
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
        }, {
          allowMove: true,
          fillOnly: true,
          preserveIdentity: false,
        });

        if (!result?.ok) blocked += 1;
        else if (!result.updated) added += 1;
        else if (result.enriched) enriched += 1;
        else unchanged += 1;
      }

      lastSyncKey = syncKey;
      const legacyText = legacy.migrated ? ` · ${legacy.migrated} CUPS heredado${legacy.migrated === 1 ? '' : 's'} recuperado${legacy.migrated === 1 ? '' : 's'} en central` : '';
      const pendingText = legacyPending ? ` · ATENCIÓN: ${legacyPending} CUPS heredado${legacyPending === 1 ? '' : 's'} sigue${legacyPending === 1 ? '' : 'n'} fuera de la base central` : '';
      setStatus(`${activeClients.length} clientes · ${holders.length} titulares · ${supplies.length} CUPS activos leídos. ${added} nuevos en caché local · ${enriched} completados · ${unchanged} sin cambios${blocked ? ` · ${blocked} bloqueados` : ''}${legacyText}${pendingText}. Fuente central: Supabase; sin almacenar PDFs.`, legacyPending ? 'error' : 'ok');

      const detail = {
        clients: activeClients.length,
        holders: holders.length,
        supplies: supplies.length,
        legacyMigrated: legacy.migrated,
        legacyMigrationFailed: legacy.failed,
        legacyIdentityUnresolved: legacy.unresolved,
        legacyPending,
        legacyPendingKeys,
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
      setStatus(`no se ha podido leer el maestro central: ${String(error?.message || error)}. El maestro local continúa funcionando.`, 'error');
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