import { closeElectronApp, expect, getRecordedHostInvocations, getStableWindow, installIpcMocks, test } from './fixtures/electron';

// Root records Electron windows with MORPHEUS_VIDEO_EVIDENCE_DIR. These tests
// distinguish actual Chromium RMS/endpoint behavior from labelled Core/native
// presentation fixtures; they make no recognition or physical-audio claim.
test.use({ video: 'on' });

test('silent input offers fresh retry or typing, and actual RMS finishes the next microphone turn once', async ({ launchElectronApp }, info) => {
  test.setTimeout(60_000);
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const status = await page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
      if (!result.ok) throw new Error('Original voice status required');
      return result.data as { settings: Record<string, unknown>; presence: Record<string, unknown> };
    });
    await installIpcMocks(app, { recordHostInvocations: true, hostApi: {
      [JSON.stringify(['morpheus', 'voiceStatus', null])]: { ...status,
        settings: { ...status.settings, enabled: true, ambientEnabled: false, speakResponses: false, autoSubmitTranscript: false },
        presence: { ...status.presence, inputEnabled: true }, transcriptionAvailable: true },
    } });
    // Only the final STT text is a controlled fixture; its audio payload varies.
    await app.evaluate(({ ipcMain }) => {
      type Request = { id?: string; module?: string; action?: string; payload?: Record<string, unknown> };
      const handlers = ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown, request: Request) => unknown> };
      const original = handlers._invokeHandlers.get('host:invoke');
      if (!original) throw new Error('Original fixture handler required');
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', (event, request: Request) => {
        if (request.module !== 'morpheus' || request.action !== 'transcribeAudio') return original(event, request);
        (globalThis as unknown as { __e2eHostInvocations?: Request[] }).__e2eHostInvocations?.push({ module: request.module, action: request.action });
        return { id: request.id, ok: true, data: { transcript: 'A fresh correction', providerAccountId: 'synthetic', modelId: 'fixture', durationMs: 1_000 } };
      });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('morpheus-command-input')).toBeVisible();
    await page.evaluate(async () => {
      const context = new AudioContext(); await context.resume();
      const oscillator = context.createOscillator(); oscillator.frequency.value = 180;
      const gain = context.createGain(); gain.gain.value = 0;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(gain).connect(destination); oscillator.start();
      (window as unknown as { recoveryAudio: { context: AudioContext; gain: GainNode; destination: MediaStreamAudioDestinationNode } }).recoveryAudio = { context, gain, destination };
      navigator.mediaDevices.getUserMedia = async () => destination.stream;
    });
    await page.getByTestId('morpheus-voice-button-command-center').click();
    const cue = page.getByTestId('morpheus-voice-recovery-command-center');
    await expect(cue).toBeVisible({ timeout: 15_000 });
    await expect(cue).toContainText('Nothing was sent');
    await expect(page.getByTestId('morpheus-voice-indicator')).toHaveCount(0);
    await expect(page.getByTestId('command-center-page').getByTestId('morpheus-fluid-orb')).toHaveAttribute('data-motion-state', 'retry');
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('');
    expect((await getRecordedHostInvocations(app)).filter(call => ['transcribeAudio', 'routeInteraction', 'submitObjective', 'submitAssistantTurn'].includes(call.action ?? ''))).toEqual([]);
    await page.screenshot({ path: info.outputPath('real-silence-recovery.png') });
    await cue.getByTestId('morpheus-recovery-type').click();
    await expect(page.getByTestId('morpheus-command-input')).toBeFocused();
    await expect(cue).toHaveCount(0);
    // A fresh stream, not the stopped silent recording, enters the next turn.
    await page.evaluate(() => {
      const audio = (window as unknown as { recoveryAudio: { context: AudioContext; gain: GainNode } }).recoveryAudio;
      const destination = audio.context.createMediaStreamDestination(); audio.gain.connect(destination);
      navigator.mediaDevices.getUserMedia = async () => destination.stream;
    });
    await page.getByTestId('morpheus-voice-button-command-center').click();
    await page.evaluate(() => { (window as unknown as { recoveryAudio: { gain: GainNode } }).recoveryAudio.gain.gain.value = .15; });
    await expect.poll(() => page.getByTestId('command-center-page').getByTestId('morpheus-fluid-orb').evaluate(node => Number.parseFloat(getComputedStyle(node).getPropertyValue('--morpheus-audio-level')))).toBeGreaterThan(0);
    await page.waitForTimeout(550); // Actual continuous synthetic input, not UI state injection.
    await page.evaluate(() => { (window as unknown as { recoveryAudio: { gain: GainNode } }).recoveryAudio.gain.gain.value = 0; });
    await expect.poll(async () => (await getRecordedHostInvocations(app)).filter(call => call.action === 'transcribeAudio').length, { timeout: 5_000 }).toBe(1);
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('A fresh correction');
    expect((await getRecordedHostInvocations(app)).filter(call => ['routeInteraction', 'submitObjective', 'submitAssistantTurn'].includes(call.action ?? ''))).toEqual([]);
    await page.screenshot({ path: info.outputPath('real-rms-auto-end.png') });
    await page.evaluate(async () => { await (window as unknown as { recoveryAudio: { context: AudioContext } }).recoveryAudio.context.close(); });
    expect(errors).toEqual([]);
    await info.attach('scope.json', { contentType: 'application/json', body: JSON.stringify({ input: 'Actual Chromium synthetic sine/silence stream and production analyser/recorder/endpoint', transcription: 'Synthetic final STT text only', physicalAudio: false, execution: false }) });
  } finally { await closeElectronApp(app); }
});

