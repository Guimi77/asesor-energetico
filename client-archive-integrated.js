(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const norm = (value) => String(value ?? '').trim().toLocaleUpperCase('es-ES');
  let syncing = false;

  function isAdmin() {
    return window.ibtCurrentProfile?.role === 'admin';
  }

  function hideDuplicatePanel() {
    const panel = $('#centralClientsAdmin');
    if (panel) panel.style.setProperty('display', 'none', 'important');
  }

  function simplifyClientHierarchy(card) {
    const title = $('.client-tree-title h3', card)?.textContent || '';
    const clientKey = norm(title);
    if (!clientKey || clientKey === 'GRUPO XTRA') return;

    const folders = $$('.holder-folder', card);
    if (folders.length !== 1) return;

    const folder = folders[0];
    const holderName = norm($('summary strong', folder)?.textContent || '');
    if (holderName && holderName !== clientKey) return;

    folder.open = true;
    folder.classList.add('simple-client-folder');
  }

  function integrateArchiveButtons() {
    if (syncing || !isAdmin()) return;
    syncing = true;
    try {
      hideDuplicatePanel();
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
        const title = $('.client-tree-title h3', card)?.textContent;
        const key = norm(title);
        if (!key || card.querySelector('.integrated-client-archive')) continue;
        const sourceRow = rowsByName.get(key);
        const sourceButton = sourceRow?.querySelector('[data-db-action="archive_client"]');
        if (!sourceButton) continue;

        const actions = $('.client-tree-title', card);
        if (!actions) continue;
        const button = sourceButton;
        button.classList.add('integrated-client-archive');
        button.textContent = 'Archivar';
        button.title = 'Archivar cliente conservando todo su histórico';
        actions.appendChild(button);
      }
    } finally {
      syncing = false;
    }
  }

  function installStyles() {
    if ($('#integratedClientArchiveStyles')) return;
    const style = document.createElement('style');
    style.id = 'integratedClientArchiveStyles';
    style.textContent = `
      #centralClientsAdmin{display:none!important}
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
      }
    `;
    document.head.appendChild(style);
  }

  function schedule() {
    queueMicrotask(integrateArchiveButtons);
  }

  function init() {
    installStyles();
    hideDuplicatePanel();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('ibt-role-changed', schedule);
    window.addEventListener('ibt-central-data-changed', schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
