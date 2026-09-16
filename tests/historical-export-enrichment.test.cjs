'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(__dirname+'/../historical-export-enrichment.js','utf8');
const indexSource=fs.readFileSync(__dirname+'/../index.html','utf8');
const bootstrapSource=fs.readFileSync(__dirname+'/../auth-bootstrap.js','utf8');

const ALCONASER='ES0031500164216001LX0F';
const OTHER='ES0000000000000000AA';

function query(data){
  const chain={
    select(){return chain;},
    in(){return chain;},
    order(){return chain;},
    range(){return Promise.resolve({data,error:null});},
    then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject);},
  };
  return chain;
}

function load({records=[],recommendationItems=[]}={}){
  const workbookRows=[
    ['INSTAL·LACIONS BT · INFORME ENERGÉTICO'],
    ['Resumen'],
    ['Estado','Nº factura','Empresa','CUPS'],
    ['CORRECTA','AUG-ONLY','ALCONASER GMBH&CO.KG.',ALCONASER],
  ];
  const supplies=[{id:'s-alconaser',holder_id:'h-alconaser',cups:ALCONASER,supply_name:'ALCONASER',address:'',status:'active'}];
  const holders=[{id:'h-alconaser',client_id:'c-1',legal_name:'ALCONASER GMBH&CO.KG.',tax_id:'X',status:'active'}];
  const seen={buildRecords:null,buildSupplies:null};
  const workbook={Sheets:{Resumen:{__rows:workbookRows}},SheetNames:['Resumen']};
  const context={
    console,setTimeout,clearTimeout,
    document:{addEventListener(){}},
    XLSX:{utils:{
      sheet_to_json(ws){return ws.__rows||[];},
      encode_cell({r,c}){return String.fromCharCode(65+c)+(r+1);},
      aoa_to_sheet(rows){return {__rows:rows};},
      book_append_sheet(wb,ws,name){wb.Sheets[name]=ws;wb.SheetNames.push(name);},
      sheet_add_aoa(ws,rows){ws.__appended=(ws.__appended||[]).concat(rows);},
    }},
    IBTHistoryRecommendations:{build({records:inputRecords,supplies:inputSupplies}){
      seen.buildRecords=inputRecords;
      seen.buildSupplies=inputSupplies;
      return {items:recommendationItems,used:inputRecords.length,excluded:0,duplicates:0,supplies:inputSupplies.length};
    }},
    ibtSupabase:{from(table){
      if(table==='supplies')return query(supplies);
      if(table==='holders')return query(holders);
      if(table==='invoices')return query(records);
      throw Error('unexpected table '+table);
    }},
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'historical-export-enrichment.js'});
  return {api:context.IBTHistoricalExportEnrichment,workbook,seen,context};
}

function powerItem(cups=ALCONASER){
  return {
    type:'power',supplyId:'s-alconaser',cups,holderName:'ALCONASER GMBH&CO.KG.',supplyName:'ALCONASER',
    title:'Estudiar un posible ajuste de potencia',amount:null,
    evidence:'4 facturas comparables (111 días) sin excesos registrados. En P3, P4, P5 el máximo no supera el 50 %.',
    action:'Revisar un ciclo anual completo antes de proponer nuevos kW.',
    caveat:'No es una potencia recomendada.',detailKind:'power',
    measurements:[{period:3,contracted:16.5,maximum:0,ratio:0,observations:4}],
    sources:[
      {invoice:'MAY',start:'2026-05-13',end:'2026-05-31'},
      {invoice:'JUN',start:'2026-06-01',end:'2026-06-30'},
      {invoice:'JUL',start:'2026-07-01',end:'2026-07-31'},
      {invoice:'AUG',start:'2026-08-01',end:'2026-08-31'},
    ],
  };
}

