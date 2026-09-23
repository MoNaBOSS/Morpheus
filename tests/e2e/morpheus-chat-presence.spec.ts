import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

test.describe('Morpheus Chat presence', () => {
  test('keeps the live Signal, conversation and composer usable at 1280x800', async ({
    launchElectronApp,
  }, testInfo) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', gatewayReady: true, port: 18789, pid: 12345 },
      });
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.reload();
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await page.getByTestId('sidebar-nav-chat').click();

      const presence = page.getByTestId('morpheus-chat-presence');
      const signal = presence.getByTestId('morpheus-signal');
      await expect(presence).toBeVisible();
      await expect(signal).toBeVisible();
      await expect(page.getByTestId('chat-composer-input')).toBeVisible();
      await expect(page.getByTestId('chat-toolbar-actions')).toBeVisible();

      const layout = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout).toEqual({ width: 1280, height: 800, scrollWidth: 1280 });

      const presenceBox = await presence.boundingBox();
      const signalBox = await signal.boundingBox();
      expect(presenceBox?.height ?? 0).toBeGreaterThanOrEqual(76);
      expect(signalBox?.width ?? 0).toBeGreaterThanOrEqual(70);

      await page.screenshot({
        path: testInfo.outputPath('morpheus-chat-ready-1280x800.png'),
        animations: 'allow',
      });

      const input = page.getByTestId('chat-composer-input');
      await expect(input).toBeEnabled({ timeout: 30_000 });
      await input.fill('Show system information');
      await page.getByTestId('chat-composer-send').click();
      await expect(presence).toHaveAttribute('data-signal-state', 'complete', { timeout: 20_000 });
      await page.screenshot({
        path: testInfo.outputPath('morpheus-chat-complete-1280x800.png'),
        animations: 'allow',
      });
    } finally {
      await closeElectronApp(app);
    }
  });
});
