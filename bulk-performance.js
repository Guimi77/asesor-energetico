(() => {
  'use strict';

  const BULK_MIN = 80;
  const RENDER_EVERY = 10;
  const nativeAppend = Node.prototype.appendChild;
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const innerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  const buffers = new WeakMap();
  let bulkActive = false;
  let bulkTotal = 0;
  let renderCycle = 0;
  let settleTimer = null;
  let lastCount = 0;
  let deferredHistory = null;
  let enqueueListenerCount = 0;

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

  function updateStatus(text){
    const el = ensureStatus();
    if (!el) return;
    const count = Number(document.querySelector('#statInvoices')?.textContent || 0) || 0;
    lastCount = count;
    el.style.display = 'block';
    el.textContent = text || `Procesando lote grande · ${renderCycle}/${bulkTotal} PDF · ${count} facturas únicas`;
  }

  function begin(files){
    const total = pdfCount(files);
    if (total < BULK_MIN) return;
    bulkActive = true;
    bulkTotal = total;
    renderCycle = 0;
    deferredHistory = null;
    document.body.classList.add('ibt-bulk-processing');
    const wrap = document.querySelector('#facturasView .table-wrap');
    if (wrap) wrap.style.contentVisibility = 'auto';
    updateStatus();
  }

  function flushHistory(){
    if (!deferredHistory) return;
    const job = deferredHistory;
    deferredHistory = null;
    updateStatus(`Lectura principal terminada · iniciando validación y guardado del histórico…`);
    setTimeout(() => {
      try{ job(); }
      catch(e){ console.warn('No se pudo iniciar el histórico diferido', e); }
    }, 50);
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
        el.textContent = `Lote principal estabilizado · ${count} facturas únicas.`;
        setTimeout(() => { if (!bulkActive && !deferredHistory) el.style.display = 'none'; }, 5000);
      }
    }, 3500);
  }

  // Interceptamos los listeners auxiliares que se registran DESPUÉS de este script.
  // app.js usa input.onchange y sigue procesando inmediatamente. El primer listener
  // con "enqueue" es el enriquecedor local: en lotes grandes se omite porque el
  // maestro ya está en Supabase. El segundo es el histórico XTRA: se difiere hasta
  // que el parser principal ha terminado, evitando que 2-3 lectores PDF trabajen a la vez.
  EventTarget.prototype.addEventListener = function(type, listener, options){
    const src = typeof listener === 'function' ? String(listener) : '';
    const isFileInput = this?.id === 'fileInput' && type === 'change' && src.includes('enqueue');
    if (isFileInput){
      enqueueListenerCount += 1;
      const slot = enqueueListenerCount;
      const wrapped = function(event){
        const files = [...(event?.target?.files || [])];
        if (files.length < BULK_MIN) return listener.call(this, event);
        if (slot === 1){
          // supply-enricher-v2: no hace falta releer cientos de PDF en el piloto;
          // el maestro XTRA ya está sincronizado desde Supabase.
          return;
        }
        deferredHistory = () => listener.call(this, {target:{files}});
        updateStatus(`Procesando lote grande · el histórico esperará a que termine la lectura principal`);
      };
      return nativeAddEventListener.call(this, type, wrapped, options);
    }
    return nativeAddEventListener.call(this, type, listener, options);
  };

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
        const result = innerHTMLDescriptor.set.call(this, value);
        if (renderCycle >= bulkTotal) queueMicrotask(flushHistory);
        return result;
      }
    });
  }

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

  nativeAddEventListener.call(document, 'change', e => {
    if (e.target?.id === 'fileInput') begin(e.target.files);
  }, true);

  nativeAddEventListener.call(document, 'drop', e => {
    if (e.target?.closest?.('#dropZone')) begin(e.dataTransfer?.files);
  }, true);

  const startObserver = () => {
    const stat = document.querySelector('#statInvoices');
    if (!stat) return;
    new MutationObserver(() => { if (bulkActive){ updateStatus(); scheduleSettle(); } }).observe(stat, {childList:true,subtree:true,characterData:true});
  };

  if (document.readyState === 'loading') nativeAddEventListener.call(document, 'DOMContentLoaded', startObserver, {once:true});
  else startObserver();
})();
