// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMorpheusVoiceService } from '../../electron/services/morpheus/voice/voice-service';
import { createManagedGateway } from '../../services/managed/gateway';
import { createManagedProviderRoutes } from '../../services/managed/provider-routes';
import { ManagedLedger } from '../../services/managed/ledger';
import { createManagedClient } from '../../electron/services/morpheus/managed/managed-client';
import { createManagedRuntimeBridge, encodeManagedPcmWav } from '../../electron/services/morpheus/managed/runtime-bridge';
import type { MorpheusSpeechChunk } from '../../shared/morpheus/voice-types';

const closers: Array<() => void> = [];
afterEach(() => { for (const close of closers.splice(0).reverse()) close(); });
const payload = { mimeType: 'audio/wav' as const, durationMs: 119_000,
  audioBase64: Buffer.from(encodeManagedPcmWav(new Uint8Array(32_000), 16_000)).toString('base64') };
function setup(upstream = vi.fn<typeof fetch>(async (url) => String(url).endsWith('/transcriptions')
  ? Response.json({ text: 'Open Notepad' }) : new Response(new Uint8Array(48_000)))) {
  const dir = mkdtempSync(join(tmpdir(), 'managed-voice-')); closers.push(() => rmSync(dir, { recursive: true, force: true }));
  const ledger = new ManagedLedger(':memory:'); closers.push(() => ledger.close());
  ledger.grant({ grantId: 'trial', accountId: 'fixture', tier: 'trial', amountMicroUsd: 100_000, expiresAt: Date.now() + 60_000,
    features: ['transcription', 'speech'] });
  const gateway = createManagedGateway({ ledger, identity: { verify: async () => ({ accountId: 'fixture' }) },
    routes: createManagedProviderRoutes({ baseUrl: 'https://provider.test/v1', apiKey: 'server-secret', fetch: upstream, routes: [
      { id: 'transcription', kind: 'transcription', modelId: 'fixture-stt', rateVersion: 'rates', microUsdPerMinute: 60_000, maxDurationMs: 2_000 },
      { id: 'speech', kind: 'speech', modelId: 'fixture-tts', rateVersion: 'rates', voices: ['cedar'], supportsInstructions: true,
        pricing: { unit: 'unknown', maximumMicroUsd: 1_000 } },
    ] }) });
  const client = createManagedClient({ origin: 'https://managed.test', sessions: {
    get: async () => ({ accountId: 'fixture', accessToken: 'session-secret', expiresAt: Date.now() + 60_000 }), set: async () => {}, clear: async () => {},
  }, fetch: async (url, init) => gateway(new Request(String(url), init)) });
  const bridge = createManagedRuntimeBridge(client);
  const recordControl = vi.fn(async (_entry: { event: string; details: Record<string, unknown> }) => {});
  const healthy = vi.fn(() => true);
  const providerService = { listAccounts: vi.fn(async () => []), getAccountRuntimeApiKey: vi.fn() };
  const chunks: MorpheusSpeechChunk[] = [];
  const wakeStop = vi.fn(), startLocalWake = vi.fn(() => ({ ready: Promise.resolve(), stop: wakeStop, pushAudio: vi.fn(() => true) }));
  const service = createMorpheusVoiceService({ userDataDir: dir, providerService: providerService as never,
    audit: { recordControl, isHealthy: healthy } as never, appVersion: 'test', getManagedRuntime: () => bridge,
    emitSpeechChunk: (chunk) => chunks.push(chunk), startLocalWake });
  closers.push(() => service.dispose());
  return { dir, service, bridge, client, ledger, upstream, providerService, recordControl, healthy, chunks, wakeStop, startLocalWake };
}

