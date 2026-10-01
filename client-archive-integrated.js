(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const norm = (value) => String(value ?? '').trim().toLocaleUpperCase('es-ES').replace(/\s/g, '');
  let syncing = false;
  let schedulePending = false;

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
    const holderPanel = $('#centralHoldersAdmin');
    if (holderPanel) holderPanel.style.setProperty('display', 'none', 'important');
    const supplyPanel = $('#centralSuppliesAdmin');
    if (supplyPanel) supplyPanel.style.setProperty('display', 'none', 'important');
  }

  function simplifyFooter() {
    const footer = $('footer');
    if (!footer || footer.dataset.simpleBranding === '1') return;
    footer.dataset.simpleBranding = '1';
    footer.innerHTML = '<strong>Electrica BT Mallorca SL</strong>';
  }

  function prepareClientHierarchy(card) {
    const folders = $$('.holder-folder', card);
    for (const folder of folders) {
      folder.open = true;
      folder.classList.remove('simple-client-folder');
      const addSupply = $('.add-supply-holder', folder);
      if (addSupply) {
        if (addSupply.textContent !== '+ Nuevo suministro') addSupply.textContent = '+ Nuevo suministro';
        if (addSupply.title !== 'Añadir un suministro para este titular') addSupply.title = 'Añadir un suministro para este titular';
      }
    }

    const hasAlias = card.classList.contains('multi-client-group') || !!$('.client-legal-name', card);
    card.classList.toggle('has-client-alias', hasAlias);
    card.classList.toggle('no-client-alias', !hasAlias);
    const legalLine = $('.client-legal-name', card);
    if (legalLine) legalLine.hidden = true;
  }

  function holderSourceRows() {
    const rows = new Map();
    for (const row of $$('#centralHoldersList .db-admin-row')) {
      const holderName = $('strong', row)?.textContent || '';
      const meta = $('.db-admin-meta', row)?.textContent || '';
      const parts = meta.split('·').map((part) => part.trim());
      const clientName = parts[1] || '';
      const sourceKey = norm(holderName) + '|' + norm(clientName);
      if (holderName && clientName && !rows.has(sourceKey)) {
        rows.set(sourceKey, { row, taxId: parts[0] || '' });
      }
    }
    return rows;
  }

  function ensureHolderActions(folder) {
    const summary = $('summary', folder);
    if (!summary) return null;
    let actions = $('.integrated-holder-actions', summary);
    if (!actions) {
      actions = document.createElement('span');
      actions.className = 'integrated-holder-actions';
      actions.addEventListener('click', (event) => event.stopPropagation());
      summary.appendChild(actions);
    }
    return actions;
  }

  function integrateHolderActions() {
    const sources = holderSourceRows();
    $$('#companyGrid .company-card-tree').forEach((card) => {
      const folders = $$('.holder-folder', card);
      for (const folder of folders) {
        const holderName = $('summary strong', folder)?.textContent || '';
        const clientName = $('.add-supply-holder', folder)?.dataset.client || card.dataset.clientPrimary || '';
        const source = sources.get(norm(holderName) + '|' + norm(clientName));
        if (!source) continue;

        const summary = $('summary', folder);
        if (summary && !$('.integrated-holder-tax', summary) && source.taxId && !/^Sin NIF\/CIF$/i.test(source.taxId)) {
          const tax = document.createElement('small');
          tax.className = 'integrated-holder-tax';
          tax.textContent = source.taxId;
          const count = [...summary.children].find((node) => node.tagName === 'SPAN' && !node.classList.contains('holder-folder-icon'));
          if (count) summary.insertBefore(tax, count);
          else summary.appendChild(tax);
        }

        const actions = ensureHolderActions(folder);
        if (!actions || actions.querySelector('.integrated-holder-edit')) continue;
        const sourceButton = source.row.querySelector('[data-db-action="edit_holder"]');
        if (!sourceButton) continue;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary integrated-holder-edit';
        button.textContent = 'Editar titular';
        button.title = 'Editar el titular actual sin reescribir las facturas históricas';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          sourceButton.click();
        });
        actions.appendChild(button);
      }
    });
  }

  function supplySourceRows() {
    const rows = new Map();
    for (const row of $$('#centralSuppliesList .db-admin-row')) {
      const cups = $('strong', row)?.textContent || '';
      if (cups) rows.set(norm(cups), row);
    }
    return rows;
  }

  function integrateHolderChangeControls() {
    const sources = supplySourceRows();
    $$('#companyGrid .holder-supply-row[data-cups]').forEach((row) => {
      const source = sources.get(norm(row.dataset.cups || ''));
      if (!source) return;

      const info = row.querySelector(':scope > div:first-child');
      const sourceNotice = source.querySelector('.db-mismatch,.db-mismatch-ok');
      let notice = $('.integrated-holder-notice', row);
      if (sourceNotice) {
        if (!notice) {
          notice = document.createElement('small');
          notice.className = 'integrated-holder-notice';
          info?.appendChild(notice);
        }
        const nextNotice = sourceNotice.textContent || '';
        if (notice.textContent !== nextNotice) notice.textContent = nextNotice;
        notice.classList.toggle('warning', sourceNotice.classList.contains('db-mismatch'));
        notice.classList.toggle('ok', sourceNotice.classList.contains('db-mismatch-ok'));
      } else {
        notice?.remove();
      }

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

      for (const action of ['apply_latest_invoice_holder', 'sync_holder_name']) {
        const className = 'integrated-' + action.replaceAll('_', '-');
        const sourceButton = source.querySelector('[data-db-action="' + action + '"]');
        const existing = $('.' + className, row);
        if (!sourceButton) {
          existing?.remove();
          continue;
        }
        if (existing) continue;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary db-warning integrated-holder-change ' + className;
        button.textContent = action === 'apply_latest_invoice_holder' ? 'Aplicar nuevo titular' : 'Actualizar titular';
        button.title = sourceButton.title || sourceButton.textContent || '';
        button.addEventListener('click', () => sourceButton.click());
        actions.appendChild(button);
      }
    });
  }

  function placeClientActionsInHierarchy() {
    $$('#companyGrid .company-card-tree').forEach((card) => {
      const topAdd = $('.client-tree-title .add-supply', card);
      if (topAdd) topAdd.style.display = 'none';

      if (card.classList.contains('multi-client-group')) {
        $$('.client-group-member', card).forEach((memberRow) => {
          const archive = $('.integrated-client-archive', memberRow);
          const clientName = memberRow.dataset.clientName || '';
          const folder = $$('.holder-folder', card).find((candidate) =>
            norm($('.add-supply-holder', candidate)?.dataset.client || '') === norm(clientName)
          );
          const actions = folder ? ensureHolderActions(folder) : null;
          if (archive && actions && !actions.contains(archive)) actions.appendChild(archive);
        });
        return;
      }

      if (!card.classList.contains('no-client-alias')) return;
      const title = $('.client-tree-title', card);
      const firstFolder = $('.holder-folder', card);
      const archive = $('.integrated-client-archive', title);
      const actions = firstFolder ? ensureHolderActions(firstFolder) : null;
      if (archive && actions && !actions.contains(archive)) actions.appendChild(archive);
      if (title) title.style.display = 'none';
    });
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
      prepareClientHierarchy(card);

      if (card.classList.contains('multi-client-group')) {
        $('.client-group-member', card).forEach((memberRow) => {
          const clientName = memberRow.dataset.clientName || '';
          const alreadyIntegrated = $('.integrated-client-archive', card).some((button) => norm(button.dataset.integratedClientName || '') === norm(clientName));
          if (alreadyIntegrated) return;
          const sourceRow = rowsByName.get(norm(clientName));
          const sourceButton = sourceRow?.querySelector('[data-db-action="archive_client"]');
          const actions = $('.client-group-member-actions', memberRow);
          if (!sourceButton || !actions) return;

          sourceButton.classList.add('integrated-client-archive');
          sourceButton.dataset.integratedClientName = clientName;
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
      integrateHolderActions();
      integrateSupplyArchiveButtons();
      integrateHolderChangeControls();
      placeClientActionsInHierarchy();
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
      #centralClientsAdmin,#centralHoldersAdmin,#centralSuppliesAdmin{display:none!important}
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
      .client-legal-name{display:none!important}
      .client-tree-title .add-supply{display:none!important}
      .add-supply-holder{
        display:inline-flex!important;
        margin-top:5px!important;
        padding:4px 0!important;
        font-size:.68rem!important;
      }
      .holder-folder{overflow:visible}
      .holder-folder>summary{
        display:flex!important;
        align-items:center;
        gap:7px;
        min-height:34px;
      }
      .holder-folder>summary>strong{font-size:.78rem}
      .integrated-holder-tax{
        color:#718096;
        font-size:.62rem;
        font-weight:600;
      }
      .integrated-holder-actions{
        display:flex;
        gap:5px;
        align-items:center;
        margin-left:auto;
      }
      .integrated-holder-actions .secondary{
        margin:0!important;
        min-height:0!important;
        padding:4px 7px!important;
        font-size:.64rem!important;
        line-height:1.2!important;
        white-space:nowrap;
      }
      .integrated-holder-notice{
        display:block;
        margin-top:3px;
        font-size:.62rem;
        font-weight:700;
      }
      .integrated-holder-notice.warning{color:#9a5b00}
      .integrated-holder-notice.ok{color:#237a45}
      .holder-supply-actions .integrated-holder-change{
        border-color:#d6a14a!important;
        color:#8a5a00!important;
        background:#fffaf0!important;
      }
      .client-group-members{
        display:none!important;
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
      .no-client-alias .holder-tree{margin-top:0!important}
      .has-client-alias .client-tree-title{margin-bottom:5px}
      .has-client-alias .client-tree-title h3{font-size:.9rem}
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
        .holder-folder>summary{
          align-items:flex-start;
          flex-wrap:wrap;
        }
        .integrated-holder-actions{
          width:100%;
          margin-left:0;
          padding-left:20px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function schedule() {
    if (!isAdmin() || schedulePending) return;
    schedulePending = true;
    queueMicrotask(() => {
      schedulePending = false;
      integrateArchiveButtons();
    });
  }

  function init() {
    installStyles();
    hideCupsMenu();
    hideDuplicatePanels();
    simplifyFooter();
    const observer = new MutationObserver(() => {
      if (isAdmin()) schedule();
    });
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
