from pathlib import Path

p=Path('index.html')
text=p.read_text(encoding='utf-8')
changes={
    'client-report-export.js?v=20260915-summary1':'client-report-export.js?v=20260917-validated1',
    'fenie-ocr-fallback.js?v=20260917-1':'fenie-ocr-fallback.js?v=20260917-2',
    'app.js?v=20260917-fenieocr1':'app.js?v=20260917-fenieocr2',
}
for old,new in changes.items():
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f'index.html: missing cache-bust anchor {old!r}')
    text=text.replace(old,new,1)
p.write_text(text,encoding='utf-8')
