'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const auth=fs.readFileSync('auth.js','utf8');
const confirmation=fs.readFileSync('registro-completado.html','utf8');
const notFound=fs.readFileSync('404.html','utf8');

test('signup requests the branded confirmation destination',()=>{
  assert(auth.includes("const SIGNUP_CONFIRM_URL=new URL('registro-completado.html',APP_ROOT).href"));
  assert(auth.includes('emailRedirectTo:SIGNUP_CONFIRM_URL'));
});

test('confirmation page verifies the authenticated user before claiming success',()=>{
  assert(confirmation.includes('supabase.auth.getUser()'));
  assert(confirmation.includes("render('ok','Correo confirmado'"));
  assert(confirmation.includes('No mostramos “registro completado” por suposición.'));
  assert(confirmation.includes('assets/energia-bt-inferior.jpg?v=628006832ae8')); // Reuses the current login brand.
});

test('confirmation page leaves the user signed out after verification',()=>{
  assert(confirmation.includes("supabase.auth.signOut({scope:'local'})"));
  assert(confirmation.includes('Un administrador vinculará manualmente tu cuenta con tu ficha y tus CUPS'));
  assert(confirmation.includes("profile?.role==='client'&&profile.active===false"));
  assert(confirmation.includes('Ya puedes volver al acceso e iniciar sesión'));
  assert(confirmation.includes('auth.css?v=7e6a616f7cd6'));
  assert(confirmation.includes('bt-action-theme.css?v=93d27f214ea0'));
  assert(confirmation.includes('auth-result-icon'));
  assert(!confirmation.includes('assets/bt-energia-logo.png'));
});

test('GitHub Pages 404 rescues auth callbacks instead of showing a dead end',()=>{
  for(const token of ['access_token','error_code','registro-completado.html'])assert(notFound.includes(token),token);
  assert(notFound.includes('location.replace(target)'));
});
