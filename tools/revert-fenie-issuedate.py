from pathlib import Path
p=Path('app.js')
s=p.read_text(encoding='utf-8')
old=",period=((find(a,/Periodo Facturaci[oó]n:/i).match(/\\d{2}\\/\\d{2}\\/\\d{4}\\s*-\\s*\\d{2}\\/\\d{2}\\/\\d{4}(?:\\s*\\(\\d+\\s*d[ií]as\\))?/i)||[])[0])||'Por identificar',issueDate=(()=>{const m=find(a,/Fecha de Factura\\s*:/i).match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:''})(),total=lastEuro(find(a,/TOTAL FACTURA/i));"
new=",period=((find(a,/Periodo Facturaci[oó]n:/i).match(/\\d{2}\\/\\d{2}\\/\\d{4}\\s*-\\s*\\d{2}\\/\\d{2}\\/\\d{4}(?:\\s*\\(\\d+\\s*d[ií]as\\))?/i)||[])[0])||'Por identificar',total=lastEuro(find(a,/TOTAL FACTURA/i));"
if s.count(old)!=1:
    raise SystemExit(f'expected one FENIE issueDate declaration, found {s.count(old)}')
s=s.replace(old,new,1)
old2="company:company||'Por identificar',cups,period,issueDate,tariff,kwh,energy,power,"
new2="company:company||'Por identificar',cups,period,tariff,kwh,energy,power,"
if s.count(old2)!=1:
    raise SystemExit(f'expected one FENIE issueDate return, found {s.count(old2)}')
s=s.replace(old2,new2,1)
p.write_text(s,encoding='utf-8')
