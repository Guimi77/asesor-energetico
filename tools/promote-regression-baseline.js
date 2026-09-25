#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const args=Object.fromEntries(process.argv.slice(2).map((v,i,a)=>{
  if(!v.startsWith('--'))return null;
  const key=v.slice(2),next=a[i+1];
  return [key,next&&!next.startsWith('--')?next:''];
}).filter(Boolean));
const required=name=>{
  const value=String(args[name]||'').trim();
  if(!value)throw new Error('Missing --'+name);
  return value;
};
const sha=required('sha');
const confirmation=required('confirmation');
const auditNote=required('audit-note');
const acceptedBy=String(args['accepted-by']||process.env.GITHUB_ACTOR||'unknown').trim();
if(confirmation!=='OK TODO FUNCIONA')throw new Error('Baseline promotion refused: confirmation must be exactly "OK TODO FUNCIONA".');
if(!/^[0-9a-f]{40}$/i.test(sha))throw new Error('Baseline promotion refused: --sha must be a full 40-character SHA.');

execFileSync('git',['cat-file','-e',sha+'^{commit}']);
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(head!==sha)throw new Error('Baseline promotion refused: candidate SHA must be the checked-out HEAD.');

const manifestPath='tests/regression-baselines.json';
const logPath='tests/regression-baseline-acceptance.json';
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const log=JSON.parse(fs.readFileSync(logPath,'utf8'));
const previous=String(manifest.accepted.sourceCommit||'');
const version=Number(manifest.accepted.version||0)+1;
const acceptedAt=new Date().toISOString().slice(0,10);
const files=[...(manifest.accepted.files||[])];
if(!files.length)throw new Error('Baseline promotion refused: accepted snapshot has no declared files.');

const snapshot='tests/regression-snapshots/accepted-v'+version;
if(fs.existsSync(snapshot))throw new Error('Baseline promotion refused: snapshot already exists: '+snapshot);
for(const file of files){
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('Baseline promotion refused: missing source file '+file);
  const target=path.join(snapshot,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(file,target);
}

manifest.schemaVersion=2;
manifest.accepted={version,snapshot,files,sourceCommit:sha,acceptedAt,acceptedBy,reason:auditNote};
log.history=Array.isArray(log.history)?log.history:[];
log.history.push({version,commit:sha,previousCommit:previous||null,acceptedAt,acceptedBy,confirmation,auditNote});

fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(logPath,JSON.stringify(log,null,2)+'\n');
console.log('Regression baseline promoted to portable snapshot',snapshot,'from',sha,'version',version);
console.log('Frozen historical snapshots were not modified.');
