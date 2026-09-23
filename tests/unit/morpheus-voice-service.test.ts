import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createMorpheusVoiceService,
  validateAndDecodeMorpheusAudio,
  validateMorpheusVoiceSettings,
} from '../../electron/services/morpheus/voice/voice-service';
import type { ProviderAccount } from '../../electron/shared/providers/types';
import * as voiceStorage from '../../electron/services/morpheus/storage/atomic-json';

const ACCOUNT: ProviderAccount = {
  id: 'voice-openai',
  vendorId: 'openai',
  label: 'OpenAI Voice',
  authMode: 'api_key',
  baseUrl: 'https://api.example.test/v1',
  apiProtocol: 'openai-completions',
  enabled: true,
  isDefault: true,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
};

const OPENROUTER_ACCOUNT: ProviderAccount = {
  ...ACCOUNT,
  id: 'voice-openrouter',
  vendorId: 'openrouter',
  label: 'OpenRouter Voice',
  baseUrl: undefined,
  isDefault: true,
};

const AUDIO_BYTES = Buffer.from('ephemeral-morpheus-voice');
const PAYLOAD = {
  audioBase64: AUDIO_BYTES.toString('base64'),
  mimeType: 'audio/webm;codecs=opus' as const,
  durationMs: 1_250,
};

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function createHarness(options?: {
  accounts?: ProviderAccount[];
  apiKey?: string | null;
  healthy?: boolean;
  fetchImpl?: typeof fetch;
  transcriptionTimeoutMs?: number;
  speechTimeoutMs?: number;
  personality?: 'adaptive' | 'witty' | 'warm' | 'concise';
  startLocalWake?: Parameters<typeof createMorpheusVoiceService>[0]['startLocalWake'];
  emitSpeechChunk?: Parameters<typeof createMorpheusVoiceService>[0]['emitSpeechChunk'];
}) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'morpheus-voice-'));
  temporaryDirectories.push(userDataDir);
  const auditOrder: string[] = [];
  const presenceEvents: string[] = [];
  const recordControl = vi.fn(async (entry: { event: string }) => {
    auditOrder.push(`audit:${entry.event}`);
  });
  const providerService = {
    listAccounts: vi.fn(async () => options?.accounts ?? [ACCOUNT]),
    getAccountRuntimeApiKey: vi.fn(async () => options?.apiKey === undefined ? 'sk-voice-secret' : options.apiKey),
  };
  const fetchImpl = options?.fetchImpl ?? vi.fn(async () => {
    auditOrder.push('network');
    return new Response(JSON.stringify({ text: 'Open Notepad' }), { status: 200 });
  }) as typeof fetch;
  const service = createMorpheusVoiceService({
    userDataDir,
    providerService: providerService as never,
    audit: {
      recordControl,
      isHealthy: vi.fn(() => options?.healthy ?? true),
    } as never,
    appVersion: '1.0.0',
    fetchImpl,
    transcriptionTimeoutMs: options?.transcriptionTimeoutMs,
    speechTimeoutMs: options?.speechTimeoutMs,
    getPersonality: () => options?.personality ?? 'adaptive',
    startLocalWake: options?.startLocalWake,
    emitSpeechChunk: options?.emitSpeechChunk,
    emitPresence: (presence) => {
      presenceEvents.push(presence.state);
      auditOrder.push(`emit:${presence.state}`);
    },
  });
  return { userDataDir, service, providerService, fetchImpl, recordControl, auditOrder, presenceEvents };
}

