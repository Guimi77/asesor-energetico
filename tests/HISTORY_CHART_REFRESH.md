# Cost chart survives page reload

Baseline: c2a3e38daf5c064960c166941692f01691f1d7fa.
Verified candidate: 3e8eb6bbbd49503981cf96e8a6fd34c54eed6f68.
Candidate workflow: 34219166942 (passed before promotion).

## Reproduced cause

The old history-cost-chart.js ran start() once. If Supabase session restoration had not created #historyContent yet, it returned before registering its observer or refresh listener. The history UI subsequently drew its two native charts but no code remained to attach the third. This was reproduced in Chromium with the actual baseline history modules and a deliberately delayed, synthetic session event.

## Fix

The cost chart is now rendered by history-ui.js alongside consumption and spending, using their existing monthly numeric aggregates and filter scope. auth-bootstrap.js no longer loads the asynchronous chart sidecar. The old sidecar file remains in Git for regression baselines, but is not executed by the application. There is no new observer, timer, auth event, PDF reader or database query. Parser, resource cleanup, recommendation logic and historical storage are unchanged.

Cost is sum(total euros) / sum(kWh) for a month. Zero/non-positive consumption has no calculable cost point; a dash is shown and the line breaks rather than falling to a false zero. Actual zero cost with positive consumption is retained. Empty filters still show the third chart panel with its empty state.

## Repeatable checks

- node --test tests/power-regression.test.cjs tests/pdf-lifecycle.test.cjs tests/history-recommendations.test.cjs tests/history-chart-refresh.test.cjs
- node tests/history-chart-refresh-browser.cjs
- node tests/history-recommendations-browser.cjs

The browser fixture uses 341 synthetic records / 52 synthetic supplies and mocked Supabase responses. It reproduces the old failure, verifies three successive page reloads with delayed sessions, immediate sessions, scoped supply/date filters, weighted cost values, history detail and recommendations, idle/tab-return stability, a zero-consumption gap, all-zero and empty selections. It does not inspect real customer invoices, contact production Supabase or claim to test production RLS.

Existing regression assertions remain in force; no tests were weakened to accept this fix.
