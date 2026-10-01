import { z } from 'zod';
import { inspectMorpheusPcmWav } from '../../shared/morpheus/pcm-wav';
import {
  MANAGED_AUDIO_CHUNK_BYTES, MANAGED_MAX_AUDIO_RESPONSE_BYTES,
  managedSpeechInputSchema, managedTextInputSchema, managedTranscriptionInputSchema,
} from '../../shared/morpheus/managed-model-types';
import type { ManagedRoute } from './gateway';
import { idSchema, ManagedError, moneySchema, readBoundedJson } from './validation';

const textRouteSchema = z.object({
  id: z.enum(['conversation', 'planning', 'planning-complex']), kind: z.literal('text'),
  modelId: z.string().min(1).max(200), rateVersion: idSchema,
  inputMicroUsdPerMillionTokens: moneySchema.positive(), outputMicroUsdPerMillionTokens: moneySchema.positive(),
  maxInputTokens: z.number().int().min(1_024).max(131_072), maxOutputTokens: z.number().int().positive().max(16_384),
}).strict();
const transcriptionRouteSchema = z.object({
  id: z.literal('transcription'), kind: z.literal('transcription'), modelId: z.string().min(1).max(200), rateVersion: idSchema,
  microUsdPerMinute: moneySchema.positive(), maxDurationMs: z.number().int().min(100).max(120_000),
}).strict();
const speechRouteSchema = z.object({
  id: z.literal('speech'), kind: z.literal('speech'), modelId: z.string().min(1).max(200), rateVersion: idSchema,
  voices: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)).min(1).max(16), supportsInstructions: z.boolean().default(false),
  pricing: z.discriminatedUnion('unit', [
    z.object({ unit: z.literal('characters'), microUsdPerMillionCharacters: moneySchema.positive() }).strict(),
    // Some compatible speech APIs do not report their billed audio units. An
    // operator-evaluated request maximum reserves allowance; it is never shown
    // as a settled price. Reconciliation is still required after a successful call.
    z.object({ unit: z.literal('unknown'), maximumMicroUsd: moneySchema.positive() }).strict(),
  ]),
}).strict();
export const managedProviderRouteSchema = z.discriminatedUnion('kind', [textRouteSchema, transcriptionRouteSchema, speechRouteSchema]);
export type ManagedProviderRouteConfig = z.infer<typeof managedProviderRouteSchema>;

function requireProviderBase(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new ManagedError('invalid_provider_configuration', 503);
  return url;
}
function endpoint(base: URL, suffix: string): URL {
  const url = new URL(base); url.pathname = `${url.pathname.replace(/\/$/, '')}${suffix}`; return url;
}
function roundedCost(value: number): number { return moneySchema.parse(Math.ceil(value)); }
function base64Bytes(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new ManagedError('invalid_audio');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new ManagedError('invalid_audio');
  return bytes;
}

/** Canonical mono PCM16 avoids trusting a client-supplied compressed duration. */
export function inspectManagedPcmWav(audio: Buffer): { durationMs: number; sampleRate: number } {
  try { return inspectMorpheusPcmWav(audio); } catch { throw new ManagedError('invalid_pcm_audio'); }
}

/** One established OpenAI-compatible protocol; models, rates and keys are
 * operator configuration. No provider retry, browsing/tool charge or model
 * selection call is hidden in these adapters. */
