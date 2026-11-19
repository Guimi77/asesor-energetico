'use strict';
// All identities and data in this browser regression are synthetic.
// SQL atomicity/authorization are covered by the separate database regression.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1150, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent('<style>body{font:16px Arial;margin:0;background:#f4f7fa}.hidden{display:none}button{padding:9px 12px}*{box-sizing:border-box}</style><main><div id="clientesView"><section id="clientEditor"></section></div><div id="cupsView"></div></main>');
    await page.evaluate(() => {
      const clients = [{ id: 'client-a', name: 'Synthetic Client A', status: 'active' }, { id: 'client-b', name: 'Synthetic Client B', status: 'active' }];
      const holders = [
        { id: 'holder-a', client_id: 'client-a', legal_name: 'Synthetic Holder A', tax_id: 'SYNTHETIC-A', status: 'active' },
        { id: 'holder-b', client_id: 'client-b', legal_name: 'Synthetic Holder B', tax_id: 'SYNTHETIC-B', status: 'active' },
        { id: 'holder-empty', client_id: 'client-b', legal_name: 'Synthetic Empty Holder', tax_id: 'SYNTHETIC-C', status: 'active' },
      ];
      const supplies = [
        { id: 'supply-a1', holder_id: 'holder-a', cups: 'SYNTHETIC-CUPS-A1', status: 'active' },
        { id: 'supply-a2', holder_id: 'holder-a', cups: 'SYNTHETIC-CUPS-A2', status: 'active' },
        { id: 'supply-a3', holder_id: 'holder-a', cups: 'SYNTHETIC-CUPS-A3', status: 'archived' },
        { id: 'supply-b1', holder_id: 'holder-b', cups: 'SYNTHETIC-CUPS-B1', status: 'active' },
      ];
      window.testDB = { clients, holders, supplies, invoices: [{ id: 'synthetic-invoice', supply_id: 'supply-a3', total_eur: 12.34 }] };
      window.testGroups = [{ id: 'group-a', name: 'Synthetic Group A', alias: 'Alpha' }, { id: 'group-b', name: 'Synthetic <img src=x onerror=alert(1)>', alias: 'Beta' }];
      window.testMembers = { 'supply-a1': 'group-a', 'supply-a2': 'group-b', 'supply-b1': 'group-a' };
      window.testProfiles = { 'holder-a': { email: 'original@example.org' } };
      window.rpcCalls = [];
      window.ibtCurrentProfile = { id: 'synthetic-admin', role: 'admin' };
      window.contextFor = (holderId) => {
        const rows = supplies.filter((supply) => supply.holder_id === holderId);
        const ids = new Set(rows.map((supply) => window.testMembers[supply.id] || null));
        return {
          ok: true, holder_id: holderId, groups: structuredClone(window.testGroups),
          total_supplies: rows.length, active_supplies: rows.filter((row) => row.status === 'active').length,
          other_supplies: rows.filter((row) => row.status !== 'active').length,
          group_id: ids.size === 1 ? [...ids][0] : null, mixed: ids.size > 1,
          snapshot: JSON.stringify(rows.map((row) => [row.id, window.testMembers[row.id] || null, row.status])),
        };
      };
      window.ibtSupabase = {
        from(table) {
          const query = { select() { return query; }, order() { return query; }, then(resolve, reject) {
            const error = window.failStateTableOnce === table ? new Error('Synthetic admin refresh failure') : null;
            if (error) window.failStateTableOnce = null;
            return Promise.resolve({ data: structuredClone(window.testDB[table] || []), error }).then(resolve, reject);
          } };
          return query;
        },
        async rpc(name, args) {
          window.rpcCalls.push({ name, args: structuredClone(args) });
          if (name === 'get_internal_billing_profiles') return { data: { holders: structuredClone(window.testProfiles), supplies: {}, legacy_clients: {} }, error: null };
          if (name === 'get_internal_holder_portfolio_context') {
            if (window.failContextOnce) { window.failContextOnce = false; return { data: null, error: new Error('Synthetic context unavailable') }; }
            const data = window.contextFor(args.p_holder_id);
            if (window.holdContextFor === args.p_holder_id) {
              await new Promise((resolve) => { window.releaseContext = resolve; });
              window.holdContextFor = null;
            }
            return { data, error: null };
          }
          if (!['admin_update_holder_profile', 'admin_update_holder_profile_with_portfolio'].includes(name)) throw Error('Unexpected RPC: ' + name);
          if (window.holdSave) { await new Promise((resolve) => { window.releaseSave = resolve; }); window.holdSave = false; }
          const context = window.contextFor(args.p_holder_id);
          if (window.rejectSaveOnce) { const reason = window.rejectSaveOnce; window.rejectSaveOnce = null; return { data: { ok: false, reason }, error: null }; }
          if (name.endsWith('_with_portfolio') && args.p_expected_portfolio_snapshot !== context.snapshot) return { data: { ok: false, reason: 'portfolio_context_changed' }, error: null };
          const holder = holders.find((row) => row.id === args.p_holder_id);
          holder.legal_name = args.p_legal_name;
          window.testProfiles[holder.id] = { email: args.p_email, phone: args.p_phone, bank_account: args.p_bank_account };
          let target = args.p_group_id;
          if (args.p_new_name) {
            target = 'group-created';
            window.testGroups.push({ id: target, name: args.p_new_name, alias: args.p_new_alias });
          }
          if (name.endsWith('_with_portfolio')) {
            for (const supply of supplies.filter((row) => row.holder_id === holder.id)) {
              if (args.p_portfolio_action === 'clear') delete window.testMembers[supply.id];
              else window.testMembers[supply.id] = target;
            }
          }
          return { data: { ok: true, holder_id: holder.id, total_supplies: context.total_supplies, group_id: target }, error: null };
        },
      };
      window.CentralSupabaseMaster = { async reload() { if (window.failReloadOnce) { window.failReloadOnce = false; return false; } return true; } };
    });
    await page.addScriptTag({ path: 'admin-data-management.js' });
    await page.waitForSelector('#centralHoldersList [data-id="holder-a"][data-db-action="edit_holder"]');
    const editor = page.locator('#holderProfileEditor');
    const group = page.locator('#holderProfileGroup');
    const submit = page.locator('#holderProfileForm button[type="submit"]');
    const open = async (id = 'holder-a') => {
      await page.locator(`#centralHoldersList [data-id="${id}"][data-db-action="edit_holder"]`).click();
      await page.waitForFunction(() => !document.querySelector('#holderProfileGroupHelp').textContent.startsWith('Consultando'));
    };
    const saved = () => editor.waitFor({ state: 'hidden' });
    const writes = () => page.evaluate(() => window.rpcCalls.filter((call) => call.name.startsWith('admin_update_holder_profile')));
    const protectedBefore = await page.evaluate(() => JSON.stringify({ clients: window.testDB.clients, supplies: window.testDB.supplies, invoices: window.testDB.invoices, ownership: window.testDB.holders.map((holder) => [holder.id, holder.client_id, holder.tax_id]) }));

    // Mixed grouping is an explicit keep state. Ordinary profile edits retain it.
    await open();
    assert.equal(await group.inputValue(), '__keep__');
    assert.match(await page.locator('#holderProfileGroupHelp').innerText(), /3 suministros.*2 activos y 1 archivado o inactivo/);
    assert.equal(await editor.locator('img').count(), 0, 'Group labels must be plain text');
    const mixedBefore = await page.evaluate(() => structuredClone(window.testMembers));
    await page.fill('#holderProfileEmail', 'profile-only@example.org');
    await submit.click();
    await saved();
    assert.equal((await writes()).at(-1).name, 'admin_update_holder_profile');
    assert.deepEqual(await page.evaluate(() => window.testMembers), mixedBefore);

    // One combined request covers all three supplies and locks the pending editor.
    await open();
    const snapshot = await page.evaluate(() => window.contextFor('holder-a').snapshot);
    await group.selectOption('group-b');
    assert.match(await page.locator('#holderProfileGroupHelp').innerText(), /Al guardar, sus 3 suministros quedarán en/);
    await page.evaluate(() => { window.holdSave = true; });
    await submit.click();
    await page.waitForFunction(() => typeof window.releaseSave === 'function');
    assert(await submit.isDisabled());
    assert(await page.locator('#closeHolderProfile').isDisabled());
    assert(await page.locator('#cancelHolderProfile').isDisabled());
    assert(await group.isDisabled());
    await page.evaluate(() => {
      document.querySelector('#holderProfileForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      document.querySelector('#closeHolderProfile').click();
      document.querySelector('#centralHoldersList [data-id="holder-b"][data-db-action="edit_holder"]').click();
    });
    assert.equal(await page.locator('#holderProfileId').inputValue(), 'holder-a');
    assert.equal((await writes()).length, 2, 'Double submit must not issue a second write');
    await page.evaluate(() => window.releaseSave());
    await saved();
    const assign = (await writes()).at(-1);
    assert.equal(assign.name, 'admin_update_holder_profile_with_portfolio');
    assert.deepEqual(Object.fromEntries(Object.entries(assign.args).filter(([key]) => key.startsWith('p_portfolio') || key.startsWith('p_group') || key.startsWith('p_new') || key.startsWith('p_expected'))), {
      p_portfolio_action: 'set', p_group_id: 'group-b', p_new_name: null, p_new_alias: null, p_expected_portfolio_snapshot: snapshot,
    });
    assert.deepEqual(await page.evaluate(() => window.testMembers), { 'supply-a1': 'group-b', 'supply-a2': 'group-b', 'supply-a3': 'group-b', 'supply-b1': 'group-a' });

    // Explicit removal and creation are distinct actions with complete preview.
    await open();
    assert.equal(await group.inputValue(), 'group-b');
    await group.selectOption('');
    await submit.click();
    await saved();
    assert.equal((await writes()).at(-1).args.p_portfolio_action, 'clear');
    assert.deepEqual(await page.evaluate(() => window.testMembers), { 'supply-b1': 'group-a' });
    await open();
    await group.selectOption('__new__');
    const beforeEmptyName = (await writes()).length;
    await page.fill('#holderProfileNewGroupName', '   ');
    await submit.click();
    assert.match(await page.locator('#holderProfileMsg').innerText(), /Escribe el nombre del nuevo grupo/);
    assert.equal((await writes()).length, beforeEmptyName);
    await page.fill('#holderProfileNewGroupName', '  Synthetic New Group  ');
    await page.fill('#holderProfileNewGroupAlias', '  New alias  ');
    await submit.click();
    await saved();
    assert.equal((await writes()).at(-1).args.p_new_name, 'Synthetic New Group');
    assert.equal((await writes()).at(-1).args.p_new_alias, 'New alias');
    assert.equal((await writes()).at(-1).args.p_group_id, null);

    // Concurrent regrouping rejects the complete save, preserves typed profile,
    // refreshes the context and requires a deliberate new destination choice.
    await open();
    await page.fill('#holderProfileEmail', 'pending-edit@example.org');
    await group.selectOption('group-b');
    await page.evaluate(() => { window.testMembers['supply-a1'] = 'group-a'; });
    await submit.click();
    await page.waitForFunction(() => document.querySelector('#holderProfileMsg').textContent.includes('No se ha guardado ningún cambio'));
    assert.equal(await page.locator('#holderProfileEmail').inputValue(), 'pending-edit@example.org');
    assert.equal(await group.inputValue(), '__keep__');
    assert.equal(await page.evaluate(() => window.testProfiles['holder-a'].email), 'profile-only@example.org');
    assert.equal(await page.evaluate(() => window.testMembers['supply-a1']), 'group-a');
    assert(!(await submit.isDisabled()));
    await page.locator('#closeHolderProfile').click();

    // Context failure cannot silently clear memberships; retry restores choices.
    await page.evaluate(() => { window.failContextOnce = true; });
    await open();
    assert(await group.isDisabled());
    assert(await page.locator('#holderProfileGroupRetry').isVisible());
    await page.locator('#holderProfileGroupRetry').click();
    await page.waitForFunction(() => !document.querySelector('#holderProfileGroup').disabled);
    assert.equal(await group.inputValue(), '__keep__');
    await page.locator('#closeHolderProfile').click();
    await page.evaluate(() => { window.failContextOnce = true; });
    await open();
    const unavailableMembers = await page.evaluate(() => structuredClone(window.testMembers));
    await submit.click();
    await saved();
    assert.equal((await writes()).at(-1).name, 'admin_update_holder_profile');
    assert.deepEqual(await page.evaluate(() => window.testMembers), unavailableMembers);

    // A late context from A cannot overwrite newly opened holder B.
    await page.evaluate(() => { window.holdContextFor = 'holder-a'; });
    await page.locator('#centralHoldersList [data-id="holder-a"][data-db-action="edit_holder"]').click();
    await page.waitForFunction(() => typeof window.releaseContext === 'function');
    await page.locator('#closeHolderProfile').click();
    await open('holder-b');
    assert.equal(await group.inputValue(), 'group-a');
    await page.evaluate(() => window.releaseContext());
    await page.waitForTimeout(30);
    assert.equal(await page.locator('#holderProfileId').inputValue(), 'holder-b');
    assert.equal(await group.inputValue(), 'group-a');
    assert.match(await page.locator('#holderProfileGroupHelp').innerText(), /^1 suministro\./);
    await page.locator('#closeHolderProfile').click();

    await open('holder-empty');
    assert(await group.isDisabled());
    assert.match(await page.locator('#holderProfileGroupHelp').innerText(), /todavía no tiene suministros/);
    await submit.click();
    await saved();
    assert.equal((await writes()).at(-1).name, 'admin_update_holder_profile');

    // A saved transaction followed by a failed refresh is labelled saved and
    // cannot be submitted twice; closing remains available.
    await open();
    await group.selectOption('group-a');
    await page.evaluate(() => { window.failReloadOnce = true; });
    await submit.click();
    await page.waitForFunction(() => document.querySelector('#holderProfileMsg').textContent.startsWith('Los cambios están guardados.'));
    assert(await submit.isDisabled());
    assert(!(await page.locator('#closeHolderProfile').isDisabled()));
    await page.locator('#closeHolderProfile').click();
    await open();
    await group.selectOption('group-b');
    await page.evaluate(() => { window.failStateTableOnce = 'holders'; });
    await submit.click();
    await page.waitForFunction(() => document.querySelector('#holderProfileMsg').textContent.startsWith('Los cambios están guardados.'));
    assert(await submit.isDisabled());
    assert(!(await page.locator('#closeHolderProfile').isDisabled()));
    await page.locator('#closeHolderProfile').click();

    assert.equal(await page.evaluate(() => JSON.stringify({ clients: window.testDB.clients, supplies: window.testDB.supplies, invoices: window.testDB.invoices, ownership: window.testDB.holders.map((holder) => [holder.id, holder.client_id, holder.tax_id]) })), protectedBefore);
    assert(!(await page.evaluate(() => window.rpcCalls.some((call) => ['link_existing_holder_to_group', 'set_internal_supply_portfolio'].includes(call.name)))), 'Bulk editing must never transfer fiscal ownership or loop over individual CUPS writes');
    await open();
    await group.selectOption('__new__');
    await page.fill('#holderProfileNewGroupName', 'Synthetic Mobile Group');
    fs.mkdirSync('test-output', { recursive: true });
    await page.screenshot({ path: 'test-output/holder-portfolio-editor-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.querySelector('.holder-editor-dialog').scrollWidth <= document.querySelector('.holder-editor-dialog').clientWidth), 'Mobile dialog must not overflow horizontally');
    await page.screenshot({ path: 'test-output/holder-portfolio-editor-mobile.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: mixed keep, atomic bulk RPC payload, all-supply preview, create/clear, stale context rejection, unavailable context retry, late-response isolation, zero supplies, double-submit/close guards, saved-but-refresh-failed state and mobile layout. Synthetic data only.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
