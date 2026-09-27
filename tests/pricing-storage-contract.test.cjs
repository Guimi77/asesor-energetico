'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260927090155_add_invoice_pricing_assessments.sql'),'utf8');

test('pricing storage stays isolated from invoice ingestion and invoice rows',()=>{
  assert.doesNotMatch(migration,/alter\s+table\s+public\.invoices\b/i);
  assert.doesNotMatch(migration,/update\s+public\.invoices\b/i);
  assert.doesNotMatch(migration,/insert\s+into\s+public\.invoices\b/i);
  assert.doesNotMatch(migration,/create\s+or\s+replace\s+function\s+public\.(?:upsert_xtra_energy_history|ingest_xtra_energy_history_safe)\b/i);
});

test('pricing assessment is a one-to-one additive table linked to invoices',()=>{
  assert.match(migration,/create\s+table\s+if\s+not\s+exists\s+public\.invoice_pricing_assessments/i);
  assert.match(migration,/invoice_id\s+uuid\s+primary\s+key\s+references\s+public\.invoices\(id\)\s+on\s+delete\s+cascade/i);
  assert.match(migration,/pricing_model\s+in\s*\('fixed','indexed','hybrid','unknown'\)/i);
  assert.match(migration,/pricing_detection\s+in\s*\('explicit','inferred','manual','unknown'\)/i);
  assert.match(migration,/pricing_confidence\s*>?=\s*0\s+and\s+pricing_confidence\s*<=\s*1/i);
});

test('pricing storage is internal-only through RLS',()=>{
  assert.match(migration,/alter\s+table\s+public\.invoice_pricing_assessments\s+enable\s+row\s+level\s+security/i);
  assert.match(migration,/revoke\s+all\s+on\s+table\s+public\.invoice_pricing_assessments\s+from\s+public,\s*anon/i);
  assert.match(migration,/using\s*\(\(select\s+private\.is_internal_user\(\)\)\)/i);
  assert.match(migration,/with\s+check\s*\(\(select\s+private\.is_internal_user\(\)\)\)/i);
});

test('enrichment RPC is narrow, invoker-security and not anonymous',()=>{
  assert.match(migration,/create\s+or\s+replace\s+function\s+public\.enrich_invoice_pricing_model/i);
  assert.match(migration,/security\s+invoker/i);
  assert.match(migration,/auth\.uid\(\)\s+is\s+null\s+or\s+not\s+private\.is_internal_user\(\)/i);
  assert.match(migration,/revoke\s+all\s+on\s+function\s+public\.enrich_invoice_pricing_model\(uuid,jsonb\)\s+from\s+public,\s*anon/i);
  assert.match(migration,/grant\s+execute\s+on\s+function\s+public\.enrich_invoice_pricing_model\(uuid,jsonb\)\s+to\s+authenticated/i);
});

test('evidence is bounded so the enrichment cannot become a PDF-text dump',()=>{
  assert.match(migration,/jsonb_typeof\(v_evidence\)\s*<>\s*'array'/i);
  assert.match(migration,/jsonb_array_length\(v_evidence\)\s*>\s*20/i);
  assert.match(migration,/length\(coalesce\(v_product,''\)\)\s*>\s*250/i);
});
