'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const manifestPath=path.join(__dirname,'..','regression-baselines.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const SHA_RE=/^[0-9a-f]{40}$/i;

function checkedSha(value,label){
  const sha=String(value||'').trim();
  if(!SHA_RE.test(sha))throw new Error(label+' must be a full 40-character Git SHA');
  return sha;
}
function acceptedCommit(){return checkedSha(manifest?.accepted?.commit,'accepted baseline');}
function frozenCommit(name){
  const entry=manifest?.frozen?.[name];
  if(!entry)throw new Error('Unknown frozen regression reference: '+name);
  return checkedSha(entry.commit,'frozen baseline '+name);
}
function at(commit,file){
  return execFileSync('git',['show',checkedSha(commit,'baseline commit')+':'+file],{encoding:'utf8'});
}
function acceptedFile(file){return at(acceptedCommit(),file);}

module.exports={manifest,acceptedCommit,frozenCommit,at,acceptedFile};
