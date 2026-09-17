from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'No se encontro el bloque esperado en {path}')
    if text.count(old) != 1:
        raise SystemExit(f'El bloque esperado aparece {text.count(old)} veces en {path}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'app.js',
    "const PARSER_VERSION='2026.09.17.2';window.IBT_PARSER_VERSION=PARSER_VERSION;",
    "const PARSER_VERSION='2026.09.17.3';window.IBT_PARSER_VERSION=PARSER_VERSION;",
)
replace_once(
    'app.js',
    " const labels=[...text.matchAll(/\\bP([1-6])\\s*:/g)].map(m=>Number(m[1]));\n const complete=entries.length>0&&entries.length===labels.length;",
    " const labels=[...text.matchAll(/\\bP([1-6])\\s*:/g)].map(m=>Number(m[1])),uniqueLabels=[...new Set(labels)];\n const complete=entries.length>0&&entries.length===uniqueLabels.length;",
)

replace_once(
    'xtra-history.js',
    "const labels=[...text.matchAll(/\\bP([1-6])\\s*:/g)].map(m=>Number(m[1]));\nconst sum=round2(entries.reduce((s,e)=>s+e.amount,0));",
    "const labels=[...text.matchAll(/\\bP([1-6])\\s*:/g)].map(m=>Number(m[1])),uniqueLabels=[...new Set(labels)];\nconst sum=round2(entries.reduce((s,e)=>s+e.amount,0));",
)
replace_once(
    'xtra-history.js',
    "const reliable=entries.length>0&&entries.length===labels.length&&subtotals.length<=1&&(printed==null||Math.abs(printed-sum)<=bound);",
    "const reliable=entries.length>0&&entries.length===uniqueLabels.length&&subtotals.length<=1&&(printed==null||Math.abs(printed-sum)<=bound);",
)

replace_once(
    'tests/power-regression.test.cjs',
    "test('reads a formula before its Pn label, without using the subtotal as P1', () => {\n  const input = six.flatMap((r, i) => [r.replace(/^P\\d: /, ''), `P${i+1}:`]);\n  input[1] += ` 21,00 ${euro}`;\n  check(input, 21);\n});",
    "test('reads a formula before its Pn label, without using the subtotal as P1', () => {\n  const input = six.flatMap((r, i) => [r.replace(/^P\\d: /, ''), `P${i+1}:`]);\n  input[1] += ` 21,00 ${euro}`;\n  check(input, 21);\n});\ntest('duplicate OCR period labels do not invalidate six complete power amounts', () => {\n  const input = six.flatMap((r, i) => [r, `P${i+1}:`]);\n  check(input, 21);\n});",
)

replace_once(
    'tests/xtra-completeness.test.cjs',
    "vm.runInContext(beforePdf+'\\nglobalThis.api={status,euros,excessRows,reactiveRows,taxRows,rightsDetail};',ctx);",
    "vm.runInContext(beforePdf+'\\nglobalThis.api={status,euros,powerDetails,excessRows,reactiveRows,taxRows,rightsDetail};',ctx);",
)
replace_once(
    'tests/xtra-completeness.test.cjs',
    "test('Period excess detail keeps measured kW, unit price and exact amount',()=>{",
    "test('Historical power parser ignores duplicate OCR period labels when all six billed amounts exist',()=>{\n const amounts=['50,80','26,47','11,17','9,69','6,27','3,60'];\n const lines=amounts.flatMap((amount,i)=>[`P${i+1}: 70,000 kW x 13 dias = ${amount} €`,`P${i+1}:`]);\n const detail=plain(ctx.api.powerDetails(lines));\n assert.equal(detail.reliable,true);\n assert.equal(detail.value,108);\n});\ntest('Period excess detail keeps measured kW, unit price and exact amount',()=>{",
)

replace_once(
    'tests/pdf-lifecycle.test.cjs',
    " const current=source('app.js'),parserSnapshot=at(PARSER_BASE,'app.js');\n assert.equal(slice(current,'const find=','const reading='),slice(parserSnapshot,'const find=','const reading='));",
    " const current=source('app.js'),parserSnapshot=at(PARSER_BASE,'app.js');\n const parserExpected=slice(parserSnapshot,'const find=','const reading=').replace(\n  \" const labels=[...text.matchAll(/\\\\bP([1-6])\\\\s*:/g)].map(m=>Number(m[1]));\\n const complete=entries.length>0&&entries.length===labels.length;\",\n  \" const labels=[...text.matchAll(/\\\\bP([1-6])\\\\s*:/g)].map(m=>Number(m[1])),uniqueLabels=[...new Set(labels)];\\n const complete=entries.length>0&&entries.length===uniqueLabels.length;\"\n );\n assert.equal(slice(current,'const find=','const reading='),parserExpected);",
)

replace_once(
    'client-report-export.js',
    "if(!rows.length)throw new Error('No hay facturas procesadas');",
    "if(!rows.length)throw new Error('No hay facturas validadas (CORRECTA + Cuadre OK)');",
)

replace_once(
    'auth-bootstrap.js',
    "script.src='xtra-history.js?v=20260917-fenieocr1';",
    "script.src='xtra-history.js?v=20260917-powerlabels1';",
)

replace_once(
    'index.html',
    "client-report-export.js?v=20260917-validated1",
    "client-report-export.js?v=20260917-validated2",
)
replace_once(
    'index.html',
    "app.js?v=20260917-fenieocr2",
    "app.js?v=20260917-powerlabels1",
)
replace_once(
    'index.html',
    "auth-bootstrap.js?v=20260917-fenieocr1",
    "auth-bootstrap.js?v=20260917-powerlabels1",
)

print('Parche aplicado correctamente')
