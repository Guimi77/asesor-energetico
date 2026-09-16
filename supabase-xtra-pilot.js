(() => {
  'use strict';

  let syncing = false;
  let lastSyncKey = '';

  const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const nameKey = (v) => norm(v).toLocaleLowerCase('es');
  const cupsKey = (v) => norm(v).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const roleIsInternal = (profile) => ['admin', 'staff'].includes(profile?.role);
  const naturalPersonTaxId = (value) => /^\d{8}[A-Z]$/i.test(norm(value).replace(/[\s-]/g, ''));

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

  async function reconcileLegacyLocalSupplies({ supabase, master, activeClients, holders, supplies }) {
    if (typeof master.all !== 'function' || typeof supabase.rpc !== 'function') return { migrated: 0, failed: 0 };

    const localRows = master.all() || [];
    if (!localRows.length) return { migrated: 0, failed: 0 };

    const centralKeys = new Set(supplies.map((supply) => cupsKey(supply.cups)).filter(Boolean));
    const clientsByName = new Map(activeClients.map((client) => [nameKey(client.name), client]));
    const holdersByIdentity = new Map(
      holders.map((holder) => [`${holder.client_id}|${nameKey(holder.legal_name)}`, holder]),
    );

    let migrated = 0;
    let failed = 0;

    for (const row of localRows) {
      const key = cupsKey(row?.cups);
      if (key.length < 18 || !key.startsWith('ES') || centralKeys.has(key)) continue;
      if (/supabase/i.test(norm(row?.source))) continue;
      if (['BAJA', 'ARCHIVADO', 'ARCHIVED'].includes(norm(row?.status).toUpperCase())) continue;

      const client = clientsByName.get(nameKey(row?.client));
      if (!client) continue;
      const holderName = norm(row?.company || row?.holder || row?.client);
      const holder = holdersByIdentity.get(`${client.id}|${nameKey(holderName)}`);
      if (!holder) continue;

      try {
        const { data, error } = await supabase.rpc('ensure_supply_from_master', {
          p_client_name: client.name,
          p_holder_name: holder.legal_name,
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

    return { migrated, failed };
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
      if (legacy.migrated) supplies = await loadActiveSupplies(supabase, holderIds);

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
      const legacyErrorText = legacy.failed ? ` · ${legacy.failed} migración${legacy.failed === 1 ? '' : 'es'} local${legacy.failed === 1 ? '' : 'es'} pendiente${legacy.failed === 1 ? '' : 's'}` : '';
      setStatus(`${activeClients.length} clientes · ${holders.length} titulares · ${supplies.length} CUPS activos leídos. ${added} nuevos en caché local · ${enriched} completados · ${unchanged} sin cambios${blocked ? ` · ${blocked} bloqueados` : ''}${legacyText}${legacyErrorText}. Fuente central: Supabase; sin almacenar PDFs.`, legacy.failed ? 'warning' : 'ok');

      const detail = {
        clients: activeClients.length,
        holders: holders.length,
        supplies: supplies.length,
        legacyMigrated: legacy.migrated,
        legacyMigrationFailed: legacy.failed,
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
    mode: 'central-master-with-legacy-reconciliation',
    scope: 'all-active-clients',
  };

  window.CentralSupabaseMaster = api;
  window.XtraSupabasePilot = {
    ...api,
    clientName: 'GRUPO XTRA',
  };
})();