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
  assert(confirmation.includes("render('ok','Registro completado'"));
  assert(confirmation.includes('No mostramos “registro completado” por suposición.'));
  assert(confirmation.includes('assets/capcalera-documents.png'));
});

test('confirmation page leaves the user signed out after verification',()=>{
  assert(confirmation.includes("supabase.auth.signOut({scope:'local'})"));
  assert(confirmation.includes('Un administrador vinculará manualmente tu cuenta con tu ficha y tus CUPS'));
});

test('GitHub Pages 404 rescues auth callbacks instead of showing a dead end',()=>{
  for(const token of ['access_token','error_code','registro-completado.html'])assert(notFound.includes(token),token);
  assert(notFound.includes('location.replace(target)'));
});
