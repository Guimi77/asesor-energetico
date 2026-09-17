from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')


# Main parser: a known tariff gives the expected number of billed power formulas.
# OCR may lose or duplicate Pn labels, but it must not lose any billed formula.
replace_once('app.js', "const PARSER_VERSION='2026.09.17.3';", "const PARSER_VERSION='2026.09.17.4';")
replace_once('app.js', 'function powerSectionDetails(a){', 'function powerSectionDetails(a,expectedPeriods=0){')
replace_once(
    'app.js',
    " const complete=entries.length>0&&entries.length===uniqueLabels.length;",
    " const expected=Number(expectedPeriods)||0;\n const complete=entries.length>0&&(expected?entries.length===expected:entries.length===uniqueLabels.length);"
)
replace_once(
    'app.js',
    "const powerDetail=powerSectionDetails(ps),power=powerDetail.value,excess=sectionTotal(section(a,/Excesos? de Potencia/i,[/Energ[ií]a reactiva/i,/Bono social/i,/Impuesto electricidad/i]))",
    "const expectedPowerPeriods=/^2\\.0TD$/i.test(tariff)?2:/^(?:3\\.0TD|6\\.[1-4]TD)$/i.test(tariff)?6:0,powerDetail=powerSectionDetails(ps,expectedPowerPeriods);if(powerDetail.reliable&&expectedPowerPeriods&&powerDetail.entries.length===expectedPowerPeriods)for(let p=1;p<=expectedPowerPeriods;p++)if(contracted[`P${p}`]==null)contracted[`P${p}`]=powerDetail.entries[p-1].contractedKw;const power=powerDetail.value,excess=sectionTotal(section(a,/Excesos? de Potencia/i,[/Energ[ií]a reactiva/i,/Bono social/i,/Impuesto electricidad/i]))"
)
replace_once('app.js', "script.src='xtra-history.js?v=20260917-powerlabels1';", "script.src='xtra-history.js?v=20260917-powerlabels2';")

# Historical parser uses the same rule and restores period numbering by document order
# only when the expected formula count is complete and therefore reliable.
replace_once('xtra-history.js', 'function powerDetails(a){', 'function powerDetails(a,expectedPeriods=0){')
replace_once(
    'xtra-history.js',
    "const reliable=entries.length>0&&entries.length===uniqueLabels.length&&subtotals.length<=1&&(printed==null||Math.abs(printed-sum)<=bound);",
    "const expected=Number(expectedPeriods)||0;\nconst reliable=entries.length>0&&(expected?entries.length===expected:entries.length===uniqueLabels.length)&&subtotals.length<=1&&(printed==null||Math.abs(printed-sum)<=bound);"
)
replace_once(
    'xtra-history.js',
    "const ps=section(a,/T[eé]rmino de potencia/i,[/Excesos? de Potencia/i,/Energ[ií]a reactiva/i,/Bono social/i]),pd=powerDetails(ps),power=pd.value;",
    "const ps=section(a,/T[eé]rmino de potencia/i,[/Excesos? de Potencia/i,/Energ[ií]a reactiva/i,/Bono social/i]),expectedPowerPeriods=/^2\\.0TD$/i.test(tariff)?2:/^(?:3\\.0TD|6\\.[1-4]TD)$/i.test(tariff)?6:0,pd=powerDetails(ps,expectedPowerPeriods),power=pd.value;"
)
replace_once(
    'xtra-history.js',
    "const periodNo=pd.labels[i],line=prow(ps,periodNo),pr=[...line.matchAll(/([\\d.,]+)\\s*€\\s*\\/\\s*kW\\s*d[ií]a/gi)].map(m=>num(m[1]));if(pr.length<4)powerPricesReliable=false;",
    "const periodNo=expectedPowerPeriods?i+1:(pd.labels[i]||i+1),line=prow(ps,periodNo),pr=[...line.matchAll(/([\\d.,]+)\\s*€\\s*\\/\\s*kW\\s*d[ií]a/gi)].map(m=>num(m[1]));if(pr.length<4)powerPricesReliable=false;"
)

# Audit must never show a fully green result while the main parser itself marked a row ERROR/REVISAR.
replace_once(
    'parser-audit.js',
    "    const add=(type,msg,severity='REVISAR')=>issues.push([severity,invoice,company,cups,period,tariff,type,msg]);\n    const idGood=",
    "    const add=(type,msg,severity='REVISAR')=>issues.push([severity,invoice,company,cups,period,tariff,type,msg]);\n    const parserStatus=txt(r[0]);if(!/^CORRECTA$/i.test(parserStatus))add('ESTADO PARSER',`La fila está marcada como ${parserStatus||'SIN ESTADO'} por el parser principal.`, 'ERROR');\n    const idGood="
)

# Regression: missing OCR labels are allowed only when all expected formulas are still present.
p = Path('tests/power-regression.test.cjs')
text = p.read_text(encoding='utf-8')
old = "function check(lines, expected, reliable = true) {\n  const input = lines.slice();\n  const got = read(input);"
new = "function check(lines, expected, reliable = true, expectedPeriods = 0) {\n  const input = lines.slice();\n  const got = read(input, expectedPeriods);"
if text.count(old) != 1:
    raise SystemExit('tests/power-regression.test.cjs: check helper mismatch')
