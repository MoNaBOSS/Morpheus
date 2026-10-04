import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closeElectronApp, expect, getStableWindow, installAttachmentHostFixture, test } from './fixtures/electron';

type PlaybackEvidence = {
  captureRequests: number;
  chunks: Array<{ streamId: string; sequence: number; bytes: number }>;
  sources: Array<{ startedAt: number; scheduledStartMs: number; scheduledEndMs: number; endedAt: number | null; stoppedAt: number | null; stoppedEarly: boolean; bytes: number }>;
};
type Completion = { text: string; pcmStream: { streamId: string; chunkCount: number; byteLength: number } };

test('generated local speech receives one live ACP answer with actual PCM playback and typed/manual Stop', async ({ launchElectronApp }, info) => {
  test.skip(process.platform !== 'win32' || !existsSync(resolve('build/local-voice/bin/sherpa-onnx-offline-tts.exe')), 'Real Windows included voice assets required');
  test.setTimeout(150_000);
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const fixture = await installAttachmentHostFixture(app, { sessions: [{ key: 'agent:main:main', title: 'Generated voice conversation' }], language: 'en' });
    const page = await getStableWindow(app);
    const generated = await page.evaluate(async () => {
      const invoke = async (action: string, payload?: unknown) => {
        const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action, payload });
        if (!result.ok) throw new Error(`Real voice ${action} failed: ${result.error?.message ?? 'Unknown host failure'}`);
        return result.data;
      };
      await invoke('updateVoiceSettings', { engine: 'local', enabled: true, ambientEnabled: false,
        localWakeEnabled: false, speakResponses: true, handsFreeFollowUp: false, autoSubmitTranscript: true });
      const streamId = crypto.randomUUID();
      const chunks: Array<{ sequence: number; bytes: Uint8Array }> = [];
      const unsubscribe = window.electron.ipcRenderer.on('morpheus:speech-chunk', (value) => {
        const chunk = value as { streamId: string; sequence: number; mimeType: string; audioBase64: string };
        if (chunk.streamId !== streamId) return;
        if (chunk.mimeType !== 'audio/pcm') throw new Error('Actual included PCM chunks are required');
        chunks.push({ sequence: chunk.sequence, bytes: Uint8Array.from(atob(chunk.audioBase64), (char) => char.charCodeAt(0)) });
      });
      let result: { mimeType: string; pcmStream?: Completion['pcmStream'] };
      try {
        result = await invoke('synthesizeSpeech', { text: 'How are you today?', streamId }) as typeof result;
        if (result.mimeType !== 'audio/pcm' || !result.pcmStream) throw new Error('Actual included progressive PCM is required');
        const deadline = performance.now() + 5_000;
        while (chunks.length < result.pcmStream.chunkCount && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
        if (chunks.length !== result.pcmStream.chunkCount || chunks.some((chunk, index) => chunk.sequence !== index)
          || chunks.reduce((total, chunk) => total + chunk.bytes.length, 0) !== result.pcmStream.byteLength) throw new Error('Generated input must retain every declared PCM frame');
      } finally { if (typeof unsubscribe === 'function') unsubscribe(); }
      const pcm = new Uint8Array(result.pcmStream!.byteLength);
      let cursor = 0; for (const chunk of chunks) { pcm.set(chunk.bytes, cursor); cursor += chunk.bytes.length; }
      // Main's input contract is canonical mono PCM16 at 16 kHz. Resample the
      // actual 24 kHz included output using the real browser audio implementation.
      const offline = new OfflineAudioContext(1, Math.ceil(pcm.length / 2 * 16_000 / 24_000), 16_000);
      const input = offline.createBuffer(1, pcm.length / 2, 24_000);
      const pcmView = new DataView(pcm.buffer);
      for (let index = 0; index < input.length; index++) input.getChannelData(0)[index] = pcmView.getInt16(index * 2, true) / 32768;
      const source = offline.createBufferSource(); source.buffer = input; source.connect(offline.destination); source.start();
      const resampled = await offline.startRendering();
      const buffer = new ArrayBuffer(44 + resampled.length * 2); const view = new DataView(buffer); const wav = new Uint8Array(buffer);
      for (const [offset, value] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) wav.set(new TextEncoder().encode(value), offset);
      view.setUint32(4, wav.length - 8, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 16_000, true); view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, resampled.length * 2, true);
      const samples = resampled.getChannelData(0);
      for (let index = 0; index < samples.length; index++) { const sample = Math.max(-1, Math.min(1, samples[index])); view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true); }
      let encoded = ''; for (let offset = 0; offset < wav.length; offset += 16384) encoded += String.fromCharCode(...wav.subarray(offset, offset + 16384));
      const audioBase64 = btoa(encoded);
      const recognized = await invoke('transcribeAudio', { audioBase64, mimeType: 'audio/wav', durationMs: Math.round(resampled.length / 16) }) as { transcript: string };
      await invoke('cancelSpeech');
      if (!/how are you/i.test(recognized.transcript)) throw new Error('The real generated phrase was not recognized');
      return { audioBase64, transcript: recognized.transcript, pcmBytes: pcm.length };
    });
    // Exercise a complete multi-clause answer through the actual local worker
    // and original playback queue, rather than only a short opening sentence.
    const firstAnswer = 'Your report is ready. I checked the latest source, compared the details, and collected the most useful findings so you can decide what to do next. The browser remains available whenever you want to check a source or continue your task.';
    await fixture.setPromptUpdates(generated.transcript, [{ sessionUpdate: 'agent_message_chunk', messageId: 'first-voice-answer', content: { type: 'text', text: firstAnswer } }]);
    await page.reload();
    await expect(page.getByTestId('morpheus-command-input')).toBeVisible();
    await app.evaluate(({ ipcMain }) => {
      const handlers = ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown, request: { module?: string; action?: string; payload?: { text?: string; streamId?: string } }) => unknown> };
      const original = handlers._invokeHandlers.get('host:invoke');
      if (!original) throw new Error('Original live host handler is required');
      const records: Completion[] = [];
      (globalThis as unknown as { voiceConversationCompletions: Completion[] }).voiceConversationCompletions = records;
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', (event, request) => {
        const result = original(event, request);
        if (request?.module === 'morpheus' && request.action === 'synthesizeSpeech' && request.payload?.streamId) {
          void Promise.resolve(result).then((value) => {
            const response = value as { ok?: boolean; data?: { pcmStream?: Completion['pcmStream'] } };
            if (response.ok && response.data?.pcmStream) records.push({ text: request.payload!.text!, pcmStream: response.data.pcmStream });
          }).catch(() => undefined);
        }
        return result;
      });
    });
    await page.evaluate((audioBase64) => {
      const evidence: PlaybackEvidence = { captureRequests: 0, chunks: [], sources: [] };
      (window as unknown as { voiceConversationEvidence: PlaybackEvidence }).voiceConversationEvidence = evidence;
      // A real WebAudio MediaStream carries the generated neural sample through
      // the original MediaRecorder/STT owner. No physical device is requested.
      navigator.mediaDevices.getUserMedia = async () => {
        if (++evidence.captureRequests > 3) throw new DOMException('Unexpected extra capture excluded from qualification', 'NotAllowedError');
        const context = new AudioContext({ sampleRate: 16_000 });
        const input = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0));
        const buffer = await context.decodeAudioData(input.buffer);
        const source = context.createBufferSource(); source.buffer = buffer;
        const destination = context.createMediaStreamDestination(); source.connect(destination);
        const originalStop = destination.stream.getTracks()[0].stop.bind(destination.stream.getTracks()[0]);
        destination.stream.getTracks()[0].stop = () => { originalStop(); void context.close(); };
        await context.resume(); source.start(context.currentTime + 0.2);
        return destination.stream;
      };
      const originalCreate = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source: AudioBufferSourceNode = Reflect.apply(originalCreate, this, args);
        if (this.sampleRate !== 24_000) return source;
        const start = source.start; const stop = source.stop;
        const record: PlaybackEvidence['sources'][number] = { startedAt: 0, scheduledStartMs: 0, scheduledEndMs: 0, endedAt: null, stoppedAt: null, stoppedEarly: false, bytes: 0 };
        source.start = function (...values) {
          const result = Reflect.apply(start, this, values);
          record.startedAt = performance.now(); record.bytes = (this.buffer?.length ?? 0) * 2;
          record.scheduledStartMs = (values[0] ?? this.context.currentTime) * 1000;
          record.scheduledEndMs = record.scheduledStartMs + (this.buffer?.duration ?? 0) * 1000;
          evidence.sources.push(record); return result;
        };
        source.stop = function (...values) { const result = Reflect.apply(stop, this, values); record.stoppedAt = performance.now(); record.stoppedEarly = record.endedAt === null; return result; };
        source.addEventListener('ended', () => { record.endedAt = performance.now(); }); return source;
      };
      window.electron.ipcRenderer.on('morpheus:speech-chunk', (value) => {
        const chunk = value as { streamId: string; sequence: number; audioBase64: string };
        evidence.chunks.push({ streamId: chunk.streamId, sequence: chunk.sequence, bytes: atob(chunk.audioBase64).length });
      });
    }, generated.audioBase64);
    const observed = () => page.evaluate(() => (window as unknown as { voiceConversationEvidence: PlaybackEvidence }).voiceConversationEvidence);
    await page.getByTestId('morpheus-voice-button-command-center').click();
    await expect(page.getByTestId('workspace-conversation')).toContainText(firstAnswer, { timeout: 25_000 });
    await expect.poll(async () => (await observed()).sources.length, { timeout: 35_000 }).toBeGreaterThan(0);
    await expect.poll(async () => { const value = await observed(); return value.sources.length > 0 && value.sources.every((source) => source.endedAt !== null); }, { timeout: 35_000 }).toBe(true);
    const first = await observed();
    const completions = await app.evaluate(() => (globalThis as unknown as { voiceConversationCompletions: Completion[] }).voiceConversationCompletions);
    expect(completions).toHaveLength(1); expect(completions[0].text).toBe(firstAnswer);
    const received = first.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
    expect(received).toBe(completions[0].pcmStream.byteLength);
    expect(first.sources.reduce((sum, source) => sum + source.bytes, 0)).toBe(received);
    expect(first.sources.every((source) => !source.stoppedEarly)).toBe(true);
    expect(first.chunks.length).toBeGreaterThan(3);
    expect(first.captureRequests).toBe(1);
    const stops: Array<{ type: string; latencyMs: number }> = [];
    for (const type of ['typed', 'manual']) {
      const answer = 'Here is a longer fixture reply so the original playback can be interrupted. '.repeat(8);
      await fixture.setPromptUpdates(generated.transcript, [{ sessionUpdate: 'agent_message_chunk', messageId: `${type}-voice-answer`, content: { type: 'text', text: answer } }]);
      const before = (await observed()).sources.length;
      await page.getByTestId('morpheus-voice-button-command-center').click();
      await expect.poll(async () => (await observed()).sources.length, { timeout: 35_000 }).toBeGreaterThan(before);
      const startedAt = await page.evaluate(() => performance.now());
      if (type === 'typed') {
        await page.getByTestId('morpheus-command-input').fill('Stop speaking');
        await page.getByTestId('morpheus-command-submit').click();
      } else await page.getByTestId('morpheus-voice-dismiss').click();
      await expect.poll(async () => (await observed()).sources.slice(before).some((source) => source.stoppedEarly), { timeout: 2_000 }).toBe(true);
      const stoppedAt = Math.min(...(await observed()).sources.slice(before).filter((source) => source.stoppedEarly).map((source) => source.stoppedAt!));
      stops.push({ type, latencyMs: stoppedAt - startedAt }); expect(stoppedAt - startedAt).toBeLessThan(1_000);
    }
    const calls = (await fixture.getHostInvocations()).filter((call) => call.module === 'chat' && call.action === 'sendAcpPrompt');
    expect(calls).toHaveLength(3);
    const report = { scope: 'Real included neural sample → synthetic WebAudio MediaStream → original recorder/Main recognition/router → original Main admission and ACP renderer → real included PCM playback. ACP model answers are deterministic fixture content.',
      exclusions: ['Physical microphone permission/capture, wake/echo/acoustic barge-in, speaker audibility and live paid-model inference are not qualified.', 'Hands-free continuation is disabled here; its completion/cancellation policy has separate focused unit evidence.'],
      generated: { transcript: generated.transcript, pcmBytes: generated.pcmBytes }, first, completions, stops,
      maximumScheduledGapMs: Math.max(0, ...first.sources.slice(1).map((source, index) => source.scheduledStartMs - first.sources[index].scheduledEndMs)),
      admittedPromptIds: calls.map((call) => call.payload?.messageId), final: await observed() };
    const path = info.outputPath('generated-voice-conversation-evidence.json'); await writeFile(path, JSON.stringify(report, null, 2));
    await info.attach('generated-voice-conversation-evidence', { path, contentType: 'application/json' });
  } finally { await closeElectronApp(app); }
});
