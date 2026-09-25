'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../auth.js','utf8');

test('client portal keeps historical UI intact for RLS-scoped rendering',()=>{
  assert.match(source,/history-ui\.js lo carga con RLS/);
  assert.doesNotMatch(source,/historical\.innerHTML=.*Sin datos asignados todavía/);
});

test('admin can assign and remove client access through client_users',()=>{
  assert.match(source,/from\('client_users'\)\.insert\(\{user_id:userId,client_id:clientId\}\)/);
  assert.match(source,/from\('client_users'\)\.delete\(\)\.eq\('user_id',userId\)\.eq\('client_id',clientId\)/);
  assert.match(source,/from\('clients'\)\.select\('id,name,status'\)/);
});

test('new client account is told that data access needs admin assignment',()=>{
  assert.match(source,/un administrador debe asignarte tu ficha/);
});
