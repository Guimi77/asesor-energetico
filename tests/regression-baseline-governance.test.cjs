'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {manifest,acceptedCommit,frozenCommit}=require('./helpers/regression-baseline.cjs');

const acceptance=JSON.parse(fs.readFileSync('tests/regression-baseline-acceptance.json','utf8'));
const exists=sha=>{execFileSync('git',['cat-file','-e',sha+'^{commit}']);return true;};
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const full=path.join(dir,entry.name);
  return entry.isDirectory()?walk(full):[full];
});

test('accepted baseline is a real ancestor commit with a positive version',()=>{
  const sha=acceptedCommit();
  assert(exists(sha));
  assert(Number.isInteger(manifest.accepted.version)&&manifest.accepted.version>0);
  execFileSync('git',['merge-base','--is-ancestor',sha,'HEAD']);
});

test('frozen historical reproduction references are explicit and valid',()=>{
  for(const key of ['historyChartRefreshLegacyTwoCharts','pdfLifecycleWorkerLeak','fenieParserBeforePowerPeriodBoundary','repsolIsolationReference']){
    assert(exists(frozenCommit(key)),key);
    assert.match(manifest.frozen[key].reason,/Referencia histórica fija/i);
  }
});

test('latest acceptance record matches the accepted baseline',()=>{
  assert(Array.isArray(acceptance.history)&&acceptance.history.length>0);
  const latest=acceptance.history.at(-1);
  assert.equal(latest.version,manifest.accepted.version);
  assert.equal(latest.commit,manifest.accepted.commit);
  assert.equal(latest.acceptedAt,manifest.accepted.acceptedAt);
  assert.equal(latest.acceptedBy,manifest.accepted.acceptedBy);
  if(latest.version===1)assert.equal(latest.confirmation,'INITIAL_BASELINE_BOOTSTRAP');
  else assert.equal(latest.confirmation,'OK TODO FUNCIONA');
  assert(String(latest.auditNote||'').trim().length>=20);
});

test('test code cannot hide standalone hard-coded Git SHAs outside the central manifest',()=>{
  const offenders=[];
  for(const file of walk('tests').filter(f=>/\.(?:cjs|js|mjs)$/i.test(f))){
    const content=fs.readFileSync(file,'utf8');
    const matches=[...content.matchAll(/\b[0-9a-f]{40}\b/gi)].map(m=>m[0]);
    if(matches.length)offenders.push({file,matches});
  }
  assert.deepEqual(offenders,[]);
});
