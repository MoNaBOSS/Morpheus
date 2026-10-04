import { closeElectronApp, completeSetup, expect, getStableWindow, test } from './fixtures/electron';
import ruSettings from '../../shared/i18n/locales/ru/settings.json';

const TEST_PROVIDER_ID = 'moonshot-e2e';
const TEST_PROVIDER_LABEL = 'Moonshot E2E';

async function seedTestProvider(page: Parameters<typeof completeSetup>[0]): Promise<void> {
  await page.evaluate(async ({ providerId, providerLabel }) => {
    const now = new Date().toISOString();
    await window.electron.ipcRenderer.invoke('provider:save', {
      id: providerId,
      name: providerLabel,
      type: 'moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2.6',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  }, { providerId: TEST_PROVIDER_ID, providerLabel: TEST_PROVIDER_LABEL });
}

async function openModels(page: Parameters<typeof completeSetup>[0]): Promise<void> {
  const models = page.getByTestId('sidebar-nav-models');
  if (!await models.isVisible().catch(() => false)) {
    await page.getByTestId('signal-nav-advanced').click();
  }
  await models.click();
}

test.describe('ClawX provider lifecycle', () => {
  test('promotes a remaining provider after deleting the default provider', async ({ page }) => {
    await completeSetup(page);

    await page.evaluate(async () => {
      const now = new Date().toISOString();
      const providers = [
        {
          id: 'moonshot-default-e2e',
          name: 'Moonshot Default E2E',
          type: 'moonshot',
          baseUrl: 'https://api.moonshot.cn/v1',
          model: 'kimi-k2.6',
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'deepseek-replacement-e2e',
          name: 'DeepSeek Replacement E2E',
          type: 'deepseek',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-pro',
          enabled: true,
          createdAt: now,
          updatedAt: new Date(Date.now() + 1_000).toISOString(),
        },
      ];

      for (const provider of providers) {
        await window.electron.ipcRenderer.invoke('provider:save', provider);
      }
      await window.electron.ipcRenderer.invoke('provider:setDefault', providers[0].id);
    });

    await openModels(page);
    await expect(page.getByTestId('provider-card-moonshot-default-e2e')).toContainText('Default');
    await expect(page.getByTestId('provider-card-deepseek-replacement-e2e')).toBeVisible();

    await page.getByTestId('provider-card-moonshot-default-e2e').hover();
    await page.getByTestId('provider-delete-moonshot-default-e2e').click();

    await expect(page.getByTestId('provider-card-moonshot-default-e2e')).toHaveCount(0);
    await expect(page.getByTestId('provider-card-deepseek-replacement-e2e')).toContainText('Default');
    await expect(page.getByTestId('provider-set-default-deepseek-replacement-e2e')).toHaveCount(0);
  });

  test('shows a saved provider and removes it cleanly after deletion', async ({ page }) => {
    await completeSetup(page);
    await seedTestProvider(page);

    await openModels(page);
    await expect(page.getByTestId('providers-settings')).toBeVisible();
    await expect(page.getByTestId(`provider-card-${TEST_PROVIDER_ID}`)).toContainText(TEST_PROVIDER_LABEL);

    await page.getByTestId(`provider-card-${TEST_PROVIDER_ID}`).hover();
    await page.getByTestId(`provider-delete-${TEST_PROVIDER_ID}`).click();

    await expect(page.getByTestId(`provider-card-${TEST_PROVIDER_ID}`)).toHaveCount(0);
    await expect(page.getByText(TEST_PROVIDER_LABEL)).toHaveCount(0);
  });

  test('does not redisplay a deleted provider after relaunch', async ({ electronApp, launchElectronApp, page }) => {
    await completeSetup(page);
    await seedTestProvider(page);

    await openModels(page);
    await expect(page.getByTestId(`provider-card-${TEST_PROVIDER_ID}`)).toContainText(TEST_PROVIDER_LABEL);

    await page.getByTestId(`provider-card-${TEST_PROVIDER_ID}`).hover();
    await page.getByTestId(`provider-delete-${TEST_PROVIDER_ID}`).click();
    await expect(page.getByTestId(`provider-card-${TEST_PROVIDER_ID}`)).toHaveCount(0);

    await electronApp.close();

    const relaunchedApp = await launchElectronApp();
    try {
      const relaunchedPage = await relaunchedApp.firstWindow();
      await relaunchedPage.waitForLoadState('domcontentloaded');
      await expect(relaunchedPage.getByTestId('main-layout')).toBeVisible();

      await openModels(relaunchedPage);
      await expect(relaunchedPage.getByTestId('providers-settings')).toBeVisible();
      await expect(relaunchedPage.getByTestId(`provider-card-${TEST_PROVIDER_ID}`)).toHaveCount(0);
      await expect(relaunchedPage.getByText(TEST_PROVIDER_LABEL)).toHaveCount(0);
    } finally {
      await relaunchedApp.close();
    }
  });

  test('shows OpenAI OAuth and API key auth mode toggle in add-provider dialog', async ({ page }) => {
    await completeSetup(page);

    await openModels(page);
    await expect(page.getByTestId('providers-settings')).toBeVisible();

    await page.getByTestId('providers-add-button').click();
    await expect(page.getByTestId('add-provider-dialog')).toBeVisible();

    await page.getByTestId('add-provider-type-openai').click();
    await expect(page.getByTestId('add-provider-auth-oauth-tab')).toBeVisible();
    await expect(page.getByTestId('add-provider-auth-apikey-tab')).toBeVisible();

    await page.getByTestId('add-provider-auth-oauth-tab').click();
    await expect(page.getByTestId('add-provider-oauth-login-button')).toBeVisible();
    await expect(page.getByTestId('add-provider-api-key-input')).toHaveCount(0);
  });

  test('trims whitespace before validating and saving a custom provider key', async ({ electronApp, page }) => {
    await completeSetup(page);

    await electronApp.evaluate(async ({ app: _app }) => {
      const { ipcMain } = process.mainModule!.require('electron') as typeof import('electron');

      let accounts: Array<Record<string, unknown>> = [];
      let keyInfo: Array<{ accountId: string; hasKey: boolean; keyMasked: string | null }> = [];
      let statuses: Array<Record<string, unknown>> = [];
      let defaultAccountId: string | null = null;
      const originalHostInvoke = (ipcMain as unknown as {
        _invokeHandlers?: Map<string, (event: unknown, request: unknown) => Promise<unknown>>;
      })._invokeHandlers?.get('host:invoke');

      const respond = (id: unknown, data: unknown) => ({
        id: typeof id === 'string' ? id : undefined,
        ok: true,
        data,
      });

      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', async (event: unknown, request: {
        id?: string;
        module?: string;
        action?: string;
        payload?: Record<string, unknown>;
      }) => {
        if (request?.module !== 'providers') {
          return originalHostInvoke?.(event, request) ?? respond(request?.id, undefined);
        }

        const body = request.payload ?? {};
        if (request.action === 'accounts') return respond(request.id, accounts);
        if (request.action === 'accountKeyInfo') return respond(request.id, keyInfo);
        if (request.action === 'vendors') return respond(request.id, []);
        if (request.action === 'getDefaultAccount') return respond(request.id, { accountId: defaultAccountId });
        if (request.action === 'list') return respond(request.id, statuses);

        if (request.action === 'validateKey') {
          if (body.apiKey !== 'sk-lm-test') {
            return respond(request.id, { valid: false, error: `unexpected key: ${String(body.apiKey)}` });
          }
          const options = body.options as Record<string, unknown> | undefined;
          if (options?.modelId !== 'local-model') {
            return respond(request.id, {
              valid: false,
              error: `unexpected validation model: ${String(options?.modelId)}`,
            });
          }
          return respond(request.id, { valid: true });
        }

        if (request.action === 'createAccount') {
          const account = body.account as Record<string, unknown>;
          accounts = [account];
          keyInfo = [{
            accountId: String(account.id),
            hasKey: Boolean(body.apiKey),
            keyMasked: body.apiKey ? 'sk-***' : null,
          }];
          statuses = [{
            id: account.id,
            name: account.label,
            type: account.vendorId,
            baseUrl: account.baseUrl,
            model: account.model,
            enabled: account.enabled,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
            hasKey: Boolean(body.apiKey),
            keyMasked: body.apiKey ? 'sk-***' : null,
          }];
          return respond(request.id, { success: true, account });
        }

        if (request.action === 'setDefaultAccount') {
          defaultAccountId = typeof body.accountId === 'string' ? body.accountId : null;
          return respond(request.id, { success: true });
        }

        return respond(request.id, {});
      });
    });

    await openModels(page);
    await expect(page.getByTestId('providers-settings')).toBeVisible();

    await page.getByTestId('providers-add-button').click();
    await expect(page.getByTestId('add-provider-dialog')).toBeVisible();

    await page.getByTestId('add-provider-type-custom').click();
    await page.getByTestId('add-provider-name-input').fill('LM Studio Local');
    await page.getByTestId('add-provider-api-key-input').fill('  sk-lm-test \n');
    await page.getByTestId('add-provider-base-url-input').fill('http://127.0.0.1:1234/v1');
    await page.getByTestId('add-provider-model-id-input').fill('local-model');
    await page.getByTestId('add-provider-submit-button').click();

    await expect(page.getByTestId('provider-card-custom')).toContainText('LM Studio Local');
  });

  test('saves only the explicit OpenRouter model while retaining other accounts, keys and the default', async ({ electronApp, launchElectronApp, page }, info) => {
    await completeSetup(page);
    // Disposable per-user profile, protected synthetic keys and real Main-owned
    // account updates. No validation, prompt or paid-provider request is sent.
    const originalAccounts = await page.evaluate(async () => {
      const now = new Date().toISOString();
      const accounts = [
        { id: 'openrouter-retained', vendorId: 'openrouter', label: 'Retained account',
          authMode: 'api_key', model: 'fixture/retained-model', enabled: true,
          isDefault: false, createdAt: now, updatedAt: now },
        { id: 'openrouter-edit', vendorId: 'openrouter', label: 'OpenRouter Review',
          authMode: 'api_key', model: 'fixture/original-model', enabled: true,
          isDefault: false, createdAt: now, updatedAt: now },
      ];
      for (const account of accounts) {
        const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'createAccount',
          payload: { account, apiKey: `synthetic-${account.id}` } });
        if (!result.ok || !(result.data as { success?: boolean }).success) throw new Error('Synthetic provider setup failed');
      }
      const selected = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'setDefaultAccount',
        payload: { accountId: 'openrouter-retained' } });
      if (!selected.ok || !(selected.data as { success?: boolean }).success) throw new Error('Synthetic default setup failed');
      const before = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'accounts' });
      if (!before.ok) throw new Error('Synthetic providers unavailable');
      return before.data;
    });
    expect(originalAccounts).toHaveLength(2);
    expect(originalAccounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'openrouter-retained', model: 'fixture/retained-model' }),
      expect.objectContaining({ id: 'openrouter-edit', model: 'fixture/original-model' }),
    ]));

    await page.reload();
    await page.evaluate(() => { window.location.hash = '#/settings?section=connections'; });
    await expect(page.getByTestId('providers-settings')).toBeVisible();
    await expect(page.getByTestId('provider-card-openrouter-edit')).toBeVisible();

    await page.getByTestId('provider-card-openrouter-edit').hover();
    await page.getByTestId('provider-edit-openrouter-edit').click();

    const modelInput = page.getByTestId('provider-edit-model-id-openrouter-edit');
    await expect(modelInput).toBeEnabled();
    await expect(modelInput).toHaveValue('fixture/original-model');
    await expect(page.getByTestId('provider-edit-model-id-help-openrouter-edit')).toContainText(
      'updates the provider used by Morpheus and OpenClaw',
    );
    const save = page.getByTestId('provider-edit-save-openrouter-edit');
    await expect(save).toBeDisabled();
    await modelInput.fill('   ');
    await expect(save).toBeDisabled();
    await expect(page.getByTestId('provider-edit-openrouter-guidance-openrouter-edit')).toContainText('service access only');
    await expect(page.getByTestId('provider-edit-openrouter-guidance-openrouter-edit').getByRole('link')).toHaveAttribute('href', 'https://openrouter.ai/models');
    await modelInput.fill('fixture/selected-model');
    await expect(save).toBeEnabled();
    await expect(page.getByTestId('provider-edit-key-input-openrouter-edit')).toHaveValue('');
    await save.click();
    await expect(modelInput).toHaveCount(0);
    await expect(page.getByTestId('provider-card-openrouter-edit')).toContainText('fixture/selected-model');
    await expect(page.getByTestId('provider-card-openrouter-retained')).toContainText('Default');
    await expect(page.getByTestId('provider-connection-result-openrouter-edit')).toContainText('without sending a model prompt');

    const readSavedState = async (target: typeof page) => target.evaluate(async () => {
      const invoke = async (action: string, payload?: Record<string, unknown>) => {
        const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action, payload });
        if (!result.ok) throw new Error('Provider verification failed');
        return result.data;
      };
      return {
        accounts: await invoke('accounts'),
        defaultAccount: await invoke('getDefaultAccount'),
        originalKey: await invoke('hasAccountApiKey', { accountId: 'openrouter-edit' }),
        retainedKey: await invoke('hasAccountApiKey', { accountId: 'openrouter-retained' }),
      };
    });
    const saved = await readSavedState(page);
    const before = originalAccounts as Array<{ id: string; [key: string]: unknown }>;
    const after = saved.accounts as Array<{ id: string; [key: string]: unknown }>;
    expect(after).toHaveLength(before.length);
    expect(after.find((account) => account.id === 'openrouter-retained')).toEqual(before.find((account) => account.id === 'openrouter-retained'));
    expect(after.find((account) => account.id === 'openrouter-edit')).toMatchObject({
      ...before.find((account) => account.id === 'openrouter-edit'),
      model: 'fixture/selected-model',
      updatedAt: expect.any(String),
    });
    expect(saved.defaultAccount).toEqual({ accountId: 'openrouter-retained' });
    expect(saved.originalKey).toBe(true);
    expect(saved.retainedKey).toBe(true);
    expect(await page.locator('body').innerText()).not.toContain('synthetic-openrouter');
    await page.screenshot({ path: info.outputPath('openrouter-model-only-save.png') });

    await closeElectronApp(electronApp);
    const relaunched = await launchElectronApp({ skipSetup: true });
    try {
      const returning = await getStableWindow(relaunched);
      await returning.evaluate(() => { window.location.hash = '#/settings?section=connections'; });
      await expect(returning.getByTestId('provider-card-openrouter-edit')).toContainText('fixture/selected-model');
      await expect(returning.getByTestId('provider-card-openrouter-retained')).toContainText('Default');
      expect(await readSavedState(returning)).toEqual(saved);
      await returning.screenshot({ path: info.outputPath('openrouter-retained-after-restart.png') });
    } finally {
      await closeElectronApp(relaunched);
    }
  });

  test('localizes a keyless default rejection while retaining the configured default and both accounts', async ({ page }, info) => {
    await completeSetup(page);
    await page.evaluate(async () => {
      const now = new Date().toISOString();
      for (const account of [
        { id: 'openrouter-configured-default', vendorId: 'openrouter', label: 'Configured default',
          authMode: 'api_key', model: 'fixture/configured-default', enabled: true,
          isDefault: false, createdAt: now, updatedAt: now },
        { id: 'openrouter-keyless-sibling', vendorId: 'openrouter', label: 'Keyless sibling',
          authMode: 'api_key', model: 'fixture/keyless-sibling', enabled: true,
          isDefault: false, createdAt: now, updatedAt: now },
      ]) {
        const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'createAccount',
          payload: { account, ...(account.id === 'openrouter-configured-default' ? { apiKey: 'synthetic-default-rejection-key' } : {}) } });
        if (!result.ok || !(result.data as { success?: boolean }).success) throw new Error('Synthetic provider setup failed');
      }
      const selected = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'setDefaultAccount',
        payload: { accountId: 'openrouter-configured-default' } });
      if (!selected.ok || !(selected.data as { success?: boolean }).success) throw new Error('Synthetic default setup failed');
      const language = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set',
        payload: { key: 'language', value: 'ru' } });
      if (!language.ok) throw new Error('Fixture language setup failed');
    });
    const readSavedState = async () => page.evaluate(async () => {
      const invoke = async (action: string, payload?: Record<string, unknown>) => {
        const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action, payload });
        if (!result.ok) throw new Error('Provider verification failed');
        return result.data;
      };
      return {
        accounts: await invoke('accounts'),
        defaultAccount: await invoke('getDefaultAccount'),
        configuredKey: await invoke('hasAccountApiKey', { accountId: 'openrouter-configured-default' }),
        siblingKey: await invoke('hasAccountApiKey', { accountId: 'openrouter-keyless-sibling' }),
      };
    });
    const before = await readSavedState();
    expect(before.accounts).toHaveLength(2);
    expect(before.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'openrouter-configured-default', model: 'fixture/configured-default' }),
      expect.objectContaining({ id: 'openrouter-keyless-sibling', model: 'fixture/keyless-sibling' }),
    ]));
    expect(before.defaultAccount).toEqual({ accountId: 'openrouter-configured-default' });
    expect(before.configuredKey).toBe(true);
    expect(before.siblingKey).toBe(false);

    await page.reload();
    await page.evaluate(() => { window.location.hash = '#/settings?section=connections'; });
    const configured = page.getByTestId('provider-card-openrouter-configured-default');
    const sibling = page.getByTestId('provider-card-openrouter-keyless-sibling');
    await expect(configured).toContainText(ruSettings.aiProviders.card.default);
    await expect(configured).toContainText(ruSettings.aiProviders.card.configured);
    await expect(sibling).toContainText(ruSettings.aiProviders.dialog.apiKeyMissing);
    await sibling.hover();
    await page.getByTestId('provider-set-default-openrouter-keyless-sibling').click();
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveText(ruSettings.aiProviders.toast.defaultNeedsKey);
    await expect(page.locator('body')).not.toContainText('Save an API key for this provider account before making it the default');
    await expect(configured).toContainText(ruSettings.aiProviders.card.default);
    await expect(page.getByTestId('provider-set-default-openrouter-configured-default')).toHaveCount(0);
    expect(await readSavedState()).toEqual(before);
    await expect(page.locator('body')).not.toContainText('synthetic-default-rejection-key');
    await page.screenshot({ path: info.outputPath('localized-keyless-default-rejection.png') });
  });

  test('reveals a saved account after interrupted service delivery without creating a duplicate', async ({ page, electronApp }, info) => {
    await completeSetup(page);
    await page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set',
        payload: { key: 'language', value: 'ru' } });
      if (!result.ok) throw new Error('Fixture language setup failed');
    });
    await page.reload();
    await page.evaluate(() => { window.location.hash = '#/settings?section=connections'; });
    await expect(page.getByTestId('providers-add-button')).toBeVisible();
    await electronApp.evaluate(({ ipcMain }) => {
      const original = (ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown, request: unknown) => Promise<{ ok?: boolean; data?: unknown }>> })._invokeHandlers.get('host:invoke');
      if (!original) throw new Error('Host fixture handler unavailable');
      (globalThis as unknown as { interruptedProviderCreates: number }).interruptedProviderCreates = 0;
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', async (event, request: { id?: string; module?: string; action?: string }) => {
        if (request.module === 'providers' && request.action === 'validateKey') {
          return { id: request.id, ok: true, data: { valid: true } };
        }
        const response = await original(event, request);
        if (request.module === 'providers' && request.action === 'createAccount' && response.ok) {
          if (!(response.data as { success?: boolean }).success) throw new Error('Actual synthetic account save failed');
          (globalThis as unknown as { interruptedProviderCreates: number }).interruptedProviderCreates++;
          // Actual protected persistence above; only its later service-delivery
          // failure is simulated. No provider metadata/inference request is sent.
          return { id: request.id, ok: true, data: { success: false,
            error: 'Error: Provider key saved; Gateway restart with the updated environment is required' } };
        }
        return response;
      });
    });
    await page.getByTestId('providers-add-button').click();
    await page.getByTestId('add-provider-type-openrouter').click();
    await page.getByTestId('add-provider-name-input').fill('Interrupted setup');
    await page.getByTestId('add-provider-api-key-input').fill('synthetic-saved-interrupted-key');
    await page.getByTestId('add-provider-model-id-input').fill('fixture/after-save');
    await page.getByTestId('add-provider-submit-button').click();
    await expect(page.getByTestId('add-provider-dialog')).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveText(ruSettings.aiProviders.toast.deliveryInterrupted);
    const saved = await page.evaluate(async () => {
      const accounts = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'accounts' });
      if (!accounts.ok) throw new Error('Synthetic saved state unavailable');
      const entries = accounts.data as Array<{ id: string; label: string; model: string }>;
      if (entries.length !== 1) throw new Error('Unexpected duplicate synthetic account');
      const key = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'providers', action: 'hasAccountApiKey', payload: { accountId: entries[0].id } });
      return { accounts: entries, keyPresent: key.ok && key.data === true };
    });
    expect(saved.accounts).toEqual([expect.objectContaining({ label: 'Interrupted setup', model: 'fixture/after-save' })]);
    expect(saved.keyPresent).toBe(true);
    expect(await electronApp.evaluate(() => (globalThis as unknown as { interruptedProviderCreates: number }).interruptedProviderCreates)).toBe(1);
    await expect(page.getByTestId(`provider-card-${saved.accounts[0].id}`)).toContainText('Interrupted setup');
    await expect(page.locator('body')).not.toContainText('synthetic-saved-interrupted-key');
    await expect(page.locator('body')).not.toContainText('Gateway restart with the updated environment');
    await page.screenshot({ path: info.outputPath('localized-saved-account-service-recovery.png') });
  });

  test('shows Z.AI CN/Global options and Code Plan endpoint toggle', async ({ page }) => {
    await completeSetup(page);

    await openModels(page);
    await expect(page.getByTestId('providers-settings')).toBeVisible();

    await page.getByTestId('providers-add-button').click();
    await expect(page.getByTestId('add-provider-dialog')).toBeVisible();
    await expect(page.getByTestId('add-provider-type-zai')).toBeVisible();
    await expect(page.getByTestId('add-provider-type-zai-global')).toBeVisible();

    await page.getByTestId('add-provider-type-zai').click();
    await expect(page.getByTestId('add-provider-base-url-input')).toHaveValue('https://open.bigmodel.cn/api/paas/v4');
    await expect(page.getByTestId('add-provider-model-id-input')).toHaveValue('glm-5.2');
    await expect(page.getByTestId('add-provider-codeplan-mode-tab')).toBeVisible();

    await page.getByTestId('add-provider-codeplan-mode-tab').click();
    await expect(page.getByTestId('add-provider-base-url-input')).toHaveValue('https://open.bigmodel.cn/api/coding/paas/v4');
    await expect(page.getByTestId('add-provider-model-id-input')).toHaveValue('glm-5.2');

    await page.getByTestId('add-provider-codeplan-apikey-tab').click();
    await expect(page.getByTestId('add-provider-base-url-input')).toHaveValue('https://open.bigmodel.cn/api/paas/v4');

    await page.getByTestId('add-provider-change-type').click();
    await page.getByTestId('add-provider-type-zai-global').click();
    await expect(page.getByTestId('add-provider-base-url-input')).toHaveValue('https://api.z.ai/api/paas/v4');
    await page.getByTestId('add-provider-codeplan-mode-tab').click();
    await expect(page.getByTestId('add-provider-base-url-input')).toHaveValue('https://api.z.ai/api/coding/paas/v4');
  });
});
