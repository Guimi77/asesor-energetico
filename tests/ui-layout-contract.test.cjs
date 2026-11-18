'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dbUi=fs.readFileSync(path.join(root,'internal-db-usage.js'),'utf8');
const dbCss=fs.readFileSync(path.join(root,'internal-db-usage.css'),'utf8');
const clientUi=fs.readFileSync(path.join(root,'client-archive-integrated.js'),'utf8');
const masterUi=fs.readFileSync(path.join(root,'master-v2.js'),'utf8');

test('Clientes keeps its core layout contract',()=>{
  const start=html.indexOf('<div id="clientesView"');
  const end=html.indexOf('<div id="cupsView"',start);
  assert.ok(start>=0 && end>start);
  const view=html.slice(start,end);

  const positions=[
    view.indexOf('class="master-actions card"'),
    view.indexOf('id="clientSearch"'),
    view.indexOf('id="clientEditor"'),
    view.indexOf('id="masterStatus"'),
    view.indexOf('id="companyGrid"')
  ];
  assert.ok(positions.every(x=>x>=0));
  for(let i=1;i<positions.length;i++) assert.ok(positions[i]>positions[i-1]);

  assert.doesNotMatch(view,/internalDbUsage/);
  assert.doesNotMatch(view,/Uso de base de datos/);
});

test('administrative database usage is isolated in Configuración',()=>{
  assert.match(dbUi,/const view = \$\('#settingsView'\)/);
  assert.doesNotMatch(dbUi,/const view = \$\('#clientesView'\)/);
  assert.match(html,/id="settingsView"/);
  assert.match(html,/internal-db-usage\.css\?v=/);
  assert.match(html,/internal-db-usage\.js\?v=fed0836b0ca2/);
});

test('database usage keeps its compact grid presentation contract',()=>{
  assert.match(dbCss,/\.internal-db-usage-grid\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(dbCss,/@media\(max-width:1180px\)\{\.internal-db-usage-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}\}/);
  assert.match(dbCss,/@media\(max-width:700px\)/);
});

test('Clientes uses only the integrated holder hierarchy, not duplicate admin panels',()=>{
  assert.match(clientUi,/#centralClientsAdmin,#centralHoldersAdmin,#centralSuppliesAdmin\{display:none!important\}/);
  assert.match(clientUi,/function prepareClientHierarchy/);
  assert.match(clientUi,/function integrateHolderActions/);
  assert.match(clientUi,/function integrateHolderChangeControls/);
});


test('Clientes shows the current retailer on every supply row',()=>{
  assert.match(masterUi,/const retailer = supply\.retailer \|\| 'Comercializadora pendiente'/);
  assert.match(masterUi,/class="supply-current-retailer"/);
  assert.match(masterUi,/Comercializadora:/);
  assert.match(clientUi,/\.supply-current-retailer\{/);
  assert.match(clientUi,/\.supply-current-retailer-label\{/);
});

test('retailer is secondary metadata and remains directly editable',()=>{
  assert.match(html,/id="supplyRetailer"/);
  assert.match(masterUi,/\$\('#supplyRetailer'\)\.value = supply\.retailer/);
  assert.match(masterUi,/manualRetailerChanged/);
  assert.match(masterUi,/supply-retailer-manual-tag/);
  assert.match(clientUi,/\.supply-current-retailer\{[\s\S]*background:transparent/);
  assert.match(clientUi,/\.supply-current-retailer\{[\s\S]*font-size:\.62rem!important/);
  assert.match(clientUi,/\.supply-retailer-manual-tag\{[\s\S]*background:#f1f4f6/);
  assert.doesNotMatch(clientUi,/\.supply-current-retailer\{[\s\S]{0,500}background:#eafaf7/);
});

test('Clientes hides positive holder coherence notices but keeps mismatch warnings',()=>{
  assert.match(clientUi,/source\.querySelector\('\.db-mismatch'\)/);
  assert.doesNotMatch(clientUi,/source\.querySelector\('\.db-mismatch,\.db-mismatch-ok'\)/);
  assert.match(clientUi,/notice\.classList\.add\('warning'\)/);
});

test('holder contact data has an explicit visual hierarchy',()=>{
  assert.match(masterUi,/class="holder-title-main"/);
  assert.match(masterUi,/class="holder-contact-line"/);
  assert.match(masterUi,/class="holder-contact-item"/);
  assert.match(masterUi,/class="holder-contact-label">Correo/);
  assert.match(masterUi,/class="holder-contact-label">Tel\./);
  assert.match(masterUi,/class="holder-contact-label">Cuenta/);
  assert.match(clientUi,/\.holder-title-wrap\{[\s\S]*flex-direction:column/);
  assert.match(clientUi,/\.holder-contact-line\{[\s\S]*display:flex/);
  assert.match(clientUi,/\.holder-contact-label\{[\s\S]*text-transform:uppercase/);
  assert.match(clientUi,/const titleMain = \$\('\.holder-title-main', summary\)/);
});

test('supply editor is grouped and shows effective contact values instead of inheritance placeholders',()=>{
  assert.match(html,/class="client-form client-form-organized"/);
  assert.match(html,/Cliente y titular/);
  assert.match(html,/Contacto y cobro/);
  assert.match(html,/Suministro/);
  assert.match(html,/Contrato y potencia/);
  assert.doesNotMatch(html,/placeholder="Heredad[oa] del titular"/);
  assert.doesNotMatch(html,/id="supplyContactInheritance"/);
  assert.match(masterUi,/supply\.supplyEmailOverride \|\| holderDefaults\.email/);
  assert.match(masterUi,/supply\.supplyPhoneOverride \|\| holderDefaults\.phone/);
  assert.match(masterUi,/supply\.supplyBankAccountOverride \|\| holderDefaults\.bankAccount/);
  assert.match(masterUi,/emailValue === holderDefaults\.email \? '' : emailValue/);
});

test('supply editor exposes periodized contracted power and max contractable power',()=>{
  for(let p=1;p<=6;p++) assert.match(html,new RegExp(`id="supplyPowerP${p}"`));
  assert.match(html,/id="supplyMaxContractablePower"/);
  assert.match(masterUi,/function updatePowerPeriodVisibility\(\)/);
  assert.match(masterUi,/powerPeriodCount/);
  assert.match(masterUi,/set_internal_supply_power_profile/);
  assert.match(masterUi,/contracted_exceeds_max_contractable/);
});

test('existing holder can be explicitly assigned to a group without editing its identity',()=>{
  assert.match(html,/id="holderGroupLink"/);
  assert.match(html,/id="holderTargetGroup"/);
  assert.match(html,/id="holderLinkToGroup"[^>]+type="button"|type="button" id="holderLinkToGroup"/);
  assert.match(masterUi,/function setupGroupLinkControls\(supply = null\)/);
  assert.match(masterUi,/function linkCurrentHolderToGroup\(/);
  assert.match(masterUi,/holderLinkToGroup'\)\.onclick = linkCurrentHolderToGroup/);
  assert.match(masterUi,/setupGroupLinkControls\(supply\)/);
});
