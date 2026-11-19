'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const authBootstrap=fs.readFileSync(path.join(root,'auth-bootstrap.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'auth.js'),'utf8');

function gitBlobSha(file){
  const buf=fs.readFileSync(path.join(root,file));
  return crypto.createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
}

function escapedName(file){
  return file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function assertSourceCacheToken(source,file){
  const expected=gitBlobSha(file).slice(0,12);
  assert.match(source,new RegExp(escapedName(file)+'\\?v='+expected+'(?:[\"\'])'),file+' debe usar como cache-buster el hash de su contenido ('+expected+')');
}

function assertCacheToken(file){
  assertSourceCacheToken(index,file);
}

test('los assets críticos no pueden desplegar código nuevo con una URL cacheada antigua',()=>{
  assertCacheToken('app.js');
  assertCacheToken('pdf-text-normalizer.js');
  assertCacheToken('fenie-parser.js');
  assertCacheToken('iberdrola-parser-v3.js');
  assertCacheToken('repsol-parser.js');
  assertCacheToken('uenergia-parser.js');
  assertCacheToken('naturgy-parser.js');
  assertCacheToken('sea-parser.js');
  assertCacheToken('som-energia-parser.js');
  assertCacheToken('parser-audit.js');
  assertCacheToken('bulk-performance.js');
  assertCacheToken('auth-bootstrap.js');
  assertCacheToken('auth.js');
  assertSourceCacheToken(auth,'admin-data-management.js');
  assertCacheToken('ui-compact.css');
  assertCacheToken('ui-compact.js');
  assertCacheToken('client-archive-integrated.js');
  assertCacheToken('history-ui.js');
  assertSourceCacheToken(authBootstrap,'xtra-history.js');
  assertSourceCacheToken(authBootstrap,'supabase-xtra-pilot.js');
  assertSourceCacheToken(authBootstrap,'bulk-performance.js');
  assertSourceCacheToken(authBootstrap,'history-ui.js');
  assertSourceCacheToken(authBootstrap,'analysis-ui.js');
  assertSourceCacheToken(authBootstrap,'alerts-ui.js');
});
