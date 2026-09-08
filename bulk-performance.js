(() => {
  'use strict';

  const BULK_MIN = 80;
  const RENDER_EVERY = 10;
  const nativeAppend = Node.prototype.appendChild;
  const innerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  const buffers = new WeakMap();
  let bulkActive = false;
  let bulkTotal = 0;
  let renderCycle = 0;
  let settleTimer = null;
  let lastCount = 0;

  function pdfCount(files){
    return [...(files || [])].filter(f => f?.name?.toLowerCase().endsWith('.pdf')).length;
  }

  function stateFor(el){
    let state = buffers.get(el);
    if (!state){
      state = {frag: document.createDocumentFragment(), scheduled: false, skipRender: false};
      buffers.set(el, state);
    }
    return state;
  }

  function ensureStatus(){
    let el = document.querySelector('#bulkProcessingStatus');
    if (el) return el;
    const uploader = document.querySelector('#dropZone');
    if (!uploader) return null;
    el = document.createElement('div');
    el.id = 'bulkProcessingStatus';
    el.style.cssText = 'display:none;margin-top:10px;padding:9px 12px;border-radius:9px;background:#eef1ff;color:#1834b8;font-size:12px;font-weight:700';
    uploader.appendChild(el);
    return el;
  }

  function updateStatus(){
    if (!bulkActive) return;
    const el = ensureStatus();
    const count = Number(document.querySelector('#statInvoices')?.textContent || 0) || 0;
    lastCount = count;
    if (el){
      el.style.display = 'block';
      el.textContent = `Procesando lote grande · ${renderCycle}/${bulkTotal} PDF · ${count} facturas únicas`;
    }
  }

  function begin(files){
    const total = pdfCount(files);
    if (total < BULK_MIN) return;
    bulkActive = true;
    bulkTotal = total;
    renderCycle = 0;
    document.body.classList.add('ibt-bulk-processing');
    const wrap = document.querySelector('#facturasView .table-wrap');
    if (wrap) wrap.style.contentVisibility = 'auto';
    updateStatus();
  }

  function scheduleSettle(){
    if (!bulkActive) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const count = Number(document.querySelector('#statInvoices')?.textContent || 0) || 0;
      if (count !== lastCount){ lastCount = count; scheduleSettle(); return; }
      bulkActive = false;
      document.body.classList.remove('ibt-bulk-processing');
      const el = ensureStatus();
      if (el){
        el.textContent = `Lote principal estabilizado · ${count} facturas únicas. El histórico puede seguir validando en segundo plano.`;
        setTimeout(() => { if (!bulkActive) el.style.display = 'none'; }, 5000);
      }
    }, 3500);
  }

  // app.js reconstruye toda la tabla después de cada PDF. En lotes grandes,
  // dejamos que haga el cálculo y actualice estadísticas en cada factura, pero
  // solo reconstruimos físicamente la tabla cada 10 PDF (y siempre en el último).
  // Esto evita el crecimiento cuadrático de trabajo DOM que bloqueaba Chrome.
  if (innerHTMLDescriptor?.get && innerHTMLDescriptor?.set){
    Object.defineProperty(HTMLTableSectionElement.prototype, 'innerHTML', {
      configurable: true,
      get(){ return innerHTMLDescriptor.get.call(this); },
      set(value){
        if (!bulkActive || this.id !== 'resultsBody') return innerHTMLDescriptor.set.call(this, value);
        renderCycle += 1;
        const state = stateFor(this);
        state.skipRender = renderCycle % RENDER_EVERY !== 0 && renderCycle !== bulkTotal;
        if (state.skipRender) return value;
        state.frag = document.createDocumentFragment();
        state.scheduled = false;
        return innerHTMLDescriptor.set.call(this, value);
      }
    });
  }

  // En los ciclos que sí se pintan, agrupamos todas las filas en un fragmento
  // para hacer una sola inserción al DOM en lugar de cientos de repintados.
  HTMLTableSectionElement.prototype.appendChild = function(node){
    if (!bulkActive || this.id !== 'resultsBody') return nativeAppend.call(this, node);
    const state = stateFor(this);
    if (state.skipRender) return node;
    nativeAppend.call(state.frag, node);
    if (!state.scheduled){
      state.scheduled = true;
      queueMicrotask(() => {
        state.scheduled = false;
        const frag = state.frag;
        state.frag = document.createDocumentFragment();
        if (frag.childNodes.length) nativeAppend.call(this, frag);
      });
    }
    return node;
  };

  document.addEventListener('change', e => {
    if (e.target?.id === 'fileInput') begin(e.target.files);
  }, true);

  document.addEventListener('drop', e => {
    if (e.target?.closest?.('#dropZone')) begin(e.dataTransfer?.files);
  }, true);

  const startObserver = () => {
    const stat = document.querySelector('#statInvoices');
    if (!stat) return;
    new MutationObserver(() => { if (bulkActive){ updateStatus(); scheduleSettle(); } }).observe(stat, {childList:true,subtree:true,characterData:true});
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, {once:true});
  else startObserver();
})();
