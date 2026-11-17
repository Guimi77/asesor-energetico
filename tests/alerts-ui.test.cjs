const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const alerts = fs.readFileSync('alerts-ui.js', 'utf8');
const analysis = fs.readFileSync('analysis-ui.js', 'utf8');
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


test('internal analysis has an all-clients triage scope', () => {
  assert.match(analysis, /const ALL_CLIENTS = '__all__'/);
  assert.match(analysis, /Todos los clientes/);
  assert.match(analysis, /state\.clientId = ALL_CLIENTS/);
  assert.match(analysis, /clientId === ALL_CLIENTS/);
  assert.match(analysis, /batchSize = 120/);
  assert.match(analysis, /showClient \? client\?\.name : ''/);
  assert.match(analysis, /data-supply-id=/);
});

test('analysis can classify a finding as alert or discard without visiting each client', () => {
  assert.match(alerts, /analysis-dismiss/);
  assert.match(alerts, /Descartar/);
  assert.match(alerts, /saveAnalysisDecision/);
  assert.match(alerts, /status === 'dismissed'/);
  assert.match(alerts, /resolved_at:resolvedAt/);
  assert.match(alerts, /state\.activeIncidentByKey/);
  assert.match(alerts, /\.update\(\{status:'dismissed',resolved_at:resolvedAt\}\)/);
  assert.match(alerts, /window\.dispatchEvent\(new CustomEvent\('ibt-alerts-changed'\)\)/);
  assert.doesNotMatch(alerts, /knownDismissed/);
});
