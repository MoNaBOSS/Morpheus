import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { morpheusUsageCounts } from '@shared/morpheus/usage-evidence';
import { composeMorpheusPersonaContext, type MorpheusPersonaContext } from '@shared/morpheus/persona-context';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES } from '@shared/morpheus/onboarding-types';

import type { ProviderAccount } from '../../../shared/providers/types';
import type { ProviderService } from '../../providers/provider-service';
import type { MorpheusObjectiveEvent, MorpheusSystemState } from '@shared/morpheus/core/objective-types';
import {
  MORPHEUS_AMBIENT_MAX_SILENCE_MS,
  MORPHEUS_AMBIENT_MAX_UTTERANCE_MS,
  MORPHEUS_AMBIENT_MIN_SILENCE_MS,
  MORPHEUS_AMBIENT_MIN_UTTERANCE_MS,
  MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN,
  MORPHEUS_VOICE_CONVERSATION_MAX_MS,
  MORPHEUS_VOICE_CONVERSATION_MAX_TURNS,
  MORPHEUS_VOICE_FOLLOW_UP_MS,
  MORPHEUS_SPEECH_MAX_AUDIO_BYTES,
  MORPHEUS_SPEECH_MAX_TEXT_CHARS,
  MORPHEUS_SPEECH_VOICES,
  MORPHEUS_VOICE_MAX_AUDIO_BYTES,
  MORPHEUS_VOICE_MAX_DURATION_MS,
  MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS,
  MORPHEUS_VOICE_MIME_TYPES,
  MORPHEUS_VOICE_PROVIDER_TIMEOUT_MS,
  MORPHEUS_VOICE_VERSION,
  type MorpheusTranscribeAudioPayload,
  type MorpheusTranscriptionResult,
  type MorpheusSynthesizeSpeechPayload,
  type MorpheusSynthesizeSpeechResult,
  type MorpheusVoicePresence,
  type MorpheusVoicePresenceState,
  type MorpheusVoiceSettings,
  type MorpheusVoiceSettingsPatch,
  type MorpheusVoiceProviderOption,
  type MorpheusVoiceStatus,
  type MorpheusSpeechChunk,
} from '@shared/morpheus/voice-types';

import type { MorpheusAuditSink } from '../audit';
import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';
import { startWindowsWake, type LocalWakeController } from './windows-wake';
import type { ManagedRuntimeBridge } from '../managed/runtime-bridge';
import { createManagedVoiceOperation, managedVoiceAvailability } from './managed-voice';

const DEFAULT_VOICE_SETTINGS: MorpheusVoiceSettings = Object.freeze({
  v: MORPHEUS_VOICE_VERSION,
  enabled: true,
  providerAccountId: null,
  modelId: 'whisper-1',
  speakResponses: true,
  speechProviderAccountId: null,
  speechModelId: 'gpt-4o-mini-tts',
  speechVoice: 'cedar',
  autoSubmitTranscript: true,
  ambientEnabled: false,
  wakePhrase: 'Morpheus',
  ambientSilenceMs: 1_000,
  ambientMaxUtteranceMs: 20_000,
  bargeIn: true,
  handsFreeFollowUp: true,
});

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

class VoiceHttpError extends Error {
  constructor(readonly status: number, operation: string) {
    super(`${operation} provider returned HTTP ${status}.`);
  }
}

function speechFailureKind(error: unknown): NonNullable<MorpheusVoicePresence['speechFailure']> {
  if (!(error instanceof VoiceHttpError)) return 'unavailable';
  if (error.status === 401) return 'authentication';
  if (error.status === 403) return 'access';
  if (error.status === 429) return 'rate-limit';
  if ([400, 404, 405, 422].includes(error.status)) return 'endpoint';
  return 'unavailable';
}

export interface MorpheusVoiceService {
  status(): Promise<MorpheusVoiceStatus>;
  presence(): MorpheusVoicePresence;
  updateSettings(patch: MorpheusVoiceSettingsPatch): Promise<MorpheusVoiceStatus>;
  transcribe(payload: MorpheusTranscribeAudioPayload): Promise<MorpheusTranscriptionResult>;
  synthesize(payload: MorpheusSynthesizeSpeechPayload): Promise<MorpheusSynthesizeSpeechResult>;
  cancelSpeech(): void;
  invalidateService?(): void;
  beginAmbientSession(): Promise<MorpheusVoicePresence>;
  endAmbientSession(): Promise<MorpheusVoicePresence>;
  setAmbientListening(listening: boolean): Promise<MorpheusVoicePresence>;
  transcribeAmbient(payload: MorpheusTranscribeAudioPayload): Promise<MorpheusTranscriptionResult>;
  setSpeaking(speaking: boolean): MorpheusVoicePresence;
  observeObjective(event: MorpheusObjectiveEvent): void;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validProviderId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value));
}

