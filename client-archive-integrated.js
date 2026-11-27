(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const norm = (value) => String(value ?? '').trim().toLocaleUpperCase('es-ES').replace(/\s/g, '');
  let syncing = false;
  let schedulePending = false;
  let observer = null;

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

    const isBusinessGroup = String(card.dataset.clientType || '').toUpperCase() === 'GRUPO' || card.classList.contains('client-type-grupo');
    const hasAlias = card.classList.contains('multi-client-group') || !!$('.client-legal-name', card);
    const keepTopHeading = hasAlias || isBusinessGroup;
    card.classList.toggle('has-client-alias', hasAlias);
    card.classList.toggle('business-group-client', isBusinessGroup);
    card.classList.toggle('no-client-alias', !keepTopHeading);
    const legalLine = $('.client-legal-name', card);
    if (legalLine) legalLine.hidden = true;
  }

  function holderSourceRows() {
    const byId = new Map();
    const byName = new Map();
    for (const row of $$('#centralHoldersList .db-admin-row')) {
      const holderName = $('strong', row)?.textContent || '';
      const meta = $('.db-admin-meta', row)?.textContent || '';
      const parts = meta.split('·').map((part) => part.trim());
      const clientName = parts[1] || '';
      const sourceKey = norm(holderName) + '|' + norm(clientName);
      const source = { row, taxId: parts[0] || '' };
      const holderId = $('[data-db-action="edit_holder"]', row)?.dataset.id;
      if (holderId) byId.set(holderId, source);
      if (holderName && clientName && !byName.has(sourceKey)) {
        byName.set(sourceKey, source);
      }
    }
    return { byId, byName };
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
        const holderId = folder.dataset.holderId;
        const source = holderId ? sources.byId.get(holderId) : sources.byName.get(norm(holderName) + '|' + norm(clientName));
        if (!source) continue;

        const summary = $('summary', folder);
        if (summary && !$('.integrated-holder-tax', summary) && source.taxId && !/^Sin NIF\/CIF$/i.test(source.taxId)) {
          const tax = document.createElement('small');
          tax.className = 'integrated-holder-tax';
          tax.textContent = source.taxId;
          const titleMain = $('.holder-title-main', summary);
          if (titleMain) titleMain.appendChild(tax);
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
      const sourceNotice = source.querySelector('.db-mismatch');
      let notice = $('.integrated-holder-notice', row);
      if (sourceNotice) {
        if (!notice) {
          notice = document.createElement('small');
          notice.className = 'integrated-holder-notice';
          info?.appendChild(notice);
        }
        const nextNotice = sourceNotice.textContent || '';
        if (notice.textContent !== nextNotice) notice.textContent = nextNotice;
        notice.classList.add('warning');
        notice.classList.remove('ok');
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
      const isBusinessGroup = String(card.dataset.clientType || '').toUpperCase() === 'GRUPO' || card.classList.contains('client-type-grupo');
      if (topAdd) {
        topAdd.style.display = isBusinessGroup ? '' : 'none';
        if (isBusinessGroup) {
          if (topAdd.textContent !== '+ Nuevo titular / suministro') {
            topAdd.textContent = '+ Nuevo titular / suministro';
          }
          if (topAdd.title !== 'Añadir un nuevo titular y su primer suministro al grupo empresarial') {
            topAdd.title = 'Añadir un nuevo titular y su primer suministro al grupo empresarial';
          }
        }
      }

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
        $$('.client-group-member', card).forEach((memberRow) => {
          const clientName = memberRow.dataset.clientName || '';
          const alreadyIntegrated = $$('.integrated-client-archive', card).some((button) => norm(button.dataset.integratedClientName || '') === norm(clientName));
          if (alreadyIntegrated) return;
          const sourceRow = rowsByName.get(norm(clientName));
          const sourceButton = sourceRow?.querySelector('[data-db-action="archive_client"]');
          const actions = $('.client-group-member-actions', memberRow);
          if (!sourceButton || !actions) return;

          sourceButton.classList.add('integrated-client-archive');
          sourceButton.dataset.integratedClientName = clientName;
          sourceButton.dataset.purgeClientName = $('strong',sourceRow)?.textContent || '';
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
      sourceButton.dataset.purgeClientName = $('strong',sourceRow)?.textContent || '';
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

  function integratePurgeButtons() {
    // Source archive buttons already carry the canonical database client ID.
    // Never resolve a destructive target by a fuzzy name or a visible label.
    $('#companyGrid .integrated-client-archive[data-id]').forEach((archive) => {
      const clientId=archive.dataset.id;
      const clientName=archive.dataset.purgeClientName || archive.dataset.integratedClientName ||
        archive.closest('.company-card-tree')?.dataset.clientPrimary || '';
      if (!clientId || !clientName || !archive.parentElement ||
          archive.parentElement.querySelector('.integrated-client-purge')) return;
      const button=document.createElement('button');
      button.type='button';
      button.className='secondary integrated-client-purge';
      button.textContent='Eliminar cliente';
      button.title='Eliminar este cliente y todos sus titulares, suministros y facturas definitivamente';
      button.addEventListener('click',async (event)=>{
        event.preventDefault();
        event.stopPropagation();
        if(!isAdmin() || typeof window.IBTAdminPurge?.purgeClient!=='function') return;
        button.disabled=true;
        try { await window.IBTAdminPurge.purgeClient({id:clientId,name:clientName}); }
        finally { button.disabled=false; }
      });
      archive.insertAdjacentElement('afterend',button);
    });
    $('#companyGrid .holder-supply-row[data-history-supply-id][data-cups]').forEach((row) => {
      if(row.querySelector('.integrated-supply-purge')) return;
      const supplyId=row.dataset.historySupplyId;
      const cups=row.dataset.cups;
      if(!supplyId || !cups) return;
      const actions=row.querySelector('.holder-supply-actions');
      if(!actions) return;
      const button=document.createElement('button');
      button.type='button';
      button.className='secondary integrated-supply-purge';
      button.textContent='Eliminar';
      button.title='Eliminar suministro, facturas y detalles definitivamente';
      button.addEventListener('click',async (event)=>{
        event.preventDefault();
        event.stopPropagation();
        if(!isAdmin() || typeof window.IBTAdminPurge?.purgeSupply!=='function') return;
        button.disabled=true;
        try { await window.IBTAdminPurge.purgeSupply({id:supplyId,cups}); }
        finally { button.disabled=false; }
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
      integratePurgeButtons();
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
      .integrated-supply-purge,.integrated-client-purge{
        color:#a42c25!important;border:1px solid #dbb4b1!important;background:#fff8f7!important;
        cursor:pointer;white-space:nowrap;
      }
      .integrated-supply-purge:hover,.integrated-client-purge:hover{background:#ffe9e5!important}
      .integrated-client-purge{padding:5px 8px!important;border-radius:7px!important;font-size:11px!important}
      .holder-supply-actions .integrated-supply-archive{
        border-color:#d6a14a!important;
        color:#8a5a00!important;
        background:#fffaf0!important;
      }
      .client-legal-name{display:none!important}
      .client-tree-title .add-supply{display:none!important}
      .business-group-client .client-tree-title .add-supply{display:inline-flex!important}
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
        gap:9px;
        min-height:42px;
      }
      .holder-title-wrap{
        display:flex;
        flex:1 1 auto;
        min-width:0;
        flex-direction:column;
        gap:4px;
      }
      .holder-title-main{
        display:flex;
        align-items:baseline;
        flex-wrap:wrap;
        gap:7px;
        min-width:0;
      }
      .holder-title-main>strong{
        color:#243442;
        font-size:.8rem;
        line-height:1.2;
      }
      .integrated-holder-tax{
        color:#8a96a6;
        font-size:.6rem;
        font-weight:650;
      }
      .holder-contact-line{
        display:flex;
        flex-wrap:wrap;
        align-items:center;
        gap:4px 14px;
        min-width:0;
        color:#5f6f80;
        font-size:.62rem;
        line-height:1.25;
      }
      .holder-contact-item{
        display:inline-flex;
        align-items:baseline;
        gap:4px;
        min-width:0;
      }
      .holder-contact-label{
        color:#8a96a6;
        font-size:.56rem;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:.025em;
      }
      .holder-contact-value{
        color:#5f6f80;
        font-weight:600;
        overflow-wrap:anywhere;
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
      .supply-current-retailer{
        display:flex!important;
        flex-wrap:wrap;
        align-items:center;
        gap:4px 6px;
        width:fit-content;
        max-width:100%;
        margin-top:4px;
        padding:0;
        border:0;
        border-radius:0;
        background:transparent;
        color:#667587!important;
        font-size:.62rem!important;
        line-height:1.25!important;
        font-weight:500!important;
      }
      .supply-current-retailer strong{
        color:#526273!important;
        font-size:.64rem!important;
        font-weight:750!important;
      }
      .supply-current-retailer-label{
        color:#8a96a6!important;
        font-size:.58rem!important;
        font-weight:700!important;
      }
      .supply-retailer-manual-tag{
        font-size:.52rem;
        letter-spacing:.035em;
        color:#5c6b78;
        background:#f1f4f6;
        border:1px solid #dce3e8;
        padding:1px 5px;
        border-radius:999px;
        font-weight:800;
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
      .business-group-client .client-tree-title{margin-bottom:5px}
      .has-client-alias .client-tree-title h3,
      .business-group-client .client-tree-title h3{font-size:.9rem}
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
        .holder-title-wrap{
          width:calc(100% - 28px);
        }
        .holder-contact-line{
          gap:4px 10px;
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
      observer?.disconnect();
      try {
        integrateArchiveButtons();
      } finally {
        if (observer && document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
        }
      }
    });
  }

  function init() {
    installStyles();
    hideCupsMenu();
    hideDuplicatePanels();
    simplifyFooter();
    observer = new MutationObserver(() => {
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