describe('managed voice joined to the original Main voice owner', () => {
  it('uses actual routes/entitlements without reading personal keys or rewriting BYOK settings', async () => {
    const h = setup();
    await h.service.updateSettings({ modelId: 'saved-personal-stt', speechModelId: 'saved-personal-tts' });
    expect(await h.service.status()).toMatchObject({ captureFormat: 'pcm16-wav', speechFormat: 'pcm24',
      transcriptionAvailable: true, neuralSpeechAvailable: true, settings: { modelId: 'fixture-stt', speechModelId: 'fixture-tts' } });
    expect(JSON.parse(readFileSync(join(h.dir, 'morpheus', 'voice-settings.json'), 'utf8'))).toMatchObject({ modelId: 'saved-personal-stt', speechModelId: 'saved-personal-tts' });
    expect(h.providerService.listAccounts).not.toHaveBeenCalled(); expect(h.upstream).not.toHaveBeenCalled();
    await h.service.updateSettings({ speechVoice: 'onyx' });
    expect((await h.service.status()).neuralSpeechAvailable).toBe(false);
    const ready = await h.bridge.status();
    vi.spyOn(h.bridge, 'status').mockResolvedValue({ ...ready, account: ready.account ? { ...ready.account, features: ['speech'] } : null });
    h.client.invalidate();
    expect((await h.service.status()).transcriptionAvailable).toBe(false);
  });
  it('derives duration from bytes and records actual receipt/model without storing spoken content', async () => {
    const h = setup();
    expect(await h.service.transcribe(payload)).toMatchObject({ transcript: 'Open Notepad', durationMs: 1000, modelId: 'fixture-stt', providerAccountId: 'managed' });
    const result = await h.service.synthesize({ text: 'private spoken response', streamId: 'utterance' });
    expect(result).toMatchObject({ mimeType: 'audio/pcm', modelId: 'fixture-tts', voice: 'cedar',
      pcmStream: { streamId: 'utterance', chunkCount: h.chunks.length, byteLength: 48_000 } });
    expect(h.chunks.map((chunk) => chunk.sequence)).toEqual(h.chunks.map((_, index) => index));
    expect(h.chunks.every((chunk) => chunk.streamId === 'utterance' && chunk.mimeType === 'audio/pcm')).toBe(true);
    expect(Buffer.concat(h.chunks.map((chunk) => Buffer.from(chunk.audioBase64, 'base64'))).length).toBe(48_000);
    const records = h.recordControl.mock.calls.map(([record]) => record);
    expect(records.find((r) => r.event === 'transcription-completed')?.details).toMatchObject({ chargedMicroUsd: 1000, costStatus: 'known', modelId: 'fixture-stt' });
    expect(records.find((r) => r.event === 'speech-completed')?.details).toMatchObject({ costStatus: 'unknown', receiptState: 'uncertain', reservedMicroUsd: 1000 });
    for (const prefix of ['speech', 'transcription']) expect(records.find((r) => r.event === `${prefix}-completed`)?.details.requestId)
      .toBe(records.find((r) => r.event === `${prefix}-started`)?.details.requestId);
    expect(JSON.stringify(records)).not.toMatch(/private spoken response|Open Notepad|server-secret|session-secret/);
    expect(h.providerService.listAccounts).not.toHaveBeenCalled();
    const request = JSON.parse(String(h.upstream.mock.calls[1][1]?.body));
    expect(request.instructions).toContain('natural conversational voice');
  });
  it('keeps a managed collected PCM result usable without inventing chunk-completion metadata', async () => {
    const h = setup();
    const result = await h.service.synthesize({ text: 'Collected reply.' });
    expect(result.mimeType).toBe('audio/pcm'); expect(Buffer.from(result.audioBase64, 'base64').length).toBe(48_000);
    expect(result.pcmStream).toBeUndefined(); expect(h.chunks).toHaveLength(0);
    expect(h.providerService.getAccountRuntimeApiKey).not.toHaveBeenCalled();
  });
  it('rejects compressed/malformed/short WAV and unhealthy audit before provider work', async () => {
    const h = setup();
    await expect(h.service.transcribe({ ...payload, mimeType: 'audio/webm' })).rejects.toThrow('PCM');
    await expect(h.service.transcribe({ ...payload, audioBase64: Buffer.from('fake wav').toString('base64') })).rejects.toThrow('PCM');
    const short = Buffer.from(payload.audioBase64, 'base64').subarray(0, 44 + 3198);
    short.writeUInt32LE(short.length - 8, 4); short.writeUInt32LE(short.length - 44, 40);
    await expect(h.service.transcribe({ ...payload, audioBase64: short.toString('base64') })).rejects.toThrow('PCM');
    h.healthy.mockReturnValue(false);
    await expect(h.service.transcribe(payload)).rejects.toThrow('Audit');
    await expect(h.service.synthesize({ text: 'hello' })).rejects.toThrow('Audit');
    expect(h.upstream).not.toHaveBeenCalled();
  });
  it('never falls through to BYOK on upstream or started-audit failure', async () => {
    const h = setup(vi.fn<typeof fetch>().mockResolvedValue(new Response('private upstream detail', { status: 503 })));
    await expect(h.service.transcribe(payload)).rejects.toThrow('No personal API');
    h.recordControl.mockRejectedValueOnce(new Error('audit full'));
    await expect(h.service.synthesize({ text: 'hello' })).rejects.toThrow('audit full');
    expect(h.upstream).toHaveBeenCalledOnce(); expect(h.providerService.listAccounts).not.toHaveBeenCalled();
    expect(JSON.stringify(h.recordControl.mock.calls)).not.toContain('private upstream detail');
  });
  it('account invalidation aborts transcription and clears local wake/presence without changing preferences', async () => {
    const upstream = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('stopped')), { once: true })));
    const h = setup(upstream);
    await h.service.updateSettings({ ambientEnabled: true, localWakeEnabled: true });
    expect(h.startLocalWake).not.toHaveBeenCalled();
    const input = await h.service.prepareAmbientInput();
    await expect(h.service.feedWakeAudio({ sessionId: input.sessionId!, sequence: 0,
      pcmBase64: Buffer.alloc(6400).toString('base64') })).resolves.toEqual({ ready: true });
    expect(h.startLocalWake).toHaveBeenCalledOnce();
    expect(h.service.presence().state).toBe('armed');
    const before = readFileSync(join(h.dir, 'morpheus', 'voice-settings.json'), 'utf8');
    const request = h.service.transcribe(payload); const rejection = expect(request).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledOnce());
    h.client.invalidate(); h.service.invalidateService?.(); await rejection;
    expect(h.service.presence()).toMatchObject({ state: 'asleep', authorityRevision: 1 }); expect(h.wakeStop).toHaveBeenCalled();
    expect(readFileSync(join(h.dir, 'morpheus', 'voice-settings.json'), 'utf8')).toBe(before);
    expect(h.recordControl.mock.calls.some(([entry]) => entry.event === 'transcription-cancelled')).toBe(true);
  });
  it('stopping mid-stream drops later chunks and preserves the uncertain receipt without a resend', async () => {
    let release!: () => void; const ready = new Promise<void>((resolve) => { release = resolve; });
    const upstream = vi.fn<typeof fetch>(async (_url, init) => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(2000));
      void ready.then(() => { if (!init?.signal?.aborted) { controller.enqueue(new Uint8Array(2000)); controller.close(); } });
    } })));
    const h = setup(upstream);
    const request = h.service.synthesize({ text: 'hello', streamId: 'owned' }); const rejection = expect(request).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(h.chunks).toHaveLength(1));
    h.service.cancelSpeech(); release(); await rejection;
    expect(h.chunks).toHaveLength(1); expect(upstream).toHaveBeenCalledOnce();
    expect(h.recordControl.mock.calls.some(([entry]) => entry.event === 'speech-cancelled')).toBe(true);
  });
  it('serializes ambient startup and prevents resurrection if service changes during preflight', async () => {
    const h = setup();
    await h.service.updateSettings({ ambientEnabled: true, localWakeEnabled: true });
    await h.service.endAmbientSession(); h.startLocalWake.mockClear();
    h.client.invalidate();
    let release!: () => void; const wait = new Promise<void>((resolve) => { release = resolve; });
    const original = h.bridge.capabilities;
    vi.spyOn(h.bridge, 'capabilities').mockImplementation(async () => { await wait; return original(); });
    const first = h.service.beginAmbientSession(), second = h.service.beginAmbientSession();
    const check = Promise.all([expect(first).rejects.toThrow('changed'), expect(second).rejects.toThrow('changed')]);
    h.service.invalidateService?.(); release(); await check;
    expect(h.startLocalWake).not.toHaveBeenCalled(); expect(h.service.presence().state).toBe('asleep');
  });
});
