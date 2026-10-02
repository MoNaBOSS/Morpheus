import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type VoiceEvidence = {
  chunks: Array<{ at: number; streamId: string; sequence: number; mimeType?: string; bytes: number }>;
  states: string[];
  microphoneRequests: number;
  sources: Array<{
    contextId: number; startAt: number | null; endedAt: number | null; stopAt: number | null;
    stoppedBeforeEnd: boolean; frames: number; channels: number; sampleRate: number;
    offsetSeconds: number; durationSeconds?: number;
  }>;
  contexts: Array<{ id: number; closeAt: number | null; pendingSourcesAtClose: number }>;
};
type PcmCompletionEvidence = { mimeType: string; pcmStream?: { streamId: string; chunkCount: number; byteLength: number } };

test('Voice preview plays every real included PCM frame before reporting completion with input muted', async ({ launchElectronApp }, testInfo) => {
  test.skip(process.platform !== 'win32' || !existsSync(resolve('build/local-voice/bin/sherpa-onnx-offline-tts.exe')), 'Real Windows bundled voice assets required');
  test.setTimeout(60_000);
  const app = await launchElectronApp({ skipSetup: true });
  try {
    // Retain the actual Main handler's return/promise unchanged. Its declared
    // totals prove that an early label cannot pass by observing only an early
    // subset of IPC chunks; no second synthesis request is made.
    await app.evaluate(({ ipcMain }) => {
      const original = (ipcMain as unknown as {
        _invokeHandlers?: Map<string, (event: unknown, request: { module?: string; action?: string }) => unknown>;
      })._invokeHandlers?.get('host:invoke');
      if (!original) throw new Error('Original host handler is required for real speech completion evidence');
      const evidence: PcmCompletionEvidence[] = [];
      (globalThis as unknown as { speechCompletionEvidence: typeof evidence }).speechCompletionEvidence = evidence;
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', (event, request) => {
        const result = original(event, request);
        if (request?.module === 'morpheus' && request?.action === 'synthesizeSpeech') {
          void Promise.resolve(result).then((value) => {
            const response = value as { ok?: boolean; data?: PcmCompletionEvidence };
            if (response.ok && response.data) evidence.push({ mimeType: response.data.mimeType, pcmStream: response.data.pcmStream });
          }).catch(() => undefined);
        }
        return result;
      });
    });
    const page = await getStableWindow(app);
    await page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'updateVoiceSettings', payload: { engine: 'local', enabled: false, ambientEnabled: false } });
      if (!result.ok) throw new Error('Cannot mute isolated voice test');
      const evidence: VoiceEvidence = { chunks: [], states: [], microphoneRequests: 0, sources: [], contexts: [] };
      (window as unknown as { voiceEvidence: typeof evidence }).voiceEvidence = evidence;
      navigator.mediaDevices.getUserMedia = () => {
        evidence.microphoneRequests++;
        return Promise.reject(new DOMException('Physical microphone capture is excluded from this muted preview test.', 'NotAllowedError'));
      };
      // Observe the real output owner without replacing audio, changing scheduling,
      // stopping playback or manufacturing ended events. A completion label alone
      // previously passed even though later PCM chunks never reached AudioContext.
      const originalCreate = AudioContext.prototype.createBufferSource;
      const originalClose = AudioContext.prototype.close;
      const contexts = new WeakMap<AudioContext, VoiceEvidence['contexts'][number]>();
      const contextRecord = (context: AudioContext) => {
        let record = contexts.get(context);
        if (!record) {
          record = { id: evidence.contexts.length, closeAt: null, pendingSourcesAtClose: 0 };
          contexts.set(context, record); evidence.contexts.push(record);
        }
        return record;
      };
      AudioContext.prototype.createBufferSource = function (...args) {
        const source: AudioBufferSourceNode = Reflect.apply(originalCreate, this, args);
        const owner = contextRecord(this);
        const originalStart = source.start;
        const originalStop = source.stop;
        const entry: VoiceEvidence['sources'][number] = {
          contextId: owner.id, startAt: null, endedAt: null, stopAt: null, stoppedBeforeEnd: false,
          frames: 0, channels: 0, sampleRate: 0, offsetSeconds: 0,
        };
        source.start = function (...startArgs) {
          const result = Reflect.apply(originalStart, this, startArgs);
          Object.assign(entry, { startAt: performance.now(), frames: this.buffer?.length ?? 0,
            channels: this.buffer?.numberOfChannels ?? 0, sampleRate: this.buffer?.sampleRate ?? 0,
            offsetSeconds: startArgs[1] ?? 0, durationSeconds: startArgs[2] });
          evidence.sources.push(entry);
          return result;
        };
        source.stop = function (...stopArgs) {
          const result = Reflect.apply(originalStop, this, stopArgs);
          entry.stopAt = performance.now(); entry.stoppedBeforeEnd = entry.endedAt === null;
          return result;
        };
        source.addEventListener('ended', () => { entry.endedAt = performance.now(); });
        return source;
      };
      AudioContext.prototype.close = function (...args) {
        const owner = contextRecord(this);
        owner.closeAt = performance.now();
        owner.pendingSourcesAtClose = evidence.sources.filter((source) => source.contextId === owner.id && source.endedAt === null).length;
        return Reflect.apply(originalClose, this, args);
      };
      window.electron.ipcRenderer.on('morpheus:speech-chunk', (value) => {
        const chunk = value as { streamId: string; sequence: number; mimeType?: string; audioBase64: string };
        evidence.chunks.push({ at: performance.now(), streamId: chunk.streamId, sequence: chunk.sequence, mimeType: chunk.mimeType, bytes: atob(chunk.audioBase64).length });
      });
      window.electron.ipcRenderer.on('morpheus:voice-presence', (value) => evidence.states.push((value as { state: string }).state));
    });
    await page.getByTestId('sidebar-nav-settings').click();
    await page.getByTestId('morpheus-settings-voice').click();
    const sample = page.getByTestId('morpheus-voice-preview');
    await sample.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { voiceEvidence: { chunks: unknown[] } }).voiceEvidence.chunks.length), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('morpheus-voice-preview-result')).toContainText('Neural playback completed', { timeout: 35_000 });
    const observed = await page.evaluate(() => ({ completedLabelObservedAt: performance.now(), result: (window as unknown as { voiceEvidence: VoiceEvidence }).voiceEvidence }));
    const result = observed.result;
    const receivedBytes = result.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
    const scheduledBytes = result.sources.reduce((sum, source) => sum + source.frames * source.channels * 2, 0);
    const endedBytes = result.sources.filter((source) => source.endedAt !== null).reduce((sum, source) => sum + source.frames * source.channels * 2, 0);
    const completions = await app.evaluate(() => (globalThis as unknown as { speechCompletionEvidence: PcmCompletionEvidence[] }).speechCompletionEvidence);
    const evidencePath = testInfo.outputPath('real-pcm-completion-evidence.json');
    await writeFile(evidencePath, JSON.stringify({ ...observed, completions, receivedBytes, scheduledBytes, endedBytes }, null, 2));
    await testInfo.attach('real-pcm-completion-evidence', { path: evidencePath, contentType: 'application/json' });
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks.every((chunk, index) => chunk.sequence === index && chunk.mimeType === 'audio/pcm')).toBe(true);
    expect(result.chunks.at(-1)!.at - result.chunks[0].at).toBeGreaterThan(100);
    expect(new Set(result.chunks.map((chunk) => chunk.streamId)).size).toBe(1);
    expect(completions).toHaveLength(1);
    expect(completions[0]).toEqual({ mimeType: 'audio/pcm', pcmStream: { streamId: result.chunks[0].streamId, chunkCount: result.chunks.length, byteLength: receivedBytes } });
    expect(result.contexts).toHaveLength(1);
    expect(receivedBytes).toBeGreaterThan(0);
    expect(scheduledBytes, 'Every received signed-16 PCM frame must be scheduled in the real AudioContext').toBe(receivedBytes);
    expect(endedBytes, 'Every scheduled frame must finish before the UI claims completed playback').toBe(receivedBytes);
    expect(result.sources.every((source) => source.frames > 0 && source.channels === 1 && source.sampleRate === 24_000
      && source.offsetSeconds === 0 && source.durationSeconds === undefined && source.endedAt !== null
      && source.endedAt <= observed.completedLabelObservedAt && !source.stoppedBeforeEnd)).toBe(true);
    expect(result.contexts.every((context) => context.closeAt !== null && context.pendingSourcesAtClose === 0)).toBe(true);
    expect(result.microphoneRequests).toBe(0);
    expect(result.states).toContain('speaking'); expect(result.states).not.toContain('listening');
  } finally { await closeElectronApp(app); }
});
