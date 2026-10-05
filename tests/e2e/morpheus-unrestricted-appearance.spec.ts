import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';
import en from '../../shared/i18n/locales/en/dashboard.json';
import zh from '../../shared/i18n/locales/zh/dashboard.json';
import ja from '../../shared/i18n/locales/ja/dashboard.json';
import ru from '../../shared/i18n/locales/ru/dashboard.json';

async function nativePage(app: ElectronApplication): Promise<Page> {
  await expect.poll(async () => Promise.all(app.windows().map((page) => page.title()))).toContain('Morpheus presence');
  for (const page of app.windows()) if (await page.title() === 'Morpheus presence') return page;
  throw new Error('Original native presence required');
}

async function audioOwnedMotion(artwork: Locator) {
  await expect(artwork).toHaveCSS('animation-name', 'none');
  const effects = await artwork.evaluate((node) => node.getAnimations().map((effect) => ({
    kind: effect.constructor.name, timing: effect.effect?.getTiming(),
  })));
  // getAnimations includes the finite transform transition that follows each
  // real meter update. A decorative keyframe loop during audio is forbidden.
  for (const effect of effects) {
    expect(effect.kind).toBe('CSSTransition');
    expect(effect.timing?.iterations).toBe(1);
    expect(Number.isFinite(effect.timing?.duration)).toBe(true);
    expect(effect.timing?.duration).toBeLessThanOrEqual(180);
  }
  return effects;
}

async function appearanceBoundary(page: Page) {
  return page.evaluate(async () => {
    const invoke = async (module: string, action: string) => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module, action });
      if (!result.ok) throw new Error(`${module}.${action} unavailable`);
      return result.data;
    };
    const [account, profile, permission, voice] = await Promise.all([
      invoke('managedAccount', 'status'), invoke('morpheus', 'onboardingStatus'),
      invoke('morpheus', 'permissionCenter'), invoke('morpheus', 'voiceStatus'),
    ]);
    return { account, preferences: (profile as { preferences: unknown }).preferences,
      permission, voiceSettings: (voice as { settings: unknown }).settings };
  });
}

test('saved red appearance preview reaches native, compact and full without changing access, and restores across relaunch', async ({ launchElectronApp }, info) => {
  test.skip(process.platform !== 'win32', 'Windows native presence');
  test.setTimeout(100_000);
  let app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
  try {
    let page = await getStableWindow(app);
    let native = await nativePage(app);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.show());
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate(() => { window.location.hash = '#/settings?section=personality'; });
    const settings = page.getByTestId('morpheus-unrestricted-preview');
    await expect(settings).toBeVisible();
    await expect(settings).toContainText(en.morpheus.experience.unrestrictedPreview.red);
    await expect(page.getByTestId('morpheus-appearance-green')).toBeChecked();
    const before = await appearanceBoundary(page);
    await page.getByTestId('morpheus-appearance-unrestricted-preview').check();
    await expect(page.getByTestId('morpheus-appearance-unrestricted-preview')).toBeEnabled();
    await expect(page.locator('html')).toHaveAttribute('data-morpheus-appearance', 'unrestricted-preview');
    const nativeOrb = native.locator('.orb');
    await expect(nativeOrb.locator('.morpheus-motion__horn')).toHaveCount(2);
    await expect(nativeOrb).toHaveAttribute('data-appearance', 'unrestricted-preview');
    expect(await appearanceBoundary(page)).toEqual(before);
    await expect(settings.getByTestId('morpheus-appearance-boundary')).toHaveText(en.morpheus.experience.unrestrictedPreview.boundary);
    const redFilter = await nativeOrb.locator('.morpheus-motion__artwork').evaluate((node) => getComputedStyle(node).filter);
    expect(redFilter).toContain('hue-rotate');
    expect(await settings.getByTestId('morpheus-fluid-orb').locator('.morpheus-motion__artwork').evaluate((node) => getComputedStyle(node).filter)).toBe(redFilter);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.hide());
    await expect(nativeOrb).toBeVisible();
    for (const horn of await nativeOrb.locator('.morpheus-motion__horn').all()) await expect(horn).toBeVisible();

    // These are labelled presentation fixtures, not microphone/task activity.
    for (const [presence, motion, cue] of [['armed', 'idle', ''], ['listening', 'listening', ''], ['working', 'working', ''], ['waiting-for-approval', 'attention', '?'], ['error', 'attention', '!']] as const) {
      await native.evaluate((value) => { document.documentElement.dataset.state = value; }, presence);
      await expect(nativeOrb).toHaveAttribute('data-motion-state', motion);
      await expect(nativeOrb.locator('.morpheus-motion__cue')).toHaveText(cue);
      if (cue) {
        const timing = await nativeOrb.locator('.morpheus-motion__artwork').evaluate((node) => {
          const style = getComputedStyle(node);
          return { count: style.animationIterationCount, duration: style.animationDuration };
        });
        expect(timing).toEqual({ count: '1', duration: '0.5s' });
        const separated = await nativeOrb.evaluate((node) => {
          const cue = node.querySelector('.morpheus-motion__cue')!.getBoundingClientRect();
          const badge = node.querySelector('.morpheus-motion__preview')!.getBoundingClientRect();
          return badge.right <= cue.left;
        });
        expect(separated).toBe(true);
      }
      if (presence === 'listening') {
        expect(await nativeOrb.evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue('--morpheus-audio-level')))).toBe(0);
        await audioOwnedMotion(nativeOrb.locator('.morpheus-motion__artwork'));
      }
    }
    await native.evaluate(() => { document.documentElement.dataset.state = 'armed'; });
    await expect(nativeOrb.locator('.morpheus-motion__artwork')).toHaveCSS('animation-name', 'morpheus-motion-red-presence');
    await native.screenshot({ path: info.outputPath('unrestricted-native-idle-preview.png') });
    await native.emulateMedia({ reducedMotion: 'reduce' });
    expect(await nativeOrb.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(nativeOrb.locator('.morpheus-motion__artwork')).toHaveCSS('transform', 'none');
    await native.emulateMedia({ reducedMotion: 'no-preference' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.show());

    for (const [language, dictionary] of [['en', en], ['zh', zh], ['ja', ja], ['ru', ru]] as const) {
      await page.evaluate(async (value) => {
        const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value } });
        if (!result.ok) throw new Error('Language save unavailable');
      }, language);
      await page.reload();
      await expect(settings).toBeVisible();
      await expect(settings.getByTestId('morpheus-appearance-boundary')).toHaveText(dictionary.morpheus.experience.unrestrictedPreview.boundary);
      await expect(page.getByTestId('morpheus-appearance-unrestricted-preview')).toBeChecked();
    }
    await page.evaluate(async () => {
      await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: 'en' } });
    });
    await page.reload();
    for (const width of [1280, 800]) {
      await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.setBounds({ width, height: width === 800 ? 720 : 800 }), width);
      await settings.scrollIntoViewIfNeeded();
      const contained = await settings.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
      });
      expect(contained).toBe(true);
      await page.screenshot({ path: info.outputPath(`unrestricted-personality-${width}.png`) });
    }

    // Native click opens the original composer; compact and full keep the choice.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.hide());
    await nativeOrb.click();
    await native.locator('.hover-composer-expand').click();
    const compact = page.getByTestId('morpheus-quick-command');
    await expect(compact).toBeVisible();
    await expect(compact.getByTestId('morpheus-fluid-orb')).toHaveAttribute('data-appearance', 'unrestricted-preview');
    await expect(nativeOrb).toHaveAttribute('data-motion-paused', 'true');
    expect(await nativeOrb.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
    await compact.getByTestId('quick-command-expand').click();
    await expect(page.getByTestId('command-center-page').getByTestId('morpheus-fluid-orb')).toHaveAttribute('data-appearance', 'unrestricted-preview');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.getByTestId('command-center-page').getByTestId('morpheus-fluid-orb').evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(errors).toEqual([]);
    await closeElectronApp(app);
    app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
    page = await getStableWindow(app); native = await nativePage(app);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.show());
    await expect(native.locator('.orb')).toHaveAttribute('data-appearance', 'unrestricted-preview');
    await page.evaluate(() => { window.location.hash = '#/settings?section=personality'; });
    await expect(page.getByTestId('morpheus-appearance-unrestricted-preview')).toBeChecked();
    await page.getByTestId('morpheus-appearance-green').check();
    await expect(page.locator('html')).toHaveAttribute('data-morpheus-appearance', 'green');
    await expect(native.locator('.orb')).toHaveAttribute('data-appearance', 'green');
    await expect(native.locator('.morpheus-motion__preview')).toBeHidden();
    await expect(native.locator('.morpheus-motion__artwork')).toHaveCSS('filter', 'none');
    await info.attach('appearance-boundary.json', { contentType: 'application/json', body: JSON.stringify({ before, unchangedAfterAppearance: true, states: 'presentation fixtures', physicalAudio: 'not tested' }) });
  } finally { await closeElectronApp(app); }
});

