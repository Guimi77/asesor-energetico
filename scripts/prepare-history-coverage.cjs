'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
function edit(file,old,next){const s=fs.readFileSync(file,'utf8');assert.equal(s.split(old).length,2,'Missing or repeated target: '+file);fs.writeFileSync(file,s.replace(old,()=>next));}
let ui=fs.readFileSync('history-ui.js','utf8');
const a=ui.indexOf('  function svgChart('),b=ui.indexOf('  // Rendered with the other charts',a);
assert(a>0&&b>a);ui=ui.slice(0,a)+fs.readFileSync('scripts/history-coverage-functions.txt','utf8')+ui.slice(b);
const c=ui.indexOf('  function svgCostChart('),d=ui.indexOf('  function powerSignature',c);
let cost=ui.slice(c,d);
assert(cost.includes('padL=68,padR=12'));cost=cost.replace('padL=68,padR=12','padL=106,padR=40');
cost=cost.replace(/font-size="10"/g,'font-size="11"');
cost=cost.replace("const dots=coords.map(c=>c.y===null?", "const dots=coords.map(c=>c.y===null?");
// Cost arithmetic and zero-consumption behavior remain unchanged; improve the tooltip only.
const old="esc(qty(c.value,4))+' \u20ac/kWh</title></circle>'";
const next="esc(qty(c.value,4))+' \u20ac/kWh'+(Number.isInteger(c.p.supplies)?' \u00b7 '+c.p.supplies+' CUPS con registros \u00b7 '+c.p.records+' periodo(s)':'')+'</title></circle>'";
assert(cost.includes(old));cost=cost.replace(old,()=>next);ui=ui.slice(0,c)+cost+ui.slice(d);
fs.writeFileSync('history-ui.js',ui);
edit('history-ui.js','    const monthly = aggregateMonthly(records);',"    const monthly = chartMonthly(records, $('#historyFrom')?.value, $('#historyTo')?.value);");
const marker='      <section class="card">\n        <div class="history-section-head"><div><p class="eyebrow">Cronolog';
edit('history-ui.js',marker,'      ${renderChartCoverage(monthly, state.currentSupply ? 1 : visibleSupplies().length)}\n'+marker);
const css='.history-coverage{margin:16px 0;padding:16px;border:1px solid #dce4ed;border-radius:12px;background:#fff}.history-coverage-warning{border-left:4px solid #b58232;background:#fffcf6}.history-coverage>strong{font-size:15px;color:#10233f}.history-coverage p{font-size:13px;line-height:1.5;margin:8px 0}.history-coverage summary{cursor:pointer;color:#1834b8;font-size:13px;font-weight:700;padding:6px 0}.history-coverage summary:focus-visible{outline:2px solid #1834b8}.history-coverage-table{margin-top:8px;min-width:580px}.history-coverage-table td{white-space:nowrap}.history-coverage .history-scope{font-size:12px}';
edit('history-ui.js','      @media(min-width:1400px)', '      '+css+'\n      @media(min-width:1400px)');
edit('auth-bootstrap.js','history-ui.js?v=20260908-export1','history-ui.js?v=20260908-coverage1');
edit('index.html','auth-bootstrap.js?v=20260908-export1','auth-bootstrap.js?v=20260908-coverage1');
// Replace only the reviewed presentation snapshot. Preserve all functional chart tests and unrelated module assertions.
const test='tests/history-chart-refresh.test.cjs';
const oldBlock=" for(const [a,b] of [['  function supplyById','  function powerSignature'],['  function powerSignature','  function renderRecommendations']]){\n  let actual=chunk(ui,a,b);if(a.includes('supplyById'))actual=actual.replace(/  \\/\\/ Rendered with the other charts[\\s\\S]*$/,'');\n  assert.equal(actual,chunk(old('history-ui.js'),a,b));\n }";
const newBlock=" // Reviewed coverage presentation change: totals, identity, observed changes and detail remain byte-for-byte unchanged.\n // The two plot renderers now have dedicated clipping, missing-data and coverage tests.\n assert.equal(chunk(ui,'  function supplyById','  // Coverage presentation'),chunk(old('history-ui.js'),'  function supplyById','  function svgChart'));\n assert.equal(chunk(ui,'  function powerSignature','  function renderRecommendations'),chunk(old('history-ui.js'),'  function powerSignature','  function renderRecommendations'));";
edit(test,oldBlock,newBlock);
console.log('Prepared only chart presentation, coverage and loader version changes. No parser, database, auth or exporter changes.');
