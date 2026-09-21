'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const location=require('../fenie-supply-location.js');

test('lee localidad FENIE aunque la dirección termine con dos ámbitos entre paréntesis',()=>{
  const r=location.parse('GERMANS PINZONS 2, OBRAS 1, 07181 CALVIA (ILLES BALEARS) (BALEARS)');
  assert.equal(r.postalCode,'07181');
  assert.equal(r.city,'CALVIA');
  assert.equal(r.province,'ILLES BALEARS');
  assert.equal(r.region,'BALEARS');
  assert.equal(r.displayAddress,'GERMANS PINZONS 2, OBRAS 1, 07181 CALVIA (ILLES BALEARS)');
});

test('no altera direcciones FENIE normales de un solo ámbito',()=>{
  const address='SA PANSA 15, 07190 ESPORLES (BALEARS)';
  const r=location.parse(address);
  assert.equal(r.city,'ESPORLES');
  assert.equal(r.province,'BALEARS');
  assert.equal(r.displayAddress,address);
});

test('sin código postal falla cerrado y conserva la dirección',()=>{
  const address='CAMI SENSE CODI POSTAL';
  const r=location.parse(address);
  assert.equal(r.city,'');
  assert.equal(r.province,'');
  assert.equal(r.displayAddress,address);
});

test('la mejora vive en el enriquecimiento del suministro, no en el parser económico FENIE',()=>{
  const source=fs.readFileSync(require('node:path').join(__dirname,'..','supply-enricher-v2.js'),'utf8');
  assert.match(source,/IBTFenieSupplyLocation\?\.parse/);
  assert.match(source,/const parsed=window\.IBTFenieSupplyLocation\?\.parse\?\.\(address\)/);
});
