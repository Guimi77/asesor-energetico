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
      window.testAliases = { clients: { 'client-a': 'Synthetic Alias A', 'client-b': 'Synthetic Alias B' }, supplies: { 'supply-a1': 'Synthetic Supply Alias' } };
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
          if (name === 'get_internal_aliases') {
            if (window.failAliasesOnce) { window.failAliasesOnce = false; return { data: null, error: new Error('Synthetic alias read failure') }; }
            return { data: structuredClone(window.testAliases), error: null };
          }
          if (name === 'get_internal_holder_portfolio_context') {
            if (window.failContextOnce) { window.failContextOnce = false; return { data: null, error: new Error('Synthetic context unavailable') }; }
            const data = window.contextFor(args.p_holder_id);
            if (window.holdContextFor === args.p_holder_id) {
              await new Promise((resolve) => { window.releaseContext = resolve; });
              window.holdContextFor = null;
            }
            return { data, error: null };
          }
          if (!['admin_update_holder_profile', 'admin_update_holder_profile_with_portfolio', 'admin_update_holder_profile_with_alias'].includes(name)) throw Error('Unexpected RPC: ' + name);
          if (window.holdSave) { await new Promise((resolve) => { window.releaseSave = resolve; }); window.holdSave = false; }
          const context = window.contextFor(args.p_holder_id);
          if (window.rejectSaveOnce) { const reason = window.rejectSaveOnce; window.rejectSaveOnce = null; return { data: { ok: false, reason }, error: null }; }
          const changePortfolio = args.p_portfolio_action && args.p_portfolio_action !== 'keep';
          if (changePortfolio && args.p_expected_portfolio_snapshot !== context.snapshot) return { data: { ok: false, reason: 'portfolio_context_changed' }, error: null };
          const holder = holders.find((row) => row.id === args.p_holder_id);
          const changeAlias = name === 'admin_update_holder_profile_with_alias';
          const aliasValue = String(args.p_client_alias ?? '').trim();
          const currentAlias = window.testAliases.clients[holder.client_id] || '';
          if (changeAlias && args.p_expected_client_id !== holder.client_id) return { data: { ok: false, reason: 'holder_client_changed' }, error: null };
          if (changeAlias && currentAlias !== String(args.p_expected_client_alias ?? '').trim() && currentAlias !== aliasValue) return { data: { ok: false, reason: 'client_alias_conflict' }, error: null };
          holder.legal_name = args.p_legal_name;
          window.testProfiles[holder.id] = { email: args.p_email, phone: args.p_phone, bank_account: args.p_bank_account };
          let target = args.p_group_id;
          if (args.p_new_name) {
            target = 'group-created';
            window.testGroups.push({ id: target, name: args.p_new_name, alias: args.p_new_alias });
          }
          if (changePortfolio) {
            for (const supply of supplies.filter((row) => row.holder_id === holder.id)) {
              if (args.p_portfolio_action === 'clear') delete window.testMembers[supply.id];
              else window.testMembers[supply.id] = target;
            }
          }
          if (changeAlias) {
            if (aliasValue) window.testAliases.clients[holder.client_id] = aliasValue;
            else delete window.testAliases.clients[holder.client_id];
          }
          return { data: { ok: true, holder_id: holder.id, total_supplies: context.total_supplies, group_id: target, client_id: holder.client_id, client_alias: aliasValue, alias_changed: changeAlias && currentAlias !== aliasValue }, error: null };
        },
      };
      window.CentralSupabaseMaster = { async reload() { if (window.failReloadOnce) { window.failReloadOnce = false; return false; } return true; } };
    });
    await page.addScriptTag({ path: 'admin-data-management.js' });
    await page.waitForSelector('#centralHoldersList [data-id="holder-a"][data-db-action="edit_holder"]');
    const editor = page.locator('#holderProfileEditor');
    const alias = page.locator('#holderProfileAlias');
    const group = page.locator('#holderProfileGroup');
    const submit = page.locator('#holderProfileForm button[type="submit"]');
    const open = async (id = 'holder-a') => {
      await page.locator(`#centralHoldersList [data-id="${id}"][data-db-action="edit_holder"]`).click();
      await page.waitForFunction(() => !document.querySelector('#holderProfileGroupHelp').textContent.startsWith('Consultando'));
    };
    const saved = () => editor.waitFor({ state: 'hidden' });
    const writes = () => page.evaluate(() => window.rpcCalls.filter((call) => call.name.startsWith('admin_update_holder_profile')));
    const refreshAdmin = async () => {
      const oldButton = await page.locator('#centralHoldersList [data-id="holder-a"][data-db-action="edit_holder"]').elementHandle();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('ibt-role-changed', { detail: { profile: window.ibtCurrentProfile } })));
      await page.waitForFunction((button) => !button.isConnected, oldButton);
    };
    const protectedBefore = await page.evaluate(() => JSON.stringify({ clients: window.testDB.clients, supplies: window.testDB.supplies, invoices: window.testDB.invoices, ownership: window.testDB.holders.map((holder) => [holder.id, holder.client_id, holder.tax_id]) }));

    // Mixed grouping is an explicit keep state. Ordinary profile edits retain it.
    await open();
    assert.equal(await alias.inputValue(), 'Synthetic Alias A', 'The current alias must be loaded using the holder client ID');
    assert.match(await alias.locator('..').innerText(), /Alias del cliente/);
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

    // Failed state/alias reads cannot turn the alias into a blank editable value.
    await open();
    assert(await alias.isDisabled());
    assert(await submit.isDisabled());
    assert.match(await alias.getAttribute('placeholder'), /Alias no disponible/);
    await page.locator('#closeHolderProfile').click();
    await refreshAdmin();

    const aliasesBefore = await page.evaluate(() => structuredClone(window.testAliases));
    const groupAliasesBefore = await page.evaluate(() => window.testGroups.map(({ id, alias: value }) => [id, value]));
    await open('holder-b');
    assert.equal(await alias.inputValue(), 'Synthetic Alias B');
    assert.match(await page.locator('#holderProfileAliasHelp').innerText(), /titulares/);
    await page.locator('#closeHolderProfile').click();
    await open('holder-empty');
    assert.equal(await alias.inputValue(), 'Synthetic Alias B', 'Other holders of the same client read the same existing alias');
    await page.locator('#closeHolderProfile').click();

    // Cancelling an alias edit issues no write and keeps every existing alias.
    await open();
    const beforeCancel = (await writes()).length;
    await alias.fill('Unsaved synthetic alias');
    await page.locator('#cancelHolderProfile').click();
    assert.equal((await writes()).length, beforeCancel);
    assert.deepEqual(await page.evaluate(() => window.testAliases), aliasesBefore);

    // Alias-only edits use one atomic wrapper and remain after reopening.
    await open();
    const beforeAliasMembers = await page.evaluate(() => structuredClone(window.testMembers));
    const beforeAliasWrite = (await writes()).length;
    await alias.fill('  Edited synthetic alias  ');
    await submit.click();
    await saved();
    assert.equal((await writes()).length, beforeAliasWrite + 1);
    const aliasWrite = (await writes()).at(-1);
    assert.equal(aliasWrite.name, 'admin_update_holder_profile_with_alias');
    assert.equal(aliasWrite.args.p_client_alias, 'Edited synthetic alias');
    assert.equal(aliasWrite.args.p_expected_client_alias, 'Synthetic Alias A');
    assert.equal(aliasWrite.args.p_expected_client_id, 'client-a');
    assert.equal(aliasWrite.args.p_portfolio_action || 'keep', 'keep');
    assert.deepEqual(await page.evaluate(() => window.testMembers), beforeAliasMembers);
    await open();
    assert.equal(await alias.inputValue(), 'Edited synthetic alias');

    // Clearing is explicit, survives refresh, and never clears a supply alias.
    await alias.fill('   ');
    await submit.click();
    await saved();
    const clearAliasWrite = (await writes()).at(-1);
    assert.equal(clearAliasWrite.name, 'admin_update_holder_profile_with_alias');
    assert.equal(clearAliasWrite.args.p_client_alias, null);
    assert.equal(clearAliasWrite.args.p_expected_client_alias, 'Edited synthetic alias');
    await open();
    assert.equal(await alias.inputValue(), '');
    assert.equal(await page.evaluate(() => Object.hasOwn(window.testAliases.clients, 'client-a')), false);

    // A profile-only save cannot overwrite an alias changed in another editor.
    await page.evaluate(() => { window.testAliases.clients['client-a'] = 'Remote synthetic alias'; });
    await page.fill('#holderProfileEmail', 'alias-untouched@example.org');
    await submit.click();
    await saved();
    assert.equal((await writes()).at(-1).name, 'admin_update_holder_profile');
    assert.equal(Object.hasOwn((await writes()).at(-1).args, 'p_client_alias'), false);
    assert.equal(await page.evaluate(() => window.testAliases.clients['client-a']), 'Remote synthetic alias');

    // Alias and grouping are sent together, including the complete snapshot.
    await open();
    assert.equal(await alias.inputValue(), 'Remote synthetic alias');
    const combinedTarget = await group.inputValue() === 'group-a' ? 'group-b' : 'group-a';
    const combinedSnapshot = await page.evaluate(() => window.contextFor('holder-a').snapshot);
    const beforeCombined = (await writes()).length;
    await alias.fill('Alias with grouping');
    await group.selectOption(combinedTarget);
    await submit.click();
    await saved();
    assert.equal((await writes()).length, beforeCombined + 1, 'Profile, alias and group must use a single write request');
    const combined = (await writes()).at(-1);
    assert.equal(combined.name, 'admin_update_holder_profile_with_alias');
    assert.equal(combined.args.p_client_alias, 'Alias with grouping');
    assert.equal(combined.args.p_expected_client_alias, 'Remote synthetic alias');
    assert.equal(combined.args.p_expected_client_id, 'client-a');
    assert.equal(combined.args.p_portfolio_action, 'set');
    assert.equal(combined.args.p_group_id, combinedTarget);
    assert.equal(combined.args.p_expected_portfolio_snapshot, combinedSnapshot);
    assert.deepEqual(await page.evaluate(() => window.testMembers), { 'supply-a1': combinedTarget, 'supply-a2': combinedTarget, 'supply-a3': combinedTarget, 'supply-b1': 'group-a' });

    // Rejected identity/busy/profile requests keep all typed values and data.
    for (const reason of ['holder_client_changed', 'holder_profile_busy', 'invalid_email']) {
      await open();
      const beforeRejected = await page.evaluate(() => JSON.stringify({ aliases: window.testAliases, profiles: window.testProfiles, members: window.testMembers }));
      await alias.fill('Pending alias ' + reason);
      await page.fill('#holderProfileEmail', 'pending-alias@example.org');
      await page.evaluate((value) => { window.rejectSaveOnce = value; }, reason);
      await submit.click();
      await page.waitForFunction(() => document.querySelector('#holderProfileMsg').classList.contains('error'));
      assert(await editor.isVisible());
      assert.equal(await alias.inputValue(), 'Pending alias ' + reason);
      assert(!(await submit.isDisabled()));
      assert.equal(await page.evaluate(() => JSON.stringify({ aliases: window.testAliases, profiles: window.testProfiles, members: window.testMembers })), beforeRejected);
      await page.locator('#closeHolderProfile').click();
    }

    // Stale alias editing is rejected before the profile or grouping can change.
    await open();
    const beforeConflict = await page.evaluate(() => JSON.stringify({ profiles: window.testProfiles, members: window.testMembers }));
    await alias.fill('Pending local alias');
    await page.fill('#holderProfileEmail', 'must-not-save@example.org');
    await group.selectOption(combinedTarget === 'group-a' ? 'group-b' : 'group-a');
    await page.evaluate(() => { window.testAliases.clients['client-a'] = 'Other editor alias'; });
    await submit.click();
    await page.waitForFunction(() => document.querySelector('#holderProfileMsg').classList.contains('error'));
    assert.match(await page.locator('#holderProfileMsg').innerText(), /alias/i);
    assert.equal(await alias.inputValue(), 'Pending local alias');
    assert.equal(await page.evaluate(() => window.testAliases.clients['client-a']), 'Other editor alias');
    assert.equal(await page.evaluate(() => JSON.stringify({ profiles: window.testProfiles, members: window.testMembers })), beforeConflict);
    await page.locator('#closeHolderProfile').click();
    await refreshAdmin();

    // Read failures have a visible unavailable state and cannot issue a write.
    await page.evaluate(() => {
      window.failAliasesOnce = true;
      window.dispatchEvent(new CustomEvent('ibt-role-changed', { detail: { profile: window.ibtCurrentProfile } }));
    });
    await page.waitForFunction(() => document.querySelector('#centralHoldersMsg').classList.contains('error'));
    await open();
    const beforeUnavailable = (await writes()).length;
    assert(await alias.isDisabled());
    assert(await submit.isDisabled());
    assert.match(await alias.getAttribute('placeholder'), /Alias no disponible/);
    await page.evaluate(() => document.querySelector('#holderProfileForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal((await writes()).length, beforeUnavailable);
    await page.locator('#closeHolderProfile').click();
    await refreshAdmin();

    assert.deepEqual(await page.evaluate(() => window.testAliases.supplies), aliasesBefore.supplies);
    assert.equal(await page.evaluate(() => window.testAliases.clients['client-b']), aliasesBefore.clients['client-b']);
    assert.deepEqual(await page.evaluate(() => window.testGroups.map(({ id, alias: value }) => [id, value])), groupAliasesBefore);

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
    await page.locator('#closeHolderProfile').click();

    // The real integrated hierarchy must resolve actions by holder UUID even
    // when a displayed alias changes the visible label or matches another name.
    await page.evaluate(() => {
      const host = document.createElement('section');
      host.id = 'companyGrid';
      host.innerHTML = `<article class="company-card-tree" data-client-primary="Synthetic Client A" data-client-type="CLIENTE">
        <div class="client-tree-title"><h3>Synthetic Client A</h3></div>
        <div class="holder-tree">
          <details class="holder-folder" id="synthetic-holder-a" data-holder-id="holder-a"><summary><strong>Synthetic Holder A (Other editor alias)</strong></summary><div class="holder-supplies"><button class="add-supply-holder" data-client="Synthetic Client A">Nuevo suministro</button></div></details>
          <details class="holder-folder" id="synthetic-holder-b" data-holder-id="holder-b"><summary><strong>Synthetic Holder B (Synthetic Alias B)</strong></summary><div class="holder-supplies"><button class="add-supply-holder" data-client="Synthetic Client B">Nuevo suministro</button></div></details>
          <details class="holder-folder" id="synthetic-holder-missing" data-holder-id="missing-holder"><summary><strong>Synthetic Holder A</strong></summary><div class="holder-supplies"><button class="add-supply-holder" data-client="Synthetic Client A">Nuevo suministro</button></div></details>
        </div>
      </article>`;
      document.querySelector('#clientesView').appendChild(host);
    });
    await page.addScriptTag({ path: 'client-archive-integrated.js' });
    await page.waitForSelector('#synthetic-holder-a .integrated-holder-edit');
    await page.waitForSelector('#synthetic-holder-b .integrated-holder-edit');
    assert.equal(await page.locator('#synthetic-holder-missing .integrated-holder-edit').count(), 0, 'An unknown UUID must not fall back to another holder with the same text');
    await page.locator('#synthetic-holder-a .integrated-holder-edit').click();
    assert.equal(await page.locator('#holderProfileId').inputValue(), 'holder-a');
    assert.equal(await alias.inputValue(), 'Other editor alias');
    await page.locator('#closeHolderProfile').click();
    await page.locator('#synthetic-holder-b .integrated-holder-edit').click();
    assert.equal(await page.locator('#holderProfileId').inputValue(), 'holder-b');
    assert.equal(await alias.inputValue(), 'Synthetic Alias B');
    await page.locator('#closeHolderProfile').click();
    await page.evaluate(() => {
      const folder = document.querySelector('#synthetic-holder-a');
      folder.querySelector('summary strong').textContent = 'Synthetic Holder B';
      folder.querySelector('.add-supply-holder').dataset.client = 'Synthetic Client B';
      folder.querySelector('.integrated-holder-edit').remove();
    });
    await page.waitForSelector('#synthetic-holder-a .integrated-holder-edit');
    assert.equal(await page.locator('#synthetic-holder-a .integrated-holder-edit').count(), 1);
    await page.locator('#synthetic-holder-a .integrated-holder-edit').click();
    assert.equal(await page.locator('#holderProfileId').inputValue(), 'holder-a', 'Stable holder identity wins over the visible alias/name');
    await page.locator('#closeHolderProfile').click();
    assert.deepEqual(errors, []);
    console.log('PASS: mixed keep, atomic bulk RPC payload, all-supply preview, create/clear, stale context rejection, unavailable context retry, late-response isolation, zero supplies, double-submit/close guards, saved-but-refresh-failed state, alias preload/save/clear/reopen, shared client scope, cancel/rejected/stale alias protection, alias+group atomic payload, unavailable alias read guard, protected identity/history/other aliases, stable UUID edit actions and mobile layout. Synthetic data only.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
