const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const alerts = fs.readFileSync('alerts-ui.js', 'utf8');
const analysis = fs.readFileSync('analysis-ui.js', 'utf8');
const history = fs.readFileSync('history-ui.js', 'utf8');
const bootstrap = fs.readFileSync('auth-bootstrap.js', 'utf8');

test('alerts use incidents as an internal tracking inbox', () => {
  assert.match(alerts, /from\('incidents'\)/);
  assert.match(alerts, /\['open','dismissed'\]/);
  assert.match(alerts, /status,/);
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


test('global analysis groups findings by client while keeping per-supply actions', () => {
  assert.match(analysis, /function groupItemsByClient\(/);
  assert.match(analysis, /function renderAllClients\(/);
  assert.match(analysis, /analysis-client-group/);
  assert.match(analysis, /analysis-client-group-counts/);
  assert.match(analysis, /group\.priority\.map\(item => card\(item,true/);
  assert.match(analysis, /group\.other\.map\(item => card\(item,false/);
  assert.match(analysis, /renderAllClients\(priority, other, supplyMap, holderMap, clientMap\)/);
  assert.match(analysis, /group\.supplyIds\.size/);
});


test('analysis findings can open the exact supply history', () => {
  assert.match(alerts, /analysis-history-link/);
  assert.match(alerts, /Ver histórico/);
  assert.match(alerts, /openAnalysisHistory/);
  assert.match(alerts, /data-view="historico"/);
  assert.match(alerts, /IBTHistoryUI\?\.focusSupply/);
  assert.match(alerts, /clientId, supply\.id/);
  assert.match(history, /async function focusSupply\(clientId, supplyId\)/);
  assert.match(history, /state\.currentClient = clientId/);
  assert.match(history, /state\.selectedSupplies = \[supplyId\]/);
  assert.match(history, /window\.IBTHistoryUI = \{ reload: refreshRecords, focusSupply \}/);
  assert.match(history, /ibt-history-focus/);
});
