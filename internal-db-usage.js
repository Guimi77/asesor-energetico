(() => {
  'use strict';

  const INTERNAL_ROLES = new Set(['admin', 'staff']);
  const REFERENCE_LIMIT_BYTES = 500 * 1024 * 1024;
  const $ = (selector) => document.querySelector(selector);
  let requestSerial = 0;

  function isInternal(profile) {
    return INTERNAL_ROLES.has(profile?.role);
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024 * 1024) return (bytes / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' kB';
    return (bytes / (1024 * 1024)).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB';
  }

  function ensureCard() {
    let card = $('#internalDbUsage');
    if (card) return card;
    const view = $('#clientesView');
    if (!view) return null;
    card = document.createElement('section');
    card.id = 'internalDbUsage';
    card.className = 'card internal-db-usage hidden';
    card.setAttribute('aria-live', 'polite');
    const anchor = $('#masterStatus');
    if (anchor && anchor.parentElement === view) view.insertBefore(card, anchor);
    else view.appendChild(card);
    return card;
  }

  function hideCard() {
    $('#internalDbUsage')?.classList.add('hidden');
  }

  function loadingMarkup() {
    return '<div class="internal-db-usage-head"><div><p class="eyebrow">Administración interna</p><h2>Uso de base de datos</h2><p>Calculando capacidad y registros almacenados…</p></div><span class="status">Solo admin / staff</span></div>';
  }

  function errorMarkup(message) {
    return '<div class="internal-db-usage-head"><div><p class="eyebrow">Administración interna</p><h2>Uso de base de datos</h2><p>No se pudo consultar el uso actual.</p></div><span class="status review">Solo admin / staff</span></div><p class="internal-db-usage-error">' + String(message || 'Error de consulta').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) + '</p>';
  }

  function render(card, data) {
    const databaseBytes = Number(data?.database_bytes) || 0;
    const publicBytes = Number(data?.public_schema_bytes) || 0;
    const pct = REFERENCE_LIMIT_BYTES > 0 ? Math.min(100, databaseBytes / REFERENCE_LIMIT_BYTES * 100) : 0;
    const clients = Number(data?.clients) || 0;
    const holders = Number(data?.holders) || 0;
    const supplies = Number(data?.supplies) || 0;
    const invoices = Number(data?.invoices) || 0;

    card.innerHTML = `
      <div class="internal-db-usage-head">
        <div>
          <p class="eyebrow">Administración interna</p>
          <h2>Uso de base de datos</h2>
          <p>Capacidad y volumen real del histórico energético almacenado.</p>
        </div>
        <span class="status ok">Solo admin / staff</span>
      </div>
      <div class="internal-db-usage-grid">
        <div><small>Base de datos</small><strong>${formatBytes(databaseBytes)}</strong><span>Referencia visual: 500 MB</span></div>
        <div><small>Datos de la app</small><strong>${formatBytes(publicBytes)}</strong><span>Esquema público estructurado</span></div>
        <div><small>Clientes</small><strong>${clients.toLocaleString('es-ES')}</strong><span>${holders.toLocaleString('es-ES')} titulares</span></div>
        <div><small>Suministros</small><strong>${supplies.toLocaleString('es-ES')}</strong><span>CUPS almacenados</span></div>
        <div><small>Facturas</small><strong>${invoices.toLocaleString('es-ES')}</strong><span>Histórico estructurado</span></div>
      </div>
      <div class="internal-db-usage-meter" role="progressbar" aria-label="Uso de base de datos respecto a la referencia de 500 MB" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(2)}">
        <span style="width:${pct.toFixed(2)}%"></span>
      </div>
      <p class="internal-db-usage-note">${pct.toLocaleString('es-ES',{minimumFractionDigits:1,maximumFractionDigits:1})}% de la referencia de 500 MB. La cifra de 500 MB es una referencia visual y debe actualizarse si cambia el plan de Supabase.</p>
    `;
  }

  async function load(profile = window.ibtCurrentProfile) {
    const serial = ++requestSerial;
    if (!isInternal(profile)) {
      hideCard();
      return;
    }

    const card = ensureCard();
    if (!card) return;
    card.classList.remove('hidden');
    card.innerHTML = loadingMarkup();

    const supabase = window.ibtSupabase;
    if (!supabase?.rpc) {
      card.innerHTML = errorMarkup('Conexión con la base de datos no disponible.');
      return;
    }

    const { data, error } = await supabase.rpc('get_internal_database_usage');
    if (serial !== requestSerial) return;
    if (!isInternal(window.ibtCurrentProfile || profile)) {
      hideCard();
      return;
    }
    if (error) {
      console.warn('No se pudo consultar el uso de base de datos', error);
      card.innerHTML = errorMarkup(error.message);
      return;
    }
    render(card, data || {});
  }

  window.addEventListener('ibt-role-changed', event => {
    const profile = event.detail?.profile || null;
    if (!isInternal(profile)) hideCard();
    else void load(profile);
  });

  window.addEventListener('central-supabase-synced', () => {
    if (isInternal(window.ibtCurrentProfile)) void load(window.ibtCurrentProfile);
  });

  window.addEventListener('xtra-history-saved', () => {
    if (isInternal(window.ibtCurrentProfile)) void load(window.ibtCurrentProfile);
  });

  window.addEventListener('DOMContentLoaded', () => {
    if (isInternal(window.ibtCurrentProfile)) void load(window.ibtCurrentProfile);
  });

  window.IBTInternalDbUsage = Object.freeze({ reload: () => load(window.ibtCurrentProfile), isInternalRole: role => INTERNAL_ROLES.has(role) });
})();
