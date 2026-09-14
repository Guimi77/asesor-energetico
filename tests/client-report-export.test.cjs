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
const row=(period,cups='A',kwh=100,total=20)=>({period,cups,kwh,energy:kwh*.1,total,periods:{P1:{kwh,cost:kwh*.1,price:.1,contracted:5,maximeter:2}}});

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

test('Filename range reflects the real selected period instead of a hard-coded year',()=>{
  assert.equal(api.rangeTag([row('01/07/2025 - 31/07/2025'),row('01/08/2026 - 31/08/2026')]),'2025-07_a_2026-08');
});
