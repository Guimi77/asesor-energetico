'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const master=fs.readFileSync(path.join(root,'master-v2.js'),'utf8');
const pilot=fs.readFileSync(path.join(root,'supabase-xtra-pilot.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20261117113606_add_private_client_contact_details.sql'),'utf8');

test('la ficha de cliente permite correo telefono y cuenta bancaria',()=>{
  assert.match(index,/id="clientEmail" type="email"/);
  assert.match(index,/id="clientPhone" type="tel"/);
  assert.match(index,/id="clientBankAccount"/);
  assert.match(index,/Nº cuenta \/ IBAN/);
});

test('los contactos se guardan por cliente mediante RPC privada',()=>{
  assert.match(master,/supabase\.rpc\('set_internal_client_contacts'/);
  assert.match(master,/p_client_id: clientId/);
  assert.match(master,/p_email: norm\(supply\.clientEmail\)/);
  assert.match(master,/p_phone: norm\(supply\.clientPhone\)/);
  assert.match(master,/p_bank_account: norm\(supply\.clientBankAccount\)/);
  assert.match(master,/centralSave\.data\?\.client_id/);
});

test('la sincronizacion central carga los contactos internos',()=>{
  assert.match(pilot,/supabase\.rpc\('get_internal_client_contacts'/);
  assert.match(pilot,/clientEmail: contact\.email \|\| ''/);
  assert.match(pilot,/clientPhone: contact\.phone \|\| ''/);
  assert.match(pilot,/clientBankAccount: contact\.bank_account \|\| ''/);
});

test('los datos sensibles no quedan persistidos en localStorage y el banco se muestra enmascarado',()=>{
  assert.match(master,/clientEmail, clientPhone, clientBankAccount/);
  assert.match(master,/maskedBankAccount/);
  assert.match(master,/Cuenta \$\{esc\(maskedBankAccount\(primaryMember\.bankAccount\)\)\}/);
});

test('la base mantiene los contactos fuera del esquema publico y restringe las RPC',()=>{
  assert.match(migration,/create table if not exists private\.client_contact_details/i);
  assert.doesNotMatch(migration,/alter table public\.clients[\s\S]*add column/i);
  assert.match(migration,/revoke all on private\.client_contact_details from public, anon, authenticated/i);
  assert.match(migration,/private\.is_internal_user\(\)/);
  assert.match(migration,/revoke all on function public\.get_internal_client_contacts\(\) from public, anon, authenticated/i);
  assert.match(migration,/revoke all on function public\.set_internal_client_contacts\(uuid,text,text,text\) from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.get_internal_client_contacts\(\) to authenticated/i);
  assert.match(migration,/grant execute on function public\.set_internal_client_contacts\(uuid,text,text,text\) to authenticated/i);
});

test('la auditoria no guarda el valor del IBAN',()=>{
  assert.match(migration,/'has_bank_account'/);
  assert.doesNotMatch(migration,/jsonb_build_object\([\s\S]{0,500}'bank_account',\s*v_bank/i);
});
