import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMorpheusVoiceService } from '@electron/services/morpheus/voice/voice-service';
import type { MorpheusDeepgramRecognitionSession } from '@electron/services/morpheus/voice/deepgram-voice';
import { localSpeechWav } from '@electron/services/morpheus/voice/local-speech';
import { MORPHEUS_WAKE_FRAME_BYTES, MORPHEUS_WAKE_FRAME_SAMPLES } from '@shared/morpheus/wake-audio-types';
import type { MorpheusSpeechChunk, MorpheusVoicePresence } from '@shared/morpheus/voice-types';

type VoiceOptions = Parameters<typeof createMorpheusVoiceService>[0];
const PCM = Buffer.alloc(MORPHEUS_WAKE_FRAME_BYTES, 0x31);
const directories: string[] = [];
const services: ReturnType<typeof createMorpheusVoiceService>[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.dispose();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

function harness() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'morpheus-cloud-integration-'));
  directories.push(userDataDir);
  let companion = true;
  let wake!: Parameters<NonNullable<VoiceOptions['startLocalWake']>>[0]['onWake'];
  const snapshots: MorpheusVoicePresence[] = [], chunks: MorpheusSpeechChunk[] = [];
  const recordControl = vi.fn(async (_entry: unknown) => undefined);
  const stop = vi.fn(), pushAudio = vi.fn(async () => undefined);
  const native = vi.fn<NonNullable<VoiceOptions['startLocalWake']>>((options) => {
    wake = options.onWake; return { ready: Promise.resolve(), stop, pushAudio };
  });
  const local = { ready: () => true, transcribe: vi.fn(async () => 'Morpheus open YouTube'), synthesize: vi.fn(async () => localSpeechWav(Buffer.alloc(4800))) };
  const sessions: Array<{ session: MorpheusDeepgramRecognitionSession; final: ReturnType<typeof deferred<string>>; signal: AbortSignal }> = [];
  const makeSession = (signal: AbortSignal) => {
    const final = deferred<string>();
    const abort = () => final.reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    const session: MorpheusDeepgramRecognitionSession = {
      result: final.promise,
      writePcm: vi.fn(), finish: vi.fn(), cancel: vi.fn(() => {
        signal.removeEventListener('abort', abort); abort();
      }),
    };
    sessions.push({ session, final, signal });
    return session;
  };
  const cloud = {
    createRecognitionSession: vi.fn(async ({ signal }: { signal: AbortSignal }) => makeSession(signal)),
    transcribe: vi.fn(async (_wav: Buffer, _signal: AbortSignal, _options?: unknown) => 'Morpheus open YouTube'),
    transcribeRecorded: vi.fn(async (_wav: Buffer, _signal: AbortSignal) => 'Morpheus open YouTube'),
    synthesize: vi.fn(async () => localSpeechWav(Buffer.alloc(4800))),
    synthesizeStream: vi.fn(async (_text: string, _signal: AbortSignal, onPcm: (pcm: Buffer) => void) => { onPcm(Buffer.alloc(96_000, 0x21)); }),
    test: vi.fn(), testConnection: vi.fn(), dispose: vi.fn(),
  };
  const connection = {
    snapshot: vi.fn(async () => ({ configured: true, recognitionModel: 'nova-3' as const, speechModel: 'flux-kit-en' as const, storage: 'protected' as const })),
    credentials: vi.fn(async () => ({ apiKey: 'synthetic-in-memory-cloud-key', recognitionModel: 'nova-3' as const, speechModel: 'flux-kit-en' as const })),
    save: vi.fn(), remove: vi.fn(), test: vi.fn(), dispose: vi.fn(),
  };
  const provider = { listAccounts: vi.fn(async () => []), getAccountRuntimeApiKey: vi.fn() };
  const service = createMorpheusVoiceService({ userDataDir, appVersion: 'test', localVoice: local,
    deepgram: cloud, deepgramConnection: connection, providerService: provider as never,
    audit: { recordControl, isHealthy: () => true } as never,
    startLocalWake: native, isCompanionVoiceScope: () => companion,
    emitPresence: (snapshot) => snapshots.push(snapshot), emitSpeechChunk: (chunk) => chunks.push(chunk),
  });
  services.push(service);
  return { service, cloud, connection, provider, local, snapshots, chunks, recordControl, native, stop, sessions, makeSession,
    setCompanion: (value: boolean) => { companion = value; }, triggerWake: () => wake(undefined, { startSample: 0, sampleCount: MORPHEUS_WAKE_FRAME_SAMPLES }) };
}

async function arm(h: ReturnType<typeof harness>) {
  await h.service.updateSettings({ engine: 'deepgram', enabled: true, ambientEnabled: true });
  const input = await h.service.prepareAmbientInput();
  expect(input.sessionId).toMatch(/^voice-/);
  const frame = { sessionId: input.sessionId!, sequence: 0, pcmBase64: PCM.toString('base64') };
  await h.service.feedWakeAudio(frame);
  return frame;
}

