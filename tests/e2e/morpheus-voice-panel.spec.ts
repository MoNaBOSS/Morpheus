import type { MorpheusVoiceSettingsPatch, MorpheusVoiceStatus } from '../../shared/morpheus/voice-types';
import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

// Flow: ordinary Settings -> companion consent/master mute -> input repair ->
// conversation. Browser plugin unavailable; use the existing Electron workflow.
// Capture is a deliberate missing-device fixture. No physical input, wake,
// synthesis, provider request or audible-output qualification is implied.
test('Voice panel groups real checks with their controls and keeps mute and repair truthful', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      const globals = window as unknown as { voicePanelCaptureRequests: number };
      globals.voicePanelCaptureRequests = 0;
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
        globals.voicePanelCaptureRequests += 1;
        throw new DOMException('Test microphone is disconnected', 'NotFoundError');
      } });
    });
    const baseline = await page.evaluate(async () => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
      if (!response.ok) throw new Error('Voice status unavailable');
      return response.data as MorpheusVoiceStatus;
    });
    await installIpcMocks(app, { recordHostInvocations: true });
    await app.evaluate(({ ipcMain }, originalStatus) => {
      type Request = { id: string; module: string; action: string; payload?: MorpheusVoiceSettingsPatch };
      type Handler = (event: Electron.IpcMainInvokeEvent, request: Request) => Promise<unknown>;
      const original = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get('host:invoke')!;
      let status = {
        ...originalStatus,
        settings: { ...originalStatus.settings, engine: 'local' as const, enabled: false, ambientEnabled: false, localWakeEnabled: true, speakResponses: false },
        speechFormat: 'wav' as const,
        availableSpeechVoices: ['cedar', 'coral'] as const,
        transcriptionAvailable: false,
        neuralSpeechAvailable: true,
        presence: { ...originalStatus.presence, state: 'asleep' as const, ambientEnabled: false },
      };
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', async (event, request: Request) => {
        if (request.module === 'morpheus' && request.action === 'updateVoiceSettings') {
          const settings = { ...status.settings, ...request.payload };
          status = { ...status, settings, transcriptionAvailable: settings.enabled };
          return { id: request.id, ok: true, data: status };
        }
        if (request.module === 'morpheus' && request.action === 'voiceStatus') return { id: request.id, ok: true, data: status };
        if (request.module === 'morpheus' && ['beginAmbientVoice', 'transcribeAudio', 'synthesizeSpeech', 'prepareVoiceOutput'].includes(request.action)) {
          throw new Error('This presentation test must not start ambient, recognition or output work');
        }
        return original(event, request);
      });
    }, baseline);
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTestId('morpheus-command-input').fill('Keep this while I check my voice');
    await page.getByTestId('sidebar-nav-settings').click();
    await page.getByTestId('morpheus-settings-voice').click();
    await expect(page).toHaveTitle('Morpheus');
    await expect(page.getByTestId('morpheus-voice-setup')).toBeVisible();
    await expect(page.locator('vite-error-overlay, nextjs-portal')).toHaveCount(0);
    for (const id of ['morpheus-wake-enabled', 'morpheus-microphone-enabled', 'morpheus-microphone-device', 'morpheus-microphone-check', 'morpheus-local-voice-choice', 'morpheus-voice-preview', 'morpheus-spoken-replies']) {
      await expect(page.getByTestId(id)).toBeInViewport();
    }
    await expect(page.getByTestId('morpheus-voice-more-options')).not.toHaveAttribute('open', '');
    await expect(page.getByTestId('morpheus-microphone-check')).toBeDisabled();
    await expect(page.getByTestId('morpheus-voice-input-card')).toContainText('Turn on the microphone above');
    await expect(page.getByTestId('morpheus-microphone-test-status')).toContainText('not been tested');
    await expect(page.getByTestId('morpheus-voice-preview-result')).toContainText('not been tested');
    await expect(page.getByTestId('morpheus-voice-input-card').getByTestId('morpheus-microphone-check')).toBeVisible();
    await expect(page.getByTestId('morpheus-voice-output-card').getByTestId('morpheus-voice-preview')).toBeVisible();
    await page.screenshot({ path: info.outputPath('voice-panel-muted-1280x800.png') });

    await page.getByTestId('morpheus-microphone-enabled').click();
    await expect(page.getByTestId('morpheus-microphone-check')).toBeEnabled();
    await page.getByTestId('morpheus-wake-enabled').click();
    await expect(page.getByTestId('morpheus-wake-enabled')).toHaveAttribute('data-state', 'checked');
    await page.getByTestId('morpheus-microphone-enabled').click();
    await expect(page.getByTestId('morpheus-wake-enabled')).toHaveAttribute('data-state', 'checked');
    await expect(page.getByTestId('morpheus-wake-enabled')).toBeEnabled();
    await expect(page.getByTestId('morpheus-companion-voice-consent')).toHaveText('Paused · muted');
    await expect(page.getByTestId('morpheus-microphone-check')).toBeDisabled();
    expect(await page.evaluate(() => (window as unknown as { voicePanelCaptureRequests: number }).voicePanelCaptureRequests)).toBe(0);
    // Consent can be changed while muted without granting microphone access.
    await page.getByTestId('morpheus-wake-enabled').click();
    await expect(page.getByTestId('morpheus-companion-voice-consent')).toHaveText('Off');
    await page.getByTestId('morpheus-wake-enabled').click();
    await expect(page.getByTestId('morpheus-companion-voice-consent')).toHaveText('Paused · muted');
    expect(await page.evaluate(() => (window as unknown as { voicePanelCaptureRequests: number }).voicePanelCaptureRequests)).toBe(0);
    await page.getByTestId('morpheus-microphone-enabled').click();
    await expect(page.getByTestId('morpheus-wake-enabled')).toHaveAttribute('data-state', 'checked');
    await page.getByTestId('morpheus-microphone-check').click();
    await expect(page.getByTestId('morpheus-voice-setup-error')).toContainText('Reconnect');
    await expect(page.getByTestId('morpheus-microphone-test-status')).toContainText('No words recognized');
    await expect(page.getByTestId('morpheus-microphone-check-result')).toHaveCount(0);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByTestId('morpheus-voice-setup-error')).toContainText('Reconnect');
    await expect(page.getByTestId('morpheus-microphone-enabled')).toHaveAttribute('data-state', 'checked');
    await page.screenshot({ path: info.outputPath('voice-panel-device-repair-1280x800.png') });
    await page.getByTestId('morpheus-voice-more-options').locator('summary').first().click();
    await expect(page.getByTestId('morpheus-voice-caption-mode')).toBeVisible();
    await page.getByTestId('morpheus-voice-caption-mode').selectOption('hidden');
    await expect(page.getByTestId('morpheus-voice-setup-error')).toBeVisible();
    await page.setViewportSize({ width: 430, height: 800 });
    expect(await page.getByTestId('morpheus-voice-setup').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.getByTestId('morpheus-microphone-device').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('voice-panel-device-repair-430.png') });
    await page.getByTestId('morpheus-settings-return').click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Keep this while I check my voice');
    expect(await page.evaluate(() => (window as unknown as { voicePanelCaptureRequests: number }).voicePanelCaptureRequests)).toBe(1);
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});
