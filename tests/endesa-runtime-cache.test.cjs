'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

function cacheKey(version){
  const parts=String(version||'').split('.');
  assert.equal(parts.length,4,'Endesa source validation version must keep YYYY.MM.DD.N format');
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}`;
}

test('production HTML cache-bust matches the current Endesa source validation version',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const source=fs.readFileSync('endesa-source-validation.js','utf8');
  const match=source.match(/const VERSION='([^']+)'/);
  assert.ok(match,'Endesa source validation VERSION was not found');
  const expected=`endesa-source-validation.js?v=${cacheKey(match[1])}`;
  assert.ok(html.includes(expected),`index.html must load ${expected}`);
});