test('red speaking responds to original included PCM playback and stops without acquiring a microphone', async ({ launchElectronApp }, info) => {
  test.skip(process.platform !== 'win32' || !existsSync(resolve('build/local-voice/bin/sherpa-onnx-offline-tts.exe')), 'Actual included Windows voice assets required');
  test.setTimeout(80_000);
  const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
  try {
    const page = await getStableWindow(app); const native = await nativePage(app);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.show());
    await page.addInitScript(() => {
      (window as unknown as { appearanceCaptureRequests: number }).appearanceCaptureRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        (window as unknown as { appearanceCaptureRequests: number }).appearanceCaptureRequests++;
        throw new Error('Appearance playback must not acquire input');
      };
    });
    await page.evaluate(async () => {
      for (const [module, action, payload] of [
        ['settings', 'set', { key: 'morpheusAppearance', value: 'unrestricted-preview' }],
        ['morpheus', 'updateVoiceSettings', { engine: 'local', enabled: false, ambientEnabled: false, localWakeEnabled: false, speakResponses: true }],
      ] as const) {
        const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module, action, payload });
        if (!result.ok) throw new Error('Original settings owner required');
      }
      window.location.hash = '#/settings?section=voice';
    });
    await page.reload();
    await page.getByTestId('morpheus-voice-preview').click();
    const feedback = page.getByTestId('morpheus-voice-check-feedback').getByTestId('morpheus-fluid-orb');
    await expect(feedback).toHaveAttribute('data-signal-state', 'speaking', { timeout: 35_000 });
    await expect(feedback).toHaveAttribute('data-appearance', 'unrestricted-preview');
    await expect.poll(() => feedback.evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue('--morpheus-audio-level')))).toBeGreaterThan(0);
    const effects = await audioOwnedMotion(feedback.locator('.morpheus-motion__artwork'));
    await info.attach('real-pcm-artwork-motion.json', { contentType: 'application/json', body: JSON.stringify(effects) });
    await page.screenshot({ path: info.outputPath('unrestricted-actual-pcm-speaking.png') });
    await page.getByTestId('morpheus-voice-preview').click();
    await expect(page.getByTestId('morpheus-voice-check-feedback')).toBeHidden();
    await expect.poll(() => native.locator('.orb').evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue('--morpheus-audio-level')))).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { appearanceCaptureRequests: number }).appearanceCaptureRequests)).toBe(0);
  } finally { await closeElectronApp(app); }
});
