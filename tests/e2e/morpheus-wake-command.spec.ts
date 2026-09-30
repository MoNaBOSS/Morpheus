import { closeElectronApp, expect, getRecordedHostInvocations, getStableWindow, installIpcMocks, test } from './fixtures/electron';

test('a local wake command presence admits one direct turn without second capture or STT', async ({ launchElectronApp }, testInfo) => {
  const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
  try {
    const page = await getStableWindow(app);
    const status = await page.evaluate(async () => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
      if (!response.ok) throw new Error('Voice status unavailable');
      return response.data as { settings: Record<string, unknown>; presence: Record<string, unknown> };
    });
    await installIpcMocks(app, {
      recordHostInvocations: true,
      hostApi: { [JSON.stringify(['morpheus', 'voiceStatus', null])]: {
        ...status, settings: { ...status.settings, enabled: true, localWakeEnabled: true,
          ambientEnabled: true, autoSubmitTranscript: true, speakResponses: false },
        // A local Main presence fixture, never microphone or provider evidence.
        // Disable STT availability so ambient startup cannot open a physical mic.
        transcriptionAvailable: false, neuralSpeechAvailable: false,
        presence: { v: 1, state: 'armed', ambientEnabled: true, wakeSequence: 0 },
      } },
    });
    await page.reload();
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    await expect.poll(async () => (await getRecordedHostInvocations(app))
      .filter((request) => request.action === 'voiceStatus').length).toBeGreaterThan(0);
    // Main emits the same audited sequence twice to exercise real Electron IPC
    // and renderer subscription deduplication. System.Speech is not mocked as real.
    await app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus');
      if (!main) throw new Error('Main window missing');
      const presence = { v: 1, state: 'understanding', ambientEnabled: true,
        wakeSequence: 1, wakeCommand: 'Show system information' };
      main.webContents.send('morpheus:voice-presence', presence);
      main.webContents.send('morpheus:voice-presence', presence);
    });
    await expect.poll(async () => (await getRecordedHostInvocations(app))
      .filter((request) => request.module === 'morpheus' && request.action === 'submitObjective').length).toBe(1);
    await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
    const calls = await getRecordedHostInvocations(app);
    const routes = calls.filter((request) => request.action === 'routeInteraction');
    const submissions = calls.filter((request) => request.action === 'submitObjective');
    expect(routes).toHaveLength(1);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].payload).toMatchObject({ objective: 'Show system information', originType: 'voice' });
    expect(calls.filter((request) => ['beginAmbientVoice', 'setAmbientVoiceListening', 'transcribeAudio', 'transcribeAmbientAudio', 'synthesizeSpeech'].includes(request.action ?? ''))).toEqual([]);
    const orb = app.windows().find((window) => window !== page);
    if (process.platform === 'win32') {
      await expect.poll(() => app.windows().length).toBeGreaterThanOrEqual(2);
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Morpheus presence')?.isFocused())).toBe(false);
      if (orb) await orb.screenshot({ path: testInfo.outputPath('wake-command-orb.png') });
    }
    // Main remains hidden in orb presentation; screenshotting it would require
    // changing the very focus/visibility behavior this journey preserves.
  } finally { await closeElectronApp(app); }
});

test('missing microphone shows localized reconnect guidance without transcription', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const status = await page.evaluate(async () => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
      if (!response.ok) throw new Error('Voice status unavailable');
      return response.data as { settings: Record<string, unknown> };
    });
    await installIpcMocks(app, { recordHostInvocations: true, hostApi: {
      [JSON.stringify(['morpheus', 'voiceStatus', null])]: {
        ...status, settings: { ...status.settings, enabled: true, ambientEnabled: false, speakResponses: false },
        transcriptionAvailable: true, neuralSpeechAvailable: false,
      },
    } });
    await page.reload();
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getUserMedia: async () => { throw new DOMException('Requested device not found', 'NotFoundError'); },
      } });
    });
    await page.getByTestId('morpheus-voice-button-command-center').click();
    await expect(page.getByTestId('morpheus-voice-error')).toContainText('Reconnect it, then turn ambient voice off and on');
    expect((await getRecordedHostInvocations(app)).filter((request) =>
      ['transcribeAudio', 'transcribeAmbientAudio', 'submitObjective'].includes(request.action ?? ''))).toEqual([]);
  } finally { await closeElectronApp(app); }
});
