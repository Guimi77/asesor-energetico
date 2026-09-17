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


# Trace the production parser version without changing the locked FENIE
# calculation block itself.
replace_once(
    'app.js',
    "const PARSER_VERSION='2026.09.17.1';",
    "const PARSER_VERSION='2026.09.17.2';",
)

# For image-first FENIE invoices, page 1 comes from OCR but later pages may
# still contain native PDF text. Canonicalise identity tokens in the OCR text
# from those later native pages before the existing parser sees page 1. This
# avoids OCR confusions such as O/0 creating a duplicate CUPS while leaving the
# existing, regression-locked FENIE calculations untouched.
replace_once(
    'fenie-ocr-fallback.js',
    "  function mergeOcrText(data,ocrText){\n    const lines=String(ocrText||'').split(/\\r?\\n/).map(v=>text(v)).filter(Boolean);\n",
    "  function mergeOcrText(data,ocrText){\n    const later=laterText(data);\n    const nativeCups=(later.match(/\\bES[A-Z0-9]{16,24}\\b/i)||[])[0]||'';\n    const nativeTariff=(later.match(/\\b(?:2\\.0TD|3\\.0TD|6\\.[1-4]TD)\\b/i)||[])[0]||'';\n    let normalized=String(ocrText||'');\n    if(nativeCups&&/\\bES[A-Z0-9]{16,24}\\b/i.test(normalized))normalized=normalized.replace(/\\bES[A-Z0-9]{16,24}\\b/i,nativeCups);\n    if(nativeTariff&&/\\b(?:2\\.0TD|3\\.0TD|6\\.[1-4]TD)\\b/i.test(normalized))normalized=normalized.replace(/\\b(?:2\\.0TD|3\\.0TD|6\\.[1-4]TD)\\b/i,nativeTariff);\n    const lines=normalized.split(/\\r?\\n/).map(v=>text(v)).filter(Boolean);\n",
)

# A client workbook is a presentation layer. It must not reintroduce a row
# already marked ERROR / REVISAR by the parser. The internal report deliberately
# retains those rows for diagnosis.
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
    'tests/fenie-ocr-fallback.test.cjs',
    "OCR identity uses native later-page CUPS",
    r"""
test('OCR identity uses native later-page CUPS and tariff before parsing',()=>{
  const d=special();
  const out=api.mergeOcrText(d,'FENIE ENERGIA\nCUPS: ES0031500123456789ABOF\nTarifa: 2.0TD\nTOTAL FACTURA 120,00 €');
  const first=out.pages[0].join(' ');
  assert.match(first,/ES0031500123456789AB0F/);
  assert.doesNotMatch(first,/ES0031500123456789ABOF/);
  assert.match(first,/Tarifa: 3\.0TD/);
});
""",
)
