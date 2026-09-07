(()=>{'use strict';
let auditMode=false;
const n=v=>Number(v)||0,txt=v=>String(v??'').trim();
const close=(a,b,t=.05)=>Math.abs(a-b)<=t;
const parserVersion=()=>String(window.IBT_PARSER_VERSION||'desconocida');
function getRows(wb,name){const ws=wb?.Sheets?.[name];return ws?XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''}).slice(3):[]}
function auditWorkbook(wb){
  const summary=getRows(wb,'Resumen').filter(r=>txt(r[1]));
  const detail=getRows(wb,'Detalle P1-P6').filter(r=>txt(r[0]));
  const byInvoice=new Map(detail.map(r=>[txt(r[0]),r]));
  const issues=[];let identityOk=0,consumptionOk=0,energyOk=0,economicOk=0,periodOk=0;
  for(const r of summary){
    const invoice=txt(r[1]),company=txt(r[2]),cups=txt(r[3]),period=txt(r[4]),tariff=txt(r[5]);
    const consumption=n(r[6]),energy=n(r[7]),power=n(r[8]),excess=n(r[9]),reactive=n(r[10]),comp=n(r[11]),other=n(r[12]),dist=n(r[13]),tax=n(r[14]),vat=n(r[15]),igic=n(r[16]),total=n(r[17]);
    const d=byInvoice.get(invoice)||[];
    const add=(type,msg,severity='REVISAR')=>issues.push([severity,invoice,company,cups,period,tariff,type,msg]);
    const idGood=!!company&&!!cups&&/^ES[A-Z0-9]{16,24}$/i.test(cups)&&!!period&&period!=='Por identificar'&&!!tariff&&tariff!=='—'&&total>0;
    if(idGood)identityOk++; else add('IDENTIDAD','Falta o parece inválido algún dato esencial: empresa, CUPS, periodo, tarifa o total.','ERROR');
    let pkwh=0,pcost=0,periodsGood=true;
    for(let p=1;p<=6;p++){
      const o=5+(p-1)*5,k=n(d[o]),cost=n(d[o+1]),price=n(d[o+2]);pkwh+=k;pcost+=cost;
      if(k>0&&price<=0){periodsGood=false;add('PRECIO PERIODO',`P${p} tiene ${k.toFixed(2)} kWh pero no tiene precio €/kWh.`)}
      if(/^2\.0TD$/i.test(tariff)&&p>=4&&(Math.abs(k)>.001||Math.abs(cost)>.001||Math.abs(price)>.000001)){periodsGood=false;add('PERIODO IMPOSIBLE',`Tarifa 2.0TD con datos en P${p}.`,'ERROR')}
    }
    if(periodsGood)periodOk++;
    if(close(pkwh,consumption,.1))consumptionOk++; else add('CONSUMO',`Suma P1-P6 = ${pkwh.toFixed(2)} kWh y consumo total = ${consumption.toFixed(2)} kWh.`,'ERROR');
    if(close(pcost,energy,.1))energyOk++; else add('ENERGÍA €',`Suma coste P1-P6 = ${pcost.toFixed(2)} € y término energía = ${energy.toFixed(2)} €.`,'ERROR');
    const accounted=energy+power+excess+reactive+comp+other+dist+tax+vat+igic;
    if(Math.abs(Math.round((total-accounted)*100))<=5)economicOk++; else add('CUADRE ECONÓMICO',`Conceptos guardados = ${accounted.toFixed(2)} € y total factura = ${total.toFixed(2)} € (dif. ${(total-accounted).toFixed(2)} €).`,'ERROR');
    if(consumption===0&&energy!==0)add('COHERENCIA','Consumo 0 kWh con término de energía distinto de 0 €.');
    if(total>0&&power===0&&consumption===0)add('FACTURA SIN CONSUMO','Factura con importe y 0 kWh: comprobar que potencia/derechos/otros conceptos estén capturados.');
  }
  const total=summary.length;
  return{version:parserVersion(),total,identityOk,consumptionOk,energyOk,economicOk,periodOk,issues};
}
function auditBook(a){
  const wb=XLSX.utils.book_new();wb.Props={Comments:`Parser ${a.version}`};
  const pct=x=>a.total?x/a.total:0;
  const overview=[
    ['AUDITORÍA DEL PARSER · INSTAL·LACIONS BT'],
    [`Objetivo: detectar incoherencias antes de guardar histórico en Supabase · Parser ${a.version}`],
    ['Control','Correctas','Total','%'],
    ['Identidad esencial',a.identityOk,a.total,pct(a.identityOk)],
    ['Consumo P1-P6 = consumo total',a.consumptionOk,a.total,pct(a.consumptionOk)],
    ['Coste energía P1-P6 = energía €',a.energyOk,a.total,pct(a.energyOk)],
    ['Cuadre económico completo',a.economicOk,a.total,pct(a.economicOk)],
    ['Coherencia de periodos/tarifa',a.periodOk,a.total,pct(a.periodOk)],
    [],['Incidencias detectadas',a.issues.length]
  ];
  const ws=XLSX.utils.aoa_to_sheet(overview);ws['!cols']=[{wch:38},{wch:12},{wch:12},{wch:12}];
  ['D4','D5','D6','D7','D8'].forEach(c=>{if(ws[c])ws[c].z='0.00%'});XLSX.utils.book_append_sheet(wb,ws,'Resumen auditoría');
  const ih=[['Severidad','Nº factura','Empresa','CUPS','Periodo','Tarifa','Control','Detalle'],...a.issues];
  const wi=XLSX.utils.aoa_to_sheet(ih);wi['!cols']=[{wch:12},{wch:20},{wch:32},{wch:27},{wch:25},{wch:10},{wch:24},{wch:80}];XLSX.utils.book_append_sheet(wb,wi,'Incidencias auditoría');
  return wb;
}
function show(a){
  const bad=a.issues.length;
  const msg=`Auditoría terminada\n\nParser: ${a.version}\nFacturas: ${a.total}\nIdentidad: ${a.identityOk}/${a.total}\nConsumos: ${a.consumptionOk}/${a.total}\nEnergía: ${a.energyOk}/${a.total}\nCuadre económico: ${a.economicOk}/${a.total}\nPeriodos/tarifa: ${a.periodOk}/${a.total}\n\nComprobaciones a revisar: ${bad}`;
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
      auditMode=false;const a=auditWorkbook(wb);show(a);return prev(auditBook(a),'Auditoria_Parser_Instalacions_BT.xlsx');
    }
    return prev(wb,name,opt);
  };
  btn.onclick=()=>{if(internal.disabled)return;auditMode=true;internal.click()};
});
})();