/** Migrates earlier voice settings without silently enabling ambient capture. */
function validateSettings(value: unknown): MorpheusVoiceSettings | null {
  if (!isRecord(value) || ![1, 2, 3, MORPHEUS_VOICE_VERSION].includes(value.v as number)) return null;
  if (typeof value.enabled !== 'boolean' || typeof value.speakResponses !== 'boolean'
    || typeof value.autoSubmitTranscript !== 'boolean' || !validProviderId(value.providerAccountId)) return null;
  if (typeof value.modelId !== 'string' || !value.modelId.trim() || value.modelId.length > 200) return null;

  const migrated = value.v === MORPHEUS_VOICE_VERSION
    ? value
    : { ...DEFAULT_VOICE_SETTINGS, ...value, v: MORPHEUS_VOICE_VERSION };
  const {
    ambientEnabled, bargeIn, handsFreeFollowUp, wakePhrase, ambientSilenceMs, ambientMaxUtteranceMs,
    speechProviderAccountId, speechModelId, speechVoice,
  } = migrated;
  if (typeof ambientEnabled !== 'boolean' || typeof bargeIn !== 'boolean'
    || typeof handsFreeFollowUp !== 'boolean') return null;
  if (migrated.localWakeEnabled !== undefined && typeof migrated.localWakeEnabled !== 'boolean') return null;
  if (typeof wakePhrase !== 'string'
    || !MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN.test(wakePhrase.trim())) return null;
  if (typeof ambientSilenceMs !== 'number' || !Number.isInteger(ambientSilenceMs)
    || ambientSilenceMs < MORPHEUS_AMBIENT_MIN_SILENCE_MS
    || ambientSilenceMs > MORPHEUS_AMBIENT_MAX_SILENCE_MS) return null;
  if (typeof ambientMaxUtteranceMs !== 'number' || !Number.isInteger(ambientMaxUtteranceMs)
    || ambientMaxUtteranceMs < MORPHEUS_AMBIENT_MIN_UTTERANCE_MS
    || ambientMaxUtteranceMs > MORPHEUS_AMBIENT_MAX_UTTERANCE_MS) return null;
  if (!validProviderId(speechProviderAccountId)
    || typeof speechModelId !== 'string' || !speechModelId.trim() || speechModelId.length > 200
    || !MORPHEUS_SPEECH_VOICES.includes(speechVoice as typeof MORPHEUS_SPEECH_VOICES[number])) return null;
  return {
    v: MORPHEUS_VOICE_VERSION,
    enabled: value.enabled,
    providerAccountId: value.providerAccountId,
    modelId: value.modelId.trim(),
    speakResponses: value.speakResponses,
    speechProviderAccountId,
    speechModelId: speechModelId.trim(),
    speechVoice: speechVoice as MorpheusVoiceSettings['speechVoice'],
    autoSubmitTranscript: value.autoSubmitTranscript,
    ambientEnabled,
    localWakeEnabled: migrated.localWakeEnabled === true,
    wakePhrase: wakePhrase.trim(),
    ambientSilenceMs,
    ambientMaxUtteranceMs,
    bargeIn,
    handsFreeFollowUp,
  };
}

function eligibleAccount(account: ProviderAccount): boolean {
  return account.enabled
    && account.authMode !== 'oauth_browser'
    && (account.vendorId === 'openai' || account.vendorId === 'openrouter' || account.vendorId === 'custom');
}

function providerEndpoint(account: ProviderAccount, suffix: '/audio/transcriptions' | '/audio/speech'): URL {
  const value = account.baseUrl ?? (
    account.vendorId === 'openai'
      ? 'https://api.openai.com/v1'
      : account.vendorId === 'openrouter'
        ? 'https://openrouter.ai/api/v1'
        : ''
  );
  if (!value) throw new Error('The voice provider has no endpoint configured.');
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) {
    throw new Error('Voice endpoints must use HTTPS, except for explicit loopback providers.');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}${suffix}`.replace(/\/+/g, '/');
  return url;
}

function speechInstructions(persona: MorpheusPersonaContext): string {
  const delivery = 'Speak to one person in a natural conversational voice, not a narrator or announcer. '
    + 'Use relaxed pacing, short meaningful pauses and varied intonation. Avoid a robotic cadence, '
    + 'exaggerated enthusiasm or theatrical whispering. Read only the supplied text; do not add words. ';
  return delivery + 'Apply the companion context to delivery only; do not rewrite the supplied summary or add greetings, names, jokes or follow-up questions.\n' + persona.instructions;
}

async function readBoundedAudio(response: Response, maxBytes = MORPHEUS_SPEECH_MAX_AUDIO_BYTES, label = 'Speech', onChunk?: (bytes: Buffer) => void): Promise<Buffer> {
  if (!response.body) {
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || audio.length > maxBytes) {
      throw new Error(`${label} provider returned an empty or oversized response.`);
    }
    onChunk?.(audio);
    return audio;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} provider response exceeded the permitted size.`);
      }
      chunks.push(Buffer.from(value));
      onChunk?.(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error(`${label} provider returned an empty response.`);
  return Buffer.concat(chunks, total);
}

function safeHeaders(account: ProviderAccount, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
  for (const [name, value] of Object.entries(account.headers ?? {})) {
    const lower = name.toLowerCase();
    if ((!lower.startsWith('x-') && lower !== 'http-referer')
      || ['authorization', 'x-api-key', 'host', 'content-length', 'cookie'].includes(lower)) continue;
    if (typeof value === 'string' && value.length <= 1_000) headers[name] = value;
  }
  return headers;
}

function audioExtension(mimeType: string): string {
  if (mimeType === 'audio/wav') return 'wav';
  if (mimeType.startsWith('audio/ogg')) return 'ogg';
  if (mimeType === 'audio/mp4') return 'm4a';
  return 'webm';
}

function decodeAudio(payload: MorpheusTranscribeAudioPayload): Buffer {
  if (!MORPHEUS_VOICE_MIME_TYPES.includes(payload.mimeType)) throw new Error('Unsupported voice recording type.');
  if (!Number.isInteger(payload.durationMs) || payload.durationMs < 100 || payload.durationMs > MORPHEUS_VOICE_MAX_DURATION_MS) {
    throw new Error('Voice recording duration is outside the permitted range.');
  }
  if (!payload.audioBase64 || payload.audioBase64.length > Math.ceil(MORPHEUS_VOICE_MAX_AUDIO_BYTES / 3) * 4 + 4
    || !BASE64_PATTERN.test(payload.audioBase64) || payload.audioBase64.length % 4 !== 0) {
    throw new Error('Voice recording data is malformed or too large.');
  }
  const audio = Buffer.from(payload.audioBase64, 'base64');
  if (audio.length === 0 || audio.length > MORPHEUS_VOICE_MAX_AUDIO_BYTES) {
    throw new Error('Voice recording data is empty or too large.');
  }
  return audio;
}

