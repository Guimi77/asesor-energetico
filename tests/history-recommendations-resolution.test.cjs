const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const resolution = require('../recommendation-resolution.js');
const consumption = require('../consumption-anomalies.js');

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

test('a second filtering pass preserves handled items from earlier recommendation wrappers', () => {
  const alreadyHandled = item({supplyId:'s-old',tracking:{state:'handled'}});
  const result = resolution.partitionResult({items:[item()],handledItems:[alreadyHandled]}, [incident()]);
  assert.equal(result.items.length, 0);
  assert.equal(result.handledItems.length, 2);
  assert.ok(result.handledItems.some(x => x.supplyId === 's-old'));
  assert.ok(result.handledItems.some(x => x.supplyId === 's-1'));
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

test('resolved consumption alert is filtered even though consumption installs after the resolution bridge', () => {
  const closed = incident({
    title:'El consumo diario reciente está un 60,0 % por encima de la referencia',
    description:'Cambio sostenido de consumo.',
    detected_at:'2026-06-10T10:00:00Z',
    resolved_at:'2026-06-15T10:00:00Z',
  });
  const root = {
    IBTHistoryRecommendations: {
      build:() => ({items:[],used:0}),
      render:() => '<base/>',
    },
    IBTRecommendationResolution: {
      partitionResult:resolution.partitionResult,
      snapshot:() => ({incidents:[closed]}),
    },
  };
  assert.equal(consumption.install(root), true);
  const supplies=[{id:'s-1',status:'active'}];
  const records=[
    ['r1','2026-01-01','2026-01-31',300],
    ['r2','2026-02-01','2026-02-28',270],
    ['r3','2026-03-01','2026-03-31',300],
    ['r4','2026-04-01','2026-04-30',580],
    ['r5','2026-05-01','2026-05-31',600],
  ].map(([id,billing_start,billing_end,consumption_kwh])=>({
    id,supply_id:'s-1',invoice_number:id,billing_start,billing_end,consumption_kwh,
    validation_status:'valid',reading_status:'actual',
  }));
  const result=root.IBTHistoryRecommendations.build({records,supplies});
  assert.equal(result.items.length,0,'closed consumption signal must not remain pending');
  assert.equal(result.handledItems.length,1,'closed consumption signal must remain traceable');
  assert.equal(result.handledItems[0].type,'consumption-up');
  const html=root.IBTHistoryRecommendations.render({records,supplies,holders:[]});
  assert.doesNotMatch(html,/Cambios sostenidos de consumo/,'closed consumption signal must not render as current');
});

test('browser load order installs resolution after the base engine and before UI bootstrap', () => {
  const index = fs.readFileSync('index.html','utf8');
  const basePos = index.indexOf('history-recommendations.js');
  const resolutionPos = index.indexOf('recommendation-resolution.js');
  const bootstrapPos = index.indexOf('auth-bootstrap.js');
  assert.ok(basePos >= 0, 'base recommendations must load');
  assert.ok(resolutionPos > basePos, 'resolution bridge must wrap the base engine');
  assert.ok(bootstrapPos > resolutionPos, 'resolution bridge must exist before human-language/history UI bootstrap');
});

test('bootstrap installs handled presentation after human-language loads', () => {
  const bootstrap = fs.readFileSync('auth-bootstrap.js','utf8');
  assert.match(bootstrap, /IBTRecommendationResolution\?\.installPresentation\?\.\(\)/);
  assert.match(bootstrap, /script\.onload=loadHistoryUi/);
});
