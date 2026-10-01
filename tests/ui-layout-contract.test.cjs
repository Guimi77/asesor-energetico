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
