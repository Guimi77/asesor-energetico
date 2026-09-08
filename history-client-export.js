/* Filtered, read-only client reports. Does not read PDFs or browser master data. */
(function(root){
  'use strict';
  const MONTHS=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const text=v=>String(v??'').trim();
  const number=v=>v==null||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
  const sum=(rows,key)=>rows.reduce((s,r)=>s+(number(r[key])??0),0);
  const date=v=>{const s=text(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:null;};
  const dateES=v=>date(v)?v.split('-').reverse().join('/'):'\u2014';
  const monthName=k=>MONTHS[Number(k.slice(5,7))-1]+' '+k.slice(0,4);
  const safe=v=>text(v).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\.+$/,'').slice(0,70)||'EMPRESA';
  const fmt=(v,d=2)=>number(v)==null?'\u2014':Number(v).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d});
  const quote=s=>"'"+s.replace(/'/g,"''")+"'";
  const formula=(f,result)=>({formula:f,result:result==null?'':result});
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function selection(input){
    const client=input?.client,from=text(input?.from),to=text(input?.to);
    if(!client?.id)throw Error('Selecciona un cliente.');
    if((from&&!date(from))||(to&&!date(to))||(from&&to&&from>to))throw Error('Revisa el intervalo de fechas.');
    const holders=new Map((input.holders||[]).filter(h=>h.client_id===client.id&&(!input.holderId||h.id===input.holderId)).map(h=>[h.id,h]));
    const supplies=new Map((input.supplies||[]).filter(s=>holders.has(s.holder_id)&&(!input.supplyId||s.id===input.supplyId)).map(s=>[s.id,s]));
    const seen=new Map(),groups=new Map();
    for(const r of input.records||[]){
      const s=supplies.get(r.supply_id);if(!s)continue;
      if(!date(r.billing_start)||!date(r.billing_end)||r.billing_start>r.billing_end)throw Error('Hay periodos sin fechas fiables. Revisa el hist\u00f3rico.');
      if((from&&r.billing_end<from)||(to&&r.billing_start>to))continue;
      if(r.validation_status!=='valid')throw Error('La selecci\u00f3n contiene registros pendientes de validaci\u00f3n.');
      if(!r.id||!text(s.cups)||number(r.consumption_kwh)==null||number(r.total_eur)==null)throw Error('Faltan datos esenciales en un periodo seleccionado.');
      if(seen.has(r.id)){if(JSON.stringify(seen.get(r.id))!==JSON.stringify(r))throw Error('Hay registros repetidos con datos diferentes.');continue;}
      seen.set(r.id,r);
      if(!groups.has(s.holder_id))groups.set(s.holder_id,{holder:holders.get(s.holder_id),supplies:new Map(),records:[]});
      const g=groups.get(s.holder_id);g.supplies.set(s.id,s);g.records.push(r);
    }
    if(!seen.size)throw Error('No hay periodos para exportar con estos filtros.');
    return {client,from,to,holderId:input.holderId||'',supplyId:input.supplyId||'',groups:[...groups.values()].map(g=>({...g,records:g.records.sort((a,b)=>a.billing_start.localeCompare(b.billing_start)||String(a.id).localeCompare(String(b.id)))}))};
  }
  function monthly(records){
    const bins=new Map();
    for(const r of records){const key=r.billing_end.slice(0,7);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(r);}
    if(!bins.size)return [];
    const keys=[...bins.keys()].sort(),out=[];let key=keys[0];
    while(key<=keys.at(-1)){
      const rows=bins.get(key)||[],energyKnown=rows.length&&rows.every(r=>number(r.energy_cost_eur)!=null);
      const kwh=rows.length?sum(rows,'consumption_kwh'):null,total=rows.length?sum(rows,'total_eur'):null,energy=energyKnown?sum(rows,'energy_cost_eur'):null;
      const periods=[];
      for(let p=1;p<=6;p++){
        const values=rows.flatMap(r=>(r.invoice_energy_periods||[]).filter(x=>Number(x.period)===p));
        if(!values.length)continue;
        const k=values.every(x=>number(x.consumption_kwh)!=null)?sum(values,'consumption_kwh'):null;
        const cost=values.every(x=>number(x.energy_cost_eur)!=null)?sum(values,'energy_cost_eur'):null;
        if(k!==null&&k!==0)periods.push('P'+p+': '+fmt(k)+' kWh \u00b7 '+(cost==null||k<=0?'precio no disponible':fmt(cost/k,6)+' \u20ac/kWh'));
      }
      out.push({key,label:monthName(key),rows,kwh,total,energy,energyPrice:kwh>0&&energy!=null?energy/kwh:null,totalUnit:kwh>0?total/kwh:null,periods:periods.join('\n')});
      let y=Number(key.slice(0,4)),m=Number(key.slice(5,7))+1;if(m===13){y++;m=1;}key=y+'-'+String(m).padStart(2,'0');
      if(out.length>1200)throw Error('El intervalo supera 100 a\u00f1os. Revisa las fechas.');
    }
    return out;
  }
  function colors(){return Object.assign({navy:'#061B38',blue:'#1834B8',red:'#B42318',light:'#F4F7FB',text:'#10233F',muted:'#65758A'},root.IBT_REPORT_TEMPLATE?.palette||{});}
  const argb=c=>'FF'+c.replace('#','');
  function sheet(wb,name,title,subtitle,headers,widths){
    const p=colors(),ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:4,showGridLines:false}]});
    ws.mergeCells(1,1,1,headers.length);ws.mergeCells(2,1,2,headers.length);
    ws.getCell('A1').value=title;ws.getCell('A1').font={name:'Calibri',size:18,bold:true,color:{argb:'FFFFFFFF'}};ws.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:argb(p.navy)}};ws.getRow(1).height=34;
    ws.getCell('A2').value=subtitle;ws.getCell('A2').font={name:'Calibri',size:10,color:{argb:argb(p.muted)}};ws.getCell('A2').alignment={wrapText:true,vertical:'middle'};ws.getCell('A2').fill={type:'pattern',pattern:'solid',fgColor:{argb:argb(p.light)}};ws.getRow(2).height=48;
    ws.getRow(4).values=headers;ws.getRow(4).height=34;ws.getRow(4).eachCell(c=>{c.font={name:'Calibri',bold:true,size:10,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:argb(p.blue)}};c.alignment={vertical:'middle',wrapText:true};});
    widths.forEach((w,i)=>ws.getColumn(i+1).width=w);
    ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};ws.pageSetup.printTitlesRow='1:4';return ws;
  }
  function dataRow(ws,values){const row=ws.addRow(values);row.height=24;row.eachCell({includeEmpty:true},c=>{c.font={name:'Calibri',size:10,color:{argb:argb(colors().text)}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:row.number%2?'FFFFFFFF':argb(colors().light)}};c.alignment={vertical:'middle',wrapText:true};});return row;}
  function totalRow(ws,values){const row=dataRow(ws,values);row.eachCell(c=>{c.font={name:'Calibri',size:10,bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:argb(colors().red)}};});return row;}
  function sourceNote(r){return 'Origen: hist\u00f3rico Supabase \u00b7 '+text(r.invoice_number)+' \u00b7 '+dateES(r.billing_start)+' - '+dateES(r.billing_end)+' \u00b7 ID '+r.id;}
  function chartPng(points,key,title,unit){
    const c=root.document.createElement('canvas');c.width=900;c.height=300;const x=c.getContext('2d');if(!x)throw Error('No se han podido generar las gr\u00e1ficas.');
    const p=colors(),valid=points.map(a=>number(a[key])).filter(v=>v!=null),low=Math.min(0,...valid),high=Math.max(0,...valid),span=high-low||1,min=low<0?low-span*.1:0,max=high+span*.1||1;
    const L=94,T=48,W=782,H=204,step=W/Math.max(points.length,1),price=key==='energyPrice';
    x.fillStyle='#FFFFFF';x.fillRect(0,0,900,300);x.fillStyle=p.text;x.font='bold 17px sans-serif';x.fillText(title,18,25);x.font='11px sans-serif';x.fillStyle=p.muted;x.fillText(unit,18,41);
    for(let i=0;i<=4;i++){const val=min+(max-min)*i/4,y=T+H-H*i/4;x.strokeStyle='#DCE4ED';x.lineWidth=1;x.beginPath();x.moveTo(L,y);x.lineTo(L+W,y);x.stroke();x.textAlign='right';x.fillStyle=p.muted;x.fillText(fmt(val,price?3:0),L-8,y+4);}
    const y=v=>T+H-(v-min)/(max-min)*H;
    x.strokeStyle=price?p.red:p.blue;x.lineWidth=2.5;let started=false;x.beginPath();
    if(price){points.forEach((a,i)=>{const v=number(a[key]);if(v==null){started=false;return;}const px=L+(i+.5)*step;if(!started)x.moveTo(px,y(v));else x.lineTo(px,y(v));started=true;});x.stroke();}
    points.forEach((a,i)=>{const v=number(a[key]),px=L+(i+.5)*step;if(v!=null){x.fillStyle=key==='kwh'?p.blue:p.red;if(price){x.beginPath();x.arc(px,y(v),3.5,0,Math.PI*2);x.fill();}else{x.fillRect(px-step*.32,Math.min(y(0),y(v)),step*.64,Math.max(Math.abs(y(0)-y(v)),v===0?1:0));}}if(points.length<=12||i%Math.ceil(points.length/10)===0||i===points.length-1){x.fillStyle=p.muted;x.textAlign='center';x.font='10px sans-serif';x.fillText(MONTHS[Number(a.key.slice(5,7))-1].slice(0,3)+' '+a.key.slice(2,4),px,276);}});
    return c.toDataURL('image/png');
  }
  function addCharts(wb,ws,mo,lastRow){
    const first=lastRow+3;
    [['kwh','Consumo mensual','kWh'],['energyPrice','Precio de energ\u00eda','\u20ac/kWh'],['total','Gasto total mensual','\u20ac']].forEach(([key,title,unit],i)=>{
      const row=first+i*17;for(let r=row;r<row+17;r++)ws.getRow(r).height=15;
      const id=wb.addImage({base64:chartPng(mo,key,title,unit),extension:'png'});let remaining=900,col=0;while(col<6){const width=Math.floor((ws.getColumn(col+1).width||8.43)*7+5);if(remaining<width)break;remaining-=width;col++;}const br={nativeCol:col,nativeColOff:Math.round(remaining*9525),nativeRow:row+14,nativeRowOff:0};ws.addImage(id,{tl:{col:0,row:row-1},br,editAs:'oneCell'});
    });
  }
  function monthlySheet(wb,name,title,rows,periodSheet,lastPeriodRow,cups,subtitle){
    const mo=monthly(rows),ws=sheet(wb,name,title,subtitle,['MES','Consumo total kWh','Gasto total \u20ac','Precio energ\u00eda \u20ac/kWh','Coste total \u20ac/kWh','PERIODOS FACTURADOS','Energ\u00eda \u20ac'],[20,20,20,24,24,58,18]);
    const origin=quote(periodSheet),criteria=(field,row)=>`SUMIFS(${origin}!$${field}$5:$${field}$${lastPeriodRow},${origin}!$D$5:$D$${lastPeriodRow},A${row}${cups?`,${origin}!$C$5:$C$${lastPeriodRow},$H$1`:''})`;
    if(cups)ws.getCell('H1').value=cups;ws.getColumn(8).hidden=true;ws.getColumn(7).hidden=true;
    for(const m of mo){const r=ws.rowCount+1;const row=dataRow(ws,[m.label,m.rows.length?formula(criteria('G',r),m.kwh):null,m.rows.length?formula(criteria('U',r),m.total):null,formula(`IF(AND(B${r}>0,ISNUMBER(G${r})),G${r}/B${r},"")`,m.energyPrice),formula(`IF(B${r}>0,C${r}/B${r},"")`,m.totalUnit),m.periods||'\u2014',m.energy==null?null:formula(criteria('H',r),m.energy)]);row.height=Math.max(24,m.periods.split('\n').length*16);}
    const end=ws.rowCount,t=end+1;
    totalRow(ws,['TOTAL SELECCI\u00d3N',formula(`SUM(B5:B${end})`,sum(rows,'consumption_kwh')),formula(`SUM(C5:C${end})`,sum(rows,'total_eur')),formula(`IF(AND(B${t}>0,COUNT(G5:G${end})=COUNT(B5:B${end})),SUM(G5:G${end})/B${t},"")`,rows.every(r=>number(r.energy_cost_eur)!=null)&&sum(rows,'consumption_kwh')>0?sum(rows,'energy_cost_eur')/sum(rows,'consumption_kwh'):null),formula(`IF(B${t}>0,C${t}/B${t},"")`,sum(rows,'consumption_kwh')>0?sum(rows,'total_eur')/sum(rows,'consumption_kwh'):null),'']);
    for(let r=5;r<=t;r++){ws.getCell(r,2).numFmt='#,##0.00 "kWh"';ws.getCell(r,3).numFmt='#,##0.00 "\u20ac"';for(const col of [4,5])ws.getCell(r,col).numFmt='0.000000 "\u20ac/kWh"';}
    addCharts(wb,ws,mo,t);return ws;
  }
  function addDetails(wb,g,subtitle){
    const headers=['Referencia','Titular','CUPS','MES','Desde','Hasta','Consumo kWh','Energ\u00eda \u20ac','Potencia \u20ac','Excesos \u20ac','Reactiva \u20ac','Compensaci\u00f3n \u20ac','Bono social \u20ac','Alquiler \u20ac','Derechos \u20ac','Otros \u20ac','Imp. electricidad \u20ac','IVA \u20ac','IGIC \u20ac','Suma conceptos \u20ac','Total \u20ac','Diferencia \u20ac','Coste total \u20ac/kWh','Tarifa','Comercializadora','Distribuidora','Estado','ID origen'];
    const ws=sheet(wb,'PERIODOS',g.holder.legal_name+' \u00b7 PERIODOS',subtitle,headers,[22,28,28,20,14,14,...Array(17).fill(19),12,24,24,14,38]);
    const fields=['consumption_kwh','energy_cost_eur','power_cost_eur','excess_cost_eur','reactive_cost_eur','compensation_eur','social_bonus_eur','meter_rental_eur','distributor_charges_eur','other_cost_eur','electricity_tax_eur','vat_eur','igic_eur'];
    for(const r of g.records){const i=ws.rowCount+1,vals=fields.map(k=>number(r[k])),complete=vals.slice(1).every(v=>v!=null),accounted=complete?vals.slice(1).reduce((a,b)=>a+b,0):null;
      const row=dataRow(ws,[text(r.invoice_number),text(g.holder.legal_name),text(g.supplies.get(r.supply_id).cups),monthName(r.billing_end.slice(0,7)),dateES(r.billing_start),dateES(r.billing_end),...vals,formula(`IF(COUNT(H${i}:S${i})=12,SUM(H${i}:S${i}),"")`,accounted),number(r.total_eur),formula(`IF(ISNUMBER(T${i}),U${i}-T${i},"")`,accounted==null?null:Number(r.total_eur)-accounted),formula(`IF(G${i}>0,U${i}/G${i},"")`,Number(r.consumption_kwh)>0?Number(r.total_eur)/Number(r.consumption_kwh):null),text(r.tariff),text(r.retailer),text(r.distributor),text(r.validation_status),text(r.id)]);
      row.getCell(1).note=sourceNote(r);for(let c=7;c<=23;c++)row.getCell(c).numFmt=c===23?'0.000000':'#,##0.00';
    }
    ws.autoFilter={from:'A4',to:'AB'+ws.rowCount};
    const pws=sheet(wb,'DETALLE P1-P6','DETALLE POR PERIODOS',subtitle,['Referencia','CUPS','Desde','Hasta','Tarifa','Periodo','Consumo kWh','Energ\u00eda \u20ac','Precio \u20ac/kWh','Contratada kW','Potencia \u20ac','Precio \u20ac/kW/d\u00eda','Max\u00edmetro kW','Max\u00edmetro fiable','Exceso kW','Excesos \u20ac','Reactiva kvarh','Reactiva \u20ac'],[22,28,14,14,12,12,...Array(12).fill(19)]);
    for(const r of g.records)for(let p=1;p<=6;p++){
      const en=(r.invoice_energy_periods||[]).filter(v=>Number(v.period)===p),pw=(r.invoice_power_periods||[]).filter(v=>Number(v.period)===p),mx=(r.invoice_maximeters||[]).filter(v=>Number(v.period)===p),ex=(r.invoice_excesses||[]).filter(v=>Number(v.period)===p),re=(r.invoice_reactive||[]).filter(v=>Number(v.period)===p);
      const count=Math.max(en.length,pw.length,mx.length,ex.length,re.length);for(let i=0;i<count;i++){const val=(a,k)=>number(a[i]?.[k]);const row=dataRow(pws,[text(r.invoice_number),text(g.supplies.get(r.supply_id).cups),dateES(r.billing_start),dateES(r.billing_end),text(r.tariff),'P'+p,val(en,'consumption_kwh'),val(en,'energy_cost_eur'),val(en,'unit_price_eur_kwh'),val(pw,'contracted_kw'),val(pw,'billed_power_eur'),val(pw,'unit_price_eur_kw_day'),val(mx,'maximeter_kw'),mx[i]?mx[i].reliable===true?'S\u00ed':'No / sin verificar':'',val(ex,'excess_kw'),val(ex,'amount_eur'),val(re,'reactive_kvarh'),val(re,'amount_eur')]);row.getCell(1).note=sourceNote(r);for(let c=7;c<=18;c++)if(c!==14)row.getCell(c).numFmt=[9,12].includes(c)?'0.000000':'#,##0.000';}
    }
    if(pws.rowCount>4)pws.autoFilter={from:'A4',to:'R'+pws.rowCount};
    const adjustments=g.records.flatMap(r=>(r.invoice_adjustments||[]).map(a=>({r,a})));
    if(adjustments.length){const aws=sheet(wb,'AJUSTES','AJUSTES REGISTRADOS','Detalle informativo. No se vuelve a sumar al total de PERIODOS.',['Referencia','CUPS','Concepto','Categor\u00eda','Importe \u20ac'],[22,28,65,22,20]);for(const {r,a} of adjustments){const row=dataRow(aws,[text(r.invoice_number),text(g.supplies.get(r.supply_id).cups),text(a.concept),text(a.category),number(a.amount_eur)]);row.getCell(5).numFmt='#,##0.00 "\u20ac"';row.getCell(1).note=sourceNote(r);}}
    return ws;
  }
  async function workbook(g,scope){
    if(!root.ExcelJS?.Workbook)throw Error('No se ha cargado la librer\u00eda de Excel. Recarga la p\u00e1gina.');
    const wb=new root.ExcelJS.Workbook();wb.creator='Instal\u00b7lacions BT';wb.calcProperties.fullCalcOnLoad=true;
    const range='Filtros: '+text(scope.client.name)+' \u00b7 '+dateES(scope.from)+' a '+dateES(scope.to)+'. '+g.records.length+' periodos facturados completos; sin prorrateo. Mes de fin de facturaci\u00f3n.';
    wb.subject=range;wb.description='Fuente: informaci\u00f3n estructurada del hist\u00f3rico. Sin documentos PDF.';
    const master=sheet(wb,'SUMINISTROS',text(g.holder.legal_name)+' \u00b7 ELECTRICIDAD',range+' Contrato y localizaci\u00f3n: maestro actual. Tarifa: \u00faltimo periodo seleccionado.',['#','CUPS','Suministro','Direcci\u00f3n','Localidad','Provincia','Tarifa en el rango','Contrato actual','Comercializadora en el rango','Distribuidora en el rango'],[6,28,32,40,22,20,18,23,27,27]);
    let idx=0;for(const [id,s] of g.supplies){const rows=g.records.filter(r=>r.supply_id===id),latest=[...rows].sort((a,b)=>b.billing_end.localeCompare(a.billing_end)||b.billing_start.localeCompare(a.billing_start))[0];dataRow(master,[++idx,text(s.cups),text(s.supply_name),text(s.address),text(s.city),text(s.province),text(latest.tariff),text(s.current_contract_number),text(latest.retailer),text(latest.distributor)]);}
    master.autoFilter={from:'A4',to:'J'+master.rowCount};
    const detail=addDetails(wb,g,range);idx=0;
    for(const [id,s] of g.supplies){const rows=g.records.filter(r=>r.supply_id===id);monthlySheet(wb,'CUPS '+(++idx),text(s.supply_name)||text(s.address)||text(s.cups),rows,detail.name,detail.rowCount,s.cups,'CUPS '+text(s.cups)+' \u00b7 '+range);await pause();}
    monthlySheet(wb,'RESUMEN EMPRESA',text(g.holder.legal_name)+' \u00b7 RESUMEN',g.records,detail.name,detail.rowCount,null,range);
    // Preserve client template order: supplies, CUPS sheets, company summary, source detail.
    const order=['SUMINISTROS',...Array.from({length:idx},(_,i)=>'CUPS '+(i+1)),'RESUMEN EMPRESA','PERIODOS','DETALLE P1-P6','AJUSTES'];order.forEach((name,i)=>{const ws=wb.getWorksheet(name);if(ws)ws.orderNo=i;});
    return wb;
  }
  async function exportSelection(input,options={}){
    const scope=selection(input),files=[],used=new Set();
    const ensure=()=>{if(options.stillCurrent&&!options.stillCurrent())throw Error('La selecci\u00f3n o la sesi\u00f3n ha cambiado. Vuelve a descargar el Excel.');};
    ensure();
    for(const g of scope.groups){ensure();const starts=g.records.map(r=>r.billing_start).sort(),ends=g.records.map(r=>r.billing_end).sort();let stem=safe(g.holder.legal_name)+'_ELECTRICIDAD_'+(scope.from||starts[0])+'_a_'+(scope.to||ends.at(-1)),name=stem+'.xlsx',i=1;while(used.has(name.toLowerCase()))name=stem+'_'+(++i)+'.xlsx';used.add(name.toLowerCase());const wb=await workbook(g,scope);files.push({name,buffer:await wb.xlsx.writeBuffer()});await pause();}
    ensure();let blob,name;if(files.length===1){name=files[0].name;blob=new Blob([files[0].buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}else{if(!root.JSZip)throw Error('No se ha cargado la librer\u00eda ZIP.');const zip=new root.JSZip();for(const f of files)zip.file(f.name,f.buffer);blob=await zip.generateAsync({type:'blob'});name=safe(scope.client.name)+'_EXCEL_CLIENTE_'+(scope.from||'inicio')+'_a_'+(scope.to||'fin')+'.zip';}
    ensure();if(options.save)await options.save(blob,name);else{const a=root.document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;root.document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},1000);}
    return {files:files.length,records:scope.groups.reduce((s,g)=>s+g.records.length,0),name};
  }
  const api=Object.freeze({selection,monthly,workbook,exportSelection});if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IBTHistoryClientExport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