export function createManagedProviderRoutes(options: {
  baseUrl: string; apiKey: string; routes: readonly ManagedProviderRouteConfig[]; fetch?: typeof fetch;
}): ReadonlyMap<string, ManagedRoute> {
  const base = requireProviderBase(options.baseUrl);
  if (!options.apiKey.trim() || /[\r\n]/.test(options.apiKey)) throw new ManagedError('invalid_provider_configuration', 503);
  const configs = z.array(managedProviderRouteSchema).min(1).max(5).parse(options.routes);
  if (new Set(configs.map((entry) => entry.id)).size !== configs.length) throw new ManagedError('duplicate_provider_route', 503);
  const transport = options.fetch ?? fetch;
  const headers = (requestId: string) => ({ Authorization: `Bearer ${options.apiKey}`, 'Idempotency-Key': requestId });
  const result = new Map<string, ManagedRoute>();
  for (const config of configs) {
    if (config.kind === 'text') {
      const parse = (input: unknown) => {
        const value = managedTextInputSchema.parse(input);
        // Byte count plus conservative message framing bounds the admitted
        // tokenizer input for the configured compatible protocol. Live rate/model
        // qualification must verify this bound; unexpected provider exposure
        // remains visible and freezes the account through the existing ledger.
        const boundedInput = value.messages.reduce((sum, message) => sum + Buffer.byteLength(message.content, 'utf8') + 64, 512);
        if (boundedInput > config.maxInputTokens || (value.maxOutputTokens ?? config.maxOutputTokens) > config.maxOutputTokens) throw new ManagedError('route_input_limit');
        return value;
      };
      result.set(config.id, {
        feature: config.id === 'conversation' ? 'conversation' : 'planning',
        capability: { id: config.id, feature: config.id === 'conversation' ? 'conversation' : 'planning', modelId: config.modelId, rateVersion: config.rateVersion, streaming: false },
        parse,
        quote(input) {
          const value = parse(input);
          return { maximumMicroUsd: Math.max(1, roundedCost((config.maxInputTokens * config.inputMicroUsdPerMillionTokens
            + (value.maxOutputTokens ?? config.maxOutputTokens) * config.outputMicroUsdPerMillionTokens) / 1_000_000)), rateVersion: config.rateVersion };
        },
        async execute(input, context) {
          const value = parse(input);
          const response = await transport(endpoint(base, '/chat/completions'), {
            method: 'POST', headers: { ...headers(context.requestId), 'Content-Type': 'application/json' }, redirect: 'error', signal: context.signal,
            body: JSON.stringify({ model: config.modelId, messages: value.messages,
              max_completion_tokens: value.maxOutputTokens ?? config.maxOutputTokens, stream: false }),
          });
          if (!response.ok) { await response.body?.cancel(); throw new ManagedError('upstream_rejected', 502); }
          const body = z.object({
            choices: z.array(z.object({ message: z.object({ content: z.string().min(1).max(64_000) }) })).min(1),
            usage: z.object({ prompt_tokens: z.number().int().nonnegative().max(1_000_000_000), completion_tokens: z.number().int().nonnegative().max(1_000_000_000) }).optional(),
          }).parse(await readBoundedJson(response.body, 256 * 1024));
          const usage = body.usage ? { inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens } : null;
          return { output: { text: body.choices[0].message.content, modelId: config.modelId, usage },
            costMicroUsd: usage ? roundedCost((usage.inputTokens * config.inputMicroUsdPerMillionTokens + usage.outputTokens * config.outputMicroUsdPerMillionTokens) / 1_000_000) : null,
            costEvidence: usage ? 'rate-estimate' : null };
        },
      });
    } else if (config.kind === 'transcription') {
      const parse = (input: unknown) => {
        const value = managedTranscriptionInputSchema.parse(input);
        if (inspectManagedPcmWav(base64Bytes(value.audioBase64)).durationMs > config.maxDurationMs) throw new ManagedError('route_input_limit');
        return value;
      };
      result.set(config.id, {
        feature: 'transcription', capability: { id: config.id, feature: 'transcription', modelId: config.modelId, rateVersion: config.rateVersion, streaming: false },
        parse, quote(input) {
          const value = parse(input); const { durationMs } = inspectManagedPcmWav(base64Bytes(value.audioBase64));
          return { maximumMicroUsd: Math.max(1, roundedCost(durationMs / 60_000 * config.microUsdPerMinute)), rateVersion: config.rateVersion };
        },
        async execute(input, context) {
          const value = parse(input); const audio = base64Bytes(value.audioBase64); const { durationMs } = inspectManagedPcmWav(audio);
          const form = new FormData(); form.append('model', config.modelId); form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'recording.wav');
          const response = await transport(endpoint(base, '/audio/transcriptions'), { method: 'POST', headers: headers(context.requestId), body: form, redirect: 'error', signal: context.signal });
          if (!response.ok) { await response.body?.cancel(); throw new ManagedError('upstream_rejected', 502); }
          const body = z.object({ text: z.string().max(8_000) }).parse(await readBoundedJson(response.body, 64 * 1024));
          return { output: { transcript: body.text, modelId: config.modelId, durationMs }, costMicroUsd: roundedCost(durationMs / 60_000 * config.microUsdPerMinute), costEvidence: 'rate-estimate' };
        },
      });
    } else {
      const parse = (input: unknown) => {
        const value = managedSpeechInputSchema.parse(input);
        if (value.voice && !config.voices.includes(value.voice)) throw new ManagedError('voice_unavailable');
        return value;
      };
      result.set(config.id, {
        feature: 'speech', streaming: true,
        capability: { id: config.id, feature: 'speech', modelId: config.modelId, rateVersion: config.rateVersion, streaming: true, voices: [...config.voices] },
        parse, quote(input) {
          const value = parse(input);
          return { maximumMicroUsd: config.pricing.unit === 'unknown' ? config.pricing.maximumMicroUsd
            : Math.max(1, roundedCost(value.text.length * config.pricing.microUsdPerMillionCharacters / 1_000_000)), rateVersion: config.rateVersion };
        },
        async execute(input, context) {
          if (!context.onAudio) throw new ManagedError('stream_required');
          const value = parse(input); const voice = value.voice ?? config.voices[0];
          const response = await transport(endpoint(base, '/audio/speech'), {
            method: 'POST', headers: { ...headers(context.requestId), 'Content-Type': 'application/json' }, redirect: 'error', signal: context.signal,
            body: JSON.stringify({ model: config.modelId, input: value.text, voice, response_format: 'pcm',
              ...(config.supportsInstructions && value.instructions ? { instructions: value.instructions } : {}) }),
          });
          if (!response.ok || !response.body) { await response.body?.cancel(); throw new ManagedError('upstream_rejected', 502); }
          const reader = response.body.getReader(); let bytes = 0;
          try {
            for (;;) {
              context.signal.throwIfAborted(); const next = await reader.read(); if (next.done) break;
              bytes += next.value.byteLength;
              if (bytes > MANAGED_MAX_AUDIO_RESPONSE_BYTES) throw new ManagedError('upstream_output_too_large', 502);
              for (let offset = 0; offset < next.value.byteLength; offset += MANAGED_AUDIO_CHUNK_BYTES) await context.onAudio(next.value.subarray(offset, offset + MANAGED_AUDIO_CHUNK_BYTES));
            }
            if (bytes === 0 || bytes % 2 !== 0) throw new ManagedError('invalid_audio_output', 502);
          } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
          return { output: { modelId: config.modelId, voice, mimeType: 'audio/pcm', sampleRate: 24_000, channels: 1, bytes },
            costMicroUsd: config.pricing.unit === 'characters' ? roundedCost(value.text.length * config.pricing.microUsdPerMillionCharacters / 1_000_000) : null,
            costEvidence: config.pricing.unit === 'characters' ? 'rate-estimate' : null };
        },
      });
    }
  }
  return result;
}

/** Absent config keeps the existing account-only pilot. Partial config fails. */
export function configuredManagedProviderRoutes(env: NodeJS.ProcessEnv, transport?: typeof fetch): ReadonlyMap<string, ManagedRoute> {
  const supplied = [env.MORPHEUS_INFERENCE_BASE_URL, env.MORPHEUS_INFERENCE_API_KEY, env.MORPHEUS_INFERENCE_ROUTES_JSON];
  if (supplied.every((value) => !value?.trim())) return new Map();
  if (supplied.some((value) => !value?.trim())) throw new ManagedError('incomplete_provider_configuration', 503);
  let routes: unknown; try { routes = JSON.parse(env.MORPHEUS_INFERENCE_ROUTES_JSON!); } catch { throw new ManagedError('invalid_provider_configuration', 503); }
  return createManagedProviderRoutes({ baseUrl: env.MORPHEUS_INFERENCE_BASE_URL!, apiKey: env.MORPHEUS_INFERENCE_API_KEY!, routes: z.array(managedProviderRouteSchema).parse(routes), fetch: transport });
}
