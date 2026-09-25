'use strict';
const fs=require('node:fs');
const path=require('node:path');

const manifestPath=path.join(__dirname,'..','regression-baselines.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));

function snapshotRoot(entry,label){
  const rel=String(entry?.snapshot||'').trim();
  if(!rel)throw new Error(label+' snapshot path is missing');
  const root=path.resolve(rel);
  if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new Error(label+' snapshot directory does not exist: '+rel);
  return root;
}
function snapshotFile(entry,file,label){
  const rel=String(file||'').replace(/\\/g,'/');
  if(!rel||rel.startsWith('/')||rel.split('/').includes('..'))throw new Error(label+' invalid snapshot file: '+rel);
  if(Array.isArray(entry?.files)&&!entry.files.includes(rel))throw new Error(label+' snapshot file not declared: '+rel);
  const root=snapshotRoot(entry,label),target=path.resolve(root,rel);
  if(target!==root&&!target.startsWith(root+path.sep))throw new Error(label+' snapshot path escaped root');
  return fs.readFileSync(target,'utf8');
}
function acceptedFile(file){return snapshotFile(manifest.accepted,file,'accepted baseline');}
function frozenFile(name,file){
  const entry=manifest?.frozen?.[name];
  if(!entry)throw new Error('Unknown frozen regression reference: '+name);
  return snapshotFile(entry,file,'frozen baseline '+name);
}
function acceptedSnapshot(){return snapshotRoot(manifest.accepted,'accepted baseline');}
function frozenSnapshot(name){
  const entry=manifest?.frozen?.[name];
  if(!entry)throw new Error('Unknown frozen regression reference: '+name);
  return snapshotRoot(entry,'frozen baseline '+name);
}

module.exports={manifest,acceptedFile,frozenFile,acceptedSnapshot,frozenSnapshot};
