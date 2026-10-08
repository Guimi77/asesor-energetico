'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const styles=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const auth=fs.readFileSync(path.join(root,'auth.css'),'utf8');
const compact=fs.readFileSync(path.join(root,'ui-compact.css'),'utf8');
const recommendations=fs.readFileSync(path.join(root,'history-recommendations.css'),'utf8');
const dbUsage=fs.readFileSync(path.join(root,'internal-db-usage.css'),'utf8');
const logoPath=path.join(root,'assets','bt-energia-logo.png');
const logo=fs.readFileSync(logoPath);
const i18n=fs.readFileSync(path.join(root,'i18n.js'),'utf8');
const authJs=fs.readFileSync(path.join(root,'auth.js'),'utf8');

test('BT Energía uses horizontal app branding while preserving the access logo',()=>{
  // Source replacement explicitly requested by Guimi on 2026-10-08: same logo, transparent PNG.
  assert.equal(logo.length,131229,'brand logo byte length changed unexpectedly');
  assert.equal(crypto.createHash('sha1').update(logo).digest('hex'),'153c7810bcafded909690e5ebdf1c715bc828d64','brand logo bytes must match the supplied transparent source');
  assert.deepEqual([...logo.subarray(0,8)],[137,80,78,71,13,10,26,10],'brand asset must remain PNG');
  assert.equal(logo[25],6,'PNG must preserve its RGBA channel');
  const refs=index.match(/assets\/bt-energia-logo\.png\?v=186342746abb/g)||[];
  assert.equal(refs.length,1,'login/maintenance must retain the vertical logo');
  assert(index.includes('class="auth-logo" src="assets/bt-energia-logo.png?v=186342746abb"'));
  assert(index.includes('class="company-logo" src="assets/bt-energia-logo-horizontal.png?v=f69426786088"'));
  const horizontal=fs.readFileSync(path.join(root,'assets','bt-energia-logo-horizontal.png'));
  assert.equal(crypto.createHash('sha1').update(horizontal).digest('hex'),'bfa9904a156fa45f1145e39d205f17dbd78092d3','horizontal logo must match the user source');
  assert(!index.includes('assets/capcalera-documents.png'),'old logo must not remain referenced');
  assert(!index.includes('assets/bt-energia-logo.jpg'),'opaque JPEG must not remain referenced');
  assert(!index.includes('assets/bt-energia-logo.webp'),'broken WebP must not remain referenced');
  assert(index.includes('alt="BT Energía"'));
  assert(index.includes('alt="BT Energía · Gestionam la teva factura elèctrica"'));
});

test('legacy Instal·lacions BT brand copy is gone from user-facing sources',()=>{
  for(const [name,source] of [['index.html',index],['i18n.js',i18n],['auth.js',authJs]]){
    assert(!source.includes('Instal·lacions BT'),name+' still contains the legacy brand name');
  }
  assert(index.includes('<title>BT Energía · Asesor Energético Alpha</title>'));
  assert(index.includes('BT Energía revisará la solicitud'));
  assert(index.includes('BT Energía revisará tus datos'));
  assert(authJs.includes('pendiente de aprobación por BT Energía'));
});

test('brand palette uses turquoise and charcoal without replacing semantic statuses',()=>{
  assert(styles.includes('--bt-charcoal:#20262b'));
  assert(styles.includes('--bt-teal:#009b91'));
  assert(styles.includes('--bt-teal-bright:#00d8c4'));
  assert(styles.includes('--bt-teal-deep:#006b68'));
  assert(styles.includes('.sidebar{background:linear-gradient(180deg,var(--bt-charcoal),var(--bt-charcoal-deep))}'));
  assert(styles.includes('.sidebar nav a.active{background:linear-gradient(90deg,var(--bt-teal-deep),var(--bt-teal-bright))'));
  assert(styles.includes('.ok{background:#e5f6e8;color:#19742b}'),'success green must remain semantic');
  assert(styles.includes('.danger{background:#fde9e7;color:#b42318}'),'danger red must remain semantic');
  assert(auth.includes('.auth-gate{background:radial-gradient(circle at top,#e6fbf7'));
  assert(auth.includes('.maintenance-icon{background:#e8faf7;color:#007d78}'));
  assert(compact.includes('.company-logo{max-width:112px!important;max-height:74px!important}'));
  assert(recommendations.includes('border-left:3px solid #009b91'));
  assert(dbUsage.includes('background:linear-gradient(90deg,#009b91,#00c8b8)'));
});

console.log('BT Energía brand regression checks passed');