describe('Morpheus voice service', () => {
  it('uses one OpenRouter account for compatible transcription and speech presets', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, _init?: RequestInit) => {
      if (String(input).endsWith('/audio/transcriptions')) {
        return new Response(JSON.stringify({ text: 'Open the project' }), { status: 200 });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    }) as typeof fetch;
    const h = createHarness({ accounts: [OPENROUTER_ACCOUNT], fetchImpl });
    const status = await h.service.updateSettings({
      providerAccountId: OPENROUTER_ACCOUNT.id,
      modelId: 'openai/whisper-large-v3-turbo',
      speechProviderAccountId: OPENROUTER_ACCOUNT.id,
      speechModelId: 'hexgrad/kokoro-82m',
      speechVoice: 'am_onyx',
    });

    expect(status.providers).toEqual([expect.objectContaining({
      accountId: OPENROUTER_ACCOUNT.id,
      vendorId: 'openrouter',
      configured: true,
    })]);
    await expect(h.service.transcribe(PAYLOAD)).resolves.toMatchObject({
      modelId: 'openai/whisper-large-v3-turbo',
    });
    await expect(h.service.synthesize({ text: 'Done.' })).resolves.toMatchObject({
      modelId: 'hexgrad/kokoro-82m',
      voice: 'am_onyx',
    });
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
    expect(String(fetchImpl.mock.calls[1][0])).toBe('https://openrouter.ai/api/v1/audio/speech');
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toMatchObject({
      model: 'hexgrad/kokoro-82m', voice: 'am_onyx', response_format: 'mp3',
    });
  });
  it('delivers ordered speech chunks after start audit and before the full response completes', async () => {
    let output!: ReadableStreamDefaultController<Uint8Array>;
    const chunks = vi.fn();
    const h = createHarness({
      fetchImpl: vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(c) { output = c; } }))),
      emitSpeechChunk: chunks,
    });
    const streamId = '12345678-1234-1234-1234-123456789abc';
    const pending = h.service.synthesize({ text: 'A private spoken result.', streamId });
    await vi.waitFor(() => expect(output).toBeDefined());
    output.enqueue(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() => expect(chunks).toHaveBeenCalledOnce());
    expect(h.auditOrder).toContain('audit:speech-started');
    expect(h.auditOrder).not.toContain('audit:speech-completed');
    expect(chunks).toHaveBeenCalledWith({ streamId, sequence: 0, audioBase64: 'AQID' });
    output.enqueue(new Uint8Array([4, 5])); output.close();
    await expect(pending).resolves.toMatchObject({ audioBase64: 'AQIDBAU=' });
    expect(chunks.mock.calls[1][0].sequence).toBe(1);
    expect(JSON.stringify(h.recordControl.mock.calls)).not.toContain('A private spoken result');
  });
  it('admits one local-wake recording only after the audited native event', async () => {
    let wake!: () => void;
    const stop = vi.fn();
    const startLocalWake = vi.fn((options: { onWake(): void }) => {
      wake = options.onWake;
      return { ready: Promise.resolve(), stop };
    });
    const h = createHarness({ startLocalWake });
    await h.service.updateSettings({ localWakeEnabled: true, ambientEnabled: true });
    expect(startLocalWake).toHaveBeenCalledOnce();
    await expect(h.service.setAmbientListening(true)).rejects.toThrow('wake phrase');
    await expect(h.service.transcribeAmbient(PAYLOAD)).rejects.toThrow('wake phrase');
    expect(h.fetchImpl).not.toHaveBeenCalled();
    wake();
    await vi.waitFor(() => expect(h.service.presence().wakeSequence).toBe(1));
    expect(h.auditOrder.indexOf('audit:local-wake-detected')).toBeGreaterThan(-1);
    expect(h.service.presence()).toMatchObject({ conversationTurn: 1 });
    expect(Date.parse(h.service.presence().followUpUntil ?? '')).toBeGreaterThan(Date.now());
    expect(h.auditOrder.indexOf('audit:conversation-started')).toBeLessThan(h.auditOrder.lastIndexOf('emit:armed'));
    expect(h.auditOrder.at(-1)).toBe('emit:armed');
    await h.service.setAmbientListening(true);
    await expect(h.service.setAmbientListening(true)).rejects.toThrow('wake phrase');
    await h.service.setAmbientListening(false);
    await expect(h.service.transcribeAmbient(PAYLOAD)).resolves.toMatchObject({ transcript: 'Open Notepad' });
    await expect(h.service.transcribeAmbient(PAYLOAD)).rejects.toThrow('wake phrase');
    await h.service.endAmbientSession();
    expect(stop).toHaveBeenCalledOnce();
    wake();
    await Promise.resolve();
    expect(h.service.presence().state).toBe('asleep');
  });

  it('accepts a new wake during task work and keeps the old result from closing the new listening turn', async () => {
    let wake!: () => void;
    const h = createHarness({ startLocalWake: ({ onWake }) => { wake = onWake; return { ready: Promise.resolve(), stop: vi.fn() }; } });
    await h.service.updateSettings({ localWakeEnabled: true, ambientEnabled: true });
    h.service.observeObjective({ objectiveRunId: 'old-task', state: 'understanding', run: { origin: { type: 'voice' } } } as never);
    h.service.observeObjective({ objectiveRunId: 'old-task', state: 'executing', run: { origin: { type: 'voice' } } } as never);
    expect(h.service.presence().state).toBe('working');
    wake();
    await vi.waitFor(() => expect(h.service.presence().wakeSequence).toBe(1));
    h.service.observeObjective({ objectiveRunId: 'old-task', state: 'complete', run: { origin: { type: 'voice' } } } as never);
    expect(h.service.presence().state).toBe('armed');
    await h.service.setAmbientListening(true);
    h.service.observeObjective({ objectiveRunId: 'old-task', state: 'observing', run: { origin: { type: 'voice' } } } as never);
    expect(h.service.presence().state).toBe('listening');
    h.service.dispose();
  });

  it('uses an audited local wake to interrupt speech only when barge-in is enabled', async () => {
    let wake!: () => void;
    const h = createHarness({ startLocalWake: ({ onWake }) => {
      wake = onWake;
      return { ready: Promise.resolve(), stop: vi.fn() };
    } });
    await h.service.updateSettings({ localWakeEnabled: true, ambientEnabled: true, bargeIn: false });
    h.service.setSpeaking(true);
    wake();
    await Promise.resolve();
    expect(h.service.presence().wakeSequence).toBeUndefined();
    expect(h.service.presence().state).toBe('speaking');

    await h.service.updateSettings({ bargeIn: true });
    h.service.setSpeaking(true);
    wake();
    await vi.waitFor(() => expect(h.service.presence().wakeSequence).toBe(1));
    expect(h.service.presence()).toMatchObject({ state: 'armed', conversationTurn: 1 });
    expect(h.auditOrder.indexOf('audit:local-wake-detected')).toBeLessThan(h.auditOrder.lastIndexOf('emit:armed'));
    h.service.dispose();
  });

  it('opens one audited hands-free follow-up after a spoken voice result', async () => {
    const h = createHarness();
    await h.service.updateSettings({ ambientEnabled: true, localWakeEnabled: false });
    h.service.observeObjective({
      state: 'complete',
      run: { origin: { type: 'voice' } },
    } as never);

    expect(h.service.presence().followUpUntil).toBeUndefined();
    h.service.setSpeaking(true);
    h.service.setSpeaking(false);

    await vi.waitFor(() => expect(h.service.presence().followUpUntil).toBeDefined());
    expect(h.service.presence()).toMatchObject({ state: 'armed', conversationTurn: 1 });
    const auditIndex = h.auditOrder.lastIndexOf('audit:follow-up-opened');
    const emitIndex = h.auditOrder.lastIndexOf('emit:armed');
    expect(auditIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeLessThan(emitIndex);
    expect(h.recordControl).toHaveBeenCalledWith(expect.objectContaining({
      category: 'voice', event: 'follow-up-opened',
      details: expect.objectContaining({ turn: 1 }),
    }));
    h.service.dispose();
  });

  it('does not fall back to cloud monitoring when native wake startup fails', async () => {
    const h = createHarness({ startLocalWake: () => ({
      ready: Promise.reject(new Error('recognizer unavailable')), stop: vi.fn(),
    }) });
    await expect(h.service.updateSettings({ localWakeEnabled: true, ambientEnabled: true }))
      .rejects.toThrow('recognizer unavailable');
    expect(h.service.presence().state).toBe('error');
    await expect(h.service.transcribeAmbient(PAYLOAD)).rejects.toThrow('not armed');
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });
  it('preserves in-memory settings when the atomic disk write fails', async () => {
    const harness = createHarness();
    const before = (await harness.service.status()).settings;
    vi.spyOn(voiceStorage, 'writeJsonAtomically').mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    await expect(harness.service.updateSettings({ speechVoice: 'coral' })).rejects.toThrow('disk unavailable');
    expect((await harness.service.status()).settings).toEqual(before);
  });
  it('cancels preflight before sending speech to the provider', async () => {
    const harness = createHarness();
    const request = harness.service.synthesize({ text: 'Do not send this.' });
    harness.service.cancelSpeech();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.fetchImpl).not.toHaveBeenCalled();
  });

  it('aborts an in-flight speech request and audits cancellation without text', async () => {
    let signal: AbortSignal | null | undefined;
    const harness = createHarness({ fetchImpl: vi.fn(async (_url, init) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason)));
    }) });
    const request = harness.service.synthesize({ text: 'A private spoken result.' });
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(signal).toBeDefined());
    harness.service.cancelSpeech();
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(harness.recordControl).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'speech-cancelled' }));
    expect(JSON.stringify(harness.recordControl.mock.calls)).not.toContain('private spoken');
  });
  it('reports a truthful unavailable state without a compatible configured provider', async () => {
    const harness = createHarness({ accounts: [] });
    await expect(harness.service.status()).resolves.toMatchObject({
      transcriptionAvailable: false,
      providers: [],
      reason: expect.stringContaining('Configure'),
    });
    expect(harness.providerService.getAccountRuntimeApiKey).not.toHaveBeenCalled();
  });

  it('does not persist ambient capture when no compatible provider can arm it', async () => {
    const harness = createHarness({ accounts: [] });
    await expect(harness.service.updateSettings({ ambientEnabled: true })).rejects.toThrow(/No compatible/);

    const status = await harness.service.status();
    expect(status.settings.ambientEnabled).toBe(false);
    expect(status.presence).toMatchObject({ state: 'asleep', ambientEnabled: false });
    expect(existsSync(join(harness.userDataDir, 'morpheus', 'voice-settings.json'))).toBe(false);
    expect(harness.recordControl).not.toHaveBeenCalled();
  });

  it('returns safe provider choices without returning any credential material', async () => {
    const harness = createHarness();
    const status = await harness.service.status();
    expect(status.providers).toEqual([{
      accountId: ACCOUNT.id,
      vendorId: ACCOUNT.vendorId,
      label: ACCOUNT.label,
      isDefault: true,
      configured: true,
    }]);
    expect(JSON.stringify(status)).not.toContain('sk-voice-secret');
  });

  it('audits metadata before provider disclosure and never audits audio, transcript or credentials', async () => {
    const harness = createHarness();
    const result = await harness.service.transcribe(PAYLOAD);

    expect(result).toMatchObject({
      transcript: 'Open Notepad',
      providerAccountId: ACCOUNT.id,
      modelId: 'whisper-1',
      durationMs: PAYLOAD.durationMs,
    });
    expect(result.providerLatencyMs).toEqual(expect.any(Number));
    expect(harness.auditOrder).toEqual([
      'audit:transcription-started',
      'network',
      'audit:transcription-completed',
    ]);
    const serializedAudit = JSON.stringify(harness.recordControl.mock.calls);
    expect(serializedAudit).not.toContain(PAYLOAD.audioBase64);
    expect(serializedAudit).not.toContain('Open Notepad');
    expect(serializedAudit).not.toContain('sk-voice-secret');

    const [url, init] = (harness.fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe('https://api.example.test/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.headers.authorization).toBe('Bearer sk-voice-secret');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('turns provider timeout into a safe retryable failure without auditing content', async () => {
    const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    })) as typeof fetch;
    const harness = createHarness({ fetchImpl, transcriptionTimeoutMs: 5 });

    await expect(harness.service.transcribe(PAYLOAD)).rejects.toThrow(/timed out after 1 seconds/);
    expect(harness.recordControl).toHaveBeenCalledWith(expect.objectContaining({
      category: 'voice', event: 'transcription-failed',
    }));
    const serializedAudit = JSON.stringify(harness.recordControl.mock.calls);
    expect(serializedAudit).not.toContain(PAYLOAD.audioBase64);
    expect(serializedAudit).not.toContain('Open Notepad');
  });

  it('blocks external disclosure while audit persistence is unhealthy', async () => {
    const harness = createHarness({ healthy: false });
    await expect(harness.service.transcribe(PAYLOAD)).rejects.toThrow(/Audit is unavailable/);
    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.recordControl).not.toHaveBeenCalled();
  });

  it('rejects malformed or oversized audio before provider or audit work', async () => {
    const harness = createHarness();
    await expect(harness.service.transcribe({ ...PAYLOAD, audioBase64: '%%%=' })).rejects.toThrow(/malformed/);
    expect(() => validateAndDecodeMorpheusAudio({
      ...PAYLOAD,
      audioBase64: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64'),
    })).toThrow(/malformed or too large|empty or too large/);
    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.recordControl).not.toHaveBeenCalled();
  });

  it('rejects insecure remote transcription endpoints', async () => {
    const harness = createHarness({ accounts: [{ ...ACCOUNT, baseUrl: 'http://api.example.test/v1' }] });
    await expect(harness.service.transcribe(PAYLOAD)).rejects.toThrow(/must use HTTPS/);
    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.recordControl).not.toHaveBeenCalled();
  });

  it('persists validated settings atomically only after their audit record succeeds', async () => {
    const harness = createHarness();
    const status = await harness.service.updateSettings({
      speakResponses: false,
      autoSubmitTranscript: true,
      modelId: 'gpt-4o-mini-transcribe',
    });
    expect(status.settings).toMatchObject({
      speakResponses: false,
      autoSubmitTranscript: true,
      modelId: 'gpt-4o-mini-transcribe',
    });
    const settingsPath = join(harness.userDataDir, 'morpheus', 'voice-settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toMatchObject({
      v: 4,
      speakResponses: false,
      autoSubmitTranscript: true,
      ambientEnabled: false,
    });
    expect(harness.recordControl).toHaveBeenCalledWith(expect.objectContaining({
      category: 'voice',
      event: 'settings-updated',
    }));
  });

  it('migrates prior push-to-talk settings without enabling ambient disclosure', () => {
    expect(validateMorpheusVoiceSettings({
      v: 1,
      enabled: true,
      providerAccountId: null,
      modelId: 'whisper-1',
      speakResponses: true,
      autoSubmitTranscript: true,
    })).toMatchObject({
      v: 4,
      ambientEnabled: false,
      wakePhrase: 'Morpheus',
      speechProviderAccountId: null,
      speechModelId: 'gpt-4o-mini-tts',
      speechVoice: 'cedar',
      handsFreeFollowUp: true,
    });
  });

  it('generates ephemeral neural speech through a fixed Main-owned endpoint without auditing text or audio', async () => {
    const audio = Buffer.from('provider-generated-mp3');
    const fetchImpl = vi.fn(async () => new Response(audio, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg', 'content-length': String(audio.length) },
    })) as typeof fetch;
    const harness = createHarness({ fetchImpl, personality: 'witty' });

    const result = await harness.service.synthesize({ text: 'Mission complete. That was almost suspiciously easy.' });

    expect(result).toMatchObject({
      audioBase64: audio.toString('base64'),
      mimeType: 'audio/mpeg',
      providerAccountId: ACCOUNT.id,
      modelId: 'gpt-4o-mini-tts',
      voice: 'cedar',
    });
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe('https://api.example.test/v1/audio/speech');
    expect(init.redirect).toBe('error');
    expect(init.headers.authorization).toBe('Bearer sk-voice-secret');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gpt-4o-mini-tts', voice: 'cedar', response_format: 'mp3',
      instructions: expect.stringContaining('subtle dry wit'),
    });
    expect(harness.auditOrder).toEqual(['audit:speech-started', 'emit:preparing-speech', 'audit:speech-completed', 'emit:asleep']);
    const serializedAudit = JSON.stringify(harness.recordControl.mock.calls);
    expect(serializedAudit).not.toContain('Mission complete');
    expect(serializedAudit).not.toContain(audio.toString('base64'));
    expect(serializedAudit).not.toContain('sk-voice-secret');
  });

  it('blocks neural speech before network disclosure when Audit is unavailable', async () => {
    const harness = createHarness({ healthy: false });
    await expect(harness.service.synthesize({ text: 'Do not disclose me.' })).rejects.toThrow(/Audit is unavailable/);
    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.recordControl).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'authentication'], [403, 'access'], [429, 'rate-limit'],
    [404, 'endpoint'], [500, 'unavailable'],
  ] as const)('projects safe speech failure for HTTP %s, then clears on success', async (status, kind) => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('secret provider body', { status }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    const harness = createHarness({ fetchImpl });
    await expect(harness.service.synthesize({ text: 'Hello' })).rejects.toThrow(`HTTP ${status}`);
    expect(harness.service.presence().speechFailure).toBe(kind);
    expect((await harness.service.status()).presence.speechFailure).toBe(kind);
    expect(harness.service.setSpeaking(true).speechFailure).toBe(kind);
    expect(harness.auditOrder.indexOf('audit:speech-failed')).toBeLessThan(harness.auditOrder.indexOf('emit:asleep'));
    expect(JSON.stringify(harness.recordControl.mock.calls)).not.toContain('secret provider body');
    expect(JSON.stringify(harness.service.presence())).not.toContain('sk-voice-secret');
    await harness.service.synthesize({ text: 'Try again' });
    expect(harness.service.presence().speechFailure).toBeUndefined();
  });

  it('audits ambient session and capture transitions before presence emission', async () => {
    const harness = createHarness();
    await harness.service.updateSettings({ ambientEnabled: true, wakePhrase: 'Hey Morpheus' });
    await harness.service.setAmbientListening(true);
    await harness.service.setAmbientListening(false);
    await harness.service.transcribeAmbient(PAYLOAD);
    await harness.service.endAmbientSession();

    expect(harness.presenceEvents).toEqual(['armed', 'listening', 'armed', 'transcribing', 'armed', 'asleep']);
    expect(harness.auditOrder).toEqual([
      'audit:settings-updated',
      'audit:ambient-session-started', 'emit:armed',
      'audit:ambient-capture-started', 'emit:listening',
      'audit:ambient-capture-ended', 'emit:armed',
      'audit:transcription-started', 'emit:transcribing',
      'network', 'audit:transcription-completed', 'emit:armed',
      'audit:ambient-session-ended', 'emit:asleep',
    ]);
    expect(JSON.stringify(harness.recordControl.mock.calls)).not.toContain('Hey Morpheus');
    expect(JSON.stringify(harness.recordControl.mock.calls)).not.toContain('Open Notepad');
  });
});
