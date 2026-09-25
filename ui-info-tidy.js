(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function injectStyles() {
    if ($('#uiInfoTidyStyles')) return;
    const style = document.createElement('style');
    style.id = 'uiInfoTidyStyles';
    style.textContent = `
      .ui-info-hidden{display:none!important}
      .ui-info-title{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
      .ui-info-btn{width:28px;height:28px;min-width:28px;border:1px solid #cfd8e3;border-radius:999px;background:#fff;color:#1834b8;font:800 16px/1 system-ui,sans-serif;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:none}
      .ui-info-btn:hover,.ui-info-btn:focus-visible{border-color:#1834b8;outline:none;box-shadow:0 0 0 3px rgba(24,52,184,.10)}
      .ui-info-modal{position:fixed;inset:0;z-index:10000;background:rgba(6,27,56,.38);display:flex;align-items:center;justify-content:center;padding:20px}
      .ui-info-modal[hidden]{display:none!important}
      .ui-info-card{width:min(520px,100%);max-height:min(72vh,620px);overflow:auto;background:#fff;border-radius:16px;padding:20px;box-shadow:0 24px 70px rgba(6,27,56,.24)}
      .ui-info-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
      .ui-info-card h3{margin:0;color:#10233f;font-size:20px}.ui-info-card p{margin:0;color:#526176;line-height:1.55;white-space:pre-line}
      .ui-info-close{border:0;background:#eef1f5;color:#10233f;border-radius:999px;width:34px;height:34px;font-size:20px;cursor:pointer}
      .topbar #pageSubtitle{display:none!important}
      .topbar .heading-block h1{margin-bottom:0}
      .topbar .ui-info-btn{vertical-align:middle;margin-left:7px}
      #clientesView .master-actions>div:first-child>p:not(.eyebrow),
      #historicoView .placeholder-view>p,
      #usersView .section-head .subtitle,
      #dropZone h2+p,
      #analisisView .analysis-head>div:first-child>p:not(.eyebrow),
      #alertasView .alerts-head>div:first-child>p:not(.eyebrow),
      #alertasView .alerts-note,
      #facturasView .section-tip{display:none!important}
      @media(max-width:700px){
        .ui-info-btn{width:26px;height:26px;min-width:26px;font-size:15px}
        .ui-info-card{padding:17px;border-radius:14px}
        .master-actions.card{gap:14px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    let modal = $('#uiInfoModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'uiInfoModal';
    modal.className = 'ui-info-modal';
    modal.hidden = true;
    modal.innerHTML = `<div class="ui-info-card" role="dialog" aria-modal="true" aria-labelledby="uiInfoTitle"><div class="ui-info-card-head"><h3 id="uiInfoTitle">Información</h3><button type="button" class="ui-info-close" aria-label="Cerrar">×</button></div><p id="uiInfoText"></p></div>`;
    document.body.appendChild(modal);
    const close = () => { modal.hidden = true; };
    $('.ui-info-close', modal)?.addEventListener('click', close);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) close(); });
    return modal;
  }

  function openInfo(title, text) {
    if (!text) return;
    const modal = ensureModal();
    $('#uiInfoTitle', modal).textContent = title || 'Información';
    $('#uiInfoText', modal).textContent = text;
    modal.hidden = false;
    $('.ui-info-close', modal)?.focus();
  }

  function makeButton(title, text, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ui-info-btn ${className}`.trim();
    button.textContent = 'i';
    button.setAttribute('aria-label', `Información: ${title}`);
    button.title = 'Más información';
    button.addEventListener('click', () => openInfo(title, text));
    return button;
  }

  function installPageInfo() {
    const title = $('#pageTitle');
    const subtitle = $('#pageSubtitle');
    if (!title || !subtitle) return;
    let button = $('#pageInfoButton');
    if (!button) {
      button = makeButton(title.textContent.trim() || 'Información', subtitle.textContent.trim(), 'page-info-btn');
      button.id = 'pageInfoButton';
      title.insertAdjacentElement('afterend', button);
    }
    const sync = () => {
      const heading = title.textContent.trim() || 'Información';
      const text = subtitle.textContent.trim();
      button.onclick = () => openInfo(heading, text);
      button.setAttribute('aria-label', `Información: ${heading}`);
      button.hidden = !text;
    };
    sync();
    if (!subtitle.dataset.infoObserved) {
      subtitle.dataset.infoObserved = '1';
      new MutationObserver(sync).observe(subtitle, {childList:true,subtree:true,characterData:true});
      new MutationObserver(sync).observe(title, {childList:true,subtree:true,characterData:true});
    }
  }

  const items = [
    {text:'#clientesView .master-actions>div:first-child>p:not(.eyebrow)', anchor:'#clientesView .master-actions h2', title:'Clientes y suministros'},
    {text:'#historicoView .placeholder-view>p', anchor:'#historicoView .placeholder-view h2', title:'Histórico energético'},
    {text:'#usersView .section-head .subtitle', anchor:'#usersView .section-head h2', title:'Usuarios y permisos'},
    {text:'#dropZone h2+p', anchor:'#dropZone h2', title:'Cargar facturas'},
    {text:'#analisisView .analysis-head>div:first-child>p:not(.eyebrow)', anchor:'#analisisView .analysis-head h2', title:'Análisis'},
    {text:'#alertasView .alerts-head>div:first-child>p:not(.eyebrow)', anchor:'#alertasView .alerts-head h2', title:'Alertas'},
    {text:'#alertasView .alerts-note', anchor:'#alertasView .section-head h2', title:'Seguimiento de alertas'},
    {text:'#facturasView .section-tip', anchor:'#facturasView .table-card .section-head h2', title:'Facturas analizadas'},
  ];

  function compactItem(item) {
    const textEl = $(item.text);
    const anchor = $(item.anchor);
    if (!textEl || !anchor || textEl.dataset.infoCompacted === '1') return;
    const text = textEl.textContent.trim();
    if (!text) return;
    textEl.dataset.infoCompacted = '1';
    textEl.classList.add('ui-info-hidden');
    if (anchor.parentElement?.querySelector(':scope > .ui-info-btn[data-info-for]')) return;
    const button = makeButton(item.title || anchor.textContent.trim(), text);
    button.dataset.infoFor = item.text;
    anchor.classList.add('ui-info-title');
    anchor.appendChild(button);
  }

  function apply() {
    injectStyles();
    ensureModal();
    installPageInfo();
    items.forEach(compactItem);
  }

  function init() {
    apply();
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; apply(); });
    }).observe(document.body, {childList:true,subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
