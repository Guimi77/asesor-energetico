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
const logoPath=path.join(root,'assets','bt-energia-logo.jpg');
const logo=fs.readFileSync(logoPath);

test('BT Energía logo is the single visible brand asset in app and access gate',()=>{
  assert.equal(logo.length,7768,'brand logo byte length changed unexpectedly');
  assert.equal(crypto.createHash('sha1').update(logo).digest('hex'),'0a4c78e35476bb52046365db019b5fc47e7b6c33','brand logo bytes must match the verified source');
  assert.equal(logo[0],0xff);
  assert.equal(logo[1],0xd8);
  assert.equal(logo[logo.length-2],0xff);
  assert.equal(logo[logo.length-1],0xd9);
  const refs=index.match(/assets\/bt-energia-logo\.jpg\?v=be93d080a8a4/g)||[];
  assert.equal(refs.length,2,'login/maintenance and topbar must share the new logo');
  assert(!index.includes('assets/capcalera-documents.png'),'old logo must not remain referenced');
  assert(!index.includes('assets/bt-energia-logo.webp'),'broken WebP must not remain referenced');
  assert(index.includes('alt="BT Energía"'));
  assert(index.includes('alt="BT Energía · Gestionam la teva factura elèctrica"'));
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
