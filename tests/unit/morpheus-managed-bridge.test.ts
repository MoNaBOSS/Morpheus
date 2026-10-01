// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManagedGateway } from '../../services/managed/gateway';
import { createManagedProviderRoutes, type ManagedProviderRouteConfig } from '../../services/managed/provider-routes';
import { ManagedLedger } from '../../services/managed/ledger';
import { createManagedClient } from '../../electron/services/morpheus/managed/managed-client';
import { createManagedRuntimeBridge } from '../../electron/services/morpheus/managed/runtime-bridge';
import type { ManagedSessionStore } from '../../electron/services/morpheus/managed/session-store';
import type { ManagedSession } from '../../shared/morpheus/managed-types';

const configs: ManagedProviderRouteConfig[] = [
  { id: 'planning', kind: 'text', modelId: 'fixture-text', rateVersion: 'fixture-rates', maxInputTokens: 2_048, maxOutputTokens: 128, inputMicroUsdPerMillionTokens: 1_000_000, outputMicroUsdPerMillionTokens: 1_000_000 },
  { id: 'conversation', kind: 'text', modelId: 'fixture-text', rateVersion: 'fixture-rates', maxInputTokens: 2_048, maxOutputTokens: 128, inputMicroUsdPerMillionTokens: 1_000_000, outputMicroUsdPerMillionTokens: 1_000_000 },
  { id: 'transcription', kind: 'transcription', modelId: 'fixture-stt', rateVersion: 'fixture-rates', microUsdPerMinute: 60_000, maxDurationMs: 2_000 },
  { id: 'speech', kind: 'speech', modelId: 'fixture-tts', rateVersion: 'fixture-rates', voices: ['fixture-voice'], supportsInstructions: true, pricing: { unit: 'unknown', maximumMicroUsd: 1_000 } },
];
const closers: Array<() => void> = [];
afterEach(() => { for (const close of closers.splice(0)) close(); });
function setup(upstream: typeof fetch) {
  const ledger = new ManagedLedger(':memory:'); closers.push(() => ledger.close());
  ledger.grant({ grantId: 'fixture-trial', accountId: 'fixture-account', tier: 'trial', amountMicroUsd: 100_000, expiresAt: Date.now() + 60_000, features: ['planning', 'conversation', 'transcription', 'speech'] });
  let session: ManagedSession | null = { accountId: 'fixture-account', accessToken: 'private-session-token', expiresAt: Date.now() + 60_000 };
  const sessions: ManagedSessionStore = { get: async () => session, set: async (next) => { session = next; }, clear: async () => { session = null; } };
  const gateway = createManagedGateway({ ledger, identity: { async verify(token) { if (token !== 'private-session-token') throw new Error('invalid'); return { accountId: 'fixture-account' }; } },
    routes: createManagedProviderRoutes({ baseUrl: 'https://provider.test/v1', apiKey: 'server-only-secret', routes: configs, fetch: upstream }) });
  const fetcher = vi.fn<typeof fetch>(async (url, init) => gateway(new Request(String(url), init)));
  const client = createManagedClient({ origin: 'https://managed.test', sessions, fetch: fetcher });
  return { ledger, bridge: createManagedRuntimeBridge(client), client, fetcher };
}
const textOutput = () => Response.json({ choices: [{ message: { content: '{"steps":[]}' } }], usage: { prompt_tokens: 20, completion_tokens: 10 } });

