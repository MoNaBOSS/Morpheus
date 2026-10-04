import { closeElectronApp, expect, getRecordedHostInvocations, getStableWindow, installIpcMocks, test } from './fixtures/electron';

test('silent synthetic Chromium capture releases input with zero provider or task requests', async ({ launchElectronApp }) => {
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
    // Replace only the input source. Production AudioContext analyser, recorder,
    // VAD, timeout and renderer/Main boundary run in real Chromium. No device
    // permission is bypassed: this fixture never requests a physical microphone.
    await page.evaluate(() => {
      const context = new AudioContext();
      const source = context.createConstantSource();
      source.offset.value = 0;
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      const globals = window as unknown as { __silentInput: { context: AudioContext; stream: MediaStream } };
      globals.__silentInput = { context, stream: destination.stream };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true, value: async () => destination.stream,
      });
    });
    await page.getByTestId('morpheus-voice-button-command-center').click();
    await expect(page.getByTestId('morpheus-voice-indicator')).toHaveAttribute('data-phase', 'listening');
    await expect(page.getByTestId('morpheus-voice-indicator')).toHaveAttribute('data-phase', 'error', { timeout: 15_000 });
    await expect(page.getByTestId('morpheus-voice-error')).toContainText("I couldn't hear that clearly. Please say it once more.");
    await expect(page.getByTestId('morpheus-voice-indicator')).toContainText('I didn’t catch that');
    await expect(page.getByTestId('morpheus-voice-indicator')).not.toContainText('Voice input unavailable');
    await expect(page.getByTestId('morpheus-voice-connect-provider')).toHaveText('Voice');
    expect(await page.evaluate(() => (window as unknown as { __silentInput: { stream: MediaStream } })
      .__silentInput.stream.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);
    expect((await getRecordedHostInvocations(app)).filter((request) => [
      'transcribeAudio', 'transcribeAmbientAudio', 'synthesizeSpeech', 'startSpeechStream',
      'routeInteraction', 'submitObjective', 'submitAssistantTurn',
    ].includes(request.action ?? ''))).toEqual([]);
    await page.evaluate(async () => {
      await (window as unknown as { __silentInput: { context: AudioContext } }).__silentInput.context.close();
    });
  } finally { await closeElectronApp(app); }
});
