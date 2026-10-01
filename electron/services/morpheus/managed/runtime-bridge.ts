import { z } from 'zod';
import type { ManagedRequest } from '../../../../shared/morpheus/managed-types';
import {
  MANAGED_MAX_PCM_BYTES, managedReceiptSchema, managedSpeechInputSchema, managedSpeechOutputSchema,
  managedTextInputSchema, managedTextOutputSchema, managedTranscriptionInputSchema, managedTranscriptionOutputSchema,
  type ManagedExecutionResult, type ManagedTextInput,
} from '../../../../shared/morpheus/managed-model-types';
import type { ManagedClient } from './managed-client';

export type ManagedCorrelation = Pick<ManagedRequest, 'requestId' | 'objectiveId' | 'turnId' | 'workerRunId' | 'speechId'>;
const envelope = z.object({ output: z.unknown(), receipt: managedReceiptSchema }).strict();
function result<T>(raw: unknown, schema: z.ZodType<T>, request: ManagedRequest): ManagedExecutionResult<T> {
  const value = envelope.parse(raw); const receipt = value.receipt;
  if (receipt.requestId !== request.requestId || receipt.route !== request.route || receipt.objectiveId !== (request.objectiveId ?? null)
    || receipt.turnId !== request.turnId || receipt.workerRunId !== request.workerRunId || receipt.speechId !== request.speechId
    || !['settled', 'uncertain'].includes(receipt.state)) throw new Error('Managed result does not match the admitted operation');
  return { output: schema.parse(value.output), receipt };
}

/** Build canonical mono PCM16 WAV from an existing capture owner's samples.
 * Does not open a mic, decode arbitrary files, or introduce another audio owner. */
export function encodeManagedPcmWav(pcm: Uint8Array, sampleRate: 16_000 | 24_000 | 48_000): Uint8Array {
  if (![16_000, 24_000, 48_000].includes(sampleRate) || !pcm.length || pcm.length % 2 || pcm.length > MANAGED_MAX_PCM_BYTES
    || pcm.length / (sampleRate * 2) < 0.1 || pcm.length / (sampleRate * 2) > 120) throw new Error('Invalid bounded PCM samples');
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
  wav.set(pcm, 44); return wav;
}

/** Main-only integration port over the existing client/session/ledger. Root
 * injects this into existing planner, conversation, worker and voice owners.
 * Routes are logical fixed ids; the server owns credentials/models/rates. */
export function createManagedRuntimeBridge(client: ManagedClient) {
  return {
    getGeneration: client.getGeneration,
    status: client.status,
    capabilities: client.capabilities,
    receipt: client.receipt,
    invalidate: client.invalidate,
    async text(input: { kind: 'conversation' | 'planning'; complex?: boolean; messages: ManagedTextInput['messages']; maxOutputTokens?: number } & ManagedCorrelation, signal?: AbortSignal) {
      const route = input.kind === 'planning' && input.complex ? 'planning-complex' : input.kind;
      const payload = managedTextInputSchema.parse({ messages: input.messages, ...(input.maxOutputTokens ? { maxOutputTokens: input.maxOutputTokens } : {}) });
      const { requestId, objectiveId, turnId, workerRunId, speechId } = input;
      const request: ManagedRequest = { requestId, objectiveId, turnId, workerRunId, speechId, route, input: payload };
      return result(await client.execute(request, signal), managedTextOutputSchema, request);
    },
    async transcribe(input: { audioBase64: string; mimeType: 'audio/wav' } & ManagedCorrelation, signal?: AbortSignal) {
      const { requestId, objectiveId, turnId, workerRunId, speechId } = input;
      const request: ManagedRequest = { requestId, objectiveId, turnId, workerRunId, speechId, route: 'transcription', input: managedTranscriptionInputSchema.parse({ audioBase64: input.audioBase64, mimeType: input.mimeType }) };
      return result(await client.transcribe(request, signal), managedTranscriptionOutputSchema, request);
    },
    async transcribePcm(input: { pcm: Uint8Array; sampleRate: 16_000 | 24_000 | 48_000 } & ManagedCorrelation, signal?: AbortSignal) {
      const { requestId, objectiveId, turnId, workerRunId, speechId } = input;
      const wav = encodeManagedPcmWav(input.pcm, input.sampleRate);
      const request: ManagedRequest = { requestId, objectiveId, turnId, workerRunId, speechId, route: 'transcription', input: { audioBase64: Buffer.from(wav).toString('base64'), mimeType: 'audio/wav' } };
      return result(await client.transcribe(request, signal), managedTranscriptionOutputSchema, request);
    },
    async synthesize(input: { text: string; voice?: string; instructions?: string } & ManagedCorrelation, onAudio: (bytes: Uint8Array) => void | Promise<void>, signal?: AbortSignal) {
      const { requestId, objectiveId, turnId, workerRunId, speechId } = input;
      const request: ManagedRequest = { requestId, objectiveId, turnId, workerRunId, speechId, route: 'speech', input: managedSpeechInputSchema.parse({ text: input.text, ...(input.voice ? { voice: input.voice } : {}), ...(input.instructions ? { instructions: input.instructions } : {}) }) };
      return result(await client.synthesize(request, onAudio, signal), managedSpeechOutputSchema, request);
    },
  };
}
export type ManagedRuntimeBridge = ReturnType<typeof createManagedRuntimeBridge>;
