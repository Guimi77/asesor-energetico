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
  assert.match(html,/Ver datos y cálculo/);
  assert.match(html,/Excesos de potencia repetidos/);
  assert.match(html,/Este análisis no calcula una propuesta económica/);
  assert.doesNotMatch(html,/Ahorro estimado/i);
});

test('Consumption change explains the exact comparison and data provenance',()=>{
  const api=load([{type:'consumption-up',supplyId:'s1',title:'Aumento sostenido de consumo',confidence:'alta',changeRatio:0.4014,baselineKwhDay:16.18307,recentKwhDay:22.67892,evidence:'Referencia técnica con mediana y media.',action:'Revisar actividad.',caveat:'Confianza alta.',sources:Array.from({length:5},(_,i)=>({invoice:'INV-'+i,start:'2026-0'+(i+3)+'-01',end:'2026-0'+(i+4)+'-01',days:30,kwh:400+i*50,kwhDay:14+i*2,readingStatus:'actual'})),measurements:[],detailKind:'consumption-change'}]);
  const html=api.render({supplies:[supply],holders:[holder]});
  assert.match(html,/Cambios importantes en el consumo/);
  assert.match(html,/Aumento del consumo diario/);
  assert.match(html,/<strong>\+40,1 %<\/strong>/);
  assert.match(html,/De 16,18 a 22,68 kWh\/día/);
  assert.match(html,/Últimas 2 facturas frente a la mediana de los 3 periodos anteriores/);
  assert.doesNotMatch(html,/<strong>1<\/strong><span>cambio detectado/);
  assert.match(html,/40,1 %/);
  assert.match(html,/Referencia: 16,18 kWh\/día/);
  assert.match(html,/22,68 kWh\/día/);
  assert.match(html,/mediana de los 3 periodos anteriores/);
  assert.match(html,/no un valor estimado por IA/);
  assert.match(html,/Ver datos y cálculo/);
  assert.match(html,/Confianza alta/);
  assert.match(html,/>Días</);
});

test('Consumption alert does not expose raw polluted supply address as its title',()=>{
  const dirty={id:'s1',holder_id:'h1',cups:'ES_TEST',address:'CALLE 1, Referencia del contrato de acceso: 123'};
  const api=load([{type:'consumption-up',supplyId:'s1',title:'Aumento sostenido de consumo',confidence:'alta',changeRatio:0.5,baselineKwhDay:10,recentKwhDay:15,evidence:'x',action:'y',caveat:'z',sources:[],measurements:[]}]);
  const html=api.render({supplies:[dirty],holders:[holder]});
  assert.match(html,/Suministro eléctrico/);
  assert.doesNotMatch(html,/Referencia del contrato de acceso/);
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
  const items=Array.from({length:8},(_,i)=>({type:'consumption-up',supplyId:'s1',title:'Aumento sostenido de consumo',changeRatio:0.5+i/100,baselineKwhDay:10,recentKwhDay:15,evidence:'x',action:'y',caveat:'z',sources:[],measurements:[]}));
  const api=load(items),html=api.render({supplies:[supply],holders:[holder]});
  assert.match(html,/Cambios importantes en el consumo/);
  assert.match(html,/Ver otros 3 avisos/);
});

test.after(()=>{delete global.IBTHistoryRecommendations;});
