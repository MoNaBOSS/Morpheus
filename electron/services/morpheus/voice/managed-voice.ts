import { randomUUID } from 'node:crypto';
import { inspectMorpheusPcmWav } from '@shared/morpheus/pcm-wav';
import { MORPHEUS_SPEECH_MAX_AUDIO_BYTES, MORPHEUS_SPEECH_VOICES, type MorpheusSpeechChunk, type MorpheusSpeechVoice } from '@shared/morpheus/voice-types';
import type { ManagedExecutionResult } from '@shared/morpheus/managed-model-types';
import type { ManagedRequestReceipt } from '@shared/morpheus/managed-types';
import type { MorpheusAuditSink } from '../audit';
import type { ManagedRuntimeBridge } from '../managed/runtime-bridge';

/** Metadata checks are unbilled. The server rechecks entitlement at dispatch. */
export async function managedVoiceAvailability(runtime: ManagedRuntimeBridge, voice: MorpheusSpeechVoice) {
  const generation = runtime.getGeneration();
  try {
    const [access, capabilities] = await Promise.all([runtime.status(), runtime.capabilities()]);
    if (generation !== runtime.getGeneration()) throw new Error('Service changed.');
    const account = access.account;
    const enabled = access.state === 'ready' && account?.enabled && account.allowance.available > 0
      && (account.expiresAt === null || account.expiresAt > Date.now());
    const transcription = capabilities.routes.find((route) => route.id === 'transcription' && route.feature === 'transcription');
    const speech = capabilities.routes.find((route) => route.id === 'speech' && route.feature === 'speech');
    return { transcriptionAvailable: Boolean(enabled && account?.features.includes('transcription') && transcription),
      neuralSpeechAvailable: Boolean(enabled && account?.features.includes('speech') && speech?.voices?.includes(voice)),
      availableSpeechVoices: MORPHEUS_SPEECH_VOICES.filter((voice) => speech?.voices?.includes(voice)),
      modelId: transcription?.modelId, speechModelId: speech?.modelId };
  } catch { return { transcriptionAvailable: false, neuralSpeechAvailable: false }; }
}

function receiptDetails(receipt?: ManagedRequestReceipt) {
  return { costStatus: receipt?.state === 'settled' && receipt.chargedMicroUsd !== null ? 'known' : 'unknown', usageStatus: 'missing',
    ...(receipt ? { receiptState: receipt.state, reservedMicroUsd: receipt.reservedMicroUsd, chargedMicroUsd: receipt.chargedMicroUsd,
      assessedCostMicroUsd: receipt.assessedCostMicroUsd, costEvidence: receipt.costEvidence, rateVersion: receipt.rateVersion } : {}) };
}

/** Adapter only: the existing voice service owns cancellation, settings, wake,
 * presence and mic admission. No fallback, retry, transcript/audio persistence. */
export function createManagedVoiceOperation(options: {
  runtime: ManagedRuntimeBridge; audit: MorpheusAuditSink; appVersion: string;
  signal: AbortSignal; checkCurrent(): void;
}) {
  const generation = options.runtime.getGeneration();
  const check = () => {
    options.signal.throwIfAborted(); options.checkCurrent();
    if (generation !== options.runtime.getGeneration()) throw new DOMException('Voice service changed', 'AbortError');
  };
  async function run<T>(route: 'transcription' | 'speech', details: Record<string, unknown>,
    invoke: (requestId: string) => Promise<ManagedExecutionResult<T>>, validate: (output: T) => void) {
    check();
    if (!options.audit.isHealthy()) throw new Error('Voice is blocked while Audit is unavailable.');
    const requestId = randomUUID(), started = performance.now();
    let receipt: ManagedRequestReceipt | undefined, recorded = false, dispatched = false;
    const record = (event: string, extra: Record<string, unknown>) => options.audit.recordControl({
      category: 'voice', event, subjectId: 'managed', appVersion: options.appVersion,
      details: { ...details, requestId, speechId: requestId, serviceRoute: route, ...extra },
    });
    await record(`${route}-started`, receiptDetails());
    try {
      check(); dispatched = true;
      const result = await invoke(requestId); receipt = result.receipt;
      validate(result.output); check();
      const providerLatencyMs = Math.max(0, Math.round(performance.now() - started));
      recorded = true;
      await record(`${route}-completed`, { ...receiptDetails(receipt), dispatched, providerLatencyMs,
        modelId: (result.output as { modelId: string }).modelId });
      check(); return { output: result.output, providerLatencyMs };
    } catch {
      if (!recorded) await record(`${route}-${options.signal.aborted || generation !== options.runtime.getGeneration() ? 'cancelled' : 'failed'}`,
        { ...receiptDetails(receipt), dispatched, providerLatencyMs: Math.max(0, Math.round(performance.now() - started)) });
      throw new Error('Managed voice is unavailable or was cancelled. No personal API was used.');
    }
  }
  return {
    async transcribe(audio: Buffer, mimeType: string, ambient: boolean) {
      if (mimeType !== 'audio/wav') throw new Error('Managed voice requires a PCM recording.');
      const { durationMs } = inspectMorpheusPcmWav(audio);
      const result = await run('transcription', { bytes: audio.length, durationMs, ambient, mimeType },
        (requestId) => options.runtime.transcribe({ requestId, speechId: requestId, mimeType: 'audio/wav', audioBase64: audio.toString('base64') }, options.signal),
        (output) => { if (!output.transcript.trim() || output.durationMs !== durationMs) throw new Error('Invalid managed transcript.'); });
      return { transcript: result.output.transcript.trim(), providerAccountId: 'managed', modelId: result.output.modelId, durationMs, providerLatencyMs: result.providerLatencyMs };
    },
    async synthesize(text: string, voice: MorpheusSpeechVoice, instructions: string, streamId: string | undefined, emit?: (chunk: MorpheusSpeechChunk) => void) {
      let bytes = 0, sequence = 0;
      const chunks: Buffer[] = [];
      const streamed = Boolean(streamId && emit);
      const started = performance.now();
      const details: Record<string, unknown> = { textChars: text.length, voice };
      const result = await run('speech', details,
        (requestId) => options.runtime.synthesize({ requestId, speechId: requestId, text, voice, instructions }, (chunk) => {
          check(); bytes += chunk.length;
          if (!chunk.length || bytes > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) throw new Error('Invalid managed speech size.');
          details.firstAudioByteMs ??= Math.max(0, Math.round(performance.now() - started)); details.bytes = bytes;
          const value = Buffer.from(chunk); if (!streamed) chunks.push(value);
          if (streamId && emit) for (let offset = 0; offset < value.length; offset += 48 * 1024) {
            check(); emit({ streamId, sequence: sequence++, mimeType: 'audio/pcm', audioBase64: value.subarray(offset, offset + 48 * 1024).toString('base64') });
          }
        }, options.signal),
        (output) => { if (output.voice !== voice || output.bytes !== bytes || !bytes || bytes % 2) throw new Error('Invalid managed speech output.'); });
      return { audioBase64: streamed ? '' : Buffer.concat(chunks, bytes).toString('base64'), mimeType: 'audio/pcm' as const,
        providerAccountId: 'managed', modelId: result.output.modelId, voice, providerLatencyMs: result.providerLatencyMs };
    },
  };
}
