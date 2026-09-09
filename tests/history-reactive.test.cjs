'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../history-recommendations.js');

const supplies=[{id:'one',holder_id:'h1',cups:'TEST-REACTIVE-CUPS',supply_name:'Local reactiva'}];
function rec(i,patch={}){
  const windows=[['2026-01-01','2026-01-31'],['2026-02-01','2026-02-28'],['2026-03-01','2026-03-31']];
  return {
    id:'rr'+i,
    invoice_number:'REACTIVE-'+i,
    supply_id:'one',
    billing_start:windows[i][0],
    billing_end:windows[i][1],
    validation_status:'valid',
    tariff:'3.0TD',
    consumption_kwh:100,
    energy_cost_eur:20,
    total_eur:100,
    excess_cost_eur:0,
    reactive_cost_eur:0,
    invoice_power_periods:[],
    invoice_maximeters:[],
    invoice_excesses:[],
    invoice_reactive:[],
    ...patch,
  };
}
const build=records=>api.build({records,supplies});

test('Repeated reactive charges expose period, kVArh and cost evidence',()=>{
  const rows=[
    rec(0,{reactive_cost_eur:10,invoice_reactive:[
      {period:1,reactive_kvarh:200,amount_eur:5},
      {period:2,reactive_kvarh:200,amount_eur:5},
    ]}),
    rec(1,{reactive_cost_eur:12,invoice_reactive:[
      {period:1,reactive_kvarh:250,amount_eur:7},
      {period:2,reactive_kvarh:100,amount_eur:5},
    ]}),
  ];
  const x=build(rows).items.find(item=>item.type==='reactive');
  assert.equal(x.title,'Energía reactiva recurrente');
  assert.equal(x.repeated,true);
  assert.equal(x.amount,22);
  assert.deepEqual(x.measurements[0],{period:1,invoices:2,amount:12,totalReactiveKvarh:450,maximumReactiveKvarh:250});
  assert.deepEqual(x.measurements[1],{period:2,invoices:2,amount:10,totalReactiveKvarh:300,maximumReactiveKvarh:200});
  assert.equal(x.recommendedKvar,undefined);
  assert.match(x.action,/compensación/);
  assert.match(x.caveat,/no demuestra por sí solo/);
  const html=api.render({records:rows,supplies,holders:[{id:'h1',legal_name:'Titular reactiva'}]});
  assert.match(html,/Reactiva registrada/);
  assert.match(html,/450,00 kVArh/);
  assert.match(html,/Energía reactiva recurrente/);
});

test('A single reactive charge is reviewable but not labelled recurrent',()=>{
  const x=build([rec(0,{reactive_cost_eur:9.5,invoice_reactive:[{period:4,reactive_kvarh:120,amount_eur:9.5}]})]).items.find(item=>item.type==='reactive');
  assert.equal(x.title,'Revisar la energía reactiva');
  assert.equal(x.repeated,false);
  assert.equal(x.measurements[0].period,4);
  assert.match(x.action,/situación puntual/);
});

test('Reactive source cost is kept even when structured period detail is unavailable',()=>{
  const x=build([rec(0,{reactive_cost_eur:15})]).items.find(item=>item.type==='reactive');
  assert.equal(x.amount,15);
  assert.equal(x.measurements.length,0);
  assert.match(x.evidence,/No hay desglose por periodos suficiente/);
});

test('Credits reduce reactive historical balance without becoming savings',()=>{
  const x=build([
    rec(0,{reactive_cost_eur:20,invoice_reactive:[{period:1,reactive_kvarh:100,amount_eur:20}]}),
    rec(1,{reactive_cost_eur:-5,invoice_reactive:[{period:1,reactive_kvarh:0,amount_eur:-5}]}),
  ]).items.find(item=>item.type==='reactive');
  assert.equal(x.amount,15);
  assert.equal(x.sources.length,2);
  assert.match(x.evidence,/Abonos/);
  assert.match(x.caveat,/no equivale a ahorro posible/);
});
