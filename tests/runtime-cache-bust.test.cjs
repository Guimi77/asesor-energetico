'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');

function gitBlobSha(file){
  const buf=fs.readFileSync(path.join(root,file));
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

function assertCacheToken(file){
  const expected=gitBlobSha(file).slice(0,12);
  const escaped=file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(index,new RegExp(`${escaped}\\?v=${expected}(?:[\"'])`),`${file} debe usar como cache-buster el hash de su contenido (${expected})`);
}

test('los assets críticos no pueden desplegar código nuevo con una URL cacheada antigua',()=>{
  assertCacheToken('app.js');
  assertCacheToken('iberdrola-parser.js');
  assertCacheToken('iberdrola-parser-hardening.js');
  assertCacheToken('iberdrola-parser-v2.js');
  assertCacheToken('parser-audit.js');
});
