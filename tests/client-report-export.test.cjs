'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function load(){
  const context={
    XLSX:{writeFile(){},utils:{}},
    window:{IBT_REPORT_TEMPLATE:{},addEventListener(){}},
    document:{},URL:{},Blob:global.Blob,console,
    MutationObserver:function(){},setTimeout,clearTimeout
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname+'/../client-report-export.js','utf8'),context,{filename:'client-report-export.js'});
  return context.window.IBTClientReportExport;
}
const api=load();
const row=(period,cups='A',kwh=100,total=20,reading='No determinada',readingSource='')=>({period,cups,kwh,energy:kwh*.1,total,reading,readingSource,periods:{P1:{kwh,cost:kwh*.1,price:.1,contracted:5,maximeter:2}}});

test('Same calendar month in different years is never merged',()=>{
  const m=api.monthly([row('01/07/2025 - 31/07/2025'),row('01/07/2026 - 31/07/2026')]);
  assert.equal(m.length,13);
  assert.equal(m[0].key,'2025-07');
  assert.equal(m.at(-1).key,'2026-07');
  assert.equal(m[0].kwh,100);
  assert.equal(m.at(-1).kwh,100);
});

test('Missing month stays blank while a real zero stays zero',()=>{
  const m=api.monthly([row('01/07/2025 - 31/07/2025','A',0,10),row('01/09/2025 - 30/09/2025','A',50,20)]);
  assert.equal(m[0].hasData,true);
  assert.equal(m[0].kwh,0);
  assert.equal(m[1].hasData,false);
  assert.equal(m[1].kwh,null);
  assert.equal(m[2].kwh,50);
});

test('Company chart hides months below 80 percent coverage without deleting table totals',()=>{
  const m=api.monthly([
    row('01/01/2026 - 31/01/2026','A',100,20),
    row('01/02/2026 - 28/02/2026','A',120,24),
    row('01/02/2026 - 28/02/2026','B',80,16)
  ]);
  const view=api.chartCoverage(m,2);
  assert.equal(view.threshold,2);
  assert.equal(m[0].kwh,100,'stored table total remains available');
  assert.equal(view.months[0].kwh,null,'partial month is not drawn as comparable');
  assert.equal(view.months[1].kwh,200);
});

test('Reading quality is preserved and mixed readings are not presented as one reliable type',()=>{
  const one=api.monthly([row('01/01/2026 - 31/01/2026','A',100,20,'Estimada','Estimada Distribuidora')])[0];
  assert.equal(one.reading,'Estimada');
  assert.equal(one.readingSource,'Estimada Distribuidora');
  const mixed=api.monthly([
    row('01/02/2026 - 28/02/2026','A',100,20,'Estimada','Estimada Distribuidora'),
    row('01/02/2026 - 28/02/2026','A',50,10,'No determinada','Telegestión Distribuidora')
  ])[0];
  assert.equal(mixed.reading,'Mixta / revisar');
  assert.equal(mixed.readingSource,'Varios orígenes');
});

test('Total cost per kWh uses the complete invoice total, not only energy cost',()=>{
  const m=api.monthly([row('01/01/2026 - 31/01/2026','A',100,25)])[0];
  assert.equal(m.energyPrice,0.1);
  assert.equal(m.totalUnit,0.25);
});

test('Client workbook keeps body cells aligned with headers and renders total cost per kWh after energy price',()=>{
  const source=fs.readFileSync(__dirname+'/../client-report-export.js','utf8');
  assert.match(source,/c\.alignment=\{horizontal:'center',vertical:'middle',wrapText:true\}/);
  assert.match(source,/\['Precio medio de energía','€\/kWh','energyPrice','price',start\+36\],\['Coste total €\/kWh','€\/kWh','totalUnit','price',start\+54\]/);
});


test('Client export preserves missing period costs as null instead of inventing zero',()=>{
  const source=fs.readFileSync(__dirname+'/../client-report-export.js','utf8');
  assert.match(source,/nullableNumber=v=>v===''\|\|v==null\?null:/);
  assert.match(source,/cost:nullableNumber\(d\[o\+1\]\)/);
});

test('Client export sanitizes legacy retailer and distributor names with the common normalizer',()=>{
  const source=fs.readFileSync(__dirname+'/../client-report-export.js','utf8');
  assert.match(source,/semanticText=v=>window\.IBTPdfTextNormalizer\?\.repair/);
  assert.match(source,/semanticText\(m\.distributor\|\|''\)/);
});

test('Filename range reflects the real selected period instead of a hard-coded year',()=>{
  assert.equal(api.rangeTag([row('01/07/2025 - 31/07/2025'),row('01/08/2026 - 31/08/2026')]),'2025-07_a_2026-08');
});

test('Client report excludes parser ERROR and REVISAR rows',()=>{
  const ok=Array(23).fill('');ok[0]='CORRECTA';ok[1]='INV-OK';ok[18]='OK';
  const error=[...ok];error[0]='ERROR';
  const review=[...ok];review[18]='REVISAR';
  assert.equal(api.validClientRow(ok),true);
  assert.equal(api.validClientRow(error),false);
  assert.equal(api.validClientRow(review),false);
});
