# Historical chart coverage and readable axes

Baseline: 7bc762dc72f59662b0f4d4acc78d05ecf22c4caa.

Only the chart presentation changes. The existing monthly numeric aggregation is retained; a presentation layer adds the count of distinct supply IDs and billing records per ending month. Multiple records from one supply count once for coverage. Missing calendar months and invalid numeric measures are null, never measured zero. Cost has no point when consumption is absent/non-positive; a genuine zero cost with positive consumption stays visible. Totals from complete records are not altered or prorated.

A native expandable coverage table gives the exact monthly figures and the denominator of selected supplies. Changes in supply identity trigger the warning even with equal counts. Coverage refers only to presence of billing records, not to operational status, complete calendar months or comparable billed days. Each record still belongs to its billing-end month. No matched-cohort comparison mode is implemented in this presentation-only change.

Axes reserve text space instead of clipping leading digits. Coverage tooltips and a visible warning prevent a partial group history being mistaken for a whole-group comparison. No new query, observer, timer, storage or PDF processing is introduced. The original parser, resource cleanup, auth, recommendations and both Excel exporters remain byte-for-byte unchanged.

The older chart test's literal presentation snapshot is deliberately narrowed only for the two reviewed chart functions; unchanged aggregation, fetching, identity, events and source detail are still compared to the baseline. Existing behavioral tests for the third chart, cost gaps, repeated reload, filters, recommendations and actual Excel downloads are retained. New tests cover coverage, zero versus missing, exact sums, negative amounts, invalid values and SVG bounding boxes at five screen widths. All UI data is synthetic; these are not production RLS or real-PDF audit tests.
