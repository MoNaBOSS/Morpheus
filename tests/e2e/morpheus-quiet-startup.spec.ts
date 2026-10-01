import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES } from '../../shared/morpheus/onboarding-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

const startupArgs = ['--morpheus-test-initial-presence', '--morpheus-onboarding=on'];
for (const language of ['en', 'zh', 'ja', 'ru']) {
  test(`returning ${language} launch stays quiet until the native composer is requested`, async ({ launchElectronApp, userDataDir }, testInfo) => {
    await mkdir(join(userDataDir, 'morpheus'), { recursive: true });
    await writeFile(join(userDataDir, 'settings.json'), JSON.stringify({ language, startMinimized: language === 'ru', telemetryEnabled: false }));
    await writeFile(join(userDataDir, 'morpheus', 'onboarding.json'), JSON.stringify({
      v: 2, completed: true, completedAt: '2026-10-01T00:00:00Z',
      preferences: { ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, preferredName: 'Larry', speakResponses: false },
    }));
    // Reduced OS side effects, but the actual Main initial-presentation branch.
    // RU additionally exercises start-minimized with no tray: accessible orb.
    const app = await launchElectronApp({ additionalArgs: startupArgs });
    try {
      await expect.poll(() => app.windows().length).toBeGreaterThanOrEqual(2);
      const windows = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })));
      const main = windows.find((window) => window.title === 'Morpheus')!.page;
      const native = windows.find((window) => window.title === 'Morpheus presence')!.page;
      const visibility = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => ({ title: window.getTitle(), visible: window.isVisible(), focused: window.isFocused() })));
      await expect.poll(async () => (await visibility()).find((window) => window.title === 'Morpheus')?.visible).toBe(false);
      await expect.poll(async () => (await visibility()).find((window) => window.title === 'Morpheus presence')?.visible).toBe(true);
      expect((await visibility()).find((window) => window.title === 'Morpheus presence')?.focused).toBe(false);
      await expect(main.getByTestId('morpheus-activation')).toHaveCount(0);
      await native.emulateMedia({ reducedMotion: 'reduce' });
      await expect(native.locator('html')).toHaveAttribute('lang', language);
      await native.locator('.orb').click();
      await expect(native.locator('#orb-input')).toBeFocused();
      await native.locator('#orb-input').fill('A preserved quiet-start draft');
      await native.screenshot({ path: testInfo.outputPath(`quiet-start-${language}.png`) });
      await native.locator('.hover-composer-expand').click();
      await expect(main.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', 'compact-window');
      await expect(main.getByTestId('quick-command-input')).toHaveValue('A preserved quiet-start draft');
      const voice = await main.evaluate(() => window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' }));
      expect(voice).toMatchObject({ ok: true, data: { settings: { ambientEnabled: false } } });
    } finally { await closeElectronApp(app); }
  });
}

test('a genuinely new profile still receives the welcome under the native startup policy', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ additionalArgs: startupArgs });
  try {
    const page = await getStableWindow(app);
    await expect(page.getByTestId('morpheus-activation')).toHaveAttribute('data-stage', 'name');
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.isVisible())).toBe(true);
  } finally { await closeElectronApp(app); }
});