describe('managed Main bridge through the actual authenticated gateway', () => {
  it('reserves/dispatches before provider work and correlates text, PCM transcription and streamed voice receipts', async () => {
    const upstream = vi.fn<typeof fetch>(async (url) => {
      const route = String(url).endsWith('/chat/completions') ? 'text-request' : String(url).endsWith('/audio/transcriptions') ? 'stt-request' : 'speech-request';
      expect(state.ledger.receipt('fixture-account', route)?.state).toBe('dispatched');
      if (route === 'text-request') return textOutput();
      if (route === 'stt-request') return Response.json({ text: 'Open Notepad' });
      return new Response(new Uint8Array(48_000));
    });
    const state = setup(upstream);
    const text = await state.bridge.text({ requestId: 'text-request', objectiveId: 'task-1', turnId: 'turn-1', workerRunId: 'worker-1', kind: 'planning', messages: [{ role: 'user', content: 'Open Notepad' }] });
    expect(text.receipt).toMatchObject({ state: 'settled', chargedMicroUsd: 30, objectiveId: 'task-1', turnId: 'turn-1', workerRunId: 'worker-1' });
    const stt = await state.bridge.transcribePcm({ requestId: 'stt-request', turnId: 'turn-1', pcm: new Uint8Array(32_000), sampleRate: 16_000 });
    expect(stt).toMatchObject({ output: { transcript: 'Open Notepad', durationMs: 1_000 }, receipt: { chargedMicroUsd: 1_000 } });
    const chunks: Uint8Array[] = [];
    const voice = await state.bridge.synthesize({ requestId: 'speech-request', speechId: 'speech-1', text: 'Notepad is open.' }, (chunk) => { chunks.push(chunk); });
    expect(chunks.reduce((sum, chunk) => sum + chunk.length, 0)).toBe(48_000);
    expect(voice).toMatchObject({ output: { mimeType: 'audio/pcm', sampleRate: 24_000 }, receipt: { state: 'uncertain', chargedMicroUsd: null, speechId: 'speech-1' } });
    expect(state.ledger.status('fixture-account').allowance).toMatchObject({ spent: 1_030, reserved: 1_000 });
    expect(JSON.stringify({ text, stt, voice })).not.toContain('server-only-secret');
    expect((await state.bridge.capabilities()).routes).toHaveLength(4);
  });
  it('a duplicate settled text request has a receipt but never repeats work to recreate its lost output', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(textOutput()); const { bridge } = setup(upstream);
    const input = { requestId: 'same', kind: 'conversation' as const, messages: [{ role: 'user' as const, content: 'hello' }] };
    await bridge.text(input); await expect(bridge.text(input)).rejects.toThrow();
    expect(upstream).toHaveBeenCalledOnce(); expect((await bridge.receipt('same')).state).toBe('settled');
  });
  it('mid-stream cancellation discards later audio and keeps dispatched speech reserved', async () => {
    let finish!: () => void; const upstreamDone = new Promise<void>((resolve) => { finish = resolve; });
    const upstream = vi.fn<typeof fetch>(async (_url, init) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2_000));
        void upstreamDone.then(() => { if (!init!.signal?.aborted) { controller.enqueue(new Uint8Array(2_000)); controller.close(); } });
      },
    })));
    const { bridge, ledger } = setup(upstream); const controller = new AbortController(); const audio = vi.fn(() => { controller.abort(); finish(); });
    await expect(bridge.synthesize({ requestId: 'cancelled', text: 'hello' }, audio, controller.signal)).rejects.toThrow();
    expect(audio).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(ledger.receipt('fixture-account', 'cancelled')?.state).toBe('uncertain'));
    expect(ledger.status('fixture-account').allowance.reserved).toBe(1_000); expect(upstream).toHaveBeenCalledOnce();
  });
  it('sign-out invalidates active voice before another chunk can publish', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(60_000)));
    const { client, bridge, ledger } = setup(upstream); const audio = vi.fn(async () => { await client.signOut(); });
    await expect(bridge.synthesize({ requestId: 'signed-out', text: 'hello' }, audio)).rejects.toThrow();
    expect(audio).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(ledger.receipt('fixture-account', 'signed-out')?.state).toBe('uncertain'));
  });
  it('rejects STT with fake compressed duration before provider work and does not silently spend BYOK', async () => {
    const upstream = vi.fn<typeof fetch>(); const { bridge, ledger } = setup(upstream);
    await expect(bridge.transcribe({ requestId: 'invalid', mimeType: 'audio/wav', audioBase64: Buffer.from('not a wav').toString('base64') })).rejects.toThrow();
    expect(upstream).not.toHaveBeenCalled(); expect(ledger.status('fixture-account').allowance.reserved).toBe(0);
    await expect(bridge.text({ requestId: 'complex', kind: 'planning', complex: true, messages: [{ role: 'user', content: 'hello' }] })).rejects.toThrow('Managed request failed (403)');
    expect(upstream).not.toHaveBeenCalled();
  });
});
