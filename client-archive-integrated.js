(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const norm = (value) => String(value ?? '').trim().toLocaleUpperCase('es-ES').replace(/\s/g, '');
  let syncing = false;

  function isAdmin() {
    return window.ibtCurrentProfile?.role === 'admin';
  }

  function hideCupsMenu() {
    const link = $('.sidebar [data-view="cups"]');
    if (!link) return;
    link.style.setProperty('display', 'none', 'important');
    link.setAttribute('aria-hidden', 'true');
    link.tabIndex = -1;
  }

  function hideDuplicatePanels() {
    const clientPanel = $('#centralClientsAdmin');
    if (clientPanel) clientPanel.style.setProperty('display', 'none', 'important');
    const supplyPanel = $('#centralSuppliesAdmin');
    if (supplyPanel) supplyPanel.style.setProperty('display', 'none', 'important');
  }

  function simplifyFooter() {
    const footer = $('footer');
    if (!footer || footer.dataset.simpleBranding === '1') return;
    footer.dataset.simpleBranding = '1';
    footer.innerHTML = '<strong>Electrica BT Mallorca SL</strong>';
  }

  function simplifyClientHierarchy(card) {
    if (card.classList.contains('multi-client-group')) return;
    const title = $('.client-tree-title h3', card)?.textContent || '';
    const clientKey = norm(title);
    if (!clientKey || clientKey === 'GRUPOXTRA') return;

    const folders = $$('.holder-folder', card);
    if (folders.length !== 1) return;

    const folder = folders[0];
    const holderName = norm($('summary strong', folder)?.textContent || '');
    if (holderName && holderName !== clientKey) return;

    folder.open = true;
    folder.classList.add('simple-client-folder');
  }

  function integrateClientArchiveButtons() {
    const rows = $$('#centralClientsList .db-admin-row');
    const cards = $$('#companyGrid .company-card-tree');
    if (!cards.length) return;

    const rowsByName = new Map();
    for (const row of rows) {
      const name = norm($('strong', row)?.textContent);
      if (name) rowsByName.set(name, row);
    }

    for (const card of cards) {
      simplifyClientHierarchy(card);

      if (card.classList.contains('multi-client-group')) {
        $$('.client-group-member', card).forEach((memberRow) => {
          if (memberRow.querySelector('.integrated-client-archive')) return;
          const clientName = memberRow.dataset.clientName || '';
          const sourceRow = rowsByName.get(norm(clientName));
          const sourceButton = sourceRow?.querySelector('[data-db-action="archive_client"]');
          const actions = $('.client-group-member-actions', memberRow);
          if (!sourceButton || !actions) return;

          sourceButton.classList.add('integrated-client-archive');
          sourceButton.textContent = 'Archivar cliente';
          sourceButton.title = 'Archivar este cliente legal conservando todo su histórico';
          actions.appendChild(sourceButton);
        });
        continue;
      }

      if (card.querySelector('.integrated-client-archive')) continue;
      const clientName = card.dataset.clientPrimary || $('.client-tree-title h3', card)?.textContent || '';
      const sourceRow = rowsByName.get(norm(clientName));
      const sourceButton = sourceRow?.querySelector('[data-db-action="archive_client"]');
      const actions = $('.client-tree-title', card);
      if (!sourceButton || !actions) continue;

      sourceButton.classList.add('integrated-client-archive');
      sourceButton.textContent = 'Archivar';
      sourceButton.title = 'Archivar cliente conservando todo su histórico';
      actions.appendChild(sourceButton);
    }
  }

  function integrateSupplyArchiveButtons() {
    $$('#companyGrid .holder-supply-row[data-cups]').forEach((row) => {
      if (row.querySelector('.integrated-supply-archive')) return;
      const cups = row.dataset.cups;
      if (!cups) return;

      let actions = $('.holder-supply-actions', row);
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'holder-supply-actions';
        const edit = $('.edit-supply-tree', row);
        if (edit) {
          row.insertBefore(actions, edit);
          actions.appendChild(edit);
        } else {
          row.appendChild(actions);
        }
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary integrated-supply-archive';
      button.textContent = 'Archivar';
      button.title = 'Archivar este suministro conservando todo su histórico';
      button.dataset.cups = cups;
      button.addEventListener('click', async () => {
        if (typeof window.ibtArchiveSupplyByCups !== 'function') {
          alert('La gestión central todavía se está cargando. Inténtalo de nuevo en un instante.');
          return;
        }
        button.disabled = true;
        try {
          await window.ibtArchiveSupplyByCups(cups);
        } catch (error) {
          alert(error?.message || String(error));
        } finally {
          button.disabled = false;
        }
      });
      actions.appendChild(button);
    });
  }

  function integrateArchiveButtons() {
    if (syncing) return;
    hideCupsMenu();
    hideDuplicatePanels();
    simplifyFooter();
    if (!isAdmin()) return;

    syncing = true;
    try {
      integrateClientArchiveButtons();
      integrateSupplyArchiveButtons();
    } finally {
      syncing = false;
    }
  }

  function installStyles() {
    if ($('#integratedClientArchiveStyles')) return;
    const style = document.createElement('style');
    style.id = 'integratedClientArchiveStyles';
    style.textContent = `
      .sidebar [data-view="cups"]{display:none!important}
      #centralClientsAdmin,#centralSuppliesAdmin{display:none!important}
      footer{justify-content:flex-start!important}
      footer span{display:none!important}
      .client-tree-title{gap:8px;align-items:center;flex-wrap:wrap}
      .client-tree-title .integrated-client-archive{
        margin-left:auto!important;
        white-space:nowrap;
        padding:6px 10px!important;
        min-height:0!important;
        font-size:12px!important;
        line-height:1.2!important;
        border-radius:8px!important;
      }
      .holder-supply-actions{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:6px;
        flex:none;
      }
      .holder-supply-actions .secondary{
        margin:0!important;
        min-height:0!important;
        padding:5px 8px!important;
        font-size:.66rem!important;
        line-height:1.2!important;
        white-space:nowrap;
      }
      .holder-supply-actions .integrated-supply-archive{
        border-color:#d6a14a!important;
        color:#8a5a00!important;
        background:#fffaf0!important;
      }
      .add-supply-holder{display:none!important}
      .multi-client-group .add-supply-holder{
        display:inline-flex!important;
        margin-top:5px!important;
        padding:4px 0!important;
        font-size:.68rem!important;
      }
      .client-group-members{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        padding:6px 10px 2px;
        border-top:1px solid #edf1f5;
      }
      .client-group-member{
        display:flex;
        align-items:center;
        gap:8px;
        padding:5px 7px;
        border:1px solid #dfe6ef;
        border-radius:8px;
        background:#f8fafc;
      }
      .client-group-member>div:first-child{
        display:flex;
        flex-direction:column;
        gap:1px;
      }
      .client-group-member small{
        color:#718096;
        font-size:.62rem;
      }
      .client-group-member-actions{
        display:flex;
        align-items:center;
      }
      .client-group-member .integrated-client-archive{
        margin-left:0!important;
        padding:4px 7px!important;
        font-size:.64rem!important;
      }
      .holder-client-name{
        color:#718096;
        font-size:.64rem;
      }
      .simple-client-folder>summary{display:none!important}
      .simple-client-folder{border-top:1px solid #e7ebf1}
      .simple-client-folder>.holder-supplies{padding-top:8px}
      @media(max-width:700px){
        .client-tree-title .integrated-client-archive{
          margin-left:0!important;
          width:auto!important;
          padding:6px 9px!important;
          font-size:12px!important;
        }
        .holder-supply-row{
          align-items:flex-start!important;
        }
        .holder-supply-actions{
          flex-direction:column;
          align-items:stretch;
          gap:4px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function schedule() {
    queueMicrotask(integrateArchiveButtons);
  }

  function init() {
    installStyles();
    hideCupsMenu();
    hideDuplicatePanels();
    simplifyFooter();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('ibt-role-changed', schedule);
    window.addEventListener('ibt-central-data-changed', schedule);
    window.addEventListener('ibt-central-data-ready', schedule);
    window.addEventListener('energy-master-ready', schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
