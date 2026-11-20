'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'alerts-ui.js'), 'utf8');
const start = source.indexOf('  function clientAlertPdfTitle(');
const end = source.indexOf('  function render() {', start);
assert.ok(start >= 0 && end > start, 'report source must exist and be extractable');
const reportSource = source.slice(start, end);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[c]);

function setup(incidents, opts = {}) {
  const clients = [{id:'client-a', name:'Cliente Uno'}, {id:'client-b', name:'Cliente Dos'}];
  const supplies = [
    {id:'supply-a', holder_id:'holder-a', cups:'CUPS_FICTICIO_A', address:'Suministro de prueba A'},
    {id:'supply-b', holder_id:'holder-b', cups:'CUPS_FICTICIO_B', address:'Suministro de prueba B'},
  ];
  const holders = [
    {id:'holder-a', client_id:'client-a', legal_name:'Titular Uno'},
    {id:'holder-b', client_id:'client-b', legal_name:'Titular Dos'},
  ];
  const state = {clients, supplies, holders, loading:false, clientId:opts.clientId || 'client-a'};
  let printed = false, doc = '', appendCount = 0, titleAtPrint = '';
  let afterprint = null;
  const frame = {
    style:{cssText:''}, setAttribute() {},
    addEventListener(event, fn) {if(event==='load') this.onload = fn;},
    contentWindow: {
      addEventListener(event, handler) { if (event === 'afterprint') afterprint = handler; },
      focus() {},
      print() { printed = true; titleAtPrint = document.title; },
    },
    set srcdoc(value) { doc = value; }, remove() {},
  };
  const document = {
    title: 'BT Energía · Asesor Energético Alpha',
    createElement(name) { assert.equal(name,'iframe'); return frame; },
    body:{appendChild(node) {appendCount++; node.onload();}},
  };
  const context = {
    state, document, Date,
    alert(message) {throw Error(message);},
    isInternal: () => opts.internal !== false,
    esc:escapeHtml,
    statusLabel: status => ({open:'Pendiente',reviewing:'En revisión',resolved:'Resuelta',dismissed:'Descartada'})[status] || status,
    priorityLabel: severity => Number(severity) >= 4 ? 'Prioridad alta' : 'Prioridad normal',
    dateES: date => String(date),
    filteredIncidents: () => incidents.filter(row => {
      const supply = supplies.find(item => item.id === row.supply_id);
      const holder = holders.find(item => item.id === supply?.holder_id);
      return !state.clientId || holder?.client_id === state.clientId;
    }),
    incidentContext: row => {
      const supply = supplies.find(item => item.id === row.supply_id);
      const holder = holders.find(item => item.id === supply?.holder_id);
      return {supply,holder,client: clients.find(item => item.id === holder?.client_id)};
    },
  };
  vm.runInNewContext(reportSource,context);
  return {context, document, get printed(){return printed;}, get doc(){return doc;},get appendCount(){return appendCount;},
    get titleAtPrint(){return titleAtPrint;}, finishPrint(){ afterprint?.(); }};
}

test('report contains only selected client alerts and preserves original evidence without inventing savings', () => {
  const r=setup([
    {id:'a', supply_id:'supply-a', title:'Reactiva elevada', description:'Revisar compensación P2.', severity:4,status:'open',detected_at:'2026-11-20'},
    {id:'b', supply_id:'supply-b', title:'Alerta PRIVADA de otro cliente', description:'No mostrar nunca.',severity:5,status:'open'},
  ]);
  r.context.printSelectedClientReport();
  assert.equal(r.printed,true);
  assert.equal(r.appendCount,1);
  assert.match(r.doc,/Cliente Uno/);
  assert.match(r.doc,/Reactiva elevada/);
  assert.match(r.doc,/CUPS_FICTICIO_A/);
  assert.match(r.doc,/Revisar compensación P2/);
  assert.doesNotMatch(r.doc,/Alerta PRIVADA|No mostrar nunca|CUPS_FICTICIO_B/);
  assert.match(r.doc,/no constituyen una garantía de ahorro/i);
});

test('corporate design uses the existing Energia BT logo, palette and official client name, never an alias',()=>{
  const r=setup([{id:'a',supply_id:'supply-a',title:'Comprobación',description:'Revisar.',severity:4,status:'open'}]);
  r.context.state.clients[0].alias='ALIAS INTERNO OMITIR';
  r.context.state.clients[0].clientAlias='ALIAS COMERCIAL OMITIR';
  r.context.printSelectedClientReport();
  assert.match(r.doc,/assets\/energia-bt-lateral\.jpg/);
  assert.match(r.doc,/BT Energía - Informe de alertas - Cliente Uno/);
  assert.match(r.doc,/class="client-name">Cliente Uno<\/div>/);
  assert.match(r.doc,/#00a99d/i);
  assert.match(r.doc,/energia@electricabt\.com/);
  assert.match(r.doc,/636 078 960/);
  assert.doesNotMatch(r.doc,/ALIAS INTERNO OMITIR|ALIAS COMERCIAL OMITIR/);
  assert.doesNotMatch(reportSource,/client\.alias|client\.clientAlias/);
});

test('PDF filename is derived from the official client name and app title is restored after printing', () => {
  const r=setup([{id:'a',supply_id:'supply-a',title:'Alerta',description:'Revisar.',severity:4,status:'open'}]);
  r.context.state.clients[0].alias='ALIAS QUE NO SE IMPRIME';
  const original = r.document.title;
  r.context.printSelectedClientReport();
  assert.match(r.titleAtPrint, /^BT Energía - Informe de alertas - Cliente Uno - /);
  assert.doesNotMatch(r.titleAtPrint, /ALIAS/);
  assert.match(r.doc, /<title>BT Energía - Informe de alertas - Cliente Uno - /);
  assert.equal(r.document.title,r.titleAtPrint,'title remains set while Save as PDF is active');
  r.finishPrint();
  assert.equal(r.document.title,original,'restore app title when print dialog closes');
});

test('report encodes arbitrary text as HTML and cannot include markup from incident descriptions',()=>{
  const r=setup([{id:'a',supply_id:'supply-a',title:'<img src=x onerror=alert(1)>',
    description:'<script>steal()</script> & detalles',severity:1,status:'reviewing'}]);
  r.context.printSelectedClientReport();
  assert.doesNotMatch(r.doc,/<script>steal/);
  assert.doesNotMatch(r.doc,/<img src=x/);
  assert.match(r.doc,/&lt;script&gt;steal\(\)&lt;\/script&gt; &amp; detalles/);
});

test('report cannot be produced by a client role or without a selected client',()=>{
  const incident={id:'a',supply_id:'supply-a',title:'Alerta',description:'Texto',status:'open'};
  const client=setup([incident],{internal:false});
  client.context.printSelectedClientReport();
  assert.equal(client.appendCount,0);
  const allClients=setup([incident],{clientId:'client-a'});
  allClients.context.state.clientId='';
  allClients.context.printSelectedClientReport();
  assert.equal(allClients.appendCount,0);
});

test('export uses current filters and does not depend on an external PDF service',()=>{
  assert.match(source,/id="alertsPdfReport"/);
  assert.match(source,/state\.clientId/);
  assert.match(source,/filteredIncidents\(\)\.map/);
  assert.match(source,/iframe\.srcdoc = buildClientAlertReport/);
  assert.match(source,/document\.title = reportTitle/);
  assert.match(source,/document\.title = previousTitle/);
  assert.match(source,/printWindow\.print\(\)/);
  assert.doesNotMatch(reportSource,/fetch\(|XMLHttpRequest|supabase\.functions\.invoke/);
});
