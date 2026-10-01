import { z } from 'zod';
import type { ManagedRequestReceipt } from './managed-types';

export const MANAGED_TEXT_ROUTES = ['conversation', 'planning', 'planning-complex'] as const;
export const MANAGED_AUDIO_CHUNK_BYTES = 24 * 1024;
export const MANAGED_MAX_PCM_BYTES = 5_760_000;
export const MANAGED_MAX_AUDIO_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MANAGED_MAX_STREAM_LINE_BYTES = 48 * 1024;
export const MANAGED_MAX_STREAM_BYTES = 12 * 1024 * 1024;
export const MANAGED_REQUEST_BODY_BYTES = 8 * 1024 * 1024;

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/);
const amount = z.number().int().nonnegative().max(1_000_000_000_000);
export const managedReceiptSchema = z.object({
  requestId: id, objectiveId: id.nullable(), route: id,
  state: z.enum(['reserved', 'dispatched', 'uncertain', 'settled', 'released']),
  reservedMicroUsd: amount, chargedMicroUsd: amount.nullable(), assessedCostMicroUsd: amount.nullable(),
  costEvidence: z.enum(['rate-estimate', 'provider-reported', 'reconciled']).nullable(),
  rateVersion: id,
  turnId: id.optional(), workerRunId: id.optional(), speechId: id.optional(),
}).strict();

export const managedTextInputSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().min(1).max(48_000) }).strict()).min(1).max(32),
  maxOutputTokens: z.number().int().positive().max(16_384).optional(),
}).strict();
export type ManagedTextInput = z.infer<typeof managedTextInputSchema>;
export const managedTextOutputSchema = z.object({
  text: z.string().min(1).max(64_000), modelId: z.string().min(1).max(200),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict().nullable(),
}).strict();
export type ManagedTextOutput = z.infer<typeof managedTextOutputSchema>;

export const managedTranscriptionInputSchema = z.object({
  /** Canonical RIFF PCM16 WAV; actual duration is derived from checked samples. */
  audioBase64: z.string().min(1).max(Math.ceil(MANAGED_MAX_PCM_BYTES / 3) * 4 + 64),
  mimeType: z.literal('audio/wav'),
}).strict();
export const managedTranscriptionOutputSchema = z.object({
  transcript: z.string().max(8_000), modelId: z.string().min(1).max(200), durationMs: z.number().int().positive().max(120_000),
}).strict();

export const managedSpeechInputSchema = z.object({
  text: z.string().trim().min(1).max(4_000), voice: z.string().min(1).max(64).optional(),
  instructions: z.string().max(4_000).optional(),
}).strict();
export const managedSpeechOutputSchema = z.object({
  modelId: z.string().min(1).max(200), voice: z.string().min(1).max(64),
  mimeType: z.literal('audio/pcm'), sampleRate: z.literal(24_000), channels: z.literal(1), bytes: z.number().int().positive().max(MANAGED_MAX_AUDIO_RESPONSE_BYTES),
}).strict();

export const managedAudioFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('receipt'), receipt: managedReceiptSchema }).strict(),
  z.object({ type: z.literal('audio'), sequence: z.number().int().nonnegative(), audioBase64: z.string().min(1).max(MANAGED_AUDIO_CHUNK_BYTES / 3 * 4) }).strict(),
  z.object({ type: z.literal('complete'), output: managedSpeechOutputSchema, receipt: managedReceiptSchema }).strict(),
  z.object({ type: z.literal('error'), error: z.literal('upstream_outcome_uncertain'), receipt: managedReceiptSchema }).strict(),
]);

export type ManagedRouteCapability = {
  id: string; feature: 'conversation' | 'planning' | 'transcription' | 'speech'; modelId: string;
  rateVersion: string; streaming: boolean; voices?: string[];
};
export const managedCapabilitiesSchema = z.object({ routes: z.array(z.object({
  id, feature: z.enum(['conversation', 'planning', 'transcription', 'speech']),
  modelId: z.string().min(1).max(200), rateVersion: id, streaming: z.boolean(), voices: z.array(z.string().min(1).max(64)).max(16).optional(),
}).strict()).max(16) }).strict();

export type ManagedExecutionResult<T> = { output: T; receipt: ManagedRequestReceipt };
