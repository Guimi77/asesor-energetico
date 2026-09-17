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

  function integrateArchiveButtons() {
    if (syncing || !isAdmin()) return;
    syncing = true;
    try {
      hideDuplicatePanel();
      const rows = $$('#centralClientsList .db-admin-row');
      const cards = $$('#companyGrid .company-card-tree');
      if (!rows.length || !cards.length) return;

      const rowsByName = new Map();
      for (const row of rows) {
        const name = norm($('strong', row)?.textContent);
        if (name) rowsByName.set(name, row);
      }

      for (const card of cards) {
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
        button.textContent = 'Archivar cliente';
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
      .client-tree-title{gap:10px;align-items:center;flex-wrap:wrap}
      .client-tree-title .integrated-client-archive{margin-left:auto;white-space:nowrap}
      @media(max-width:700px){
        .client-tree-title .integrated-client-archive{margin-left:0;width:auto}
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
