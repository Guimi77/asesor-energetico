'use strict';
// Synthetic fixtures only. No customer identifiers or original documents.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const appPath = process.env.PARSER_FILE || path.join(root, 'app.js');
const source = fs.readFileSync(appPath, 'utf8');
const boot = source.indexOf("const dz=$('#dropZone')");
assert.ok(boot > 0, 'Application bootstrap must remain present');
const ctx = vm.createContext({window: {}, document: {}, pdfjsLib: {GlobalWorkerOptions: {}}, console});
vm.runInContext(source.slice(0, boot).replace(/^import[^\n]*\n/, '') +
  '\nglobalThis.check={powerSectionDetails,parseFenie,render,exportExcel};', ctx);
const read = ctx.check.powerSectionDetails;
const euro = '\u20ac';
const row = (p, amount, days = '30 d\u00edas', price = '0,00') =>
  `P${p}: ${price} ${euro}/kW d\u00eda + 0,000001 ${euro}/kW d\u00eda = 0,012345 ${euro}/kW d\u00eda x 17,000 kW x ${days} = ${amount} ${euro}`;
const two = [row(1, '10,00'), row(2, '0,25')];
const six = [1,2,3,4,5,6].map(p => row(p, `${p},00`));
function check(lines, expected, reliable = true) {
  const input = lines.slice();
  const got = read(input);
  assert.equal(got.value, expected);
  assert.equal(got.reliable, reliable);
  assert.deepEqual(input, lines, 'Reading must not alter source text');
  return got;
}
test('preserves both 2.0 power periods with a two-decimal unit rate', () => check(two, 10.25));
test('does not treat a nonzero euro/kW-day rate as an amount', () =>
  check([row(1, '10,00', undefined, '9,99'), two[1]], 10.25));
test('ignores a subtotal next to the P1 amount when summing rows', () =>
  check([six[0] + ` 21,00 ${euro}`, ...six.slice(1)], 21));
test('accepts a separately printed subtotal between P1 and P2', () =>
  check([two[0], `10,25 ${euro}`, two[1]], 10.25));
test('retains explicitly printed subtotal with independent cent rounding', () => {
  const x = check([two[0], `10,26 ${euro}`, two[1]], 10.26);
  assert.equal(x.sum, 10.25);
  assert.equal(x.printedTotal, 10.26);
});
test('reads a formula before its Pn label, without using the subtotal as P1', () => {
  const input = six.flatMap((r, i) => [r.replace(/^P\d: /, ''), `P${i+1}:`]);
  input[1] += ` 21,00 ${euro}`;
  check(input, 21);
});
test('allows a header preceding P1 without modifying energy extraction', () =>
  check(['T\u00e9rmino de potencia ' + two[0], two[1]], 10.25));
test('reads the singular dia form', () => check([row(1, '10,00', '19 d\u00eda'), two[1]], 10.25));
test('reads wrapped formulas and multiplication sign', () =>
  check([two[0].replace('x 30', '\u00d7\n30').replace('= 10,00', '=\n10,00'), two[1]], 10.25));
test('does not approve a conflicting subtotal or hide the difference', () => {
  const x = check([...two, `45,00 ${euro}`], 10.25, false);
  assert.ok(x.message.includes('no coinciden'));
});
test('does not approve missing per-period amounts', () => check([two[0], 'P2:'], 10, false));
test('does not approve ambiguous duplicate subtotals', () =>
  check([...two, `10,25 ${euro}`, `10,25 ${euro}`], 10.25, false));
test('empty input remains unreliable, not a validated zero', () => check([], 0, false));
test('explicit zero power remains distinguishable from missing power', () =>
  check([row(1, '0,00'), row(2, '0,00'), `0,00 ${euro}`], 0));
test('preserves the sign of negative billed amounts', () =>
  check([row(1, '-10,00'), row(2, '-0,25'), `-10,25 ${euro}`], -10.25));
test('reads Spanish thousands without including unit rates', () =>
  check([row(1, '1.100,00'), row(2, '0,25'), `1.100,25 ${euro}`], 1100.25));
test('keeps renderer and existing internal export entry points', () => {
  assert.equal(typeof ctx.check.render, 'function');
  assert.equal(typeof ctx.check.exportExcel, 'function');
});
