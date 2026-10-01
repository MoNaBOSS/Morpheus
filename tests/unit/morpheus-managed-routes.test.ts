// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManagedProviderRoutes, configuredManagedProviderRoutes, inspectManagedPcmWav, type ManagedProviderRouteConfig } from '../../services/managed/provider-routes';
import { encodeManagedPcmWav } from '../../electron/services/morpheus/managed/runtime-bridge';

const text: ManagedProviderRouteConfig = { id: 'planning', kind: 'text', modelId: 'fixture-fixed-model', rateVersion: 'fixture-rates-v1',
  maxInputTokens: 2_048, maxOutputTokens: 128, inputMicroUsdPerMillionTokens: 1_000_000, outputMicroUsdPerMillionTokens: 2_000_000 };
const transcription: ManagedProviderRouteConfig = { id: 'transcription', kind: 'transcription', modelId: 'fixture-stt', rateVersion: 'fixture-rates-v1', microUsdPerMinute: 60_000, maxDurationMs: 2_000 };
const speech: ManagedProviderRouteConfig = { id: 'speech', kind: 'speech', modelId: 'fixture-tts', rateVersion: 'fixture-rates-v1', voices: ['fixture-voice'], supportsInstructions: true, pricing: { unit: 'unknown', maximumMicroUsd: 100 } };
const context = () => ({ requestId: 'account-scoped-id', signal: new AbortController().signal });
const create = (configs: ManagedProviderRouteConfig[], fetcher: typeof fetch) => createManagedProviderRoutes({ baseUrl: 'https://provider.test/v1', apiKey: 'server-private-provider-key', routes: configs, fetch: fetcher });

describe('configured managed provider routes', () => {
  it('does not invent absent routes, credentials or prices and rejects partial configuration', () => {
    expect(configuredManagedProviderRoutes({}).size).toBe(0);
    expect(() => configuredManagedProviderRoutes({ MORPHEUS_INFERENCE_BASE_URL: 'https://provider.test/v1' })).toThrow('incomplete_provider_configuration');
    expect(() => create([text, text], vi.fn())).toThrow('duplicate_provider_route');
    expect(() => createManagedProviderRoutes({ baseUrl: 'http://provider.test/v1', apiKey: 'private', routes: [text] })).toThrow('invalid_provider_configuration');
  });
  it('pins server model and token maxima with one upstream dispatch and rate provenance', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"steps":[]}' } }], usage: { prompt_tokens: 50, completion_tokens: 10 } }));
    const route = create([text], fetcher).get('planning')!;
    expect(() => route.parse({ messages: [{ role: 'user', content: 'hello' }], model: 'evil-model' })).toThrow();
    expect(() => route.parse({ messages: [{ role: 'user', content: 'x'.repeat(2_000) }] })).toThrow('route_input_limit');
    const input = route.parse({ messages: [{ role: 'user', content: 'hello' }], maxOutputTokens: 64 });
    expect(route.quote(input)).toEqual({ maximumMicroUsd: 2_176, rateVersion: 'fixture-rates-v1' });
    const result = await route.execute(input, context());
    expect(result).toMatchObject({ output: { text: '{"steps":[]}', modelId: 'fixture-fixed-model', usage: { inputTokens: 50, outputTokens: 10 } }, costMicroUsd: 70, costEvidence: 'rate-estimate' });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://provider.test/v1/chat/completions');
    expect(JSON.parse(init!.body as string)).toEqual({ model: 'fixture-fixed-model', messages: [{ role: 'user', content: 'hello' }], max_completion_tokens: 64, stream: false });
    expect(init).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer server-private-provider-key', 'Idempotency-Key': 'account-scoped-id' } });
    expect(JSON.stringify(result)).not.toContain('server-private-provider-key');
  });
  it('leaves missing text usage unknown rather than pretending successful output was free', async () => {
    const route = create([text], vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: 'done' } }] }))).get('planning')!;
    expect(await route.execute({ messages: [{ role: 'user', content: 'hello' }] }, context())).toMatchObject({ costMicroUsd: null, costEvidence: null });
  });
  it('derives transcription duration from checked PCM samples and rejects forged/compressed metadata', async () => {
    const wav = Buffer.from(encodeManagedPcmWav(new Uint8Array(32_000), 16_000));
    expect(inspectManagedPcmWav(wav)).toEqual({ sampleRate: 16_000, durationMs: 1_000 });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ text: 'Open Notepad' }));
    const route = create([transcription], fetcher).get('transcription')!;
    const input = { audioBase64: wav.toString('base64'), mimeType: 'audio/wav' };
    expect(() => route.parse({ ...input, durationMs: 1 })).toThrow();
    expect(() => route.parse({ ...input, mimeType: 'audio/webm' })).toThrow();
    const forged = Buffer.from(wav); forged.writeUInt32LE(1, 40);
    expect(() => route.parse({ ...input, audioBase64: forged.toString('base64') })).toThrow('invalid_pcm_audio');
    expect(route.quote(input)).toEqual({ maximumMicroUsd: 1_000, rateVersion: 'fixture-rates-v1' });
    expect(await route.execute(input, context())).toEqual({ output: { transcript: 'Open Notepad', modelId: 'fixture-stt', durationMs: 1_000 }, costMicroUsd: 1_000, costEvidence: 'rate-estimate' });
    const form = fetcher.mock.calls[0][1]!.body as FormData;
    expect(form.get('model')).toBe('fixture-stt'); expect((form.get('file') as Blob).size).toBe(32_044);
  });
  it('streams bounded actual PCM bytes and keeps non-reported speech charges held', async () => {
    const pcm = new Uint8Array(30_000);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(pcm));
    const route = create([speech], fetcher).get('speech')!; const chunks: Uint8Array[] = [];
    expect(() => route.parse({ text: 'hello', voice: 'invented' })).toThrow('voice_unavailable');
    const result = await route.execute({ text: 'hello', voice: 'fixture-voice', instructions: 'Speak naturally.' }, { ...context(), onAudio: async (chunk) => { chunks.push(chunk); } });
    expect(chunks.map((chunk) => chunk.length)).toEqual([24_576, 5_424]);
    expect(result).toMatchObject({ output: { mimeType: 'audio/pcm', sampleRate: 24_000, bytes: 30_000 }, costMicroUsd: null, costEvidence: null });
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({ model: 'fixture-tts', response_format: 'pcm', instructions: 'Speak naturally.' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not retry an upstream rejection or expose its raw response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private detail with key', { status: 401 }));
    await expect(create([text], fetcher).get('planning')!.execute({ messages: [{ role: 'user', content: 'hi' }] }, context())).rejects.toThrow('upstream_rejected');
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
