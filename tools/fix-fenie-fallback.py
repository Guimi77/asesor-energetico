from pathlib import Path
p=Path('fenie-ocr-fallback.js')
s=p.read_text()
old="""  function shouldAttempt(data){
    if(!data?.pages?.length||!isSparseFirstPage(data))return false;
    const complete=allText(data),later=laterText(data);
    if(isEndesa(complete))return false;
    const ev=fenieEvidence(later);
"""
new="""  function shouldAttempt(data){
    if(!data?.pages?.length||!isSparseFirstPage(data))return false;
    const first=pageText(data?.pages?.[0]),complete=allText(data),later=laterText(data);
    if(/FENIE\\s+ENERG[IÍ]A/i.test(first)||(/Raz[oó]n\\s+Social\\s*:/i.test(first)&&/Periodo\\s+Facturaci[oó]n\\s*:/i.test(first)&&/TOTAL\\s+FACTURA/i.test(first)))return false;
    if(isEndesa(complete))return false;
    const ev=fenieEvidence(later);
"""
if old not in s: raise SystemExit('Expected shouldAttempt block not found')
p.write_text(s.replace(old,new,1))
