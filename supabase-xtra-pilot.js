(() => {
  'use strict';

  const PILOT_CLIENT = 'GRUPO XTRA';
  let syncing = false;
  let lastSyncKey = '';

  const norm = (v) => String(v ?? '').trim();
  const roleIsInternal = (profile) => ['admin', 'staff'].includes(profile?.role);

  function setStatus(message, type = 'ok') {
    const el = document.querySelector('#masterStatus');
    if (!el) return;
    el.innerHTML = `<strong>GRUPO XTRA · Supabase</strong> ${message}`;
    el.dataset.remoteStatus = type;
  }

  async function syncPilot() {
    if (syncing) return;
    const supabase = window.ibtSupabase;
    const profile = window.ibtCurrentProfile;
    const master = window.EnergyMaster;
    if (!supabase || !master?.__v2 || !roleIsInternal(profile)) return;

    const syncKey = `${profile.id}:${profile.role}`;
    if (lastSyncKey === syncKey) return;

    syncing = true;
    try {
      setStatus('conectando con el maestro central…', 'loading');

      const { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('id,name,tax_id,status')
        .eq('name', PILOT_CLIENT)
        .limit(1);
      if (clientError) throw clientError;
      const client = clients?.[0];
      if (!client) {
        setStatus('no se ha encontrado el cliente piloto en la base.', 'error');
        return;
      }

      const { data: holders, error: holderError } = await supabase
        .from('holders')
        .select('id,legal_name,tax_id,status')
        .eq('client_id', client.id)
        .order('legal_name');
      if (holderError) throw holderError;

      const holderIds = (holders || []).map((h) => h.id);
      let supplies = [];
      if (holderIds.length) {
        const { data, error } = await supabase
          .from('supplies')
          .select('id,holder_id,cups,supply_name,address,city,province,postal_code,current_tariff,current_contract_number,current_retailer,current_distributor,status')
          .in('holder_id', holderIds)
          .order('cups');
        if (error) throw error;
        supplies = data || [];
      }

      const holderById = new Map((holders || []).map((h) => [h.id, h]));
      let added = 0;
      let enriched = 0;
      let unchanged = 0;
      let blocked = 0;

      for (const supply of supplies) {
        const holder = holderById.get(supply.holder_id);
        if (!holder || !norm(supply.cups)) continue;
        const result = master.add({
          client: client.name,
          clientTaxId: client.tax_id || '',
          clientType: 'GRUPO',
          type: 'GRUPO',
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
          status: supply.status === 'active' ? 'ACTIVO' : String(supply.status || 'ACTIVO').toUpperCase(),
          source: 'Supabase · GRUPO XTRA',
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
      setStatus(`${holders?.length || 0} titulares · ${supplies.length} CUPS leídos. ${added} nuevos en caché local · ${enriched} completados · ${unchanged} sin cambios${blocked ? ` · ${blocked} bloqueados` : ''}. Fuente central: Supabase; sin almacenar PDFs.`, 'ok');
      window.dispatchEvent(new CustomEvent('xtra-supabase-synced', {
        detail: { clientId: client.id, holders: holders?.length || 0, supplies: supplies.length }
      }));
    } catch (error) {
      console.error('No se pudo sincronizar GRUPO XTRA desde Supabase', error);
      setStatus(`no se ha podido leer el maestro central: ${String(error?.message || error)}. El maestro local continúa funcionando.`, 'error');
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    setTimeout(syncPilot, 0);
  }

  window.addEventListener('ibt-role-changed', scheduleSync);
  window.addEventListener('energy-master-ready', scheduleSync);
  window.addEventListener('DOMContentLoaded', scheduleSync);

  window.XtraSupabasePilot = {
    reload: () => { lastSyncKey = ''; return syncPilot(); },
    clientName: PILOT_CLIENT,
    mode: 'read-only-master',
  };
})();