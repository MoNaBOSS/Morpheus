import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';
import { join } from 'node:path';

test.describe('Morpheus production companion intelligence', () => {
  test('requires each user to choose an explicit OpenRouter model without claiming model readiness', async ({ launchElectronApp }, info) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => { window.location.hash = '#/settings?section=connections'; });
      await expect(page.getByTestId('providers-settings')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('providers-byok-description')).toContainText('Connect your own provider account');
      await expect(page.getByTestId('providers-byok-description')).toContainText('local English voice needs no separate API key');
      await page.getByTestId('providers-add-button').click();
      await page.getByTestId('add-provider-type-openrouter').click();

      const model = page.getByTestId('add-provider-model-id-input');
      const submit = page.getByTestId('add-provider-submit-button');
      const assertEntirelyVisible = async (target: typeof model, regionTestId: string) => {
        await expect.poll(() => target.evaluate((element, regionTestId) => {
          const rect = element.getBoundingClientRect();
          const region = element.closest(`[data-testid="${regionTestId}"]`)!.getBoundingClientRect();
          const dialog = element.closest('[data-testid="add-provider-dialog"]')!.getBoundingClientRect();
          const within = (outer: { left: number; right: number; top: number; bottom: number }) =>
            rect.width > 0 && rect.height > 0 && rect.left >= outer.left && rect.right <= outer.right
            && rect.top >= outer.top && rect.bottom <= outer.bottom;
          return {
            inRegion: within(region),
            inDialog: within(dialog),
            inViewport: within({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }),
          };
        }, regionTestId)).toEqual({ inRegion: true, inDialog: true, inViewport: true });
      };
      await expect(model).toHaveValue('');
      await expect(submit).toBeDisabled();
      await expect(page.getByTestId('add-provider-close-button')).toHaveAccessibleName('Close');
      const guidance = page.getByTestId('openrouter-model-guidance');
      await expect(guidance).toContainText('exact model ID');
      await expect(guidance).toContainText('service access only');
      await expect(guidance.getByRole('link')).toHaveAttribute('href', 'https://openrouter.ai/models');
      const folder = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR?.trim();
      for (const size of [{ width: 1280, height: 800 }, { width: 800, height: 720 }]) {
        await page.setViewportSize(size);
        await model.scrollIntoViewIfNeeded();
        await assertEntirelyVisible(model, 'add-provider-form-body');
        await model.fill('fixture/selected-model');
        await expect(submit).toBeEnabled();
        await model.fill('   ');
        await expect(submit).toBeDisabled();
        await assertEntirelyVisible(submit, 'add-provider-action-footer');
        if (size.width === 800) {
          expect(await page.getByTestId('add-provider-form-body').evaluate((body) => body.scrollHeight > body.clientHeight)).toBe(true);
        }
        await page.screenshot({ path: info.outputPath(size.width === 1280 ? 'openrouter-explicit-model.png' : 'openrouter-explicit-model-800x720.png') });
        if (folder && size.width === 1280) await page.screenshot({ path: join(folder, 'provider-model-guidance.png') });
      }
    } finally { await closeElectronApp(app); }
  });

  test('explains a rejected neural speech credential rather than claiming readiness', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      const status = await page.evaluate(async () => {
        const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
        if (!response.ok) throw new Error('Voice status unavailable');
        return response.data as { presence: Record<string, unknown> };
      });
      // Presentation-only fixture for a failure already covered by real service
      // unit tests; this is not represented as a successful live provider test.
      await installIpcMocks(app, { hostApi: { [JSON.stringify(['morpheus', 'voiceStatus', null])]: {
        ...status, neuralSpeechAvailable: true, speechProviderLabel: 'Review provider',
        presence: { ...status.presence, speechFailure: 'authentication' },
      } } });
      await page.getByTestId('sidebar-nav-settings').click();
      const failure = page.getByTestId('morpheus-speech-failure');
      await failure.scrollIntoViewIfNeeded();
      await expect(failure).toContainText('authentication failed (401)');
      await expect(failure).toContainText('Models');
      await expect(failure).not.toContainText('sk-');
      const folder = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR?.trim();
      if (folder) await page.screenshot({ path: join(folder, 'voice-authentication-recovery.png') });
    } finally { await closeElectronApp(app); }
  });

  test('makes the optimized voice setup discoverable before credentials are configured', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-settings').click();
      const presets = page.getByTestId('morpheus-openrouter-voice-presets');
      await presets.scrollIntoViewIfNeeded();
      await expect(presets).toContainText('One-key optimized voice');
      await expect(presets).toContainText('One key can then power planning, transcription and speech');
      await expect(page.getByTestId('morpheus-voice-preset-efficient')).toBeDisabled();
      await expect(page.getByTestId('morpheus-voice-preset-expressive')).toBeDisabled();

      const folder = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR?.trim();
      if (folder) await page.screenshot({ path: join(folder, 'voice-optimized-setup.png') });
    } finally { await closeElectronApp(app); }
  });

  test('projects a durable Goal into Today and routes its next action through Objective Core', async ({ launchElectronApp }) => {
    let app = await launchElectronApp({ skipSetup: true });
    try {
      let page = await getStableWindow(app);
      await page.getByTestId('signal-nav-advanced').click();
      await page.getByTestId('sidebar-nav-goals').click();
      await expect(page.getByTestId('goals-page')).toBeVisible();

      await page.getByTestId('goal-create').click();
      await page.getByTestId('goal-name').fill('Ship the production companion');
      await page.getByTestId('goal-objective').fill('Keep Morpheus release work moving across real Missions.');
      await page.getByTestId('goal-success').fill('A verified packaged build is ready for personal testing.');
      await page.getByTestId('goal-next-action').fill('Show system information');
      await page.getByTestId('goal-target-date').fill('2020-01-01');
      await page.getByTestId('goal-save').click();
      await expect(page.locator('[data-testid^="goal-list-"]').first()).toContainText('Ship the production companion');

      // A full app restart proves Main-owned durability and regenerates factual attention
      // from the overdue Goal rather than relying on Renderer memory.
      await closeElectronApp(app);
      app = await launchElectronApp({ skipSetup: true });
      page = await getStableWindow(app);
      await expect(page.getByTestId('sidebar-nav-command-center')).toBeVisible();
      await page.getByTestId('sidebar-nav-command-center').click();
      await expect(page.getByTestId('command-center-goal-focus')).toContainText('Ship the production companion');
      await expect(page.getByTestId('command-center-goal-progress')).toHaveAttribute('style', /0%/);
      await expect(page.getByTestId('command-center-page')).toContainText('Show system information');

      await page.locator('[data-testid^="today-act-"]').first().click();
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i, { timeout: 20_000 });
      await expect(page.getByTestId('command-center-mission').first()).toContainText('Show system information');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('keeps ambient capture off when no compatible transcription provider exists', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-settings').click();
      const settings = page.getByTestId('morpheus-voice-settings');
      await settings.scrollIntoViewIfNeeded();
      await expect(settings).toBeVisible();
      await expect(page.getByTestId('morpheus-voice-ambient')).toHaveAttribute('data-state', 'unchecked');
      await expect(page.getByTestId('morpheus-speech-model')).toHaveValue('gpt-4o-mini-tts');
      await expect(page.getByTestId('morpheus-speech-voice')).toHaveValue('cedar');
      await expect(settings).toContainText(/Windows speech|Windows voice/i);

      await page.getByTestId('morpheus-voice-ambient').click();
      await expect(page.getByTestId('morpheus-voice-settings-error')).toContainText(/No compatible transcription provider/i);
      await expect(page.getByTestId('morpheus-voice-ambient')).toHaveAttribute('data-state', 'unchecked');
      await expect(page.getByTestId('morpheus-ambient-voice-indicator')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('turns missing voice configuration into a direct recovery path', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('morpheus-voice-button-command-center').click();
      await expect(page.getByTestId('morpheus-voice-indicator')).toHaveAttribute('data-phase', 'error');
      await expect(page.getByTestId('morpheus-voice-error')).toContainText(/transcription provider/i);
      await page.getByTestId('morpheus-voice-connect-provider').click();
      await expect(page.getByTestId('providers-settings')).toBeVisible();
      await expect(page.getByTestId('add-provider-dialog')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
