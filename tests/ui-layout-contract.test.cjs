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


test('commercial portfolio field groups CUPS across legal clients without changing holder identities',()=>{
  assert.match(html,/id="clientGroupSelect"/);
  assert.match(html,/id="clientPortfolioNewName"/);
  assert.match(html,/id="clientPortfolioNewAlias"/);
  assert.match(html,/id="clientPortfolioSaveAlias"/);
  assert.match(masterUi,/function configureClientGroupField\(supply = null\)/);
  assert.match(masterUi,/portfolioId: norm\(raw\.portfolioId\)/);
  assert.match(masterUi,/PORTFOLIO\|/);
  assert.match(masterUi,/saveCommercialPortfolio\(\)/);
  assert.match(masterUi,/set_internal_supply_portfolio'/);
  assert.match(masterUi,/set_internal_supply_portfolio_alias'/);
});


test('BT interactive theme removes white actions across all menus without recoloring destructive buttons',()=>{
  const actionCss=fs.readFileSync(path.join(root,'bt-action-theme.css'),'utf8');
  const themeLink=html.match(/<link rel="stylesheet" href="bt-action-theme\.css\?v=[a-f0-9]{12}"\/>/);
  assert.ok(themeLink,'BT action theme must have a content-hash cache marker');
  const links=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"\/>/g)].map(match=>match[1]);
  assert.ok(links.at(-1).startsWith('bt-action-theme.css?'),'Theme must come after legacy CSS');
  assert.match(actionCss,/body button,/);
  assert.match(actionCss,/body button\.primary/);
  assert.match(actionCss,/body button\.company-link/);
  assert.match(actionCss,/body #exportExcel/);
  assert.match(actionCss,/body #auditParser/);
  assert.match(actionCss,/body button\.integrated-supply-archive/);
  assert.match(actionCss,/body button\.integrated-client-archive/);
  assert.match(actionCss,/body button:focus-visible/);
  assert.match(actionCss,/body button:disabled/);
  assert.doesNotMatch(actionCss,/\b(?:select|input\[type="text"\])\s*\{/);
});

test('group collapse styling has no large boxed toggle',()=>{
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  const theme=fs.readFileSync(path.join(root,'bt-action-theme.css'),'utf8');
  assert.match(masterUi,/class="client-group-heading"/);
  assert.match(css,/width:16px;height:22px/);
  assert.match(theme,/body button\.client-group-toggle/);
  assert.match(theme,/border: 0 !important/);
  assert.doesNotMatch(masterUi,/client-group-toggle-label/);
});

test('client supply editor opens as an accessible modal without jumping to the page top',()=>{
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert.match(html,/id="clientEditorBackdrop"/);
  assert.match(html,/id="clientEditor"[^>]+role="dialog"/);
  assert.match(html,/aria-labelledby="clientEditorTitle"/);
  assert.match(masterUi,/function showEditorModal\(\)/);
  assert.match(masterUi,/document\.body\.classList\.add\('client-editor-modal-open'\)/);
  assert.match(masterUi,/document\.body\.classList\.remove\('client-editor-modal-open'\)/);
  assert.match(masterUi,/lastEditorTrigger\.focus\(\{preventScroll:true\}\)/);
  assert.match(masterUi,/event\.key === 'Escape'/);
  assert.match(masterUi,/event\.key === 'Tab'/);
  assert.match(css,/#clientEditorBackdrop\{position:fixed/);
  assert.match(css,/body\.client-editor-modal-open #clientEditor\{/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.doesNotMatch(masterUi, /editor\.scrollIntoView\(/);
  assert.doesNotMatch(masterUi, /\$\('#clientEditor'\)\.scrollIntoView\(/);
});

test('maximum contractable power is immediately below the whole P1-P6 contracted power block',()=>{
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  const powerStart=html.indexOf('class="power-profile-field power-profile-full-row"');
  const hint=html.indexOf('id="contractedPowerHint"',powerStart);
  const powerMax=html.indexOf('class="max-contractable-power-field"',hint);
  const sectionEnd=html.indexOf('</section>',hint);
  assert.ok(powerStart>=0 && hint>powerStart && powerMax>hint && powerMax<sectionEnd);
  assert.match(html.slice(powerStart,powerMax),/id="supplyPowerP6"/);
  assert.match(html.slice(powerMax,sectionEnd),/id="supplyMaxContractablePower"/);
  assert.match(css,/\.client-form-grid \.power-profile-full-row\{grid-column:1\/-1\}/);
  assert.match(css,/\.client-form-grid \.max-contractable-power-field\{grid-column:1\/-1;max-width:290px\}/);
});

test('client supply row opens exact supply history without hijacking editing',()=>{
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert.match(masterUi,/data-history-client-id=/);
  assert.match(masterUi,/data-history-supply-id=/);
  assert.match(masterUi,/holder-supply-history-link/);
  assert.match(masterUi,/history\.focusSupply\(clientId, supplyId\)/);
  assert.match(masterUi,/nav\.click\(\)/);
  assert.match(masterUi,/event\.target\.closest\('button, a, input, select, textarea'\)/);
  assert.match(masterUi,/if \(event\.target !== row/);
  assert.match(masterUi,/grid\.querySelectorAll\('\.edit-supply-tree'\)/);
  assert.match(css,/\.holder-supply-history-link:focus-visible/);
});