describe('Morpheus cloud voice integration authority', () => {
  it('preserves Included voice until explicit selection and never opens a cloud session while idle', async () => {
    const h = harness();
    expect(await h.service.status()).toMatchObject({ settings: { engine: 'local' }, deepgram: { configured: true } });
    expect(h.cloud.createRecognitionSession).not.toHaveBeenCalled();
    await arm(h);
    expect(h.service.presence().state).toBe('armed');
    expect(h.cloud.createRecognitionSession).not.toHaveBeenCalled();
    expect(h.cloud.transcribe).not.toHaveBeenCalled();
    expect(h.cloud.transcribeRecorded).not.toHaveBeenCalled();
    expect(h.cloud.synthesize).not.toHaveBeenCalled();
    expect(h.cloud.synthesizeStream).not.toHaveBeenCalled();
  });

  it('uses the selected cloud recognizer on addressed tray audio and publishes only a verified command once', async () => {
    const h = harness();
    await arm(h); h.snapshots.length = 0;
    h.triggerWake();
    await vi.waitFor(() => expect(h.service.presence().wakeCommand).toBe('open YouTube'));
    expect(h.local.transcribe).not.toHaveBeenCalled();
    expect(h.snapshots.filter((snapshot) => snapshot.wakeCommand === 'open YouTube')).toHaveLength(1);
    expect(h.service.presence().wakeSequence).toBe(1);
    const cloudCalls = [...h.cloud.transcribe.mock.calls, ...h.cloud.transcribeRecorded.mock.calls];
    expect(cloudCalls).toHaveLength(1);
    expect(cloudCalls[0][0].subarray(44)).toEqual(PCM);
    const audit = JSON.stringify(h.recordControl.mock.calls);
    expect(audit).not.toContain('Morpheus open YouTube');
    expect(audit).not.toContain('synthetic-in-memory-cloud-key');
    expect(audit).not.toContain(PCM.toString('base64'));
  });

  it('foreground conversation invalidates a pending tray recognition and publishes no late command', async () => {
    const h = harness(), final = deferred<string>();
    h.cloud.transcribe.mockReturnValueOnce(final.promise);
    h.cloud.transcribeRecorded.mockReturnValueOnce(final.promise);
    await arm(h); h.triggerWake();
    await vi.waitFor(() => expect(h.cloud.transcribe.mock.calls.length + h.cloud.transcribeRecorded.mock.calls.length).toBe(1));
    h.setCompanion(false); await h.service.reconcileAmbientScope();
    final.resolve('Morpheus open YouTube');
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(h.stop).toHaveBeenCalledOnce();
    expect(h.service.presence().state).toBe('asleep');
    expect(h.snapshots.some((snapshot) => snapshot.wakeCommand)).toBe(false);
    expect(h.snapshots.some((snapshot) => snapshot.state === 'error')).toBe(false);
  });

  it('explicit capture waits for a real final and exposes no partial command or fake listening before PCM', async () => {
    const h = harness(); h.setCompanion(false);
    await h.service.updateSettings({ engine: 'deepgram' }); h.snapshots.length = 0;
    const input = await h.service.beginDeepgramInput();
    expect(h.service.presence().state).toBe('asleep');
    let delivered = false;
    const waiting = h.service.waitDeepgramInput(input).then((result) => { delivered = true; return result; });
    await h.service.feedDeepgramInput({ ...input, sequence: 0, pcmBase64: PCM.toString('base64') });
    expect(h.service.presence().state).toBe('listening');
    expect(delivered).toBe(false);
    expect(h.snapshots.some((snapshot) => snapshot.wakeCommand)).toBe(false);
    h.sessions[0].final.resolve('open YouTube');
    await expect(waiting).resolves.toMatchObject({ transcript: 'open YouTube', modelId: 'nova-3', providerAccountId: 'deepgram', durationMs: 200 });
    expect(h.sessions[0].session.cancel).toHaveBeenCalledOnce();
    expect(h.service.presence().state).toBe('asleep');
  });

  it('manual mute immediately stops explicit PCM even while the settings audit is unfinished', async () => {
    const h = harness(); h.setCompanion(false);
    await h.service.updateSettings({ engine: 'deepgram' });
    const input = await h.service.beginDeepgramInput();
    await h.service.feedDeepgramInput({ ...input, sequence: 0, pcmBase64: PCM.toString('base64') });
    const waiting = h.service.waitDeepgramInput(input);
    const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    const audit = deferred<void>();
    h.recordControl.mockImplementationOnce(() => audit.promise);
    const muting = h.service.updateSettings({ enabled: false });
    expect(h.sessions[0].signal.aborted).toBe(true);
    await expect(h.service.feedDeepgramInput({ ...input, sequence: 1, pcmBase64: PCM.toString('base64') })).rejects.toThrow();
    expect(h.sessions[0].session.writePcm).toHaveBeenCalledOnce();
    audit.resolve(); await muting; await rejected;
    expect((await h.service.status()).settings.enabled).toBe(false);
    expect(h.snapshots.some((snapshot) => snapshot.wakeCommand)).toBe(false);
  });

  it('rejects duplicate consumers of one explicit final transcript', async () => {
    const h = harness(); h.setCompanion(false);
    await h.service.updateSettings({ engine: 'deepgram' });
    const input = await h.service.beginDeepgramInput();
    await h.service.feedDeepgramInput({ ...input, sequence: 0, pcmBase64: PCM.toString('base64') });
    const first = h.service.waitDeepgramInput(input);
    const duplicate = expect(h.service.waitDeepgramInput(input)).rejects.toThrow();
    h.sessions[0].final.resolve('open YouTube');
    await expect(first).resolves.toMatchObject({ transcript: 'open YouTube' });
    await duplicate;
  });

  it('invalidates an overlapping pending explicit start before creating another session', async () => {
    const h = harness(); h.setCompanion(false);
    await h.service.updateSettings({ engine: 'deepgram' });
    const pending = deferred<MorpheusDeepgramRecognitionSession>();
    let olderSignal!: AbortSignal;
    h.cloud.createRecognitionSession.mockImplementationOnce(async ({ signal }) => { olderSignal = signal; return pending.promise; });
    const older = h.service.beginDeepgramInput();
    const rejected = expect(older).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(h.cloud.createRecognitionSession).toHaveBeenCalledOnce());
    const current = await h.service.beginDeepgramInput();
    expect(olderSignal.aborted).toBe(true);
    pending.resolve(h.makeSession(olderSignal));
    await rejected;
    await expect(h.service.feedDeepgramInput({ ...current, sequence: 0, pcmBase64: PCM.toString('base64') })).resolves.toEqual({ ready: true });
  });

  it('emits exact even-sized sequenced Kit PCM and publishes playback only after real playback authority', async () => {
    const h = harness(); await h.service.updateSettings({ engine: 'deepgram' }); h.snapshots.length = 0;
    const result = await h.service.synthesize({ text: 'Opened YouTube.', streamId: 'cloud-test-speech' });
    expect(result).toMatchObject({ mimeType: 'audio/pcm', audioBase64: '', modelId: 'flux-kit-en',
      pcmStream: { streamId: 'cloud-test-speech', chunkCount: 2, byteLength: 96_000 } });
    expect(h.chunks.map((chunk) => chunk.sequence)).toEqual([0, 1]);
    expect(h.chunks.every((chunk) => chunk.mimeType === 'audio/pcm' && Buffer.from(chunk.audioBase64, 'base64').length % 2 === 0)).toBe(true);
    expect(Buffer.concat(h.chunks.map((chunk) => Buffer.from(chunk.audioBase64, 'base64')))).toEqual(Buffer.alloc(96_000, 0x21));
    expect(h.snapshots.some((snapshot) => snapshot.state === 'speaking')).toBe(false);
    expect(h.service.setSpeaking(true).state).toBe('speaking');
    expect(JSON.stringify(h.recordControl.mock.calls)).not.toContain('Opened YouTube.');
  });

  it('allows a deliberate cloud sample with automatic replies off and the microphone still muted', async () => {
    const h = harness(); h.setCompanion(false);
    await h.service.updateSettings({ engine: 'deepgram', enabled: false, speakResponses: false, ambientEnabled: false });
    const before = (await h.service.status()).settings;
    const sample = await h.service.synthesize({ text: 'Morpheus is connected.' });
    expect(sample).toMatchObject({ mimeType: 'audio/wav', modelId: 'flux-kit-en', providerAccountId: 'deepgram' });
    expect(Buffer.from(sample.audioBase64, 'base64').subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(h.cloud.synthesize).toHaveBeenCalledOnce();
    expect((await h.service.status()).settings).toEqual(before);
    expect(h.service.presence().inputEnabled).toBe(false);
    expect(h.native).not.toHaveBeenCalled();
    expect(h.cloud.createRecognitionSession).not.toHaveBeenCalled();
    expect(h.cloud.transcribe).not.toHaveBeenCalled();
  });

  it('drops late PCM after cancellation even if an adapter ignores its abort signal', async () => {
    const h = harness(); await h.service.updateSettings({ engine: 'deepgram' });
    const complete = deferred<void>(); let emit!: (pcm: Buffer) => void;
    h.cloud.synthesizeStream.mockImplementationOnce(async (_text, _signal, onPcm) => { emit = onPcm; return complete.promise; });
    const speaking = h.service.synthesize({ text: 'Opened YouTube.', streamId: 'cloud-cancel-speech' });
    const rejected = expect(speaking).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(emit).toBeTypeOf('function'));
    emit(Buffer.alloc(4800)); expect(h.chunks).toHaveLength(1);
    h.service.cancelSpeech();
    expect(() => emit(Buffer.alloc(4800))).toThrow();
    expect(h.chunks).toHaveLength(1);
    complete.resolve(); await rejected;
  });
});
