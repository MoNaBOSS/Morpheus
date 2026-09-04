import { join } from 'node:path';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test.describe('Fluid Morpheus arrival', () => {
  test('welcome can be reopened, traps focus, and a missing tray never hides the app', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page).toHaveTitle('Morpheus');
      await page.getByTestId('morpheus-open-welcome').click();
      const welcome = page.getByTestId('morpheus-welcome');
      await expect(welcome).toBeVisible();
      await expect(welcome).toContainText('Moving to the tray does not enable your microphone');
      await expect(page.getByTestId('morpheus-ambient-voice-indicator')).toHaveCount(0);
      await expect(welcome.getByTestId('morpheus-signal').locator('.morpheus-signal-core')).toBeVisible();
      const enter = page.getByTestId('morpheus-welcome-enter');
      const box = await enter.boundingBox();
      expect(box && box.y + box.height).toBeLessThan(800);
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('Tab');
        expect(await welcome.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      }
      // The real E2E Main has no tray. The production guard must reject, not hide.
      await page.getByTestId('morpheus-tray-transfer').click();
      await expect(page.getByTestId('morpheus-tray-error')).toBeVisible();
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
      const folder = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR?.trim();
      await page.keyboard.press('Escape');
      await expect(welcome).toHaveCount(0);
      await page.getByTestId('morpheus-open-welcome').click();
      await expect(welcome).toBeVisible();
      if (folder) await page.screenshot({ path: join(folder, 'fluid-welcome-1280x800.png'), animations: 'disabled' });
      await enter.click();
      await expect(welcome).toHaveCount(0);
      await page.getByTestId('morpheus-command-input').fill('Show system information');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
      if (folder) await page.screenshot({ path: join(folder, 'fluid-command-result-1280x800.png'), animations: 'disabled' });
      expect(errors).toEqual([]);
    } finally { await closeElectronApp(app); }
  });

  test('reduced motion and voice settings recovery work at large and narrow sizes', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.getByTestId('morpheus-open-welcome').click();
      const welcome = page.getByTestId('morpheus-welcome');
      await expect(welcome).toHaveCSS('animation-name', 'none');
      const folder = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR?.trim();
      if (folder) await page.screenshot({ path: join(folder, 'fluid-welcome-1920x1080.png') });
      await page.setViewportSize({ width: 800, height: 800 });
      expect(await welcome.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.getByTestId('morpheus-welcome-voice-settings').click();
      await expect(page.getByTestId('morpheus-voice-settings')).toBeVisible();
      await expect(page.getByTestId('settings-voice-destination')).toBeFocused();
      const settingsBox = await page.getByTestId('settings-voice-destination').boundingBox();
      expect(settingsBox?.y).toBeLessThan(200);
      await expect(page.getByTestId('morpheus-voice-ambient')).toHaveAttribute('data-state', 'unchecked');
    } finally { await closeElectronApp(app); }
  });
});
