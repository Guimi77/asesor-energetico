from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def append_once(path, marker, block):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if marker in text:
        return
    if not text.endswith('\n'):
        text += '\n'
    p.write_text(text + '\n' + block.strip() + '\n', encoding='utf-8')


# Parser version: this change is deliberately narrow and makes the production
# output traceable when comparing exported audit files.
replace_once(
    'app.js',
    "const PARSER_VERSION='2026.09.17.1';",
    "const PARSER_VERSION='2026.09.17.2';",
)

# For image-first FENIE invoices, page 1 may be OCR while later pages still
# contain native PDF text. Identity fields should prefer that native text over
# OCR, so a typical OCR confusion such as 0/O cannot create a second CUPS.
replace_once(
    'app.js',
    "function parseFenie(d,file){const a=d.pages[0]||[],text=d.text,companyLine=",
    "function parseFenie(d,file){const a=d.pages[0]||[],text=d.text,laterText=(d.pages||[]).slice(1).flat().join('\\n'),companyLine=",
)
replace_once(
    'app.js',
    "cups=((find(a,/CUPS:/i).match(/ES[A-Z0-9]{16,24}/i)||text.match(/ES[A-Z0-9]{16,24}/i)||[])[0])||''",
    "cups=((laterText.match(/ES[A-Z0-9]{16,24}/i)||find(a,/CUPS:/i).match(/ES[A-Z0-9]{16,24}/i)||text.match(/ES[A-Z0-9]{16,24}/i)||[])[0])||''",
)
replace_once(
    'app.js',
    "tariff=((find(a,/Tarifa:/i).match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||text.match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||[])[1])||'—'",
    "tariff=((laterText.match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||find(a,/Tarifa:/i).match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||text.match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||[])[1])||'—'",
)

# Historical persistence must derive the same canonical CUPS/tariff as the
# visible parser. It already refuses non-CORRECTA / non-OK rows; this keeps the
# cross-check deterministic too.
replace_once(
    'xtra-history.js',
    "const a=d.pages[0]||[],text=d.text;\nconst reading=",
    "const a=d.pages[0]||[],text=d.text,laterText=(d.pages||[]).slice(1).flat().join('\\n');\nconst reading=",
)
replace_once(
    'xtra-history.js',
    "const cups=((find(a,/CUPS:/i).match(/ES[A-Z0-9]{16,24}/i)||text.match(/ES[A-Z0-9]{16,24}/i)||[])[0])||'';",
    "const cups=((laterText.match(/ES[A-Z0-9]{16,24}/i)||find(a,/CUPS:/i).match(/ES[A-Z0-9]{16,24}/i)||text.match(/ES[A-Z0-9]{16,24}/i)||[])[0])||'';",
)
replace_once(
    'xtra-history.js',
    "const tariff=((find(a,/Tarifa:/i).match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||text.match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||[])[1])||'';",
    "const tariff=((laterText.match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||find(a,/Tarifa:/i).match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||text.match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||[])[1])||'';",
)

# The client workbook is a presentation layer and must never reintroduce rows
# the parser explicitly marked ERROR / REVISAR. The internal report keeps them
# for diagnosis, but client totals, supplies and charts use validated rows only.
replace_once(
    'client-report-export.js',
    "const clean=v=>String(v??'').trim(),safe=v=>clean(v).replace(/[\\\\/:*?\"<>|]/g,'_').slice(0,80)||'EMPRESA';\n",
    "const clean=v=>String(v??'').trim(),safe=v=>clean(v).replace(/[\\\\/:*?\"<>|]/g,'_').slice(0,80)||'EMPRESA';\nfunction validClientRow(r){return clean(r?.[1])&&/^CORRECTA$/i.test(clean(r?.[0]))&&clean(r?.[18]).toUpperCase()==='OK'}\n",
)
replace_once(
    'client-report-export.js',
    "return sr.filter(r=>clean(r[1])).map(r=>",
    "return sr.filter(validClientRow).map(r=>",
)
replace_once(
    'client-report-export.js',
    "window.IBTClientReportExport=Object.freeze({monthKey,monthly,chartCoverage,rangeTag});",
    "window.IBTClientReportExport=Object.freeze({monthKey,monthly,chartCoverage,rangeTag,validClientRow});",
)

append_once(
    'tests/client-report-export.test.cjs',
    "Client report excludes parser ERROR and REVISAR rows",
    r"""
test('Client report excludes parser ERROR and REVISAR rows',()=>{
  const ok=Array(23).fill('');ok[0]='CORRECTA';ok[1]='INV-OK';ok[18]='OK';
  const error=[...ok];error[0]='ERROR';
  const review=[...ok];review[18]='REVISAR';
  assert.equal(api.validClientRow(ok),true);
  assert.equal(api.validClientRow(error),false);
  assert.equal(api.validClientRow(review),false);
});
""",
)

append_once(
    'tests/fenie-ocr-integration.test.cjs',
    "OCR identity prefers native later-page CUPS",
    r"""
test('OCR identity prefers native later-page CUPS and tariff',()=>{
  const app=read('app.js'),history=read('xtra-history.js');
  assert.match(app,/laterText=\(d\.pages\|\|\[\]\)\.slice\(1\)\.flat\(\)\.join\('\\n'\)/);
  assert.ok(app.includes("cups=((laterText.match(/ES[A-Z0-9]{16,24}/i)||find(a,/CUPS:/i)"));
  assert.ok(app.includes("tariff=((laterText.match(/(2\\.0TD|3\\.0TD|6\\.1TD|6\\.2TD|6\\.3TD|6\\.4TD)/i)||find(a,/Tarifa:/i)"));
  assert.ok(history.includes("const a=d.pages[0]||[],text=d.text,laterText=(d.pages||[]).slice(1).flat().join('\\n');"));
  assert.ok(history.includes("const cups=((laterText.match(/ES[A-Z0-9]{16,24}/i)||find(a,/CUPS:/i)"));
});
""",
)
