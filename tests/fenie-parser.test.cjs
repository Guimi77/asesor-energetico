'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const fenie=require('../fenie-parser.js');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('detector FENIE reconoce su formato y no captura otras comercializadoras',()=>{
  assert.equal(fenie.detect('FENIE ENERGIA Razón Social: DEMO Periodo Facturación: 01/01/2026 - 31/01/2026 Término de potencia'),true);
  assert.equal(fenie.detect('Endesa Energía, S.A. Unipersonal Nº factura: P26CON000000001'),false);
  assert.equal(fenie.detect('IBERDROLA CLIENTES FACTURA ELECTRICIDAD'),false);
  assert.equal(fenie.detect('Naturgy Clientes, S.A.U. factura electricidad'),false);
});

test('parser FENIE mantiene el contrato económico sintético 2.0TD',()=>{
  const euro='€';
  const page=[
    'FENIE ENERGIA',
    'Nº Factura: TEST000001',
    'Razón Social: CLIENTE SINTETICO',
    'CUPS: ES0000000000000000AA',
    'Tarifa: 2.0TD',
    'Periodo Facturación: 01/01/2026 - 31/01/2026 (31 días)',
    'Término de energía',
    `P1: 100,00 kWh 0,100000 ${euro}/kWh 10,00 ${euro}`,
    `P2: 50,00 kWh 0,100000 ${euro}/kWh 5,00 ${euro}`,
    'Término de potencia',
    `P1: 0,050000 ${euro}/kW día x 5,000 kW x 31 días = 7,75 ${euro}`,
    `P2: 0,010000 ${euro}/kW día x 5,000 kW x 31 días = 1,55 ${euro}`,
    `9,30 ${euro}`,
    'Bono social',
    `TOTAL FACTURA 24,30 ${euro}`
  ];
  const row=fenie.parse({pages:[page],rawPages:[[],[]],text:page.join('\n')},{name:'synthetic-fenie.pdf'});
  assert.equal(row.invoiceNumber,'TEST000001');
  assert.equal(row.cups,'ES0000000000000000AA');
  assert.equal(row.tariff,'2.0TD');
  assert.equal(row.kwh,150);
  assert.equal(row.energy,15);
  assert.equal(row.power,9.3);
  assert.equal(row.total,24.3);
  assert.equal(row.accounted,24.3);
  assert.equal(row.balanced,true);
  assert.equal(row.readOk,true);
  assert.deepEqual(row.periods.P1,{consumption:100,cost:10,price:0.1});
  assert.deepEqual(row.periods.P2,{consumption:50,cost:5,price:0.1});
});

test('app ya no contiene reglas de interpretación FENIE',()=>{
  assert.match(app,/window\.IBTFenieParser/);
  assert.match(app,/function parseFenie\(d,file\)\{[\s\S]{0,250}IBTFenieParser/);
  assert.doesNotMatch(app,/Raz\[oó\]n Social/);
  assert.doesNotMatch(app,/Compensaci\[oó\]n Excedente/);
  assert.doesNotMatch(app,/Ajuste por Integrador/);
});

test('navegador carga fenie-parser antes de app.js',()=>{
  const parserPos=html.indexOf('fenie-parser.js');
  const appPos=html.indexOf('src="app.js');
  assert.ok(parserPos>=0);
  assert.ok(appPos>parserPos);
});

test('API portable expone detect, parse, revision y helper de potencia',()=>{
  assert.equal(typeof fenie.detect,'function');
  assert.equal(typeof fenie.parse,'function');
  assert.equal(typeof fenie.powerSectionDetails,'function');
  assert.match(fenie.revision,/^fenie-/);
});
