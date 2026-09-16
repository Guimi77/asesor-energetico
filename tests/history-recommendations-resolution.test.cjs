const test = require('node:test');
const assert = require('node:assert/strict');
const resolution = require('../recommendation-resolution.js');

const item = (overrides={}) => ({
  type:'excess', supplyId:'s-1', title:'Excesos de potencia repetidos',
  sources:[{invoice:'F1',start:'2026-07-01',end:'2026-07-31'}],
  ...overrides,
});

const incident = (overrides={}) => ({
  id:'i-1', supply_id:'s-1', title:'Estás pagando penalizaciones por superar la potencia contratada',
  description:'Hemos detectado cargos repetidos por exceso de potencia.', status:'resolved',
  detected_at:'2026-09-10T10:00:00Z', resolved_at:'2026-09-14T10:00:00Z',
  ...overrides,
});

test('closed alert suppresses the same recommendation while evidence is not newer', () => {
  const result = resolution.partitionResult({items:[item()],used:1}, [incident()]);
  assert.equal(result.items.length, 0);
  assert.equal(result.handledItems.length, 1);
  assert.equal(result.handledItems[0].tracking.state, 'handled');
});

test('newer invoice evidence reopens the recommendation as a recurrence', () => {
  const result = resolution.partitionResult({items:[item({sources:[{invoice:'F2',start:'2026-09-01',end:'2026-09-30'}]})]}, [incident()]);
  assert.equal(result.items.length, 1);
  assert.equal(result.handledItems.length, 0);
  assert.equal(result.items[0].tracking.recurrence, true);
});

test('open or reviewing alerts never suppress a current recommendation', () => {
  for (const status of ['open','reviewing']) {
    const result = resolution.partitionResult({items:[item()]}, [incident({status,resolved_at:null})]);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tracking.state, 'active');
  }
});

test('closure is isolated by supply and recommendation kind', () => {
  const rows = [item(), item({type:'reactive',title:'Energía reactiva recurrente'}), item({supplyId:'s-2'})];
  const result = resolution.partitionResult({items:rows}, [incident()]);
  assert.equal(result.handledItems.length, 1);
  assert.equal(result.items.length, 2);
  assert.ok(result.items.some(x => x.type === 'reactive'));
  assert.ok(result.items.some(x => x.supplyId === 's-2'));
});

test('dismissed alerts are also treated as attended until later evidence appears', () => {
  const result = resolution.partitionResult({items:[item()]}, [incident({status:'dismissed'})]);
  assert.equal(result.items.length, 0);
  assert.equal(result.handledItems[0].tracking.incident.status, 'dismissed');
});

test('current human-facing alert titles map back to stable recommendation kinds', () => {
  const cases = [
    ['Estás pagando penalizaciones por superar la potencia contratada','excess'],
    ['Has pagado una penalización por superar la potencia contratada','excess'],
    ['Estás pagando un coste adicional por energía reactiva','reactive'],
    ['Podrías tener más potencia contratada de la que necesitas','power'],
    ['Faltan datos fiables de consumo en algunas facturas','reading-quality'],
    ['Este suministro aparece sin consumo pero sigue teniendo costes','zero-consumption'],
    ['El consumo diario reciente está un 40,1 % por encima de la referencia','consumption-change'],
    ['El consumo diario reciente está un 32,0 % por debajo de la referencia','consumption-change'],
  ];
  for (const [title, expected] of cases) assert.equal(resolution.inferType(title), expected, title);
});
