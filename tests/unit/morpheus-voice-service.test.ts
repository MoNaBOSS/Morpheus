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
    emitPresence: (presence) => {
      presenceEvents.push(presence.state);
      auditOrder.push(`emit:${presence.state}`);
    },
  });
  return { userDataDir, service, providerService, fetchImpl, recordControl, auditOrder, presenceEvents };
}

describe('Morpheus voice service', () => {
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
      v: 2,
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
      v: 2,
      ambientEnabled: false,
      wakePhrase: 'Morpheus',
    });
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
