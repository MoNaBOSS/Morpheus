import type { ProviderAccount } from '../../electron/shared/providers/types';
import type { MorpheusPlannerRoutingPolicy } from '../../shared/morpheus/planner-routing';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type RoutingFixture = { defaultAccountId: string; accounts: ProviderAccount[]; writes: MorpheusPlannerRoutingPolicy[]; forbidden: string[] };
type Globals = typeof globalThis & { routingUiFixture: RoutingFixture };

// Browser plugin not available. Rendered Electron flow: conversation -> ordinary
// Connections -> optional same-account task models -> saved Main preferences ->
// reload -> conversation draft. Account metadata is synthetic; settings use real
// Main storage. No model, credential, task, microphone or paid provider is used.
for (const locale of ['en', 'zh', 'ja', 'ru']) {
  test(`connected task model choices preserve accounts and conversation in ${locale}`, async ({ launchElectronApp }, info) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.evaluate(async (language) => {
        for (const [key, value] of [['language', language], ['morpheusPlannerRouting', { mode: 'adaptive', routes: { 'fixture-second': { strongModelId: 'second/retained' } } }]]) {
          const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key, value } });
          if (!response.ok) throw new Error('Fixture settings unavailable');
        }
      }, locale);
      await app.evaluate(({ ipcMain }) => {
        type Request = { id: string; module: string; action: string; payload?: { key?: string; value?: MorpheusPlannerRoutingPolicy } };
        type Handler = (event: Electron.IpcMainInvokeEvent, request: Request) => Promise<unknown>;
        const original = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get('host:invoke')!;
        const account: ProviderAccount = { id: 'fixture-first', vendorId: 'openrouter', label: 'Personal task connection', authMode: 'api_key', model: 'fixture/saved-model',
          fallbackModels: ['fixture/configured-model'], enabled: true, isDefault: true, createdAt: 'fixture', updatedAt: 'fixture' };
        const fixture: RoutingFixture = { defaultAccountId: account.id, accounts: [account, { ...account, id: 'fixture-second', label: 'Other connection', model: 'second/saved', isDefault: false }], writes: [], forbidden: [] };
        (globalThis as Globals).routingUiFixture = fixture;
        ipcMain.removeHandler('host:invoke');
        ipcMain.handle('host:invoke', async (event, request: Request) => {
          const response = (data: unknown) => ({ id: request.id, ok: true, data });
          if (request.module === 'providers') {
            if (request.action === 'accounts') return response(fixture.accounts);
            if (request.action === 'getDefaultAccount') return response({ accountId: fixture.defaultAccountId });
            if (request.action === 'accountKeyInfo') return response([]);
            if (!['vendors', 'list', 'getDefault'].includes(request.action)) {
              fixture.forbidden.push(request.action);
              throw new Error('Task routing fixture may not mutate or test provider accounts');
            }
          }
          if (request.module === 'settings' && request.action === 'set' && request.payload?.key === 'morpheusPlannerRouting') fixture.writes.push(request.payload.value!);
          return original(event, request);
        });
      });
      await page.reload();
      await page.setViewportSize({ width: 1280, height: 900 });
      const draft = 'Preserve this conversation while choosing task models';
      await page.getByTestId('morpheus-command-input').fill(draft);
      await page.getByTestId('sidebar-nav-settings').click();
      await page.getByTestId('morpheus-settings-connections').click();
      const card = page.getByTestId('morpheus-model-routing');
      await expect(page).toHaveTitle('Morpheus');
      expect(page.url()).toContain('index.html');
      await expect(card).toBeVisible();
      await expect(page.locator('vite-error-overlay, nextjs-portal')).toHaveCount(0);
      await expect(page.getByTestId('morpheus-routing-adaptive')).toBeEnabled();
      await expect(page.getByTestId('morpheus-routing-account')).toContainText('fixture/saved-model');
      await expect(page.getByTestId('morpheus-routing-options')).not.toHaveAttribute('open', '');
      await expect(page.getByTestId('morpheus-routing-save')).toBeDisabled();
      await page.getByTestId('morpheus-routing-options').locator('summary').click();
      await page.getByTestId('morpheus-routing-efficientModelId').fill('fixture/custom-efficient');
      await page.getByTestId('morpheus-routing-strongModelId').fill('fixture/custom-strong');
      await page.getByTestId('morpheus-routing-save').click();
      await expect(page.getByTestId('morpheus-routing-save')).toBeDisabled();
      await expect(page.getByTestId('morpheus-routing-feedback')).toBeVisible();
      expect(await app.evaluate(() => (globalThis as Globals).routingUiFixture.writes)).toEqual([{
        mode: 'adaptive', routes: { 'fixture-first': { efficientModelId: 'fixture/custom-efficient', strongModelId: 'fixture/custom-strong' }, 'fixture-second': { strongModelId: 'second/retained' } },
      }]);
      expect(await card.textContent()).not.toContain('morpheus.modelRouting.');
      await page.screenshot({ path: info.outputPath('task-models-connected.png') });
      await page.setViewportSize({ width: 430, height: 800 });
      await card.scrollIntoViewIfNeeded();
      expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath('task-models-430.png') });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.reload();
      await expect(page.getByTestId('morpheus-routing-adaptive')).toBeEnabled();
      await page.getByTestId('morpheus-routing-options').locator('summary').click();
      await expect(page.getByTestId('morpheus-routing-strongModelId')).toHaveValue('fixture/custom-strong');
      if (locale === 'en') {
        await page.getByTestId('morpheus-routing-strongModelId').fill('should/not-save');
        await app.evaluate(() => { (globalThis as Globals).routingUiFixture.defaultAccountId = 'fixture-second'; });
        await page.getByTestId('morpheus-routing-save').click();
        await expect(page.getByTestId('morpheus-routing-account')).toContainText('second/saved');
        await expect(page.getByTestId('morpheus-routing-strongModelId')).toHaveValue('second/retained');
        expect(await app.evaluate(() => (globalThis as Globals).routingUiFixture.writes.length)).toBe(1);
        await page.getByTestId('morpheus-routing-fixed').click();
        await expect(page.getByTestId('morpheus-routing-strongModelId')).toBeDisabled();
        await page.getByTestId('morpheus-routing-save').click();
        await expect.poll(() => app.evaluate(() => (globalThis as Globals).routingUiFixture.writes.length)).toBe(2);
      }
      await page.getByTestId('morpheus-settings-return').click();
      await expect(page.getByTestId('morpheus-command-input')).toHaveValue(draft);
      expect(await app.evaluate(() => (globalThis as Globals).routingUiFixture.forbidden)).toEqual([]);
      expect(errors).toEqual([]);
    } finally { await closeElectronApp(app); }
  });
}
