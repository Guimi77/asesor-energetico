(() => {
  'use strict';

  // app.js moves the diagnostic column ("Qué revisar") from the last
  // position to the second one for readability. xtra-history.js still
  // validates result rows using the original fixed column positions.
  // Keep the DOM order compatible with the history validator until that
  // validator is converted to header-based field lookup.
  function restoreHistoryColumnOrder() {
    const body = document.querySelector('#resultsBody');
    const table = body?.closest('table');
    const head = table?.querySelector('thead tr');

    if (head?.children?.[1]?.dataset?.validationReason) {
      head.appendChild(head.children[1]);
    }

    for (const tr of body?.rows || []) {
      if (tr.cells.length === 16 && tr.cells[1]?.dataset?.validationReason) {
        tr.appendChild(tr.cells[1]);
      }
    }
  }

  const body = document.querySelector('#resultsBody');
  if (!body) return;

  const observer = new MutationObserver(() => {
    // app.js registered its observer first, so defer one microtask to run
    // after its presentation-only column move has finished.
    queueMicrotask(restoreHistoryColumnOrder);
  });

  observer.observe(body, { childList: true });
  restoreHistoryColumnOrder();

  window.IBTHistoryRowCompat = {
    restore: restoreHistoryColumnOrder,
    mode: 'legacy-history-column-order'
  };
})();