text = text.replace(old, new)
anchor = "test('duplicate OCR period labels do not invalidate six complete power amounts', () => {\n  const input = six.flatMap((r, i) => [r, `P${i+1}:`]);\n  check(input, 21);\n});\n"
insert = anchor + "test('3.0TD OCR may lose P4/P5 labels when all six billed power formulas remain', () => {\n  const amounts=['50,80','26,47','11,17','9,69','6,27','3,60'];\n  const input=amounts.map((amount,i)=>`${[0,1,2,5].includes(i)?`P${i+1}: `:''}70,000 kW x 13 dias = ${amount} ${euro}`);\n  check(input,108,true,6);\n});\ntest('3.0TD expected period count stays fail-closed when a billed power formula is really missing', () => {\n  const amounts=['50,80','26,47','11,17','9,69','6,27'];\n  const input=amounts.map((amount,i)=>`P${i+1}: 70,000 kW x 13 dias = ${amount} ${euro}`);\n  check(input,104.4,false,6);\n});\ntest('FENIE 3.0TD restores missing contracted P4/P5 labels from six ordered formulas', () => {\n  const amounts=['50,80','26,47','11,17','9,69','6,27','3,60'];\n  const powerRows=amounts.map((amount,i)=>`${[0,1,2,5].includes(i)?`P${i+1}: `:''}70,000 kW x 13 dias = ${amount} ${euro}`);\n  const page=['Razón Social: CLIENTE SINTETICO','CUPS: ES123456789012345678','Tarifa: 3.0TD','Periodo Facturación: 01/01/2026 - 13/01/2026 (13 días)','Término de energía','Término de potencia',...powerRows,'Excesos de Potencia',`TOTAL FACTURA 108,00 ${euro}`];\n  const parsed=ctx.check.parseFenie({pages:[page],rawPages:[[],[]],text:page.join('\\n')},{name:'synthetic.pdf'});\n  assert.equal(parsed.powerDetail.reliable,true);\n  assert.equal(parsed.power,108);\n  assert.equal(parsed.readOk,true);\n  for(let p=1;p<=6;p++)assert.equal(parsed.contracted[`P${p}`],70);\n});\n"
if text.count(anchor) != 1:
    raise SystemExit('tests/power-regression.test.cjs: duplicate-label anchor mismatch')
text = text.replace(anchor, insert)
# A green audit may not hide a main-parser ERROR row.
if "const auditSource=" not in text:
    text = text.replace("const source = fs.readFileSync(appPath, 'utf8');", "const source = fs.readFileSync(appPath, 'utf8');\nconst auditSource = fs.readFileSync(path.join(root, 'parser-audit.js'), 'utf8');")
    text += "\ntest('parser audit surfaces rows rejected by the main parser', () => {\n  assert.match(auditSource,/ESTADO PARSER/);\n  assert.match(auditSource,/\\^CORRECTA\\$/);\n});\n"
p.write_text(text, encoding='utf-8')

p = Path('tests/xtra-completeness.test.cjs')
text = p.read_text(encoding='utf-8')
anchor = "test('Historical power parser ignores duplicate OCR period labels when all six billed amounts exist',()=>{\n const amounts=['50,80','26,47','11,17','9,69','6,27','3,60'];\n const lines=amounts.flatMap((amount,i)=>[`P${i+1}: 70,000 kW x 13 dias = ${amount} €`,`P${i+1}:`]);\n const detail=plain(ctx.api.powerDetails(lines));\n assert.equal(detail.reliable,true);\n assert.equal(detail.value,108);\n});\n"
insert = anchor + "test('Historical FENIE 3.0TD accepts missing OCR labels only with all six billed formulas',()=>{\n const amounts=['50,80','26,47','11,17','9,69','6,27','3,60'];\n const lines=amounts.map((amount,i)=>`${[0,1,2,5].includes(i)?`P${i+1}: `:''}70,000 kW x 13 dias = ${amount} €`);\n const detail=plain(ctx.api.powerDetails(lines,6));\n assert.equal(detail.reliable,true);assert.equal(detail.value,108);\n const missing=plain(ctx.api.powerDetails(lines.slice(0,5),6));\n assert.equal(missing.reliable,false);\n assert(source.includes('powerDetails(ps,expectedPowerPeriods)'));\n assert(source.includes('periodNo=expectedPowerPeriods?i+1'));\n});\n"
if text.count(anchor) != 1:
    raise SystemExit('tests/xtra-completeness.test.cjs: history anchor mismatch')
p.write_text(text.replace(anchor, insert), encoding='utf-8')

# Force browsers to actually load the new parser and audit code.
replace_once('index.html', 'parser-audit.js?v=20260914-endesa2', 'parser-audit.js?v=20260917-status1')
replace_once('index.html', 'app.js?v=20260917-powerlabels1', 'app.js?v=20260917-powerlabels2')

print('Applied FENIE missing-label validation fix, history alignment, audit guard and regressions.')
