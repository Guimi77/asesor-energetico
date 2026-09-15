'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const exporterPath = path.join(root, 'history-client-export.js');
const testPath = path.join(root, 'tests', 'history-client-export.test.cjs');

let source = fs.readFileSync(exporterPath, 'utf8');

const oldPrice = "price=key==='energyPrice';";
const newPrice = "price=key==='energyPrice'||key==='totalUnit';";
if (!source.includes(newPrice)) {
  const hits = source.split(oldPrice).length - 1;
  if (hits !== 1) throw new Error(`Expected exactly one price-mode marker, found ${hits}`);
  source = source.replace(oldPrice, newPrice);
}

const oldCharts = "[['kwh','Consumo mensual','kWh'],['energyPrice','Precio de energ\\u00eda','\\u20ac/kWh'],['total','Gasto total mensual','\\u20ac']]";
const newCharts = "[['kwh','Consumo mensual','kWh'],['total','Gasto total mensual','\\u20ac'],['energyPrice','Precio medio de energ\\u00eda','\\u20ac/kWh'],['totalUnit','Coste total \\u20ac/kWh','\\u20ac/kWh']]";
if (!source.includes(newCharts)) {
  const hits = source.split(oldCharts).length - 1;
  if (hits !== 1) throw new Error(`Expected exactly one chart list, found ${hits}`);
  source = source.replace(oldCharts, newCharts);
}

fs.writeFileSync(exporterPath, source);

let tests = fs.readFileSync(testPath, 'utf8');
const marker = "History client Excel keeps total cost per kWh chart";
if (!tests.includes(marker)) {
  tests += `\ntest('${marker}',()=>{const fs=require('node:fs'),s=fs.readFileSync(__dirname+'/../history-client-export.js','utf8');assert(s.includes("['totalUnit','Coste total \\\\u20ac/kWh','\\\\u20ac/kWh']"));assert(s.includes("price=key==='energyPrice'||key==='totalUnit'"));});\n`;
  fs.writeFileSync(testPath, tests);
}

console.log('Restored fourth historical Excel chart: Coste total €/kWh.');
