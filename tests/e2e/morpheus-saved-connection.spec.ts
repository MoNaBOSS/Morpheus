import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ElectronApplication } from '@playwright/test';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test('onboarding and ordinary Connections test a protected saved credential without inference', async ({ launchElectronApp }, info) => {
  // Deterministic local service only; no owner credential or live paid provider call.
  const credential = 'synthetic-connection-e2e-private';
  let status = 200;
  const requests: Array<{ method?: string; path?: string; authorized: boolean }> = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, path: request.url, authorized: request.headers.authorization === `Bearer ${credential}` });
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(status === 200 ? { data: [{ id: 'synthetic-model' }] } : { error: { message: `secret ${credential}` } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  let app: ElectronApplication | undefined;
  try {
    app = await launchElectronApp({ additionalArgs: ['--morpheus-onboarding=on'] });
    const page = await getStableWindow(app);
    await page.evaluate(async ({ baseUrl, credential }) => {
      const now = new Date().toISOString();
      const created = await window.clawx.hostInvoke({
        id: crypto.randomUUID(), module: 'providers', action: 'createAccount', payload: {
          account: { id: 'saved-test', vendorId: 'custom', label: 'Saved test', authMode: 'api_key',
            baseUrl, apiProtocol: 'openai-completions', model: 'synthetic-model',
            enabled: true, isDefault: true, createdAt: now, updatedAt: now },
          apiKey: credential,
        },
      });
      if (!created.ok || !(created.data as { success?: boolean }).success) throw new Error('Synthetic account creation failed');
      await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'updateVoiceSettings', payload: { enabled: false, ambientEnabled: false, speakResponses: false } });
    }, { baseUrl, credential });
    await page.reload();
    await expect(page.getByTestId('activation-intro-name')).toBeVisible();
    await page.getByTestId('activation-intro-name').fill('Larry');
    await page.getByTestId('morpheus-activation-begin').click();
    await expect(page.getByTestId('activation-setup-connections')).toBeVisible();
    const button = page.getByTestId('provider-test-connection-saved-test');
    const result = page.getByTestId('provider-connection-result-saved-test');
    await expect(button).toBeVisible(); // discoverable without hover, edit, or another key entry
    await expect(result).toContainText('without sending a model prompt');
    await button.click();
    await expect(result).toContainText('Service access confirmed');
    await expect(result).toContainText('model has not been tested');
    expect(requests).toEqual([{ method: 'GET', path: '/v1/models?limit=1', authorized: true }]);
    expect(await page.locator('body').innerText()).not.toContain(credential);
    await page.screenshot({ path: info.outputPath('onboarding-saved-connection.png') });

    // Complete the real first-run owner without executing a model prompt or recording.
    await page.getByTestId('activation-setup-skip').click();
    await page.getByTestId('activation-setup-skip').click();
    await page.getByTestId('morpheus-activation-finish').click();
    await page.getByTestId('morpheus-activation-enter').click();
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    await page.getByTestId('morpheus-command-input').fill('Preserve this draft');
    await page.getByTestId('sidebar-nav-settings').click();
    await page.getByTestId('morpheus-settings-connections').click();
    status = 429;
    await page.getByTestId('provider-test-connection-saved-test').click();
    await expect(page.getByTestId('provider-connection-result-saved-test')).toContainText('rate limiting');
    status = 401;
    await page.getByTestId('provider-test-connection-saved-test').click();
    await expect(page.getByTestId('provider-connection-result-saved-test')).toContainText('rejected this credential');
    expect(await page.locator('body').innerText()).not.toContain(credential);
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.method === 'GET' && request.authorized)).toBe(true);
    await page.getByTestId('morpheus-settings-return').click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Preserve this draft');
  } finally {
    if (app) await closeElectronApp(app);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
