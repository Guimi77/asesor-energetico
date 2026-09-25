'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {manifest,acceptedSnapshot,frozenSnapshot}=require('./helpers/regression-baseline.cjs');

const acceptance=JSON.parse(fs.readFileSync('tests/regression-baseline-acceptance.json','utf8'));
const SHA_RE=/^[0-9a-f]{40}$/i;
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const full=path.join(dir,entry.name);
  return entry.isDirectory()?walk(full):[full];
});
const verifyEntry=(entry,label,root)=>{
  assert.match(String(entry.sourceCommit||''),SHA_RE,label+' sourceCommit');
  assert(Array.isArray(entry.files)&&entry.files.length>0,label+' files');
  for(const file of entry.files){
    assert(!path.isAbsolute(file),label+' absolute file');
    assert(!String(file).split(/[\\/]/).includes('..'),label+' traversal');
    assert(fs.existsSync(path.join(root,file)),label+' missing '+file);
  }
};

test('accepted baseline is a portable versioned snapshot with provenance',()=>{
  assert.equal(manifest.schemaVersion,2);
  assert(Number.isInteger(manifest.accepted.version)&&manifest.accepted.version>0);
  const root=acceptedSnapshot();
  assert(root.includes(path.join('tests','regression-snapshots')));
  verifyEntry(manifest.accepted,'accepted baseline',root);
});

test('frozen historical reproductions are portable snapshots with provenance',()=>{
  for(const key of ['historyChartRefreshLegacyTwoCharts','pdfLifecycleWorkerLeak','fenieParserBeforePowerPeriodBoundary','repsolIsolationReference','historyRecommendationsCoreLock']){
    const entry=manifest.frozen[key];
    assert(entry,key);
    assert.match(entry.reason,/Referencia histórica fija/i);
    const root=frozenSnapshot(key);
    assert(root.includes(path.join('tests','regression-snapshots')));
    verifyEntry(entry,'frozen baseline '+key,root);
  }
});

test('latest acceptance record matches the portable accepted baseline',()=>{
  assert(Array.isArray(acceptance.history)&&acceptance.history.length>0);
  const latest=acceptance.history.at(-1);
  assert.equal(latest.version,manifest.accepted.version);
  assert.equal(latest.commit,manifest.accepted.sourceCommit);
  assert.equal(latest.acceptedAt,manifest.accepted.acceptedAt);
  assert.equal(latest.acceptedBy,manifest.accepted.acceptedBy);
  if(latest.version===1)assert.equal(latest.confirmation,'INITIAL_BASELINE_BOOTSTRAP');
  else assert.equal(latest.confirmation,'OK TODO FUNCIONA');
  assert(String(latest.auditNote||'').trim().length>=20);
});

test('active test code cannot hide standalone hard-coded Git SHAs outside the central manifest',()=>{
  const snapshots=path.resolve('tests/regression-snapshots')+path.sep;
  const offenders=[];
  for(const file of walk('tests').filter(f=>/\.(?:cjs|js|mjs)$/i.test(f))){
    if(path.resolve(file).startsWith(snapshots))continue;
    const fileContent=fs.readFileSync(file,'utf8');
    const matches=[...fileContent.matchAll(/\b[0-9a-f]{40}\b/gi)].map(m=>m[0]);
    if(matches.length)offenders.push({file,matches});
  }
  assert.deepEqual(offenders,[]);
});

test('portable baseline helper has no dependency on historical git objects',()=>{
  const helper=fs.readFileSync('tests/helpers/regression-baseline.cjs','utf8');
  assert(!/git\s+show|cat-file|merge-base|child_process|execFileSync/.test(helper));
  assert(helper.includes('regression-baselines.json'));
  assert(helper.includes('readFileSync'));
});
