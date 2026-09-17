from pathlib import Path
import re


def replace_once(path, old, new):
    p=Path(path)
    text=p.read_text(encoding='utf-8')
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{path}: expected exactly one match, got {count}: {old[:120]!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')


app=Path('app.js')
text=app.read_text(encoding='utf-8')
if "import './invoice-supersession.js?v=20260917-1';" not in text:
    text=text.replace(
        "import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';\n",
        "import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';\nimport './invoice-supersession.js?v=20260917-1';\n",
        1,
    )
text=text.replace("const PARSER_VERSION='2026.09.17.4';","const PARSER_VERSION='2026.09.17.5';",1)
text=text.replace(
    ",period=((find(a,/Periodo Facturaci[oó]n:/i).match(/\\d{2}\\/\\d{2}\\/\\d{4}\\s*-\\s*\\d{2}\\/\\d{2}\\/\\d{4}(?:\\s*\\(\\d+\\s*d[ií]as\\))?/i)||[])[0])||'Por identificar',total=lastEuro(find(a,/TOTAL FACTURA/i));",
    ",period=((find(a,/Periodo Facturaci[oó]n:/i).match(/\\d{2}\\/\\d{2}\\/\\d{4}\\s*-\\s*\\d{2}\\/\\d{2}\\/\\d{4}(?:\\s*\\(\\d+\\s*d[ií]as\\))?/i)||[])[0])||'Por identificar',issueDate=(()=>{const m=find(a,/Fecha de Factura\\s*:/i).match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:''})(),total=lastEuro(find(a,/TOTAL FACTURA/i));",
    1,
)
text=text.replace(
    "company:company||'Por identificar',cups,period,tariff,kwh,energy,power,",
    "company:company||'Por identificar',cups,period,issueDate,tariff,kwh,energy,power,",
    1,
)
old_process="async function process(files){for(const file of [...files]){if(!file.name.toLowerCase().endsWith('.pdf'))continue;try{const r=await parseInvoiceFile(file),k=cleanKey(r.invoiceNumber);if(!(k&&k!==cleanKey('Por identificar')&&rows.some(x=>cleanKey(x.invoiceNumber)===k)))rows.push(r)}catch(e){console.warn('Error leyendo',file.name,e)}render()}}"
new_process="async function process(files){for(const file of [...files]){if(!file.name.toLowerCase().endsWith('.pdf'))continue;try{const r=await parseInvoiceFile(file),k=cleanKey(r.invoiceNumber);if(!(k&&k!==cleanKey('Por identificar')&&rows.some(x=>cleanKey(x.invoiceNumber)===k)))rows.push(r);window.IBTInvoiceSupersession?.reconcile?.(rows)}catch(e){console.warn('Error leyendo',file.name,e)}render()}}"
if old_process not in text:
    raise SystemExit('app.js: process() signature changed')
text=text.replace(old_process,new_process,1)

render_match=re.search(r"function render\(\)\{.*?\}\nconst XL=",text,re.S)
if not render_match:
    raise SystemExit('app.js: render() block not found')
new_render="""function activeRows(){const result=window.IBTInvoiceSupersession?.reconcile?.(rows);return result?.active||rows.filter(r=>!r?.superseded)}
function render(){
 const active=activeRows(),visible=[...rows].sort((a,b)=>Number(!!a.superseded)-Number(!!b.superseded)),b=$('#resultsBody');
 b.innerHTML=rows.length?'':'<tr class=\"empty\"><td colspan=\"16\">Aún no hay facturas procesadas.</td></tr>';
 for(const r of visible){
  const tr=document.createElement('tr'),superseded=!!r.superseded,possible=!!r.possibleSupersession;
  const diagnostic=superseded?`Refacturación detectada: sustituida por la factura ${r.supersededBy}. No se suma, no se exporta y no entra en histórico.`:possible?'Posible refacturación: mismo CUPS, periodo y consumo, pero no se puede determinar con seguridad cuál es posterior. Revisar antes de consolidar.':(!r.readOk&&r.readMessage?`Motivo del error: ${r.readMessage}`:r.opportunity);
  if(r.unsupported){tr.innerHTML=`<td><span class=\"status danger\">No compatible</span></td><td>${r.company}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td class=\"opp\">${diagnostic}</td>`}
  else{const statusClass=superseded?'review':r.readOk?'ok':'danger',statusLabel=superseded?'Sustituida':r.readOk?'Correcta':'Error';tr.innerHTML=`<td><span class=\"status ${statusClass}\" title=\"${superseded?diagnostic:(r.readMessage||'')}\">${statusLabel}</span></td><td>${r.company}</td><td>${r.cups||'—'}</td><td>${r.period}</td><td>${r.tariff}</td><td>${money(r.kwh)}</td><td>${money(r.energy)}</td><td>${money(r.power)}</td><td>${money(r.excess)}</td><td>${money(r.reactive)}</td><td>${money(r.other+r.compensation+r.distributorCharges)}</td><td>${money(r.tax+r.vat+r.igic)}</td><td><strong>${money(r.total)}</strong></td><td><strong>${r.total?(r.balanced?'OK':money(r.diff)+' €'):'—'}</strong></td><td>${r.avg?money(r.avg):'—'}</td><td class=\"opp\">${diagnostic}</td>`}
  b.appendChild(tr)
 }
 $('#statInvoices').textContent=active.length;$('#statOk').textContent=active.filter(r=>r.readOk).length;$('#statReview').textContent=active.filter(r=>!r.readOk).length;$('#statKwh').textContent=money(active.reduce((s,r)=>s+(Number.isFinite(Number(r.kwh))?Number(r.kwh):0),0))+' kWh';$('#statTotal').textContent=money(active.reduce((s,r)=>s+(Number.isFinite(Number(r.total))?Number(r.total):0),0))+' €';$('#exportExcel').disabled=!active.length
}
const XL="""
text=text[:render_match.start()]+new_render+text[render_match.end():]

export_match=re.search(r"function exportExcel\(\)\{.*?\}\nconst dz=",text,re.S)
if not export_match:
    raise SystemExit('app.js: exportExcel() block not found')
original=export_match.group(0)[:-len('\nconst dz=')]
patched=re.sub(r'\brows\b','exportRows',original)
patched=patched.replace('function exportExcel(){','function exportExcel(){const exportRows=activeRows();',1)
text=text[:export_match.start()]+patched+'\nconst dz='+text[export_match.end():]
text=text.replace(
    "const diagnosticFor=r=>!r.readOk&&r.readMessage?`Motivo del error: ${r.readMessage}`:r.opportunity;",
    "const diagnosticFor=r=>r.superseded?`Refacturación detectada: sustituida por la factura ${r.supersededBy}. No se suma ni se exporta.`:r.possibleSupersession?'Posible refacturación: revisar antes de consolidar.':!r.readOk&&r.readMessage?`Motivo del error: ${r.readMessage}`:r.opportunity;",
    1,
)
app.write_text(text,encoding='utf-8')

replace_once('index.html','app.js?v=20260917-powerlabels2','app.js?v=20260917-refact1')

wf=Path('.github/workflows/parser-regression.yml')
w=wf.read_text(encoding='utf-8')
w=w.replace("'app.js', 'fenie-ocr-fallback.js'","'app.js', 'invoice-supersession.js', 'fenie-ocr-fallback.js'")
w=w.replace('          node --check app.js\n','          node --check app.js\n          node --check invoice-supersession.js\n',1)
w=w.replace('run: node --test tests/power-regression.test.cjs ','run: node --test tests/invoice-supersession.test.cjs tests/power-regression.test.cjs ',1)
wf.write_text(w,encoding='utf-8')
