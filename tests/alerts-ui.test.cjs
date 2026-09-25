const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const alerts = fs.readFileSync('alerts-ui.js', 'utf8');
const bootstrap = fs.readFileSync('auth-bootstrap.js', 'utf8');

test('alerts use incidents as an internal tracking inbox', () => {
  assert.match(alerts, /from\('incidents'\)/);
  assert.match(alerts, /status:'open'/);
  assert.match(alerts, /reviewing/);
  assert.match(alerts, /resolved/);
  assert.match(alerts, /dismissed/);
  assert.doesNotMatch(alerts, /estimated_savings/i);
  assert.doesNotMatch(alerts, /from\('recommendations'\)/);
});

test('analysis findings can be promoted without becoming automatic savings proposals', () => {
  assert.match(alerts, /Añadir a Alertas/);
  assert.match(alerts, /Qué revisar:/);
  assert.match(alerts, /ELECTRICA BT ha decidido revisar/);
});

test('alerts module is loaded after analysis module', () => {
  const analysisPos = bootstrap.indexOf('analysis-ui.js');
  const alertsPos = bootstrap.indexOf('alerts-ui.js');
  assert.ok(analysisPos >= 0);
  assert.ok(alertsPos >= 0);
  assert.ok(alertsPos < analysisPos || bootstrap.includes('loadAlertsUi'));
});
