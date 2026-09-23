import { completeSetup, expect, installIpcMocks, test } from './fixtures/electron';

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

  test('edit form updates an existing OpenRouter account to the economy model', async ({ electronApp, page }) => {
    await completeSetup(page);
    const now = new Date().toISOString();
    const account = {
      id: 'openrouter-edit',
      vendorId: 'openrouter',
      label: 'OpenRouter Review',
      authMode: 'api_key',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiProtocol: 'openai-completions',
      model: 'openai/gpt-5.6-sol',
      enabled: true,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    };
    await installIpcMocks(electronApp, { hostApi: {
      [JSON.stringify(['providers', 'accounts', null])]: [account],
      [JSON.stringify(['providers', 'accountKeyInfo', null])]: [{
        accountId: account.id,
        hasKey: true,
        keyMasked: 'sk-or-***',
      }],
      [JSON.stringify(['providers', 'vendors', null])]: [],
      [JSON.stringify(['providers', 'getDefaultAccount', null])]: { accountId: account.id },
    } });

    await page.evaluate(() => { window.location.hash = '#/models'; });
    await expect(page.getByTestId('providers-settings')).toBeVisible();
    await expect(page.getByTestId('provider-card-openrouter-edit')).toBeVisible();

    await page.getByTestId('provider-card-openrouter-edit').hover();
    await page.getByTestId('provider-edit-openrouter-edit').click();

    const modelInput = page.getByTestId('provider-edit-model-id-openrouter-edit');
    await expect(modelInput).toBeEnabled();
    await expect(modelInput).toHaveValue('openai/gpt-5.6-sol');
    await expect(page.getByTestId('provider-edit-model-id-help-openrouter-edit')).toContainText(
      'updates the provider used by Morpheus and OpenClaw',
    );
    await page.getByTestId('provider-edit-use-economy-openrouter-edit').click();
    await expect(modelInput).toHaveValue('deepseek/deepseek-v4-flash-0731');
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
