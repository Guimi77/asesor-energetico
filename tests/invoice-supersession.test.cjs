'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../invoice-supersession.js');

function invoice(number,issueDate,total=1995.14){
  return {
    invoiceNumber:number,
    issueDate,
    cups:'ES0021000043629140LT0F',
    period:'18/06/2026 - 30/06/2026 (13 días)',
    tariff:'3.0TD',
    kwh:11048,
    total,
    readOk:true,
    balanced:true,
    periods:{
      P1:{consumption:1458},P2:{consumption:1558},P3:{consumption:2174},
      P4:{consumption:1933},P5:{consumption:1057},P6:{consumption:2868},
    }
  };
}

test('XTRA FENIE refacturation keeps only the later invoice active',()=>{
  const old=invoice('2026070411734','2026-07-04',2043.91);
  const newer=invoice('2026073102923','2026-07-31',1995.14);
  const result=api.reconcile([old,newer]);
  assert.equal(result.active.length,1);
  assert.equal(result.active[0].invoiceNumber,'2026073102923');
  assert.equal(old.superseded,true);
  assert.equal(old.supersededBy,'2026073102923');
  assert.equal(result.active.reduce((s,r)=>s+r.kwh,0),11048);
  assert.equal(result.active.reduce((s,r)=>s+r.total,0),1995.14);
});

test('invoice date can be recovered from a FENIE numeric invoice number',()=>{
  const row=invoice('2026073102923','');
  assert.equal(api.invoiceDate(row),'2026-07-31');
});

test('FENIE supersession does not require changing the locked parser to expose issueDate',()=>{
  const old=invoice('2026070411734','',2043.91);
  const newer=invoice('2026073102923','',1995.14);
  const result=api.reconcile([old,newer]);
  assert.equal(result.active.length,1);
  assert.equal(result.active[0].invoiceNumber,'2026073102923');
  assert.equal(old.superseded,true);
});

test('same period with different total consumption is never auto-superseded',()=>{
  const a=invoice('2026070411734','2026-07-04');
  const b=invoice('2026073102923','2026-07-31');
  b.kwh=11049;
  assert.equal(api.reconcile([a,b]).active.length,2);
  assert.equal(a.superseded,undefined);
});

test('same period and kWh with a different P1-P6 profile is not treated as the same physical billing',()=>{
  const a=invoice('2026070411734','2026-07-04');
  const b=invoice('2026073102923','2026-07-31');
  b.periods.P3.consumption=2175;
  b.periods.P6.consumption=2867;
  assert.equal(api.samePhysicalPeriod(a,b),false);
  assert.equal(api.reconcile([a,b]).active.length,2);
});

test('an invalid replacement cannot displace a valid invoice',()=>{
  const a=invoice('2026070411734','2026-07-04');
  const b=invoice('2026073102923','2026-07-31');
  b.readOk=false;
  assert.equal(api.reconcile([a,b]).active.length,2);
  assert.equal(a.superseded,undefined);
});

test('ambiguous recency warns but never silently discards either invoice',()=>{
  const a=invoice('A-100','');
  const b=invoice('B-100','');
  const result=api.reconcile([a,b]);
  assert.equal(result.active.length,2);
  assert.equal(a.possibleSupersession,true);
  assert.equal(b.possibleSupersession,true);
  assert.equal(result.ambiguous,2);
});
