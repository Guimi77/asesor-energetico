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
const i18n=fs.readFileSync(path.join(root,'i18n.js'),'utf8');
const authJs=fs.readFileSync(path.join(root,'auth.js'),'utf8');

test('requested lateral and lower-text logos are mapped to app and access respectively',()=>{
  // Both original JPEG sources explicitly supplied and requested on 2026-10-13.
  assert(index.includes('class="company-logo" src="assets/energia-bt-lateral.jpg?v=fb457adaa405" alt="Energia BT"'));
  const lateral=fs.readFileSync(path.join(root,'assets','energia-bt-lateral.jpg'));
  assert.equal(crypto.createHash('sha1').update(lateral).digest('hex'),'64ede9b894307a6664b1405403672084035275cd','original lateral JPEG must be preserved');
  assert(index.includes('class="auth-logo" src="assets/energia-bt-inferior.jpg?v=628006832ae8" alt="Energia BT"'));
  const inferior=fs.readFileSync(path.join(root,'assets','energia-bt-inferior.jpg'));
  assert.equal(crypto.createHash('sha1').update(inferior).digest('hex'),'ecc24da87a84c23e19cbe6a64968e0a125901a8e','original inferior JPEG must be preserved');
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
