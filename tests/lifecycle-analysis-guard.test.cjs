'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadGuard(){
  const source=fs.readFileSync('lifecycle-analysis-guard.js','utf8');
  const document={readyState:'loading'};
  const window={addEventListener(){}};
  const context={window,document,MutationObserver:function(){}};
  vm.runInNewContext(source,context,{filename:'lifecycle-analysis-guard.js'});
  return context.window.IBTLifecycleAnalysisGuard;
}

test('Active and inactive status labels are classified safely',()=>{
  const api=loadGuard();
  for(const value of ['active','ACTIVO','ACTIVO · desde 09/09/2026',undefined]) assert.equal(api.activeStatus(value),true,String(value));
  for(const value of ['inactive','BAJA CLIENTE · 09/09/2026','BAJA SUMINISTRO · 09/09/2026','archived']) assert.equal(api.activeStatus(value),false,value);
});

test('Inactive CUPS keep their history but are removed from current recommendation input',()=>{
  const api=loadGuard();
  const scope=api.filterRecommendationScope({
    supplies:[
      {id:'active-one',status:'active'},
      {id:'inactive-one',status:'inactive'},
    ],
    records:[
      {id:'a',supply_id:'active-one'},
      {id:'b',supply_id:'inactive-one'},
      {id:'c',supply_id:'inactive-one'},
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(scope.options.supplies)),[{id:'active-one',status:'active'}]);
  assert.deepEqual(JSON.parse(JSON.stringify(scope.options.records)),[{id:'a',supply_id:'active-one'}]);
  assert.equal(scope.inactiveRecords,2);
  assert.equal(scope.inactiveSupplies,1);
});

test('Unknown supply status defaults to active so new supplies are not silently hidden',()=>{
  const api=loadGuard();
  const scope=api.filterRecommendationScope({supplies:[{id:'new'}],records:[{id:'r',supply_id:'new'}]});
  assert.equal(scope.options.records.length,1);
  assert.equal(scope.inactiveRecords,0);
});

test('Bootstrap loads lifecycle analysis guard before history UI',()=>{
  const bootstrap=fs.readFileSync('auth-bootstrap.js','utf8');
  assert(bootstrap.includes("script[data-lifecycle-analysis-guard]"));
  assert(bootstrap.includes("lifecycle-analysis-guard.js?v=20260909-1"));
  assert(bootstrap.indexOf('lifecycle-analysis-guard.js')<bootstrap.indexOf('history-ui.js'));
});

test('Current invoice view explicitly suppresses recommendations for known inactive CUPS',()=>{
  const source=fs.readFileSync('lifecycle-analysis-guard.js','utf8');
  assert(source.includes('Suministro inactivo · histórico conservado · sin recomendación actual'));
  assert(source.includes("cells[15]"));
  assert(source.includes('window.EnergyMaster?.find?.(cups)'));
});
