'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');

function load(items){
  const modulePath=path.resolve(__dirname,'../human-language.js');
  delete require.cache[modulePath];
  global.IBTHistoryRecommendations={
    __consumptionAnomalies:true,
    build:()=>({items,used:5,excluded:0,duplicates:0,supplies:1}),
    render:()=>'<div>old</div>',
    rules:{},
  };
  require(modulePath);
  return global.IBTHistoryRecommendations;
}

const supply={id:'s1',holder_id:'h1',cups:'ES_TEST',supply_name:'Local de prueba'};
const holder={id:'h1',legal_name:'Cliente de prueba'};

test('Excess is explained in plain language while keeping technical detail',()=>{
  const api=load([{type:'excess',supplyId:'s1',title:'Excesos de potencia repetidos',repeated:true,amount:125.5,evidence:'Dos facturas con exceso.',action:'Comparar escenarios.',caveat:'No demuestra que deba aumentarse la potencia.',sources:[{invoice:'A',start:'2026-01-01',end:'2026-01-31',amount:60},{invoice:'B',start:'2026-02-01',end:'2026-02-28',amount:65.5}],measurements:[],detailKind:'excess'}]);
  const html=api.render({supplies:[supply],holders:[holder]});
  assert.match(html,/Resumen rápido/);
  assert.match(html,/Costes adicionales detectados/);
  assert.match(html,/125,50 €/);
  assert.match(html,/Costes que ya aparecen en las facturas/);
  assert.match(html,/Estás pagando penalizaciones por superar la potencia contratada/);
  assert.match(html,/Por qué importa/);
  assert.match(html,/Qué conviene revisar/);
  assert.match(html,/Ver detalle técnico/);
  assert.match(html,/Excesos de potencia repetidos/);
  assert.match(html,/Este análisis no calcula una propuesta económica/);
  assert.doesNotMatch(html,/Ahorro estimado/i);
});

test('Consumption change leads with the percentage and hides jargon in technical detail',()=>{
  const api=load([{type:'consumption-up',supplyId:'s1',title:'Aumento sostenido de consumo',confidence:'media',changeRatio:0.684,evidence:'Referencia técnica.',action:'Revisar actividad.',caveat:'Confianza media.',sources:Array.from({length:5},(_,i)=>({invoice:'INV-'+i,start:'2026-0'+(i+1)+'-01',end:'2026-0'+(i+1)+'-28',kwh:100+i*20,kwhDay:4+i,readingStatus:'unknown'})),measurements:[],detailKind:'consumption-change'}]);
  const html=api.render({supplies:[supply],holders:[holder]});
  assert.match(html,/Cambios importantes de consumo/);
  assert.match(html,/Tu consumo ha aumentado un 68 %/);
  assert.match(html,/2 últimas facturas/);
  assert.match(html,/Conviene revisarlo/);
  assert.match(html,/Ver detalle técnico/);
  assert.match(html,/Confianza media/);
});

test('Confirmed historical costs are ordered before study signals',()=>{
  const api=load([
    {type:'power',supplyId:'s1',title:'Potencia alta',amount:null,evidence:'x',action:'y',caveat:'z',sources:[],measurements:[]},
    {type:'reactive',supplyId:'s1',title:'Reactiva',amount:20,evidence:'x',action:'y',caveat:'z',sources:[],measurements:[]},
  ]);
  const html=api.render({supplies:[supply],holders:[holder]});
  assert(html.indexOf('Costes que ya aparecen en las facturas')<html.indexOf('Otras cosas que conviene estudiar'));
});

test('Long anomaly lists show the most important five first and collapse the rest',()=>{
  const items=Array.from({length:8},(_,i)=>({type:'consumption-up',supplyId:'s1',title:'Aumento sostenido de consumo',changeRatio:0.5+i/100,evidence:'x',action:'y',caveat:'z',sources:[],measurements:[]}));
  const api=load(items),html=api.render({supplies:[supply],holders:[holder]});
  assert.match(html,/Cambios importantes en el consumo/);
  assert.match(html,/Ver otros 3 avisos/);
});

test.after(()=>{delete global.IBTHistoryRecommendations;});
