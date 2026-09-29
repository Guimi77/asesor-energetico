(()=>{'use strict';
let auditMode=false;
const n=v=>Number(v)||0,txt=v=>String(v??'').trim(),has=v=>v!==''&&v!=null;
const MAX_DIAGNOSTIC_ROWS=10000;
const close=(a,b,t=.05)=>Math.abs(a-b)<=t;
const parserVersion=()=>String(window.IBT_PARSER_VERSION||'desconocida');
const expectedEnergyPeriods=tariff=>/^2\.0TD$/i.test(tariff)?3:/^(?:3\.0TD|6\.[1-4]TD)$/i.test(tariff)?6:0;
function getRows(wb,name){const ws=wb?.Sheets?.[name];return ws?XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''}).slice(3):[]}
function pdfJsDiagnosticItems(){try{return window.IBTParserDiagnostics?.items?.()||[]}catch{return[]}}
function pdfJsDiagnosticLines(){try{return window.IBTParserDiagnostics?.lines?.()||[]}catch{return[]}}
function diagnosticStats(){
 try{
  const s=window.IBTParserDiagnostics?.stats?.();
  if(s)return{pages:n(s.pages),items:n(s.items),lines:n(s.lines)};
 }catch{}
 return{pages:0,items:pdfJsDiagnosticItems().length,lines:pdfJsDiagnosticLines().length};
}
function issueInvoices(a){return[...new Set((a?.issues||[]).map(r=>txt(r?.[1])).filter(Boolean))]}
function diagnosticIssueStats(invoices){
 try{
  const s=window.IBTParserDiagnostics?.statsForInvoices?.(invoices);
  if(s)return{pages:n(s.pages),items:n(s.items),lines:n(s.lines)};
 }catch{}
 const wanted=new Set(invoices||[]);
 return{pages:0,items:pdfJsDiagnosticItems().filter(i=>wanted.has(txt(i.invoiceNumber))).length,lines:pdfJsDiagnosticLines().filter(i=>wanted.has(txt(i.invoiceNumber))).length};
}
function diagnosticSheetRows(invoices){
 let items=[];
 try{items=window.IBTParserDiagnostics?.itemsForInvoices?.(invoices,MAX_DIAGNOSTIC_ROWS)||[]}catch{}
 if(!items.length&&invoices?.length){
  const wanted=new Set(invoices);
  items=pdfJsDiagnosticItems().filter(i=>wanted.has(txt(i.invoiceNumber))).slice(0,MAX_DIAGNOSTIC_ROWS);
 }
 const header=['Archivo PDF','Nº factura parser','Formato parser','Versión parser','Página','Índice item PDF.js','Texto exacto','x','y','Ancho','Alto','hasEOL','dir','fontName','t0','t1','t2','t3','t4','t5','Ancho página','Alto página'];
 const rows=items.map(i=>[i.file,i.invoiceNumber,i.sourceFormat,i.parserVersion,i.page,i.index,i.text,i.x,i.y,i.width,i.height,i.hasEOL?'TRUE':'FALSE',i.dir,i.fontName,...Array.from({length:6},(_,n)=>Number(i.transform?.[n]??0)),i.pageWidth,i.pageHeight]);
 return{header,rows};
}
function diagnosticLineRows(invoices){
 let lines=[];
 try{lines=window.IBTParserDiagnostics?.linesForInvoices?.(invoices,MAX_DIAGNOSTIC_ROWS)||[]}catch{}
 if(!lines.length&&invoices?.length){
  const wanted=new Set(invoices);
  lines=pdfJsDiagnosticLines().filter(r=>wanted.has(txt(r.invoiceNumber))).slice(0,MAX_DIAGNOSTIC_ROWS);
 }
 return{header:['Archivo PDF','Nº factura parser','Formato parser','Versión parser','Página','Índice línea reconstruida','Texto de línea usado por la app'],rows:lines.map(r=>[r.file,r.invoiceNumber,r.sourceFormat,r.parserVersion,r.page,r.lineIndex,r.text])};
}
function auditWorkbook(wb){
  const summary=getRows(wb,'Resumen').filter(r=>txt(r[1]));
  const detail=getRows(wb,'Detalle P1-P6').filter(r=>txt(r[0]));
  const byInvoice=new Map(detail.map(r=>[txt(r[0]),r]));
  const issues=[];const issueDocuments=new Set();let supported=0,unsupported=0,identityOk=0,consumptionOk=0,energyOk=0,economicOk=0,periodOk=0;
  for(let rowIndex=0;rowIndex<summary.length;rowIndex++){
    const r=summary[rowIndex];
    const invoice=txt(r[1]),company=txt(r[2]),cups=txt(r[3]),period=txt(r[4]),tariff=txt(r[5]);
    const consumption=n(r[6]),energy=n(r[7]),power=n(r[8]),excess=n(r[9]),reactive=n(r[10]),comp=n(r[11]),other=n(r[12]),dist=n(r[13]),tax=n(r[14]),vat=n(r[15]),igic=n(r[16]),total=n(r[17]);
    const d=byInvoice.get(invoice)||[];
    const documentKey=`row:${rowIndex}`;
    const add=(type,msg,severity='REVISAR')=>{issues.push([severity,invoice,company,cups,period,tariff,type,msg]);issueDocuments.add(documentKey)};
    const parserStatus=txt(r[0]);
    if(/^NO\s+COMPATIBLE$/i.test(parserStatus)){
      unsupported++;
      add('DOCUMENTO NO COMPATIBLE','El documento está fuera de los formatos soportados. No se evalúa como fallo de identidad, consumo, energía, cuadre o periodos.','NO COMPATIBLE');
      continue;
    }
    supported++;
    if(!/^CORRECTA$/i.test(parserStatus))add('ESTADO PARSER',`La fila está marcada como ${parserStatus||'SIN ESTADO'} por el parser principal.`, 'ERROR');
    const idGood=!!invoice&&invoice!=='Por identificar'&&!!company&&!!cups&&/^ES[A-Z0-9]{16,24}$/i.test(cups)&&!!period&&period!=='Por identificar'&&!!tariff&&tariff!=='—'&&total>0;
    if(idGood)identityOk++; else add('IDENTIDAD','Falta o parece inválido algún dato esencial: nº factura, empresa, CUPS, periodo, tarifa o total.','ERROR');
    let pkwh=0,pcost=0,periodsGood=true,periodConsumptionCells=0,periodCostCells=0;
    const expectedPeriods=expectedEnergyPeriods(tariff);
    const hasAnyPeriodPrice=[1,2,3,4,5,6].some(p=>has(d[5+(p-1)*5+2]));
    const hasAnyPeriodCost=[1,2,3,4,5,6].some(p=>has(d[5+(p-1)*5+1]));
    for(let p=1;p<=6;p++){
      const o=5+(p-1)*5,rawK=d[o],rawCost=d[o+1],rawPrice=d[o+2],k=n(rawK),cost=n(rawCost),price=n(rawPrice);
      if(has(rawK))periodConsumptionCells++;
      if(has(rawCost))periodCostCells++;
      pkwh+=k;if(has(rawCost))pcost+=cost;
      if(k>0&&hasAnyPeriodPrice&&(!has(rawPrice)||price<=0)){periodsGood=false;add('PRECIO PERIODO',`P${p} tiene ${k.toFixed(2)} kWh pero el precio €/kWh informado no es válido.`)}
      if(/^2\.0TD$/i.test(tariff)&&p>=4&&(Math.abs(k)>.001||(has(rawCost)&&Math.abs(cost)>.001)||(has(rawPrice)&&Math.abs(price)>.000001))){periodsGood=false;add('PERIODO IMPOSIBLE',`Tarifa 2.0TD con datos en P${p}.`,'ERROR')}
    }
    if(periodsGood)periodOk++;
    const requiredConsumption=expectedPeriods||((consumption>0||energy>0)?1:0);
    const consumptionComplete=requiredConsumption?periodConsumptionCells>=requiredConsumption:periodConsumptionCells>0||consumption===0;
    if(!consumptionComplete){
      add('CONSUMO',`Faltan consumos por periodo: ${periodConsumptionCells}/${requiredConsumption||'?'} informados. No se acepta 0 kWh por ausencia de datos.`,'ERROR');
    }else if(close(pkwh,consumption,.1))consumptionOk++;
    else add('CONSUMO',`Suma P1-P6 = ${pkwh.toFixed(2)} kWh y consumo total = ${consumption.toFixed(2)} kWh.`,'ERROR');
    let energyGood=true;
    if(consumption>0&&energy<=0){energyGood=false;add('ENERGÍA €',`Hay ${consumption.toFixed(2)} kWh pero el término de energía no está informado o vale 0 €.`,'ERROR')}
    if(!/^2\.0TD$/i.test(tariff)&&expectedPeriods&&periodCostCells<expectedPeriods){energyGood=false;add('ENERGÍA €',`Faltan costes de energía por periodo: ${periodCostCells}/${expectedPeriods} informados.`,'ERROR')}
    if(energyGood&&hasAnyPeriodCost&&!close(pcost,energy,.1)){energyGood=false;add('ENERGÍA €',`Suma del coste por periodos = ${pcost.toFixed(2)} € y término energía = ${energy.toFixed(2)} €.`,'ERROR')}
    if(energyGood)energyOk++;
    const accounted=energy+power+excess+reactive+comp+other+dist+tax+vat+igic;
    if(Math.abs(Math.round((total-accounted)*100))<=5)economicOk++; else add('CUADRE ECONÓMICO',`Conceptos guardados = ${accounted.toFixed(2)} € y total factura = ${total.toFixed(2)} € (dif. ${(total-accounted).toFixed(2)} €).`,'ERROR');
    if(consumption===0&&energy!==0)add('COHERENCIA','Consumo 0 kWh con término de energía distinto de 0 €.');
    if(total>0&&power===0&&consumption===0)add('FACTURA SIN CONSUMO','Factura con importe y 0 kWh: comprobar que potencia/derechos/otros conceptos estén capturados.');
  }
  const total=summary.length,diagnostic=diagnosticStats();
  return{version:parserVersion(),total,supported,unsupported,issueDocuments:issueDocuments.size,identityOk,consumptionOk,energyOk,economicOk,periodOk,issues,diagnosticPages:diagnostic.pages,diagnosticItems:diagnostic.items,diagnosticLines:diagnostic.lines};
}
function auditBook(a){
  const wb=XLSX.utils.book_new();wb.Props={Comments:`Parser ${a.version}`};
  const pct=x=>a.supported?x/a.supported:0;
  const overview=[
    ['AUDITORÍA DEL PARSER · INSTAL·LACIONS BT'],
    [`Objetivo: detectar incoherencias antes de guardar histórico en Supabase · Parser ${a.version}`],
    ['Control','Correctas','Total','%'],
    ['Identidad esencial',a.identityOk,a.supported,pct(a.identityOk)],
    ['Consumo P1-P6 = consumo total',a.consumptionOk,a.supported,pct(a.consumptionOk)],
    ['Detalle energético coherente',a.energyOk,a.supported,pct(a.energyOk)],
    ['Cuadre económico completo',a.economicOk,a.supported,pct(a.economicOk)],
    ['Coherencia de periodos/tarifa',a.periodOk,a.supported,pct(a.periodOk)],
    [],
    ['Documentos procesados',a.total],
    ['Facturas compatibles',a.supported],
    ['Documentos no compatibles',a.unsupported],
    ['Documentos con incidencias',a.issueDocuments],
    ['Comprobaciones/incidencias',a.issues.length],
    ['Items PDF.js capturados',a.diagnosticItems],
    ['Líneas reconstruidas capturadas',a.diagnosticLines]
  ];
  const ws=XLSX.utils.aoa_to_sheet(overview);ws['!cols']=[{wch:42},{wch:12},{wch:12},{wch:12}];
  ['D4','D5','D6','D7','D8'].forEach(c=>{if(ws[c])ws[c].z='0.00%'});XLSX.utils.book_append_sheet(wb,ws,'Resumen auditoría');
  const ih=[['Severidad','Nº factura','Empresa','CUPS','Periodo','Tarifa','Control','Detalle'],...a.issues];
  const wi=XLSX.utils.aoa_to_sheet(ih);wi['!cols']=[{wch:12},{wch:20},{wch:32},{wch:27},{wch:25},{wch:10},{wch:24},{wch:80}];XLSX.utils.book_append_sheet(wb,wi,'Incidencias auditoría');
  const invoices=issueInvoices(a),issueStats=diagnosticIssueStats(invoices);
  const scope=invoices.length
    ? `Detalle bruto limitado a documentos con incidencias: ${a.issueDocuments} documento(s). Items ${issueStats.items}; líneas ${issueStats.lines}. Máximo ${MAX_DIAGNOSTIC_ROWS} filas por hoja.`
    : `Sin incidencias: se omite el detalle bruto PDF.js para evitar generar millones de celdas. Capturados en memoria: ${a.diagnosticItems} items y ${a.diagnosticLines} líneas.`;
  const di=diagnosticSheetRows(invoices),wdi=XLSX.utils.aoa_to_sheet([['ALCANCE DEL DIAGNÓSTICO',scope],[],di.header].concat(di.rows));
  wdi['!cols']=[{wch:34},{wch:22},{wch:14},{wch:18},{wch:8},{wch:14},{wch:90},{wch:12},{wch:12},{wch:12},{wch:12},{wch:10},{wch:10},{wch:18},...Array(6).fill({wch:12}),{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,wdi,'Diagnóstico PDF.js');
  const dl=diagnosticLineRows(invoices),wdl=XLSX.utils.aoa_to_sheet([['ALCANCE DEL DIAGNÓSTICO',scope],[],dl.header].concat(dl.rows));
  wdl['!cols']=[{wch:34},{wch:22},{wch:14},{wch:18},{wch:8},{wch:18},{wch:120}];
  XLSX.utils.book_append_sheet(wb,wdl,'Filas PDF.js');
  return wb;
}
function show(a){
  const bad=a.issues.length;
  const msg=`Auditoría terminada\n\nParser: ${a.version}\nDocumentos: ${a.total}\nCompatibles: ${a.supported}\nNo compatibles: ${a.unsupported}\nIdentidad: ${a.identityOk}/${a.supported}\nConsumos: ${a.consumptionOk}/${a.supported}\nEnergía: ${a.energyOk}/${a.supported}\nCuadre económico: ${a.economicOk}/${a.supported}\nPeriodos/tarifa: ${a.periodOk}/${a.supported}\n\nDiagnóstico PDF.js: ${a.diagnosticItems} items · ${a.diagnosticLines} líneas\nDocumentos con incidencias: ${a.issueDocuments}\nComprobaciones a revisar: ${bad}`;
  alert(msg);
}
window.addEventListener('DOMContentLoaded',()=>{
  const internal=document.querySelector('#exportExcel');if(!internal)return;
  const btn=document.createElement('button');btn.className='secondary';btn.id='auditParser';btn.disabled=internal.disabled;btn.textContent='✓ Auditar parser';btn.style.marginLeft='7px';
  const client=document.querySelector('#exportClientExcel');(client||internal).insertAdjacentElement('afterend',btn);
  new MutationObserver(()=>btn.disabled=internal.disabled).observe(internal,{attributes:true,attributeFilter:['disabled']});
  const prev=XLSX.writeFile.bind(XLSX);
  XLSX.writeFile=function(wb,name,opt){
    if(auditMode&&name==='Informe_Energetico_Instalacions_BT.xlsx'){
      auditMode=false;
      try{
        const a=auditWorkbook(wb);
        const result=prev(auditBook(a),'Auditoria_Parser_Instalacions_BT.xlsx');
        setTimeout(()=>show(a),0);
        return result;
      }catch(error){
        console.error('No se pudo generar la auditoría del parser',error);
        alert('No se pudo generar la auditoría del parser: '+(error?.message||error));
        return;
      }
    }
    return prev(wb,name,opt);
  };
  btn.onclick=()=>{if(internal.disabled)return;auditMode=true;internal.click()};
});
})();