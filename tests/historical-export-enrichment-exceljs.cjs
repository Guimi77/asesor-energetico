'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ExcelJS=require('exceljs');

const source=fs.readFileSync(__dirname+'/../historical-export-enrichment.js','utf8');

// The production browser and ExcelJS share one JS realm. Keep this integration test
// in that same shape: ExcelJS checks array-like row values internally, and a separate
// vm realm can turn a valid row into an empty one even though that cannot happen in-page.
global.ExcelJS=ExcelJS;
global.document={addEventListener(){}};
delete global.IBTHistoricalExportEnrichment;
vm.runInThisContext(source,{filename:'historical-export-enrichment.js'});
const api=global.IBTHistoricalExportEnrichment;

const ALCONASER='ES0031500164216001LX0F';
const OTHER='ES0000000000000000AA';
const item=(cups,holder)=>({
  type:'power',cups,holderName:holder,supplyName:holder,title:'Estudiar un posible ajuste de potencia',amount:null,
  evidence:'4 facturas comparables (111 días) sin excesos registrados.',action:'Revisar ciclo anual.',caveat:'No es potencia recomendada.',detailKind:'power',
  measurements:[{period:3,contracted:16.5,maximum:0,ratio:0,observations:4}],
  sources:[{invoice:'MAY',start:'2026-05-13',end:'2026-05-31'},{invoice:'AUG',start:'2026-08-01',end:'2026-08-31'}],
});
const snapshot={checked:true,error:null,requestedCups:[ALCONASER,OTHER],matchedCups:[ALCONASER,OTHER],missingCups:[],items:[item(ALCONASER,'ALCONASER'),item(OTHER,'OTRO')],used:8,excluded:0,duplicates:0,supplies:2,records:8};

(async()=>{
  const wb=new ExcelJS.Workbook();
  wb.addWorksheet('SUMINISTROS');
  wb.addWorksheet('CUPS 1');
  wb.addWorksheet('RESUMEN TOTAL');
  api.addExcelJsRecommendations(wb,snapshot,[ALCONASER]);

  const rec=wb.getWorksheet('RECOMENDACIONES');
  assert.ok(rec,'the client workbook must contain RECOMENDACIONES');
  assert.equal(rec.getCell('B5').value,ALCONASER);
  assert.notEqual(rec.getCell('B5').value,OTHER);
  assert.match(String(rec.getCell('H5').value),/4 facturas comparables/);
  assert.match(String(rec.getCell('K5').value),/MAY/);
  assert.match(String(rec.getCell('K5').value),/AUG/);

  const buffer=await wb.xlsx.writeBuffer();
  const reread=new ExcelJS.Workbook();
  await reread.xlsx.load(buffer);
  const persisted=reread.getWorksheet('RECOMENDACIONES');
  assert.ok(persisted,'recommendations sheet must survive XLSX serialization');
  assert.equal(persisted.getCell('B5').value,ALCONASER);
  assert.equal(reread.worksheets.filter(ws=>ws.name==='RECOMENDACIONES').length,1);
  console.log('historical export ExcelJS regression: ok');
})().catch(error=>{console.error(error);process.exitCode=1;});
