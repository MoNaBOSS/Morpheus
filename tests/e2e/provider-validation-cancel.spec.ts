import type { ElectronApplication } from '@playwright/test';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type DeferredProviderFixture = {
  validations: Array<(valid: boolean) => void>;
  commits: Array<() => Promise<void>>;
  mutations: string[];
};

async function releaseValidation(app: ElectronApplication, index: number, valid: boolean) {
  await app.evaluate((_electron, input) => {
    const fixture = (globalThis as unknown as { __providerCancel: DeferredProviderFixture }).__providerCancel;
    fixture.validations[input.index](input.valid);
  }, { index, valid });
}

async function fixtureState(app: ElectronApplication) {
  return app.evaluate(() => {
    const fixture = (globalThis as unknown as { __providerCancel: DeferredProviderFixture }).__providerCancel;
    return { validations: fixture.validations.length, commits: fixture.commits.length, mutations: fixture.mutations };
  });
}

test('cancelled provider validation cannot create accounts, replace keys or change a newer form', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const seededAccounts = await page.evaluate(async () => {
      const now = new Date().toISOString();
      for (const id of ['cancel-first', 'cancel-default']) {
        const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'createAccount', payload: {
          account: { id, vendorId: 'openrouter', label: id, authMode: 'api_key', model: 'fixture/original',
            enabled: true, isDefault: false, createdAt: now, updatedAt: now }, apiKey: `synthetic-${id}`,
        } });
        if (!result.ok || !(result.data as { success?: boolean }).success) throw new Error('Synthetic account setup failed');
      }
      const selected = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'setDefaultAccount', payload: { accountId: 'cancel-default' } });
      if (!selected.ok || !(selected.data as { success?: boolean }).success) throw new Error('Synthetic default setup failed');
      const listed = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'accounts' });
      if (!listed.ok) throw new Error('Synthetic providers unavailable');
      return listed.data;
    });
    expect(seededAccounts).toHaveLength(2);
    expect(seededAccounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cancel-first', model: 'fixture/original' }),
      expect.objectContaining({ id: 'cancel-default', model: 'fixture/original' }),
    ]));
    await app.evaluate(({ ipcMain }) => {
      const original = (ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown, request: unknown) => Promise<unknown>> })._invokeHandlers.get('host:invoke');
      if (!original) throw new Error('Host fixture handler unavailable');
      const fixture: DeferredProviderFixture = { validations: [], commits: [], mutations: [] };
      (globalThis as unknown as { __providerCancel: DeferredProviderFixture }).__providerCancel = fixture;
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', async (event, request: { id?: string; module?: string; action?: string }) => {
        if (request.module === 'providers' && request.action === 'validateKey') {
          return new Promise((resolve) => fixture.validations.push((valid) => resolve({ id: request.id, ok: true,
            data: valid ? { valid: true } : { valid: false, error: 'Cancelled validation must stay hidden' } })));
        }
        if (request.module === 'providers' && (request.action === 'createAccount' || request.action === 'updateAccount')) {
          fixture.mutations.push(request.action);
          return new Promise((resolve, reject) => fixture.commits.push(async () => {
            try { resolve(await original(event, request)); } catch (error) { reject(error); }
          }));
        }
        return original(event, request);
      });
    });
    await page.reload();
    await page.evaluate(() => { window.location.hash = '#/settings?section=connections'; });
    await expect(page.getByTestId('provider-card-cancel-default')).toContainText('Default');
    const openAdd = async () => {
      await page.getByTestId('providers-add-button').click();
      await page.getByTestId('add-provider-type-openrouter').click();
      await expect(page.getByTestId('add-provider-api-key-input')).toHaveValue('');
    };
    const submitAdd = async (model: string) => {
      await page.getByTestId('add-provider-api-key-input').fill('synthetic-add-key');
      await page.getByTestId('add-provider-model-id-input').fill(model);
      await page.getByTestId('add-provider-submit-button').click();
    };
    const settleOldReply = async () => {
      // A bounded renderer turn is required for negative assertions after the IPC reply.
      await page.waitForTimeout(150);
    };

    // A successful old validation cannot commit, or clear a newer form's busy state.
    await openAdd();
    await submitAdd('fixture/cancelled');
    await expect.poll(() => fixtureState(app)).toMatchObject({ validations: 1 });
    await page.getByTestId('add-provider-close-button').click();
    await openAdd();
    await submitAdd('fixture/new-form');
    await expect.poll(() => fixtureState(app)).toMatchObject({ validations: 2 });
    await releaseValidation(app, 0, true);
    await settleOldReply();
    await expect(page.getByTestId('add-provider-submit-button')).toBeDisabled();
    expect((await fixtureState(app)).mutations).toEqual([]);

    // Rejected old validation is also ignored after close and reopen.
    await page.getByTestId('add-provider-close-button').click();
    await openAdd();
    await releaseValidation(app, 1, false);
    await settleOldReply();
    await expect(page.getByTestId('add-provider-dialog')).not.toContainText('Cancelled validation');
    await expect(page.getByTestId('add-provider-api-key-input')).toHaveValue('');

    // A changed draft cannot be silently saved from its earlier validation.
    await submitAdd('fixture/old-draft');
    await expect.poll(() => fixtureState(app)).toMatchObject({ validations: 3 });
    await page.getByTestId('add-provider-model-id-input').fill('fixture/changed-draft');
    await releaseValidation(app, 2, true);
    await expect(page.getByTestId('add-provider-submit-button')).toBeEnabled();
    expect((await fixtureState(app)).mutations).toEqual([]);
    await page.getByTestId('add-provider-close-button').click();

    // Edit cancellation/sibling selection preserves both keys and the default.
    await page.getByTestId('provider-card-cancel-first').hover();
    await page.getByTestId('provider-edit-cancel-first').click();
    await page.getByTestId('provider-edit-key-input-cancel-first').fill('synthetic-replacement');
    await page.getByTestId('provider-edit-save-cancel-first').click();
    await expect.poll(() => fixtureState(app)).toMatchObject({ validations: 4 });
    await page.getByTestId('provider-edit-cancel-cancel-first').click();
    await page.getByTestId('provider-card-cancel-default').hover();
    await page.getByTestId('provider-edit-cancel-default').click();
    await releaseValidation(app, 3, true);
    await settleOldReply();
    await expect(page.getByTestId('provider-edit-key-input-cancel-default')).toHaveValue('');
    expect((await fixtureState(app)).mutations).toEqual([]);
    await page.getByTestId('provider-edit-key-input-cancel-default').fill('synthetic-rejected');
    await page.getByTestId('provider-edit-save-cancel-default').click();
    await expect.poll(() => fixtureState(app)).toMatchObject({ validations: 5 });
    await page.getByTestId('provider-edit-cancel-cancel-default').click();
    await page.getByTestId('provider-card-cancel-default').hover();
    await page.getByTestId('provider-edit-cancel-default').click();
    await releaseValidation(app, 4, false);
    await settleOldReply();
    await expect(page.getByTestId('provider-edit-key-input-cancel-default')).toHaveValue('');
    await expect(page.getByTestId('provider-card-cancel-default')).not.toContainText('Cancelled validation');

    // Once the write reaches Main, Cancel and draft fields stay locked until it settles.
    await page.getByTestId('provider-edit-model-id-cancel-default').fill('fixture/committed');
    await page.getByTestId('provider-edit-save-cancel-default').click();
    await expect.poll(() => fixtureState(app)).toMatchObject({ commits: 1 });
    await expect(page.getByTestId('provider-edit-cancel-cancel-default')).toBeDisabled();
    await expect(page.getByTestId('provider-edit-model-id-cancel-default')).toBeDisabled();
    await app.evaluate(async () => (globalThis as unknown as { __providerCancel: DeferredProviderFixture }).__providerCancel.commits[0]());
    await expect(page.getByTestId('provider-card-cancel-default')).toContainText('fixture/committed');
    await expect(page.getByTestId('provider-edit-model-id-cancel-default')).toHaveCount(0);
    expect((await fixtureState(app)).mutations).toEqual(['updateAccount']);
    const retained = await page.evaluate(async () => {
      const invoke = async (action: string, payload?: Record<string, unknown>) => {
        const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action, payload });
        if (!result.ok) throw new Error('Provider retention check failed');
        return result.data;
      };
      return { accounts: await invoke('accounts'), default: await invoke('getDefaultAccount'),
        firstKey: await invoke('hasAccountApiKey', { accountId: 'cancel-first' }),
        defaultKey: await invoke('hasAccountApiKey', { accountId: 'cancel-default' }) };
    });
    expect(retained.accounts).toHaveLength(2);
    expect(retained.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cancel-first', model: 'fixture/original' }),
      expect.objectContaining({ id: 'cancel-default', model: 'fixture/committed' }),
    ]));
    expect(retained.default).toEqual({ accountId: 'cancel-default' });
    expect(retained.firstKey).toBe(true);
    expect(retained.defaultKey).toBe(true);
    expect(await page.locator('body').innerText()).not.toContain('synthetic-');
    await page.screenshot({ path: info.outputPath('provider-cancel-retention.png') });
  } finally {
    await closeElectronApp(app);
  }
});
