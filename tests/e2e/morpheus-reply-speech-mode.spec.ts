import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { closeElectronApp, expect, getStableWindow, installAttachmentHostFixture, test } from './fixtures/electron';

type SpeechEvidence = {
  requests: string[]; pcmCompletions: number; cancelSpeech: number; cancelTasks: number;
  nextTranscript: string; holdPrompt: boolean; pendingPrompt: boolean; releasePrompt?: () => Promise<void>;
};
type PlaybackEvidence = { captures: number; starts: number; stoppedEarly: number; active: number };

test('native and compact orb replies follow the saved mode and original surface with real PCM, meter and Stop', async ({ launchElectronApp }, info) => {
  test.skip(process.platform !== 'win32' || !existsSync(resolve('build/local-voice/bin/sherpa-onnx-offline-tts.exe')), 'Included Windows voice assets required');
  test.setTimeout(210_000);
  const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
  try {
    const fixture = await installAttachmentHostFixture(app, { sessions: [{ key: 'agent:main:main', title: 'Speech modes' }], language: 'en' });
    const page = await getStableWindow(app);
    await page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'updateVoiceSettings',
        payload: { engine: 'local', enabled: false, ambientEnabled: false, localWakeEnabled: false,
          speakResponses: true, replySpeechMode: 'orb', handsFreeFollowUp: false, autoSubmitTranscript: true } });
      if (!result.ok) throw new Error('Actual speech settings unavailable');
    });
    await app.evaluate(({ ipcMain }) => {
      type Request = { id: string; module?: string; action?: string; payload?: { text?: string; streamId?: string } };
      type Handler = (event: unknown, request: Request) => Promise<unknown>;
      const original = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get('host:invoke');
      if (!original) throw new Error('Original host owner required');
      const evidence: SpeechEvidence = { requests: [], pcmCompletions: 0, cancelSpeech: 0, cancelTasks: 0,
        nextTranscript: 'What changed in the voice report?', holdPrompt: false, pendingPrompt: false };
      (globalThis as unknown as { replySpeechEvidence: SpeechEvidence }).replySpeechEvidence = evidence;
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', async (event, request: Request) => {
        if (request.module === 'morpheus' && request.action === 'transcribeAudio') {
          // Input/model content are controlled. Original recording, admission,
          // reply owner, included synthesis and PCM playback remain active.
          return { id: request.id, ok: true, data: { transcript: evidence.nextTranscript,
            providerAccountId: 'fixture-input', modelId: 'fixture-transcription', durationMs: 500 } };
        }
        if (request.module === 'chat' && request.action === 'sendAcpPrompt' && evidence.holdPrompt) {
          evidence.holdPrompt = false; evidence.pendingPrompt = true;
          return new Promise((done) => { evidence.releasePrompt = async () => {
            done(await original(event, request)); evidence.pendingPrompt = false;
          }; });
        }
        if (request.module === 'morpheus' && request.action === 'cancelSpeech') evidence.cancelSpeech++;
        if (request.module === 'morpheus' && request.action === 'cancelObjective') evidence.cancelTasks++;
        if (request.module === 'chat' && request.action === 'cancelAcpPrompt') evidence.cancelTasks++;
        if (request.module === 'morpheus' && request.action === 'synthesizeSpeech' && request.payload?.streamId) {
          evidence.requests.push(request.payload.text ?? '');
          const response = await original(event, request) as { ok?: boolean; data?: { pcmStream?: { byteLength: number } } };
          if (response.ok && (response.data?.pcmStream?.byteLength ?? 0) > 0) evidence.pcmCompletions++;
          return response;
        }
        return original(event, request);
      });
    });
    await page.addInitScript(() => {
      const evidence: PlaybackEvidence = { captures: 0, starts: 0, stoppedEarly: 0, active: 0 };
      (window as unknown as { replyPlaybackEvidence: PlaybackEvidence }).replyPlaybackEvidence = evidence;
      navigator.mediaDevices.getUserMedia = async () => {
        evidence.captures++;
        const context = new AudioContext({ sampleRate: 16_000 });
        const tone = context.createOscillator(); const gain = context.createGain(); gain.gain.value = 0.08;
        const destination = context.createMediaStreamDestination(); tone.connect(gain); gain.connect(destination);
        const track = destination.stream.getTracks()[0]; const stop = track.stop.bind(track);
        track.stop = () => { stop(); tone.stop(); void context.close(); };
        await context.resume(); tone.start(); return destination.stream;
      };
      const original = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source: AudioBufferSourceNode = Reflect.apply(original, this, args);
        if (this.sampleRate !== 24_000) return source;
        let active = false; const start = source.start; const stop = source.stop;
        source.start = function (...values) {
          const result = Reflect.apply(start, this, values); active = true; evidence.starts++; evidence.active++; return result;
        };
        source.stop = function (...values) {
          const result = Reflect.apply(stop, this, values);
          if (active) { evidence.stoppedEarly++; evidence.active--; active = false; } return result;
        };
        source.addEventListener('ended', () => { if (active) { evidence.active--; active = false; } });
        return source;
      };
    });
    await page.reload();
    const observed = () => app.evaluate(() => {
      const { releasePrompt: _releasePrompt, ...data } = (globalThis as unknown as { replySpeechEvidence: SpeechEvidence }).replySpeechEvidence;
      return data;
    });
    const playback = () => page.evaluate(() => (window as unknown as { replyPlaybackEvidence: PlaybackEvidence }).replyPlaybackEvidence);
    const showOrb = async () => {
      await page.evaluate(async () => { await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'showCompanionSurface' }); });
      await expect(page.getByTestId('morpheus-quick-command')).toBeVisible();
    };
    const typeOrb = async (prompt: string) => {
      await page.getByTestId('quick-command-input').fill(prompt); await page.getByTestId('quick-command-submit').click();
    };
    const record = async (source: 'quick-command' | 'command-center') => {
      const mic = page.getByTestId(`morpheus-voice-button-${source}`);
      await mic.click(); await expect(mic).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(550); await mic.click();
    };
    const answer = async (prompt: string, text: string, id: string) => fixture.setPromptUpdates(prompt,
      [{ sessionUpdate: 'agent_message_chunk', messageId: id, content: { type: 'text', text } }]);
    const waitFinished = async () => expect.poll(async () => (await playback()).active, { timeout: 30_000 }).toBe(0);
    const savedSettings = async () => page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
      if (!result.ok) throw new Error('Saved speech settings unavailable');
      return (result.data as { settings: { enabled: boolean; replySpeechMode: string; speakResponses: boolean } }).settings;
    });

    await expect.poll(() => app.windows().length).toBeGreaterThanOrEqual(2);
    const orb = (await Promise.all(app.windows().map(async (item) => ({ item, title: await item.title() }))))
      .find(({ title }) => title === 'Morpheus presence')?.item;
    if (!orb) throw new Error('Actual native orb window required');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((item) => item.getTitle() === 'Morpheus')!.hide());
    await expect(orb.locator('.orb')).toBeVisible();
    await answer('What changed in the native report?', 'The live native orb reply is ready.', 'native-orb-answer');
    await orb.locator('.orb').click();
    await expect(orb.locator('#orb-input')).toBeFocused();
    await orb.locator('#orb-input').fill('What changed in the native report?');
    await orb.locator('#orb-input').press('Enter');
    await expect(page.getByTestId('quick-command-conversation')).toContainText('The live native orb reply is ready.');
    await expect.poll(async () => (await observed()).requests).toContain('The live native orb reply is ready.');
    await expect.poll(async () => (await observed()).pcmCompletions, { timeout: 35_000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await playback()).starts, { timeout: 35_000 }).toBeGreaterThan(0);
    await waitFinished();
    const nativeSnapshot = await page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'assistantSnapshot' });
      if (!result.ok) throw new Error('Original native admission unavailable');
      return result.data as { turns: Array<{ source: string; turnId: string }> };
    });
    expect(nativeSnapshot.turns.filter((turn) => turn.source === 'orb')).toHaveLength(1);
    const nativeCalls = (await fixture.getHostInvocations()).filter((call) => call.module === 'chat' && call.action === 'sendAcpPrompt');
    expect(nativeCalls).toHaveLength(1);
    expect(nativeCalls[0].payload?.messageId).toBe(nativeSnapshot.turns.find((turn) => turn.source === 'orb')!.turnId);
    const afterNative = (await observed()).requests.length;
    await page.reload(); await page.waitForTimeout(250);
    expect((await observed()).requests).toHaveLength(afterNative);
    expect((await playback()).starts).toBe(0);

    const longReply = 'Here is the typed orb report. The important details are ready, and you can stop this spoken reply while keeping the conversation and task intact. '.repeat(4);
    await answer('What changed in the typed report?', longReply, 'typed-orb-answer');
    await showOrb(); await typeOrb('What changed in the typed report?');
    await expect(page.getByTestId('quick-command-conversation')).toContainText('Here is the typed orb report.');
    await expect.poll(async () => (await playback()).starts, { timeout: 35_000 }).toBeGreaterThan(0);
    const compact = page.getByTestId('morpheus-quick-command');
    const meter = compact.getByTestId('morpheus-audio-meter');
    await expect(meter).toHaveAttribute('data-audio-state', 'speaking');
    await expect.poll(async () => meter.evaluate((element) => parseFloat(getComputedStyle(element).getPropertyValue('--morpheus-meter-level')))).toBeGreaterThan(0);
    expect((await playback()).captures).toBe(0);
    expect((await savedSettings()).enabled).toBe(false);
    await page.screenshot({ path: info.outputPath('orb-typed-reply-speaking-mic-muted.png') });
    const beforeStop = await observed();
    await compact.getByTestId('quick-command-stop-speech').click();
    await expect.poll(async () => (await playback()).stoppedEarly).toBeGreaterThan(0);
    await waitFinished();
    expect((await observed()).cancelTasks).toBe(beforeStop.cancelTasks);
    expect((await observed()).cancelSpeech).toBeGreaterThan(beforeStop.cancelSpeech);

    await page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'updateVoiceSettings', payload: { enabled: true } });
      if (!result.ok) throw new Error('Explicit voice input enable unavailable');
    });
    await answer('What changed in the voice report?', 'The live voice orb reply is ready.', 'voice-orb-answer');
    const beforeVoice = await playback();
    const beforeVoiceCompletions = (await observed()).pcmCompletions;
    await record('quick-command');
    await expect(page.getByTestId('quick-command-conversation')).toContainText('The live voice orb reply is ready.');
    await expect.poll(async () => (await observed()).requests).toContain('The live voice orb reply is ready.');
    await expect.poll(async () => (await observed()).pcmCompletions, { timeout: 35_000 }).toBeGreaterThan(beforeVoiceCompletions);
    await expect.poll(async () => (await playback()).starts, { timeout: 35_000 }).toBeGreaterThan(beforeVoice.starts);
    await waitFinished();

    await answer('What changed in the moving report?', 'This reply belongs to the orb request.', 'moving-orb-answer');
    const beforeMoving = await playback();
    const beforeMovingCompletions = (await observed()).pcmCompletions;
    await app.evaluate(() => { (globalThis as unknown as { replySpeechEvidence: SpeechEvidence }).replySpeechEvidence.holdPrompt = true; });
    await typeOrb('What changed in the moving report?');
    await expect.poll(async () => (await observed()).pendingPrompt).toBe(true);
    await page.getByTestId('quick-command-expand').click();
    await app.evaluate(async () => { await (globalThis as unknown as { replySpeechEvidence: SpeechEvidence }).replySpeechEvidence.releasePrompt!(); });
    await expect(page.getByTestId('workspace-conversation')).toContainText('This reply belongs to the orb request.');
    await expect.poll(async () => (await observed()).requests).toContain('This reply belongs to the orb request.');
    await expect.poll(async () => (await playback()).starts, { timeout: 35_000 }).toBeGreaterThan(beforeMoving.starts);
    await expect.poll(async () => (await observed()).pcmCompletions, { timeout: 35_000 }).toBeGreaterThan(beforeMovingCompletions);
    await waitFinished();

    const quietCount = (await observed()).requests.length;
    await answer('What changed in the expanded report?', 'This expanded reply stays quiet.', 'expanded-answer');
    await app.evaluate(() => { (globalThis as unknown as { replySpeechEvidence: SpeechEvidence }).replySpeechEvidence.holdPrompt = true; });
    await page.getByTestId('morpheus-command-input').fill('What changed in the expanded report?');
    await page.getByTestId('morpheus-command-submit').click();
    await expect.poll(async () => (await observed()).pendingPrompt).toBe(true);
    await showOrb();
    await app.evaluate(async () => { await (globalThis as unknown as { replySpeechEvidence: SpeechEvidence }).replySpeechEvidence.releasePrompt!(); });
    await expect(page.getByTestId('quick-command-conversation')).toContainText('This expanded reply stays quiet.');
    await page.getByTestId('quick-command-expand').click();
    await app.evaluate(() => { (globalThis as unknown as { replySpeechEvidence: SpeechEvidence }).replySpeechEvidence.nextTranscript = 'What changed in the expanded voice report?'; });
    await answer('What changed in the expanded voice report?', 'This expanded voice reply also stays quiet.', 'expanded-voice-answer');
    await record('command-center');
    await expect(page.getByTestId('workspace-conversation')).toContainText('This expanded voice reply also stays quiet.');
    await page.waitForTimeout(250); expect((await observed()).requests).toHaveLength(quietCount);

    await page.evaluate(() => { window.location.hash = '#/settings?section=voice'; });
    const mode = page.getByTestId('morpheus-reply-speech-mode');
    await expect(mode).toHaveValue('orb');
    await expect(page.getByTestId('morpheus-reply-speech-description')).toContainText('Expanded chat stays quiet');
    await mode.selectOption('voice');
    await expect.poll(async () => (await savedSettings()).replySpeechMode).toBe('voice');
    await page.reload();
    await expect(mode).toHaveValue('voice');
    await mode.selectOption('all');
    await expect.poll(async () => (await savedSettings()).replySpeechMode).toBe('all');
    await page.getByTestId('morpheus-spoken-replies').click();
    await expect(page.getByTestId('morpheus-spoken-replies')).toHaveAttribute('data-state', 'unchecked');
    await expect.poll(async () => (await savedSettings()).speakResponses).toBe(false);
    await page.getByTestId('morpheus-settings-return').click(); await showOrb();
    await answer('What changed in the quiet report?', 'The existing quiet choice is respected.', 'master-quiet-answer');
    await typeOrb('What changed in the quiet report?');
    await expect(page.getByTestId('quick-command-conversation')).toContainText('The existing quiet choice is respected.');
    await page.reload(); await page.waitForTimeout(250);
    expect((await observed()).requests).toHaveLength(quietCount);
    expect((await observed()).pcmCompletions).toBeGreaterThanOrEqual(2);
    const settings = await savedSettings();
    expect(settings).toMatchObject({ replySpeechMode: 'all', speakResponses: false });
    await page.screenshot({ path: info.outputPath('orb-reply-mode-quiet-retention.png') });
    await info.attach('speech-scope', { body: JSON.stringify({
      scope: 'Original Main admissions and ACP presentation, actual included PCM synthesis/playback/meter/Stop; synthetic recording streams, controlled transcription and model answers.',
      exclusions: 'No physical microphone, recognition quality, wake, echo, speaker audibility or paid inference acceptance.',
      evidence: await observed(), settings,
    }), contentType: 'application/json' });
  } finally { await closeElectronApp(app); }
});
