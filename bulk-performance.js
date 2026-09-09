(() => {
  'use strict';

  const BULK_MIN = 80;
  const RENDER_EVERY = 10;
  const nativeAppend = Node.prototype.appendChild;
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const nativeWarn = console.warn.bind(console);
  const innerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  const buffers = new WeakMap();
  const enqueueCounts = {change: 0, drop: 0};

  let bulkActive = false;
  let bulkTotal = 0;
  let renderCycle = 0;
  let settleTimer = null;
  let deferredHistory = null;
  let historyRunning = false;
  let historyText = '';
  let mainDone = false;
  let startedAt = 0;
  let baselineInvoices = 0;
  let baselineOk = 0;
  let baselineReview = 0;
  let readErrors = 0;
  let readErrorFiles = [];

  function pdfCount(files){
    return [...(files || [])].filter(f => f?.name?.toLowerCase().endsWith('.pdf')).length;
  }

  function countOf(selector){
    return Number(document.querySelector(selector)?.textContent || 0) || 0;
  }

  function plural(n, one, many){
    return `${n} ${n === 1 ? one : many}`;
  }

  function elapsed(){
    if (!startedAt) return '';
    const totalSeconds = Math.max(0, Math.round((performance.now() - startedAt) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes} min ${seconds} s` : `${seconds} s`;
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
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'display:none;flex-basis:100%;margin-top:10px;padding:10px 12px;border-radius:9px;background:#eef1ff;color:#1834b8;font-size:12px;font-weight:700;white-space:pre-line;line-height:1.45';
    uploader.appendChild(el);
    return el;
  }

  function snapshot(){
    const processed = Math.min(renderCycle, bulkTotal);
    const added = Math.max(0, countOf('#statInvoices') - baselineInvoices);
    const correct = Math.max(0, countOf('#statOk') - baselineOk);
    const review = Math.max(0, countOf('#statReview') - baselineReview);
    const duplicates = Math.max(0, processed - added - readErrors);
    return {processed, added, correct, review, duplicates, readErrors};
  }

  function progressText(prefix){
    const s = snapshot();
    const lines = [
      `${prefix || 'Procesando'} · ${s.processed}/${bulkTotal} PDF`,
      `${plural(s.added, 'factura nueva', 'facturas nuevas')} · ${plural(s.correct, 'correcta', 'correctas')} · ${plural(s.review, 'a revisar', 'a revisar')} · ${plural(s.duplicates, 'duplicada', 'duplicadas')} · ${plural(s.readErrors, 'error de lectura', 'errores de lectura')}`
    ];
    if (historyText) lines.push(historyText);
    if (readErrorFiles.length) lines.push(`Errores de lectura: ${readErrorFiles.slice(0, 3).join(', ')}${readErrorFiles.length > 3 ? ` y ${readErrorFiles.length - 3} más` : ''}`);
    return lines.join('\n');
  }

  function updateStatus(text){
    const el = ensureStatus();
    if (!el) return;
    el.style.display = 'block';
    el.textContent = text || progressText(mainDone ? 'Lectura principal terminada' : 'Procesando');
  }

  function begin(files){
    const total = pdfCount(files);
    if (total < BULK_MIN) return;
    bulkActive = true;
    bulkTotal = total;
    renderCycle = 0;
    deferredHistory = null;
    historyRunning = false;
    historyText = '';
    mainDone = false;
    readErrors = 0;
    readErrorFiles = [];
    startedAt = performance.now();
    baselineInvoices = countOf('#statInvoices');
    baselineOk = countOf('#statOk');
    baselineReview = countOf('#statReview');
    document.body.classList.add('ibt-bulk-processing');
    const wrap = document.querySelector('#facturasView .table-wrap');
    if (wrap) wrap.style.contentVisibility = 'auto';
    updateStatus(`Lote recibido · ${total} facturas PDF · preparando lectura…`);
  }

  function finishWithoutHistory(){
    if (!bulkActive) return;
    bulkActive = false;
    document.body.classList.remove('ibt-bulk-processing');
    updateStatus(`${progressText('Carga terminada')}\nTiempo empleado: ${elapsed()}`);
  }

  function flushHistory(){
    if (!bulkActive || !mainDone || historyRunning) return;
    if (!deferredHistory){
      scheduleSettle();
      return;
    }
    const job = deferredHistory;
    deferredHistory = null;
    historyRunning = true;
    historyText = 'Histórico: iniciando validación y guardado…';
    updateStatus();
    setTimeout(() => {
      try{ job(); }
      catch(e){
        historyRunning = false;
        historyText = 'Histórico: no se pudo iniciar el guardado.';
        nativeWarn('No se pudo iniciar el histórico diferido', e);
        scheduleSettle();
      }
    }, 50);
  }

  function scheduleSettle(){
    if (!bulkActive) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (historyRunning) return;
      if (!mainDone && renderCycle < bulkTotal){
        updateStatus(`${progressText('Lectura detenida o incompleta')}\nLa aplicación recibió ${bulkTotal} PDF pero solo terminó ${renderCycle}.`);
        return;
      }
      finishWithoutHistory();
    }, 3500);
  }

  // app.js informa los fallos de lectura por consola. Conservamos ese aviso y,
  // durante un lote grande, lo contamos para distinguirlo de una factura duplicada.
  console.warn = function(...args){
    if (bulkActive && args[0] === 'Error leyendo'){
      readErrors += 1;
      const fileName = String(args[1] || '').trim();
      if (fileName) readErrorFiles.push(fileName);
      updateStatus();
    }
    return nativeWarn(...args);
  };

  // Los lectores auxiliares se registran después de este script. En lotes grandes
  // dejamos trabajar primero al lector principal y después al histórico. Esto se
  // aplica tanto al selector normal como al arrastre de una carpeta completa.
  EventTarget.prototype.addEventListener = function(type, listener, options){
    const src = typeof listener === 'function' ? String(listener) : '';
    const isChange = this?.id === 'fileInput' && type === 'change' && src.includes('enqueue');
    const isDrop = this?.id === 'dropZone' && type === 'drop' && src.includes('enqueue');
    if (isChange || isDrop){
      const kind = isChange ? 'change' : 'drop';
      enqueueCounts[kind] += 1;
      const slot = enqueueCounts[kind];
      const wrapped = function(event){
        const files = isChange ? [...(event?.target?.files || [])] : [...(event?.dataTransfer?.files || [])];
        if (pdfCount(files) < BULK_MIN) return listener.call(this, event);
        if (slot === 1){
          // supply-enricher-v2: el maestro XTRA ya está sincronizado desde Supabase.
          return;
        }
        deferredHistory = () => listener.call(this, isChange ? {target:{files}} : {dataTransfer:{files}});
        historyText = 'Histórico: esperando a que termine la lectura principal…';
        updateStatus();
        if (mainDone) queueMicrotask(flushHistory);
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
        if (state.skipRender){
          if (renderCycle >= bulkTotal){
            mainDone = true;
            queueMicrotask(flushHistory);
          }
          return value;
        }
        state.frag = document.createDocumentFragment();
        state.scheduled = false;
        const result = innerHTMLDescriptor.set.call(this, value);
        if (renderCycle >= bulkTotal){
          mainDone = true;
          queueMicrotask(flushHistory);
        }
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

  nativeAddEventListener.call(window, 'xtra-history-updated', e => {
    if (!bulkActive) return;
    const d = e.detail || {};
    historyRunning = false;
    historyText = `Histórico terminado · ${plural(Number(d.saved || 0), 'guardada', 'guardadas')} · ${plural(Number(d.complete || 0), 'completa', 'completas')} · ${plural(Number(d.review || 0), 'a revisar', 'a revisar')} · ${plural(Number(d.skipped || 0), 'omitida', 'omitidas')} · ${plural(Number(d.failed || 0), 'error', 'errores')}`;
    bulkActive = false;
    document.body.classList.remove('ibt-bulk-processing');
    updateStatus(`${progressText('Carga terminada')}\nTiempo empleado: ${elapsed()}`);
  });

  const startObservers = () => {
    const stat = document.querySelector('#statInvoices');
    const dropZone = document.querySelector('#dropZone');
    if (stat){
      new MutationObserver(() => {
        if (!bulkActive) return;
        updateStatus();
        if (renderCycle >= bulkTotal){
          mainDone = true;
          queueMicrotask(flushHistory);
        } else {
          scheduleSettle();
        }
      }).observe(stat, {childList:true,subtree:true,characterData:true});
    }
    if (dropZone){
      new MutationObserver(() => {
        if (!bulkActive) return;
        const h = document.querySelector('#historySyncStatus');
        const text = h?.textContent?.trim();
        if (text && text !== historyText){
          historyText = text;
          updateStatus();
        }
      }).observe(dropZone, {childList:true,subtree:true,characterData:true});
    }
  };

  if (document.readyState === 'loading') nativeAddEventListener.call(document, 'DOMContentLoaded', startObservers, {once:true});
  else startObservers();
})();