test('Evil horns and finite question/retry motion preserve the same clarification on full and compact', async ({ launchElectronApp }, info) => {
  test.skip(process.platform !== 'win32', 'Windows native orb projection');
  const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
  try {
    const page = await getStableWindow(app);
    // The native fixture hides Main on its first ready-to-show. Await that
    // lifecycle before restoring it; DOM readiness alone can race the hide.
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.getTitle() === 'Morpheus presence'))).toBe(true);
    await app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Morpheus');
      main?.show(); main?.focus();
    });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const runId = 'objective-recovery-question';
    const questionRun = { v: 1, objectiveRunId: runId, objective: 'Prepare a report', origin: { type: 'voice', commandText: 'Prepare a report' },
      state: 'needs-clarification', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), iteration: 1,
      corrections: [], planIds: [], observations: [], artifacts: [], clarification: 'Which report format?', clarificationChoices: ['Markdown', 'Text'] };
    const publishQuestion = async (iteration: number, state: 'needs-clarification' | 'cancelled' = 'needs-clarification') => {
      await app.evaluate(({ BrowserWindow }, run) => {
        const main = BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Morpheus');
        if (!main) throw new Error('Main window required');
        main.webContents.send('morpheus:objective-event', { v: 1, seq: run.iteration, ts: run.updatedAt,
          objectiveRunId: run.objectiveRunId, state: run.state, run });
      }, { ...questionRun, iteration, state, updatedAt: new Date().toISOString() });
    };
    await installIpcMocks(app, { recordHostInvocations: true, hostApi: {
      [JSON.stringify(['morpheus', 'objectiveSnapshot', null])]: {
        activeObjectiveRunId: runId, runOrder: [runId], plansByObjectiveRunId: {},
        runsById: { [runId]: questionRun },
      },
      [JSON.stringify(['morpheus', 'correctObjective', { objectiveRunId: runId, correction: 'Markdown' }])]: { accepted: true },
      [JSON.stringify(['morpheus', 'correctObjective', { objectiveRunId: runId, correction: 'Text' }])]: { accepted: true },
    } });
    await page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'morpheusAppearance', value: 'unrestricted-preview' } });
      if (!result.ok) throw new Error('Saved appearance required');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const full = page.getByTestId('command-center-page');
    await expect(full).toBeVisible();
    await expect(page.getByTestId('morpheus-command-input')).toBeVisible();
    await expect(full.getByTestId('morpheus-fluid-orb')).toHaveAttribute('data-motion-state', 'question');
    await expect(full.getByTestId('morpheus-brand-mark').locator('.morpheus-motion__horn')).toHaveCount(2);
    for (const horn of await full.getByTestId('morpheus-brand-mark').locator('.morpheus-motion__horn').all()) await expect(horn).toBeVisible();
    for (const horn of await full.getByTestId('morpheus-fluid-orb').locator('.morpheus-motion__horn').all()) await expect(horn).toBeVisible();
    await expect(full.getByTestId('morpheus-question-answers')).toBeVisible();
    await expect(full.getByTestId('morpheus-command-unsupported')).toHaveCount(0);
    await expect(full.getByTestId('workspace-result')).toHaveCount(0);
    await expect(full.getByTestId('morpheus-command-unsupported')).toHaveCount(0);
    const captureWindows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ title: window.getTitle(), visible: window.isVisible(), focused: window.isFocused() })));
    expect(captureWindows.find(window => window.title === 'Morpheus')?.visible).toBe(true);
    await info.attach('capture-window-lifecycle.json', { contentType: 'application/json', body: JSON.stringify(captureWindows) });
    await page.screenshot({ path: info.outputPath('evil-actual-question-choices.png') });
    await full.getByTestId('morpheus-question-answers').getByRole('button', { name: 'Markdown', exact: true }).click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Markdown');
    expect((await getRecordedHostInvocations(app)).filter(call => call.action === 'correctObjective')).toEqual([]);
    await page.getByTestId('signal-nav-presence').click();
    const compact = page.getByTestId('morpheus-quick-command');
    await expect(compact).not.toContainText('That objective is not supported yet.');
    await expect(compact.getByTestId('quick-command-input')).toHaveValue('Markdown');
    // The exact answer travels with its draft; no editing or reselection.
    await compact.getByTestId('quick-command-submit').click();
    await expect.poll(async () => (await getRecordedHostInvocations(app)).filter(call => call.action === 'correctObjective').length).toBe(1);
    expect((await getRecordedHostInvocations(app)).find(call => call.action === 'correctObjective')?.payload).toEqual({ objectiveRunId: runId, correction: 'Markdown' });
    await expect(compact.getByTestId('morpheus-question-answers')).toBeVisible();
    await compact.getByTestId('morpheus-question-answers').getByRole('button', { name: 'Text', exact: true }).click();
    await compact.getByTestId('quick-command-expand').click();
    await expect(full).toBeVisible();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Text');
    await page.getByTestId('morpheus-command-submit').click();
    await expect.poll(async () => (await getRecordedHostInvocations(app)).filter(call => call.action === 'correctObjective').length).toBe(2);
    expect((await getRecordedHostInvocations(app)).filter(call => call.action === 'correctObjective')[1].payload).toEqual({ objectiveRunId: runId, correction: 'Text' });
    expect((await getRecordedHostInvocations(app)).filter(call => ['submitObjective', 'respondPlanPermission', 'synthesizeSpeech'].includes(call.action ?? ''))).toEqual([]);
    await expect(compact).toHaveCount(0);
    await publishQuestion(2);
    await expect(full.getByTestId('morpheus-question-answers')).toBeVisible();
    await expect(full.getByTestId('morpheus-command-unsupported')).toHaveCount(0);
    await full.getByTestId('morpheus-question-answers').getByRole('button', { name: 'Markdown', exact: true }).click();
    await page.getByTestId('signal-nav-presence').click();
    await expect(compact.getByTestId('quick-command-input')).toHaveValue('Markdown');
    await publishQuestion(2, 'cancelled');
    await expect(compact.getByTestId('morpheus-fluid-orb')).not.toHaveAttribute('data-motion-state', 'question');
    await compact.getByTestId('quick-command-submit').click();
    await compact.getByTestId('quick-command-submit').click();
    await expect(compact.getByTestId('quick-command-input')).toHaveValue('Markdown');
    expect((await getRecordedHostInvocations(app)).filter(call => call.action === 'correctObjective')).toHaveLength(2);
    await compact.getByTestId('quick-command-input').fill('');
    await publishQuestion(3);
    await expect(compact.getByTestId('morpheus-question-answers')).toBeVisible();
    await compact.getByTestId('morpheus-question-answers').getByRole('button', { name: 'Text', exact: true }).click();
    await compact.getByTestId('quick-command-expand').click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Text');
    await publishQuestion(3, 'cancelled');
    await expect(full.getByTestId('morpheus-fluid-orb')).not.toHaveAttribute('data-motion-state', 'question');
    await page.getByTestId('morpheus-command-submit').click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Text');
    expect((await getRecordedHostInvocations(app)).filter(call => ['routeInteraction', 'submitObjective', 'submitAssistantTurn', 'respondPlanPermission', 'synthesizeSpeech'].includes(call.action ?? ''))).toEqual([]);
    expect((await getRecordedHostInvocations(app)).filter(call => call.action === 'correctObjective')).toHaveLength(2);
    const native = app.windows().find(window => window !== page && window.url().includes('orb.html'));
    if (!native) throw new Error('Native orb required');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Morpheus')?.hide());
    // Fixed native presentation fixtures exercise shared CSS, not input authority.
    await native.evaluate(() => { document.documentElement.dataset.question = 'true'; });
    await expect(native.locator('.orb')).toHaveAttribute('data-motion-state', 'question');
    await native.evaluate(() => { document.documentElement.dataset.question = 'false'; document.documentElement.dataset.recovery = 'wake-unverified'; });
    await expect(native.locator('.orb')).toHaveAttribute('data-motion-state', 'retry');
    await expect(native.locator('.morpheus-motion__horn')).toHaveCount(2);
    for (const state of ['question', 'retry']) {
      await native.evaluate(value => { document.documentElement.dataset.recovery = value === 'retry' ? 'wake-unverified' : ''; document.documentElement.dataset.question = String(value === 'question'); }, state);
      const timings = await native.locator('.morpheus-motion__artwork').evaluate(node => ({ count: getComputedStyle(node).animationIterationCount, duration: getComputedStyle(node).animationDuration }));
      expect(timings.count).toBe('1'); expect(parseFloat(timings.duration)).toBeLessThan(1);
      await native.screenshot({ path: info.outputPath(`evil-native-${state}-presentation.png`) });
    }
    await native.emulateMedia({ reducedMotion: 'reduce' });
    expect(await native.locator('.orb').evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
    await info.attach('presentation-boundary.json', { contentType: 'application/json', body: JSON.stringify({ question: 'Main/Core snapshot fixture, exact run correction', nativeMotion: 'Labelled fixed presentation fixture', noAutomaticAnswerOrPermission: true, physicalAudio: false }) });
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});
