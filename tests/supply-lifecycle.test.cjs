'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const lifecycle=fs.readFileSync('supply-lifecycle.js','utf8');
const bootstrap=fs.readFileSync('auth-bootstrap.js','utf8');

test('CUPS lifecycle offers the three safe state changes',()=>{
  for(const token of ['client_exit','supply_deactivated','reactivated']) assert(lifecycle.includes(token),token);
  assert(lifecycle.includes("supabase.rpc('set_supply_lifecycle'"));
  assert(lifecycle.includes('p_event_date: effectiveDate'));
  assert(lifecycle.includes('p_description: reason'));
});

test('Lifecycle UI explains that invoice history is preserved',()=>{
  assert(lifecycle.includes('El histórico se conserva completo'));
  assert(lifecycle.includes('Sus facturas e histórico siguen conservados'));
  assert(!/\.from\(['"]invoices['"]\).*\.(delete|update)\(/s.test(lifecycle));
  assert(!/invoice_(energy_periods|power_periods|maximeters|excesses|reactive|tax_lines|adjustments|distributor_rights)/.test(lifecycle));
});

test('Only internal users can operate lifecycle controls',()=>{
  assert(lifecycle.includes("new Set(['admin', 'staff'])"));
  assert(lifecycle.includes('if (!selectedSupply || !isInternal()) return'));
});

test('Bootstrap loads the lifecycle module once with a cache-busted URL',()=>{
  assert(bootstrap.includes("script[data-supply-lifecycle]"));
  assert(bootstrap.includes("supply-lifecycle.js?v=20260909-1"));
  assert(bootstrap.includes("script.dataset.supplyLifecycle='1'"));
});
