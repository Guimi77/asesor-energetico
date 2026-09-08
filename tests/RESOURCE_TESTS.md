# PDF lifecycle and historical changes

Verified 2026-09-08 against baseline `1668d5ea2f8059d17e08502d83c6395db361c4bf`.

The previous PDF readers left loading tasks and owned workers open. The fix awaits `loadingTask.destroy()` in `finally` in all three readers, including load/page/text errors. Financial extraction and cross-validation rules are unchanged.

## Tests

`node --test tests/power-regression.test.cjs tests/pdf-lifecycle.test.cjs`

33 checks cover resource ownership, reader output equivalence, the pre-existing power regressions, and observed contractual changes. Missing or conflicting period values are not treated as zero. Historical changes include source periods and before/after/difference values; they are not recommendations or confirmed effective dates.

`node tests/pdf-lifecycle-browser.cjs` (requires playwright 1.51.1, pdf-lib 1.17.1, pdfjs-dist 4.10.38 and Chromium).

The browser test uses actual PDF.js with a synthetic PDF generated in memory. It reproduces 30 retained workers in the old readers, then performs 341 iterations through each of the three corrected readers (1,023 successful reads), plus three malformed-document cases. All workers must close and the test page must still respond after completion. No customer data or production database is used.

This is a resource stress test, not a new end-to-end audit of the customer's 341 PDFs. Full real-document audits remain required for changes to extraction rules.

The byte-for-byte baseline check documents the narrow scope of this fix. An intentional future change to a protected function needs its own regression evidence and a reviewed update of that assertion; do not remove assertions simply to make CI green.
