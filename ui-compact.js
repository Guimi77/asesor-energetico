
(() => {
  'use strict';

  let toastTimer = 0;
  let lastHistoryFinalAt = 0;

  const getToast = () => {
    let toast = document.querySelector('#ibtCompactToast');
    if (toast) return toast;

    toast = document.createElement('div');
    toast.id = 'ibtCompactToast';
    toast.className = 'ibt-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = '<strong></strong><button type="button" aria-label="Cerrar">×</button><p></p>';
    toast.querySelector('button').addEventListener('click', () => {
      toast.classList.remove('is-visible');
    });
    document.body.appendChild(toast);
    return toast;
  };

  const showToast = (title, message, tone = 'ok') => {
    const toast = getToast();
    toast.dataset.tone = tone;
    toast.querySelector('strong').textContent = title;
    toast.querySelector('p').textContent = message;
    toast.classList.add('is-visible');

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 6000);
  };

  const hasPositiveCount = (text, labelPattern) => {
    const match = text.match(new RegExp('(\\d+)\\s+' + labelPattern, 'i'));
    return Boolean(match && Number(match[1]) > 0);
  };

  const statusTone = (text) => (
    hasPositiveCount(text, 'errores?') ||
    hasPositiveCount(text, 'a revisar') ||
    hasPositiveCount(text, 'con detalle a revisar') ||
    hasPositiveCount(text, 'omitid[oa]s?')
  ) ? 'review' : 'ok';

  const processHistoryStatus = (el) => {
    const text = el?.textContent?.trim();
    if (!text) return;
    el.title = text;

    if (!/Histórico terminado/i.test(text)) return;
    if (el.dataset.ibtToastSource === text) return;

    el.dataset.ibtToastSource = text;
    lastHistoryFinalAt = Date.now();
    showToast('Análisis terminado', text, statusTone(text));
  };

  const processBulkStatus = (el) => {
    const text = el?.textContent?.trim();
    if (!text) return;
    el.title = text;

    if (!/Carga terminada/i.test(text)) return;
    if (el.dataset.ibtToastSource === text) return;

    el.dataset.ibtToastSource = text;

    if (Date.now() - lastHistoryFinalAt > 2500) {
      showToast('Carga terminada', text, statusTone(text));
    }

    window.setTimeout(() => {
      if (el.textContent.trim() === text) el.style.display = 'none';
    }, 3200);
  };

  const processStatuses = (root = document) => {
    const history = root.querySelector?.('#historySyncStatus') ||
      (root.id === 'historySyncStatus' ? root : null);
    const bulk = root.querySelector?.('#bulkProcessingStatus') ||
      (root.id === 'bulkProcessingStatus' ? root : null);

    if (history) processHistoryStatus(history);
    if (bulk) processBulkStatus(bulk);
  };

  const install = () => {
    const dropZone = document.querySelector('#dropZone');
    if (!dropZone || dropZone.dataset.ibtCompactUi === '1') return;

    dropZone.dataset.ibtCompactUi = '1';
    processStatuses(dropZone);

    const observer = new MutationObserver(() => processStatuses(dropZone));
    observer.observe(dropZone, {
      childList: true,
      subtree: true,
      characterData: true
    });

    const toolbar = document.querySelector('.toolbar');
    if (toolbar) toolbar.setAttribute('aria-label', 'Acciones del análisis');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
