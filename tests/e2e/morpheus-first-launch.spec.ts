import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MorpheusObjectiveSnapshot } from '../../shared/morpheus/core/objective-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

for (const language of ['en', 'zh', 'ja', 'ru']) {
  test(`fresh ${language} profile reaches the approved welcome and a real task without legacy setup`, async ({ launchElectronApp, userDataDir }, testInfo) => {
    await writeFile(join(userDataDir, 'settings.json'), JSON.stringify({ language, telemetryEnabled: false }));
    // Deliberately no skipSetup, renderer mocks, provider, microphone or fake
    // task result. This exercises the ordinary first-run routing prerequisite.
    let app = await launchElectronApp({ additionalArgs: ['--morpheus-onboarding=on'] });
    try {
      const page = await getStableWindow(app);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 1280, height: 800 });
      const arrival = page.getByTestId('morpheus-activation');
      await expect(arrival).toHaveAttribute('data-stage', 'name');
      await expect(page.getByTestId('setup-page')).toHaveCount(0);
      expect(page.url()).not.toContain('/setup');
      await expect(page.getByTestId('activation-intro-name')).toBeFocused();
      await expect(page.getByTestId('activation-voice-start')).toBeDisabled();
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
        expect(await arrival.evaluate((node) => node.contains(document.activeElement))).toBe(true);
      }
      await page.getByTestId('activation-intro-name').fill('Larry');
      await page.screenshot({ path: testInfo.outputPath(`first-launch-${language}.png`) });
      await page.getByTestId('activation-intro-name').press('Enter');
      await expect(arrival).toHaveAttribute('data-stage', 'welcome');
      const input = page.getByTestId('activation-first-request');
      await expect(input).toBeFocused();
      await input.fill('Show system information');
      await input.press('Enter');
      await expect(arrival).toHaveCount(0);
      await expect.poll(async () => {
        const response = await page.evaluate(() => window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'objectiveSnapshot' }));
        if (!response.ok) return undefined;
        const snapshot = response.data as MorpheusObjectiveSnapshot;
        // Terminal tasks intentionally stop being "active". Inspect the real
        // persisted result, not the transient running-task pointer.
        return Object.values(snapshot.runsById).find((run) => run.objective === 'Show system information')?.state;
      }).toBe('complete');
      const profile = JSON.parse(await readFile(join(userDataDir, 'morpheus', 'onboarding.json'), 'utf8'));
      expect(profile).toMatchObject({ completed: true, preferences: { preferredName: 'Larry' } });
      // Clearing only our fixture's old renderer flag must not repeat setup.
      await page.evaluate(() => localStorage.removeItem('clawx-settings'));
      expect(errors).toEqual([]);
      await closeElectronApp(app);
      app = await launchElectronApp({ additionalArgs: ['--morpheus-boot=on', '--morpheus-onboarding=on'] });
      const returning = await getStableWindow(app);
      await expect(returning.getByTestId('command-center-page')).toBeVisible();
      await expect(returning.getByTestId('morpheus-activation')).toHaveCount(0);
      await expect(returning.getByTestId('setup-page')).toHaveCount(0);
      await expect(returning.getByTestId('morpheus-boot')).toHaveCount(0);
      const restored = await returning.evaluate(() => window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'onboardingStatus' }));
      expect(restored).toMatchObject({ ok: true, data: { completed: true, preferences: { preferredName: 'Larry' } } });
    } finally { await closeElectronApp(app); }
  });
}