function objectivePresence(state: MorpheusSystemState): MorpheusVoicePresenceState | null {
  if (state === 'understanding' || state === 'planning') return 'understanding';
  if (state === 'waiting-for-approval' || state === 'needs-clarification') return 'waiting-for-approval';
  if (state === 'executing' || state === 'observing' || state === 'replanning') return 'working';
  if (state === 'error' || state === 'degraded') return 'error';
  if (state === 'cancelled' || state === 'complete' || state === 'ready') return 'armed';
  return null;
}

export function createMorpheusVoiceService(options: {
  userDataDir: string;
  providerService: ProviderService;
  audit: MorpheusAuditSink;
  appVersion: string;
  fetchImpl?: typeof fetch;
  transcriptionTimeoutMs?: number;
  speechTimeoutMs?: number;
  getPersonality?: () => 'adaptive' | 'concise' | 'warm' | 'witty';
  getPersonaContext?: () => MorpheusPersonaContext;
  now?: () => Date;
  emitPresence?: (presence: MorpheusVoicePresence) => void;
  emitSpeechChunk?: (chunk: MorpheusSpeechChunk) => void;
  startLocalWake?: typeof startWindowsWake;
  getManagedRuntime?: () => ManagedRuntimeBridge | null;
}): MorpheusVoiceService {
  const now = options.now ?? (() => new Date());
  const transcriptionTimeoutMs = options.transcriptionTimeoutMs ?? MORPHEUS_VOICE_PROVIDER_TIMEOUT_MS;
  const speechTimeoutMs = options.speechTimeoutMs ?? MORPHEUS_VOICE_PROVIDER_TIMEOUT_MS;
  const settingsPath = join(options.userDataDir, 'morpheus', 'voice-settings.json');
  let settings = readValidatedJson(settingsPath, validateSettings) ?? structuredClone(DEFAULT_VOICE_SETTINGS);
  let ambientSession: { sessionId: string; startedAt: string; providerLabel: string } | null = null;
  let speechGeneration = 0;
  let authorityRevision = 0;
  let ambientStarting: Promise<MorpheusVoicePresence> | null = null;
  let ambientStartRevision = 0;
  let managedAvailability: { runtime: ManagedRuntimeBridge; generation: number; voice: string; until: number;
    result: ReturnType<typeof managedVoiceAvailability> } | null = null;
  const managedStatus = (runtime: ManagedRuntimeBridge, voice = settings.speechVoice) => {
    const generation = runtime.getGeneration();
    if (managedAvailability?.runtime === runtime && managedAvailability.generation === generation
      && managedAvailability.voice === voice && managedAvailability.until > Date.now()) return managedAvailability.result;
    // Shared short metadata cache: no idle polling or new network round-trip for
    // each addressed recording. The service still checks allowance at dispatch.
    const result = managedVoiceAvailability(runtime, voice);
    managedAvailability = { runtime, generation, voice, until: Date.now() + 15_000, result };
    return result;
  };
  let speechController: AbortController | null = null;
  let speechFailure: MorpheusVoicePresence['speechFailure'];
  let localWake: LocalWakeController | null = null;
  let wakeSequence = 0;
  let voiceObjectiveId: string | undefined;
  let voiceObjectiveWakeSequence = 0;
  let lastWakeAt = 0;
  let localAddressUntil = 0;
  let localCaptureUntil = 0;
  let conversationStartedAt = 0;
  let conversationTurn = 0;
  let followUpUntil = 0;
  let followUpTimer: ReturnType<typeof setTimeout> | null = null;
  let followUpPending = false;
  const transcriptions = new Map<AbortController, boolean>();
  const clearFollowUp = (): void => {
    if (followUpTimer) clearTimeout(followUpTimer);
    followUpTimer = null;
    followUpUntil = 0;
    localAddressUntil = 0;
  };
  const cancelSpeech = (): void => {
    speechGeneration += 1;
    speechController?.abort(new DOMException('Speech cancelled', 'AbortError'));
    speechController = null;
    if (currentPresence.state === 'preparing-speech' || currentPresence.state === 'speaking') {
      publish(ambientSession ? 'armed' : 'asleep');
    }
  };
  let currentPresence: MorpheusVoicePresence = {
    v: MORPHEUS_VOICE_VERSION,
    state: 'asleep',
    ambientEnabled: settings.ambientEnabled,
  };
  const publish = (state: MorpheusVoicePresenceState, reason?: string, wakeCommand?: string): MorpheusVoicePresence => {
    currentPresence = {
      v: MORPHEUS_VOICE_VERSION,
      authorityRevision,
      state,
      ambientEnabled: settings.ambientEnabled,
      ...(ambientSession ? {
        sessionStartedAt: ambientSession.startedAt,
        providerLabel: ambientSession.providerLabel,
      } : {}),
      ...(reason ? { reason } : {}),
      ...(speechFailure ? { speechFailure } : {}),
      ...(wakeSequence ? { wakeSequence } : {}),
      ...(wakeCommand ? { wakeCommand } : {}),
      ...(followUpUntil > Date.now() ? { followUpUntil: new Date(followUpUntil).toISOString() } : {}),
      ...(conversationTurn ? { conversationTurn } : {}),
    };
    options.emitPresence?.(structuredClone(currentPresence));
    return structuredClone(currentPresence);
  };
  const conversationActive = (): boolean => conversationStartedAt > 0
    && Date.now() - conversationStartedAt <= MORPHEUS_VOICE_CONVERSATION_MAX_MS
    && conversationTurn < MORPHEUS_VOICE_CONVERSATION_MAX_TURNS;
  const openFollowUp = async (reason: 'wake' | 'result'): Promise<void> => {
    if (!ambientSession || !settings.handsFreeFollowUp && reason === 'result') return;
    if (reason === 'wake' || !conversationActive()) {
      conversationStartedAt = Date.now();
      conversationTurn = 0;
    }
    if (!conversationActive()) return;
    clearFollowUp();
    conversationTurn += 1;
    followUpUntil = Date.now() + MORPHEUS_VOICE_FOLLOW_UP_MS;
    if (settings.localWakeEnabled) localAddressUntil = followUpUntil;
    await options.audit.recordControl({
      category: 'voice', event: reason === 'wake' ? 'conversation-started' : 'follow-up-opened',
      subjectId: ambientSession.sessionId,
      details: { turn: conversationTurn, expiresInMs: MORPHEUS_VOICE_FOLLOW_UP_MS },
      appVersion: options.appVersion,
    });
    publish('armed');
    followUpTimer = setTimeout(() => {
      clearFollowUp();
      followUpPending = false;
      publish('armed');
    }, MORPHEUS_VOICE_FOLLOW_UP_MS);
    followUpTimer.unref?.();
  };

  const resolveAccount = async (
    accountCandidates?: ProviderAccount[],
    preferredAccountId: string | null = settings.providerAccountId,
  ): Promise<{ account: ProviderAccount; apiKey: string } | null> => {
    const accounts = accountCandidates
      ?? (await options.providerService.listAccounts()).filter(eligibleAccount);
    const selected = preferredAccountId
      ? accounts.find((account) => account.id === preferredAccountId)
      : accounts.find((account) => account.isDefault) ?? accounts[0];
    if (!selected) return null;
    const apiKey = await options.providerService.getAccountRuntimeApiKey(selected.id);
    return apiKey ? { account: selected, apiKey } : null;
  };

  const status = async (): Promise<MorpheusVoiceStatus> => {
    const managed = options.getManagedRuntime?.();
    if (managed) {
      const available = settings.enabled ? await managedStatus(managed)
        : { transcriptionAvailable: false, neuralSpeechAvailable: false };
      return { ...available, captureFormat: 'pcm16-wav', speechFormat: 'pcm24',
        settings: { ...structuredClone(settings), ...(available.modelId ? { modelId: available.modelId } : {}),
          ...(available.speechModelId ? { speechModelId: available.speechModelId } : {}) },
        presence: structuredClone(currentPresence), providers: [], providerLabel: 'Morpheus managed', speechProviderLabel: 'Morpheus managed',
        ...(!available.transcriptionAvailable ? { reason: 'Managed voice is unavailable. Check your managed account and allowance.' } : {}) };
    }
    const accounts = (await options.providerService.listAccounts()).filter(eligibleAccount);
    const providers: MorpheusVoiceProviderOption[] = await Promise.all(accounts.map(async (account) => ({
      accountId: account.id,
      vendorId: account.vendorId,
      label: account.label,
      isDefault: Boolean(account.isDefault),
      configured: Boolean(await options.providerService.getAccountRuntimeApiKey(account.id)),
    })));
    if (!settings.enabled) {
      return {
        settings: structuredClone(settings), presence: structuredClone(currentPresence),
        transcriptionAvailable: false, neuralSpeechAvailable: false, providers,
        reason: 'Voice input is disabled.',
      };
    }
    const resolved = await resolveAccount(accounts);
    const speech = await resolveAccount(accounts, settings.speechProviderAccountId ?? settings.providerAccountId);
    return {
      settings: structuredClone(settings), presence: structuredClone(currentPresence), providers,
      transcriptionAvailable: Boolean(resolved), neuralSpeechAvailable: Boolean(speech),
      ...(resolved ? { providerLabel: resolved.account.label } : {
        reason: 'Configure an API-key OpenAI, OpenRouter or compatible transcription provider.',
      }),
      ...(speech ? { speechProviderLabel: speech.account.label } : {}),
    };
  };

  const transcribeWithMode = async (
    payload: MorpheusTranscribeAudioPayload,
    ambient: boolean,
  ): Promise<MorpheusTranscriptionResult> => {
    if (!settings.enabled) throw new Error('Voice input is disabled.');
    if (!options.audit.isHealthy()) throw new Error('Voice transcription is blocked while Audit is unavailable.');
    if (ambient && !ambientSession) throw new Error('Ambient voice is not armed.');
    const inputSettings = settings;
    const inputAuthority = authorityRevision;
    const inputSession = ambientSession?.sessionId;
    const checkInput = () => {
      if (inputAuthority !== authorityRevision || !settings.enabled || settings !== inputSettings || (ambient && ambientSession?.sessionId !== inputSession)) {
        throw new DOMException('Voice input cancelled', 'AbortError');
      }
    };
    if (ambient && settings.localWakeEnabled) {
      if (!localCaptureUntil || Date.now() > localCaptureUntil) throw new Error('Say the wake phrase before recording a command.');
      localCaptureUntil = 0; // one bounded upload per admitted capture
    }
    const audio = decodeAudio(payload);
    const managed = options.getManagedRuntime?.();
    if (managed) {
      const controller = new AbortController();
      transcriptions.set(controller, ambient);
      const timer = setTimeout(() => controller.abort(), transcriptionTimeoutMs); timer.unref?.();
      try {
        checkInput();
        if (ambient) publish('transcribing');
        const result = await createManagedVoiceOperation({ runtime: managed, audit: options.audit, appVersion: options.appVersion,
          signal: controller.signal, checkCurrent: checkInput }).transcribe(audio, payload.mimeType, ambient);
        checkInput();
        if (ambient) publish('armed');
        return result;
      } catch (error) {
        if (ambient && inputAuthority === authorityRevision && ambientSession?.sessionId === inputSession && settings === inputSettings) {
          publish('error', 'Managed transcription failed. Check your account before retrying.');
        }
        throw error;
      } finally { clearTimeout(timer); transcriptions.delete(controller); }
    }
    const resolved = await resolveAccount();
    checkInput();
    if (!resolved) throw new Error('No compatible transcription provider is configured.');
    const endpoint = providerEndpoint(resolved.account, '/audio/transcriptions');
    const modelId = settings.modelId.trim();
    const requestId = randomUUID();
    const requestStartedAt = performance.now();
    let dispatched = false;
    let terminalRecorded = false;

    await options.audit.recordControl({
      category: 'voice', event: 'transcription-started', subjectId: resolved.account.id,
      details: {
        requestId, costStatus: 'unknown', bytes: audio.length, durationMs: payload.durationMs,
        mimeType: payload.mimeType, modelId, ambient,
      },
      appVersion: options.appVersion,
    });
    try {
      checkInput();
      if (ambient) publish('transcribing');
      const form = new FormData();
      form.append('model', modelId);
      form.append('file', new Blob([audio], { type: payload.mimeType }), `morpheus-voice.${audioExtension(payload.mimeType)}`);
      const controller = new AbortController();
      transcriptions.set(controller, ambient);
      let timedOut = false;
      const providerStartedAt = Date.now();
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('Transcription timed out', 'TimeoutError'));
      }, transcriptionTimeoutMs);
      timer.unref?.();
      let response: Response;
      let raw: string;
      try {
        try {
          dispatched = true;
          response = await (options.fetchImpl ?? fetch)(endpoint, {
            method: 'POST', headers: safeHeaders(resolved.account, resolved.apiKey),
            body: form, signal: controller.signal, redirect: 'error',
          });
        } catch (error) {
          if (timedOut) {
            throw new Error(
              `Transcription provider timed out after ${Math.ceil(transcriptionTimeoutMs / 1_000)} seconds.`,
              { cause: error },
            );
          }
          throw error;
        }
        if (!response.ok) throw new Error(`Transcription provider returned HTTP ${response.status}.`);
        raw = (await readBoundedAudio(response, 64 * 1024, 'Transcription')).toString('utf8');
      } catch (error) {
        if (timedOut) throw new Error(`Transcription provider timed out after ${Math.ceil(transcriptionTimeoutMs / 1_000)} seconds.`, { cause: error });
        throw error;
      } finally {
        clearTimeout(timer);
        transcriptions.delete(controller);
      }
      checkInput();
      if (raw.length > 64 * 1024) throw new Error('Transcription response was too large.');
      let body: unknown;
      try { body = JSON.parse(raw); } catch { throw new Error('Transcription provider returned invalid JSON.'); }
      const transcript = isRecord(body) && typeof body.text === 'string' ? body.text.trim() : '';
      if (!transcript || transcript.length > MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS) {
        throw new Error('Transcription provider returned an empty or oversized transcript.');
      }
      const providerLatencyMs = Math.max(0, Date.now() - providerStartedAt);

      terminalRecorded = true;
      await options.audit.recordControl({
        category: 'voice', event: 'transcription-completed', subjectId: resolved.account.id,
        details: {
          requestId, costStatus: 'unknown', dispatched, ...morpheusUsageCounts(body),
          durationMs: payload.durationMs, transcriptChars: transcript.length,
          providerLatencyMs, modelId, ambient,
        },
        appVersion: options.appVersion,
      });
      checkInput();
      if (ambient) publish('armed');
      return {
        transcript, providerAccountId: resolved.account.id, modelId,
        durationMs: payload.durationMs, providerLatencyMs,
      };
    } catch (error) {
      try {
        if (!terminalRecorded) await options.audit.recordControl({
          category: 'voice', event: 'transcription-failed', subjectId: resolved.account.id,
          details: { requestId, costStatus: 'unknown', usageStatus: 'missing', dispatched,
            providerLatencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
            durationMs: payload.durationMs, modelId, ambient }, appVersion: options.appVersion,
        });
      } finally {
        if (ambient && ambientSession?.sessionId === inputSession && settings === inputSettings) {
          publish('error', 'Transcription failed. Ambient voice remains armed for retry.');
        }
      }
      throw error;
    }
  };

  const synthesize = async (
    payload: MorpheusSynthesizeSpeechPayload,
  ): Promise<MorpheusSynthesizeSpeechResult> => {
    cancelSpeech();
    const generation = speechGeneration;
    const checkCurrent = (): void => {
      if (generation !== speechGeneration) throw new DOMException('Speech cancelled', 'AbortError');
    };
    if (!settings.speakResponses) throw new Error('Spoken responses are disabled.');
    if (!options.audit.isHealthy()) throw new Error('Neural speech is blocked while Audit is unavailable.');
    const text = payload.text.trim();
    if (!text || text.length > MORPHEUS_SPEECH_MAX_TEXT_CHARS) {
      throw new Error('Speech text is empty or exceeds the permitted length.');
    }
    const managed = options.getManagedRuntime?.();
    if (managed) {
      const controller = new AbortController(); speechController = controller;
      const timer = setTimeout(() => controller.abort(), speechTimeoutMs); timer.unref?.();
      try {
        checkCurrent(); publish('preparing-speech');
        const instructions = speechInstructions(options.getPersonaContext?.() ?? composeMorpheusPersonaContext({
          ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, personality: options.getPersonality?.() ?? 'adaptive', humorStyle: undefined,
        }));
        const result = await createManagedVoiceOperation({ runtime: managed, audit: options.audit, appVersion: options.appVersion,
          signal: controller.signal, checkCurrent }).synthesize(text, settings.speechVoice, instructions, payload.streamId, options.emitSpeechChunk);
        checkCurrent(); speechFailure = undefined; return result;
      } catch (error) {
        if (generation === speechGeneration) speechFailure = 'unavailable';
        throw error;
      } finally {
        clearTimeout(timer);
        if (speechController === controller) speechController = null;
        if (generation === speechGeneration && currentPresence.state === 'preparing-speech') publish(ambientSession ? 'armed' : 'asleep');
      }
    }
    const resolved = await resolveAccount(
      undefined,
      settings.speechProviderAccountId ?? settings.providerAccountId,
    );
    if (!resolved) throw new Error('No compatible neural speech provider is configured.');
    checkCurrent();
    const endpoint = providerEndpoint(resolved.account, '/audio/speech');
    const modelId = settings.speechModelId.trim();
    const voice = settings.speechVoice;
    const requestId = randomUUID();
    let dispatched = false;
    let terminalRecorded = false;
    let firstAudioByteMs: number | undefined;

    await options.audit.recordControl({
      category: 'voice', event: 'speech-started', subjectId: resolved.account.id,
      details: { requestId, costStatus: 'unknown', textChars: text.length, modelId, voice }, appVersion: options.appVersion,
    });

    const controller = new AbortController();
    let timedOut = false;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('Speech generation timed out', 'TimeoutError'));
    }, speechTimeoutMs);
    timer.unref?.();

    try {
      checkCurrent();
      speechController = controller;
      publish('preparing-speech');
      let response: Response;
      try {
        dispatched = true;
        response = await (options.fetchImpl ?? fetch)(endpoint, {
          method: 'POST',
          headers: { ...safeHeaders(resolved.account, resolved.apiKey), 'content-type': 'application/json' },
          body: JSON.stringify({
            model: modelId,
            input: text,
            voice,
            response_format: 'mp3',
            ...(modelId.startsWith('gpt-4o')
              ? { instructions: speechInstructions(options.getPersonaContext?.() ?? composeMorpheusPersonaContext({
                ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
                personality: options.getPersonality?.() ?? 'adaptive', humorStyle: undefined,
              })) }
              : {}),
          }),
          signal: controller.signal,
          redirect: 'error',
        });
      } catch (error) {
        if (timedOut) {
          throw new Error(
            `Speech provider timed out after ${Math.ceil(speechTimeoutMs / 1_000)} seconds.`,
            { cause: error },
          );
        }
        throw error;
      }
      if (!response.ok) throw new VoiceHttpError(response.status, 'Speech');
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) {
        throw new Error('Speech provider response exceeded the permitted size.');
      }
      let sequence = 0;
      const streamId = payload.streamId;
      const audio = await readBoundedAudio(response, MORPHEUS_SPEECH_MAX_AUDIO_BYTES, 'Speech',
        (bytes) => {
          checkCurrent();
          if (bytes.length && firstAudioByteMs === undefined) firstAudioByteMs = Math.max(0, Date.now() - startedAt);
          if (!streamId || !options.emitSpeechChunk) return;
          // Bound individual IPC messages as well as the complete response.
          for (let offset = 0; offset < bytes.length; offset += 48 * 1024) {
            options.emitSpeechChunk?.({ streamId, sequence: sequence++, audioBase64: bytes.subarray(offset, offset + 48 * 1024).toString('base64') });
          }
        });
      checkCurrent();
      const providerLatencyMs = Math.max(0, Date.now() - startedAt);
      terminalRecorded = true;
      await options.audit.recordControl({
        category: 'voice', event: 'speech-completed', subjectId: resolved.account.id,
        details: { requestId, costStatus: 'unknown', usageStatus: 'missing', dispatched,
          textChars: text.length, bytes: audio.length, modelId, voice, providerLatencyMs,
          ...(firstAudioByteMs !== undefined ? { firstAudioByteMs } : {}) },
        appVersion: options.appVersion,
      });
      checkCurrent();
      speechFailure = undefined;
      return {
        audioBase64: audio.toString('base64'), mimeType: 'audio/mpeg',
        providerAccountId: resolved.account.id, modelId, voice, providerLatencyMs,
      };
    } catch (error) {
      if (!terminalRecorded) await options.audit.recordControl({
        category: 'voice', event: generation !== speechGeneration ? 'speech-cancelled' : 'speech-failed', subjectId: resolved.account.id,
        details: {
          requestId, costStatus: 'unknown', usageStatus: 'missing', dispatched,
          providerLatencyMs: Math.max(0, Date.now() - startedAt),
          ...(firstAudioByteMs !== undefined ? { firstAudioByteMs } : {}),
          textChars: text.length, modelId, voice,
          ...(generation === speechGeneration ? { failureKind: speechFailureKind(error) } : {}),
        }, appVersion: options.appVersion,
      });
      if (generation === speechGeneration) speechFailure = speechFailureKind(error);
      throw error;
    } finally {
      clearTimeout(timer);
      if (speechController === controller) speechController = null;
      if (generation === speechGeneration && currentPresence.state === 'preparing-speech') {
        publish(ambientSession ? 'armed' : 'asleep');
      }
    }
  };

  const service: MorpheusVoiceService = {
    status,
    presence: () => structuredClone(currentPresence),

    async updateSettings(patch) {
      const updatingAuthority = authorityRevision;
      const candidate = {
        ...settings,
        ...patch,
        ...(patch.enabled === false ? { ambientEnabled: false } : {}),
        v: MORPHEUS_VOICE_VERSION,
      };
      const next = validateSettings(candidate);
      if (!next) throw new Error('Invalid Morpheus voice settings.');
      const enableAmbient = !settings.ambientEnabled && next.ambientEnabled;
      if (enableAmbient) {
        if (!options.audit.isHealthy()) throw new Error('Ambient voice is blocked while Audit is unavailable.');
        const managed = options.getManagedRuntime?.();
        if (managed ? !(await managedStatus(managed, next.speechVoice)).transcriptionAvailable : !await resolveAccount()) {
          throw new Error(managed ? 'Managed transcription is unavailable.' : 'No compatible transcription provider is configured.');
        }
      }
      await options.audit.recordControl({
        category: 'voice', event: 'settings-updated',
        details: {
          enabled: next.enabled, ambientEnabled: next.ambientEnabled,
          speakResponses: next.speakResponses, autoSubmitTranscript: next.autoSubmitTranscript,
          providerConfigured: Boolean(next.providerAccountId),
          speechProviderConfigured: Boolean(next.speechProviderAccountId),
          speechModelId: next.speechModelId, speechVoice: next.speechVoice,
          handsFreeFollowUp: next.handsFreeFollowUp,
          wakePhraseChars: next.wakePhrase.length,
        },
        appVersion: options.appVersion,
      });
      const disableAmbient = settings.ambientEnabled && !next.ambientEnabled;
      const restartAmbient = Boolean(ambientSession && (
        settings.localWakeEnabled !== next.localWakeEnabled || settings.wakePhrase !== next.wakePhrase
        || settings.providerAccountId !== next.providerAccountId || settings.modelId !== next.modelId));
      // Persist first: a failed atomic write must not change in-memory policy.
      if (updatingAuthority !== authorityRevision) throw new Error('Voice service changed. Retry the setting.');
      writeJsonAtomically(settingsPath, next);
      for (const controller of transcriptions.keys()) controller.abort(new DOMException('Voice settings changed', 'AbortError'));
      if (settings.speechProviderAccountId !== next.speechProviderAccountId
        || settings.providerAccountId !== next.providerAccountId
        || settings.speechModelId !== next.speechModelId || settings.speechVoice !== next.speechVoice) {
        cancelSpeech();
        speechFailure = undefined;
      }
      settings = structuredClone(next);
      if (disableAmbient || restartAmbient) await service.endAmbientSession();
      if (settings.ambientEnabled) await service.beginAmbientSession();
      else publish('asleep');
      return status();
    },

    transcribe: (payload) => transcribeWithMode(payload, false),
    synthesize,
    cancelSpeech,
    invalidateService() {
      authorityRevision += 1;
      managedAvailability = null;
      for (const controller of transcriptions.keys()) controller.abort();
      cancelSpeech();
      // endAmbientSession clears wake/capture synchronously before its audit await.
      void service.endAmbientSession().catch(() => undefined);
      publish('asleep');
    },

    async beginAmbientSession() {
      if (ambientStarting) return ambientStarting;
      const start = async () => {
      if (ambientSession) return structuredClone(currentPresence);
      const startingAuthority = authorityRevision, startingSettings = settings, startingRevision = ambientStartRevision;
      const checkStart = () => {
        if (startingAuthority !== authorityRevision || settings !== startingSettings || startingRevision !== ambientStartRevision) throw new DOMException('Voice session changed', 'AbortError');
      };
      if (!settings.enabled || !settings.ambientEnabled) throw new Error('Ambient voice is disabled.');
      if (!options.audit.isHealthy()) throw new Error('Ambient voice is blocked while Audit is unavailable.');
      const managed = options.getManagedRuntime?.();
      const available = managed ? await managedStatus(managed) : null;
      const resolved = managed ? (available?.transcriptionAvailable ? { account: { id: 'managed', label: 'Morpheus managed' } } : null) : await resolveAccount();
      checkStart();
      if (!resolved) {
        publish('error', 'Configure a compatible transcription provider before enabling ambient voice.');
        throw new Error('No compatible transcription provider is configured.');
      }
      const startedAt = now().toISOString();
      const sessionId = `voice-${randomUUID()}`;
      clearFollowUp();
      conversationStartedAt = 0;
      conversationTurn = 0;
      followUpPending = false;
      await options.audit.recordControl({
        category: 'voice', event: 'ambient-session-started', subjectId: sessionId,
        details: { providerAccountId: resolved.account.id, modelId: available?.modelId ?? settings.modelId },
        appVersion: options.appVersion,
      });
      checkStart();
      ambientSession = { sessionId, startedAt, providerLabel: resolved.account.label };
      if (settings.localWakeEnabled) {
        try {
          const controller = (options.startLocalWake ?? startWindowsWake)({
            phrase: settings.wakePhrase,
            onWake(command) {
              if (command !== undefined && (typeof command !== 'string' || !command.trim() || command.length > 2000)) return;
              const interruptingSpeech = currentPresence.state === 'speaking'
                || currentPresence.state === 'preparing-speech';
              if (!ambientSession || ambientSession.sessionId !== sessionId
                || ['listening', 'transcribing'].includes(currentPresence.state)
                || (interruptingSpeech && !settings.bargeIn)
                || Date.now() - lastWakeAt < 1500) return;
              lastWakeAt = Date.now();
              void options.audit.recordControl({ category: 'voice', event: 'local-wake-detected',
                subjectId: sessionId, details: {}, appVersion: options.appVersion,
              }).then(() => {
                if (ambientSession?.sessionId !== sessionId) return;
                if (interruptingSpeech) {
                  // The renderer receives the new wake sequence and stops its
                  // playback as well; Main aborts in-flight synthesis here.
                  followUpPending = false;
                  cancelSpeech();
                }
                wakeSequence += 1;
                if (command) {
                  clearFollowUp();
                  localCaptureUntil = 0;
                  publish('understanding', undefined, command.trim());
                  return;
                }
                void openFollowUp('wake').catch(() => {
                  localWake?.stop();
                  publish('error', 'Local wake stopped because Audit is unavailable.');
                });
              }).catch(() => { localWake?.stop(); publish('error', 'Local wake stopped because Audit is unavailable.'); });
            },
            onError() { publish('error', 'Local wake stopped. Check your microphone and restart ambient voice.'); },
          });
          localWake = controller;
          await controller.ready;
          if (ambientSession?.sessionId !== sessionId) { controller.stop(); return structuredClone(currentPresence); }
        } catch (error) {
          await service.endAmbientSession();
          publish('error', 'Windows local wake is unavailable. Check your microphone and installed English speech recognition.');
          throw error;
        }
      }
      return publish('armed');
      };
      ambientStarting = start();
      try { return await ambientStarting; } finally { ambientStarting = null; }
    },

    async endAmbientSession() {
      ambientStartRevision += 1;
      for (const [controller, ambient] of transcriptions) if (ambient) controller.abort(new DOMException('Ambient voice stopped', 'AbortError'));
      localAddressUntil = 0;
      localCaptureUntil = 0;
      clearFollowUp();
      conversationStartedAt = 0;
      conversationTurn = 0;
      followUpPending = false;
      localWake?.stop();
      localWake = null;
      const session = ambientSession;
      ambientSession = null;
      if (session) {
        try {
          await options.audit.recordControl({
            category: 'voice', event: 'ambient-session-ended', subjectId: session.sessionId,
            details: {}, appVersion: options.appVersion,
          });
        } finally {
          publish('asleep');
        }
      } else publish('asleep');
      return structuredClone(currentPresence);
    },

    async setAmbientListening(listening) {
      if (!ambientSession) throw new Error('Ambient voice is not armed.');
      if (listening && settings.localWakeEnabled) {
        if (!localAddressUntil || Date.now() > localAddressUntil) throw new Error('Say the wake phrase before recording a command.');
        localAddressUntil = 0;
        localCaptureUntil = Date.now() + settings.ambientMaxUtteranceMs + 5_000;
      }
      if (listening) {
        if (followUpTimer) clearTimeout(followUpTimer);
        followUpTimer = null;
        followUpUntil = 0;
      }
      await options.audit.recordControl({
        category: 'voice',
        event: listening ? 'ambient-capture-started' : 'ambient-capture-ended',
        subjectId: ambientSession.sessionId,
        details: {}, appVersion: options.appVersion,
      });
      return publish(listening ? 'listening' : 'armed');
    },

    transcribeAmbient: (payload) => transcribeWithMode(payload, true),

    setSpeaking(speaking) {
      if (speaking) {
        clearFollowUp();
        return publish('speaking');
      }
      const next = publish(settings.ambientEnabled ? 'armed' : 'asleep');
      if (followUpPending && ambientSession) {
        followUpPending = false;
        void openFollowUp('result').catch(() => publish('error', 'Voice follow-up stopped because Audit is unavailable.'));
      }
      return next;
    },

    observeObjective(event) {
      if (!ambientSession || event.run.origin.type !== 'voice') return;
      if (event.state === 'understanding') {
        voiceObjectiveId = event.objectiveRunId;
        voiceObjectiveWakeSequence = wakeSequence;
      }
      if (voiceObjectiveId && voiceObjectiveId !== event.objectiveRunId) return;
      // A background result cannot close capture for a newer wake/utterance.
      if (event.state !== 'understanding' && (['listening', 'transcribing'].includes(currentPresence.state)
        || (currentPresence.state === 'armed' && voiceObjectiveWakeSequence !== wakeSequence))) return;
      if (!conversationActive() && event.state === 'understanding') {
        conversationStartedAt = Date.now();
        conversationTurn = 0;
      }
      const next = objectivePresence(event.state);
      if (next) publish(next, event.state === 'error' ? event.run.error?.message : undefined);
      if (['complete', 'needs-clarification', 'error', 'degraded'].includes(event.state)) {
        followUpPending = settings.handsFreeFollowUp;
        if (followUpPending && !settings.speakResponses) {
          followUpPending = false;
          void openFollowUp('result').catch(() => publish('error', 'Voice follow-up stopped because Audit is unavailable.'));
        }
      } else if (event.state === 'cancelled') {
        followUpPending = false;
        clearFollowUp();
      }
    },

    dispose() {
      authorityRevision += 1;
      ambientStartRevision += 1;
      for (const controller of transcriptions.keys()) controller.abort(new DOMException('Voice disposed', 'AbortError'));
      transcriptions.clear();
      localWake?.stop();
      localWake = null;
      clearFollowUp();
      cancelSpeech();
      ambientSession = null;
      currentPresence = {
        v: MORPHEUS_VOICE_VERSION, state: 'asleep', ambientEnabled: settings.ambientEnabled,
      };
    },
  };

  return service;
}

export { decodeAudio as validateAndDecodeMorpheusAudio, validateSettings as validateMorpheusVoiceSettings };
