import { join } from 'node:path';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';
import type { MorpheusVoicePresence } from '../../shared/morpheus/voice-types';

test('invocation motion preserves focus, repeat opening, execution and reduced motion', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    const dialog = page.getByTestId('morpheus-quick-command');
    for (let index = 0; index < 3; index++) {
      await page.getByTestId('signal-nav-presence').click();
      await expect(dialog).toHaveCSS('opacity', '1');
      await expect(page.getByTestId('quick-command-input')).toBeFocused();
      expect(await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      if (index === 0 && process.env.MORPHEUS_VISUAL_EVIDENCE_DIR) {
        await page.screenshot({ path: join(process.env.MORPHEUS_VISUAL_EVIDENCE_DIR, 'polished-presence-1280x800.png') });
      }
      await page.keyboard.press('Escape');
      if (process.platform === 'win32') {
        // Compact dismissal hides the native window. Hidden Chromium may pause
        // AnimatePresence before its DOM exit completes, so removal alone is
        // not proof of the real user-visible dismissal. Restore explicitly to
        // simulate a tray entry; this does not qualify the physical tray click.
        await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
          .find((window) => window.getTitle() === 'Morpheus')?.isVisible())).toBe(false);
        await app.evaluate(({ BrowserWindow }) => {
          const main = BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus');
          if (!main) throw new Error('Main window missing');
          main.show();
          main.focus();
        });
      }
      await expect(dialog).toHaveCount(0);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('signal-nav-presence').click();
    await expect(page.getByTestId('quick-command-input')).toBeFocused();
    await expect(dialog.locator('section').first()).toHaveCSS('transform', 'none');
    await page.getByTestId('quick-command-input').fill('Show system information');
    await page.getByTestId('quick-command-submit').click();
    await expect(page.getByTestId('quick-command-objective-state')).toContainText(/complete/i, { timeout: 20000 });
    await page.getByTestId('quick-command-expand').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});

test('greeting motion settles without clipping at review resolutions', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    for (const size of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 800, height: 800 }]) {
      await page.setViewportSize(size);
      await page.getByTestId('morpheus-open-welcome').click();
      const welcome = page.getByTestId('morpheus-welcome');
      await expect(welcome.locator('.morpheus-welcome-copy > div').last()).toHaveCSS('opacity', '1');
      expect(await welcome.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      if (size.width >= 1280) {
        expect(await welcome.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
        await expect(page.getByTestId('morpheus-welcome-speech')).toBeInViewport();
      }
      const folder = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR;
      if (folder) await page.screenshot({ path: join(folder, `polished-welcome-${size.width}x${size.height}.png`) });
      await page.keyboard.press('Escape');
      await expect(welcome).toHaveCount(0);
    }
  } finally { await closeElectronApp(app); }
});

test('greeting retains fallback disclosure and never conceals an active microphone', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    await page.getByTestId('morpheus-open-welcome').click();
    await expect(page.getByTestId('morpheus-welcome')).toHaveCSS('opacity', '1');
    // Presentation fixtures only. These are not audio recordings, recognizer
    // results, or claimed successful provider calls.
    const emit = async (presence: MorpheusVoicePresence) => app.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0].webContents.send('morpheus:voice-presence', payload);
    }, presence);
    await emit({ v: 1, state: 'speaking', ambientEnabled: false, speechFailure: 'authentication' });
    await expect(page.getByTestId('morpheus-welcome-speech-fallback')).toContainText('authentication failed');
    await expect(page.getByTestId('morpheus-voice-indicator')).toHaveCount(0);
    await emit({ v: 1, state: 'listening', ambientEnabled: true });
    await expect(page.getByTestId('morpheus-voice-indicator')).toHaveAttribute('data-phase', 'listening');
    await expect(page.getByTestId('morpheus-voice-stop')).toBeVisible();
    await emit({ v: 1, state: 'asleep', ambientEnabled: false });
    await page.keyboard.press('Escape');
  } finally { await closeElectronApp(app); }
});
