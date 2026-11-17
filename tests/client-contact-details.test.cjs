'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const master=fs.readFileSync(path.join(root,'master-v2.js'),'utf8');
const pilot=fs.readFileSync(path.join(root,'supabase-xtra-pilot.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin-data-management.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20261117121000_holder_billing_profiles_inheritance.sql'),'utf8');

test('el titular es la fuente principal de contacto y cobro',()=>{
  assert.match(admin,/holderProfileEmail/);
  assert.match(admin,/holderProfilePhone/);
  assert.match(admin,/holderProfileBankAccount/);
  assert.match(admin,/admin_update_holder_profile/);
  assert.match(admin,/Sus suministros heredarán estos datos salvo excepción/);
});

test('editar titular usa una ficha real y no prompts para nombre o nif',()=>{
  assert.match(admin,/holderProfileEditor/);
  assert.match(admin,/openHolderProfile/);
  assert.match(admin,/saveHolderProfile/);
  const editStart=admin.indexOf("if (action === 'edit_holder')");
  const editEnd=admin.indexOf("if (action === 'sync_holder_name')",editStart);
  const segment=admin.slice(editStart,editEnd);
  assert.match(segment,/openHolderProfile\(id\)/);
  assert.doesNotMatch(segment,/prompt\(/);
});

test('el suministro muestra los datos efectivos y guarda solo excepciones respecto al titular',()=>{
  assert.match(index,/Contacto y cobro/);
  assert.match(index,/Correo electrónico/);
  assert.match(index,/Teléfono de contacto/);
  assert.match(index,/Cuenta \/ IBAN/);
  assert.match(index,/id="clearSupplyContactOverrides"/);
  assert.doesNotMatch(index,/Heredad[oa] del titular/);
  assert.doesNotMatch(index,/supplyContactInheritance/);
  assert.match(master,/supply\.supplyEmailOverride \|\| holderDefaults\.email/);
  assert.match(master,/supply\.supplyPhoneOverride \|\| holderDefaults\.phone/);
  assert.match(master,/supply\.supplyBankAccountOverride \|\| holderDefaults\.bankAccount/);
  assert.match(master,/emailValue === holderDefaults\.email \? '' : emailValue/);
  assert.match(master,/set_internal_supply_contact_overrides/);
});

test('la sincronizacion calcula dato efectivo como override o titular',()=>{
  assert.match(pilot,/get_internal_billing_profiles/);
  assert.match(pilot,/holderEmail: holderProfile\.email \|\| ''/);
  assert.match(pilot,/supplyBankAccountOverride: override\.bank_account \|\| ''/);
  assert.match(pilot,/effectiveEmail: override\.email \|\| holderProfile\.email \|\| ''/);
  assert.match(pilot,/effectiveBankAccount: override\.bank_account \|\| holderProfile\.bank_account \|\| ''/);
  assert.match(pilot,/holderId: holder\.id/);
  assert.match(pilot,/supplyId: supply\.id/);
});

test('los datos privados no quedan persistidos en localStorage y la cuenta se enmascara',()=>{
  assert.match(master,/holderEmail,[\s\S]*supplyBankAccountOverride,[\s\S]*effectiveBankAccount/);
  assert.match(master,/maskedBankAccount/);
  assert.match(master,/maskedBankAccount\(holder\.bankAccount\)/);
  assert.match(master,/class="holder-contact-label">Cuenta/);
  assert.match(master,/class="holder-contact-value"/);
});

test('base privada separa perfil de titular y excepciones de suministro',()=>{
  assert.match(migration,/create table if not exists private\.holder_contact_details/i);
  assert.match(migration,/create table if not exists private\.supply_contact_overrides/i);
  assert.match(migration,/references public\.holders\(id\) on delete cascade/i);
  assert.match(migration,/references public\.supplies\(id\) on delete cascade/i);
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/revoke all on private\.holder_contact_details from public, anon, authenticated/i);
  assert.match(migration,/revoke all on private\.supply_contact_overrides from public, anon, authenticated/i);
  assert.match(migration,/private\.is_internal_user\(\)/);
});

test('migracion anterior solo se copia a titular si no hay ambiguedad',()=>{
  assert.match(migration,/from private\.client_contact_details d/);
  assert.match(migration,/where \(\s*select count\(\*\)[\s\S]*hx\.client_id=d\.client_id[\s\S]*\)=1/);
  assert.match(migration,/on conflict \(holder_id\) do nothing/);
});

test('auditoria nunca guarda el valor de la cuenta',()=>{
  assert.match(migration,/'has_bank_account'/);
  assert.match(migration,/'has_bank_account_override'/);
  assert.doesNotMatch(migration,/jsonb_build_object\([\s\S]{0,600}'bank_account',\s*v_bank/i);
});
