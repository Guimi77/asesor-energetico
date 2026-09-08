# Historical recommendations: initial read-only version

These are automatic prompts for technical review, not approved advice, executed changes or forecasts. They are derived exclusively from the historical records already authorized and loaded by the existing history screen. A filter change renders new prompts from that selection. No PDFs are reopened and no additional Supabase requests, timers or observers are introduced. No recommendations are saved or approved by this initial module.

Rules: separate excess/reactive concept balances including credits of the same concept; a zero-consumption check for at least two comparable billing periods; a conservative power study prompt for 3.0TD/6.x with at least three comparable non-overlapping periods, 80 covered days, unchanged six-period powers and tariff, reliable demand in all six periods, no excesses or unknown excess values, and a nonzero maximum demand at most 50% of contracted power in one or more periods. The 3/80/50 values are internal screening choices, not legal thresholds. 2.0TD is deliberately excluded from this six-period demand heuristic. Missing or ambiguous readings never become zero. Power-study amounts and recommended kW remain unknown. Credits/regularizations recorded under other concepts require manual review. Past charges must never be labeled guaranteed savings.

Technical background, not a source for the internal screening thresholds:
- Feníe Energía, optimization of power: https://www.fenieenergia.es/es/sobre-fenie/actualidad/como-hacer-una-optimizacion-de-potencia
- Feníe Energía, reactive compensation: https://www.fenieenergia.es/es/empresas/eficiencia-energetica/compensacion-reactiva
- CNMC, Entiende tu factura and annual contracted/demanded power comparison: https://www.cnmc.es/prensa/entiende-tu-factura-20231002

Run `node --test tests/history-recommendations.test.cjs` and `node tests/history-recommendations-browser.cjs` (Playwright 1.51.1 with Chromium). Test data is synthetic. Tests cover scope filtering, invalid/missing values, credits, repeated IDs, power comparability, HTML escaping, preservation of baseline modules, 341-row UI behavior and isolation from recommendation failures. They do not re-audit the private 341 PDFs or test production RLS.