test('Facturas export asks the historical engine for full Supabase history, not only the current August batch',async()=>{
  const records=[
    {id:'may',supply_id:'s-alconaser',billing_start:'2026-05-13'},
    {id:'jun',supply_id:'s-alconaser',billing_start:'2026-06-01'},
    {id:'jul',supply_id:'s-alconaser',billing_start:'2026-07-01'},
    {id:'aug',supply_id:'s-alconaser',billing_start:'2026-08-01'},
  ];
  const item=powerItem();
  const {api,workbook,seen}=load({records,recommendationItems:[item]});
  const snapshot=await api.fetchSnapshot(workbook);
  assert.equal(snapshot.checked,true);
  assert.equal(seen.buildRecords.length,4,'the historical engine must receive all four stored periods');
  assert.equal(snapshot.records,4);
  assert.equal(snapshot.items.length,1);
  assert.equal(snapshot.items[0].cups,ALCONASER);
  assert.match(snapshot.items[0].evidence,/4 facturas comparables/);
});

test('recommendations are isolated by CUPS so one company workbook cannot receive another company alert',()=>{
  const {api}=load();
  const snapshot={items:[powerItem(ALCONASER),{...powerItem(OTHER),cups:OTHER,holderName:'OTRO'}],missingCups:[]};
  const only=api.itemsForCups(snapshot,[ALCONASER]);
  assert.equal(only.length,1);
  assert.equal(only[0].cups,ALCONASER);
});

test('historical evidence remains traceable in the exported recommendation row',()=>{
  const {api}=load();
  const item=powerItem();
  const rows=api.recommendationTableRows({items:[item],missingCups:[]},[ALCONASER]);
  assert.equal(rows.length,1);
  assert.equal(rows[0][4],'13/05/2026 - 31/08/2026');
  assert.equal(rows[0][5],4);
  assert.match(rows[0][8],/P3:/);
  assert.match(rows[0][9],/ciclo anual completo/);
  assert.match(rows[0][11],/MAY/);
  assert.match(rows[0][11],/AUG/);
});

test('an unavailable history is explicit and never becomes a silent no-alert result',()=>{
  const {api}=load();
  const snapshot=api.errorSnapshot([ALCONASER],new Error('network down'));
  const status=api.clientSheetStatus(snapshot,[ALCONASER]);
  assert.equal(snapshot.checked,false);
  assert.match(status.message,/Histórico no verificado/i);
  assert.match(status.message,/network down/);
});

test('internal workbook gets a historical recommendations sheet and a historical point-to-review row',()=>{
  const {api,workbook}=load();
  workbook.Sheets['Puntos a revisar']={__rows:[]};
  workbook.SheetNames.push('Puntos a revisar');
  const item=powerItem();
  const snapshot={checked:true,error:null,requestedCups:[ALCONASER],matchedCups:[ALCONASER],missingCups:[],items:[item],used:4,excluded:0,duplicates:0,supplies:1,records:4};
  api.addSheetJsRecommendations(workbook,snapshot);
  api.appendSheetJsPoints(workbook,snapshot);
  assert.ok(workbook.SheetNames.includes('Recomendaciones histórico'));
  const recommendation=workbook.Sheets['Recomendaciones histórico'].__rows;
  assert.match(recommendation[3][7],/4 facturas comparables/);
  assert.equal(workbook.Sheets['Puntos a revisar'].__appended.length,1);
  assert.equal(workbook.Sheets['Puntos a revisar'].__appended[0][0],'HISTÓRICO');
});

test('the enrichment loads after the canonical history engine and is cache-busted',()=>{
  const historyPos=indexSource.indexOf('history-recommendations.js?v=20260916-powerboundary1');
  const enrichmentPos=indexSource.indexOf('historical-export-enrichment.js?v=20260916-history1');
  assert.ok(historyPos>=0 && enrichmentPos>historyPos,'the canonical history engine must load first');
  assert.match(indexSource,/auth-bootstrap\.js\?v=20260916-history1/);
  assert.match(bootstrapSource,/historical-export-enrichment\.js\?v=20260916-history1/);
});
