import { closeElectronApp, expect, getRecordedHostInvocations, getStableWindow, installIpcMocks, test } from './fixtures/electron';

// Browser plugin not available. Actual recorder/RMS + real Main routing; only
// recognition text is a fixture. No physical microphone, model or tool executes.
test.use({ video: 'on' });
test('uncertain recognized speech offers repeat or typing without executing a guessed task', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const status = await page.evaluate(async () => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
      if (!response.ok) throw new Error('Voice status required');
      return response.data as { settings: Record<string, unknown>; presence: Record<string, unknown> };
    });
    await installIpcMocks(app, { recordHostInvocations: true, hostApi: {
      [JSON.stringify(['morpheus', 'voiceStatus', null])]: { ...status, settings: { ...status.settings,
        enabled: true, ambientEnabled: false, autoSubmitTranscript: true, speakResponses: false },
        presence: { ...status.presence, inputEnabled: true }, transcriptionAvailable: true },
    } });
    await app.evaluate(({ ipcMain }) => {
      type Request = { id?: string; module?: string; action?: string; payload?: Record<string, unknown> };
      const handlers = ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown, request: Request) => unknown> };
      const original = handlers._invokeHandlers.get('host:invoke')!;
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', (event, request: Request) => {
        if (request.module !== 'morpheus' || request.action !== 'transcribeAudio') return original(event, request);
        (globalThis as unknown as { __e2eHostInvocations: Request[] }).__e2eHostInvocations.push({ module: request.module, action: request.action });
        return { id: request.id, ok: true, data: { transcript: 'opened the YouTube', providerAccountId: 'synthetic', modelId: 'fixture', durationMs: 1_000 } };
      });
    });
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page).toHaveTitle('Morpheus');
    expect(page.url()).toContain('index.html');
    await expect(page.getByTestId('morpheus-command-input')).toBeVisible();
    await expect(page.locator('vite-error-overlay, nextjs-portal')).toHaveCount(0);
    await page.evaluate(async () => {
      const context = new AudioContext(); await context.resume();
      const gain = context.createGain(); gain.gain.value = .15;
      const oscillator = context.createOscillator(); oscillator.frequency.value = 180;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(gain).connect(destination); oscillator.start();
      (window as unknown as { clarificationAudio: { context: AudioContext; gain: GainNode } }).clarificationAudio = { context, gain };
      navigator.mediaDevices.getUserMedia = async () => destination.stream;
    });
    await page.getByTestId('morpheus-voice-button-command-center').click();
    await expect(page.getByTestId('morpheus-voice-button-command-center')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(550); // Real synthetic audio through the production recorder/endpoint.
    await page.evaluate(() => { (window as unknown as { clarificationAudio: { gain: GainNode } }).clarificationAudio.gain.gain.value = 0; });
    const cue = page.getByTestId('morpheus-voice-recovery-command-center');
    await expect(cue).toBeVisible();
    await expect(cue).toContainText('Nothing was sent');
    await expect(cue.getByTestId('morpheus-recovery-retry')).toBeVisible();
    await expect(cue.getByTestId('morpheus-recovery-type')).toBeVisible();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('opened the YouTube');
    await expect(page.getByTestId('command-center-page').getByTestId('morpheus-fluid-orb')).toHaveAttribute('data-motion-state', 'retry');
    const calls = await getRecordedHostInvocations(app);
    expect(calls.filter((call) => call.action === 'routeInteraction')).toEqual([expect.objectContaining({ payload: { text: 'opened the YouTube', mode: 'auto', surface: 'voice' } })]);
    expect(calls.filter((call) => ['submitObjective', 'submitAssistantTurn', 'submitConversation', 'synthesizeSpeech'].includes(call.action ?? ''))).toEqual([]);
    await page.screenshot({ path: info.outputPath('voice-uncertain-repeat-type.png') });
    await cue.getByTestId('morpheus-recovery-type').click();
    await expect(page.getByTestId('morpheus-command-input')).toBeFocused();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('opened the YouTube');
    await expect(cue).toHaveCount(0);
    await page.getByTestId('morpheus-command-input').fill('Open YouTube');
    expect((await getRecordedHostInvocations(app)).filter((call) => ['submitObjective', 'submitAssistantTurn', 'submitConversation', 'synthesizeSpeech'].includes(call.action ?? ''))).toEqual([]);
    await page.evaluate(async () => { await (window as unknown as { clarificationAudio: { context: AudioContext } }).clarificationAudio.context.close(); });
    await info.attach('scope.json', { contentType: 'application/json', body: JSON.stringify({ recognition: 'Fixture final text', input: 'Actual Chromium sine/silence recorder and natural endpoint', routing: 'Real Main routeInteraction', dispatch: false, physicalAudio: false, paidModel: false }) });
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});
