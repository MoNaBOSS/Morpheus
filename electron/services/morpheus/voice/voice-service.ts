import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isMorpheusWakeAudioFrame, MORPHEUS_WAKE_FRAME_BYTES, type MorpheusAmbientInputSession, type MorpheusWakeAudioFrame } from '@shared/morpheus/wake-audio-types';
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
import { addressedLocalWakeTranscript, MorpheusWakeAudioBuffer } from './wake-audio-buffer';
import type { ManagedRuntimeBridge } from '../managed/runtime-bridge';
import { createManagedVoiceOperation, managedVoiceAvailability } from './managed-voice';
import type { MorpheusLocalVoice } from './local-voice';
import { MorpheusNoSpeechError, validateMorpheusLocalTranscript } from './local-input';
import { DeepgramVoiceError, type MorpheusDeepgramVoice, type MorpheusDeepgramRecognitionSession } from './deepgram-voice';
import type { MorpheusDeepgramConnectionService } from './deepgram-connection';

function isIncludedVoiceEngine(engine: MorpheusVoiceSettings['engine']): boolean {
  return engine !== 'provider' && engine !== 'deepgram';
}

const DEFAULT_VOICE_SETTINGS: MorpheusVoiceSettings = Object.freeze({
  v: MORPHEUS_VOICE_VERSION,
  enabled: true,
  providerAccountId: null,
  modelId: 'whisper-1',
  speakResponses: true,
  replySpeechMode: 'orb',
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
  if (error instanceof DeepgramVoiceError) {
    if (error.code === 'authentication') return 'authentication';
    if (error.code === 'access') return 'access';
    if (error.code === 'rate-limit') return 'rate-limit';
    return 'unavailable';
  }
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
  beginDeepgramInput(): Promise<{ sessionId: string }>;
  feedDeepgramInput(frame: MorpheusWakeAudioFrame): Promise<{ ready: boolean }>;
  waitDeepgramInput(payload: { sessionId: string }): Promise<MorpheusTranscriptionResult>;
  finishDeepgramInput(payload: { sessionId: string }): { finished: boolean };
  cancelDeepgramInput(payload: { sessionId: string }): { cancelled: boolean };
  synthesize(payload: MorpheusSynthesizeSpeechPayload): Promise<MorpheusSynthesizeSpeechResult>;
  cancelSpeech(): void;
  prepareOutput(): Promise<{ prepared: boolean }>;
  reconcileAmbientScope(): Promise<void>;
  invalidateService?(): void;
  beginAmbientSession(): Promise<MorpheusVoicePresence>;
  prepareAmbientInput(): Promise<MorpheusAmbientInputSession>;
  feedWakeAudio(frame: MorpheusWakeAudioFrame): Promise<{ ready: boolean }>;
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
  if (migrated.replySpeechMode !== undefined && !['orb', 'voice', 'all'].includes(migrated.replySpeechMode as string)) return null;
  if (migrated.engine !== undefined && !['local', 'provider', 'deepgram'].includes(migrated.engine as string)) return null;
  if (migrated.inputDeviceId !== undefined && (typeof migrated.inputDeviceId !== 'string' || migrated.inputDeviceId.length > 256)) return null;
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
    ...(migrated.engine ? { engine: migrated.engine as MorpheusVoiceSettings['engine'] } : {}),
    ...(typeof migrated.inputDeviceId === 'string' ? { inputDeviceId: migrated.inputDeviceId } : {}),
    enabled: value.enabled,
    providerAccountId: value.providerAccountId,
    modelId: value.modelId.trim(),
    speakResponses: value.speakResponses,
    replySpeechMode: (migrated.replySpeechMode ?? 'orb') as MorpheusVoiceSettings['replySpeechMode'],
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
  localVoice?: MorpheusLocalVoice;
  deepgram?: MorpheusDeepgramVoice;
  deepgramConnection?: MorpheusDeepgramConnectionService;
  /** Main-owned native visibility; foreground conversations require an explicit microphone press. */
  isCompanionVoiceScope?: () => boolean;
}): MorpheusVoiceService {
  const now = options.now ?? (() => new Date());
  const transcriptionTimeoutMs = options.transcriptionTimeoutMs ?? MORPHEUS_VOICE_PROVIDER_TIMEOUT_MS;
  const speechTimeoutMs = options.speechTimeoutMs ?? MORPHEUS_VOICE_PROVIDER_TIMEOUT_MS;
  const settingsPath = join(options.userDataDir, 'morpheus', 'voice-settings.json');
  let settings = readValidatedJson(settingsPath, validateSettings) ?? structuredClone(DEFAULT_VOICE_SETTINGS);
  if (settings.engine === 'deepgram' || (options.localVoice && isIncludedVoiceEngine(settings.engine))) {
    settings = { ...settings, localWakeEnabled: true };
  }
  let ambientSession: { sessionId: string; startedAt: string; providerLabel: string } | null = null;
  const wakeAudio = new MorpheusWakeAudioBuffer();
  let ambientInputReady = false;
  let wakeAudioSequence = 0;
  let wakeAudioBytes = 0;
  let wakeAudioWindow = 0;
  let wakeAudioBusy = false;
  let wakeVerificationInFlight = false;
  let speechGeneration = 0;
  let authorityRevision = 0;
  let ambientStarting: Promise<MorpheusVoicePresence> | null = null;
  let ambientStartingRevision = 0;
  let ambientStartRevision = 0;
  let preparationRevision = 0;
  let settingsUpdateRevision = 0;
  let settingsRevision = 0;
  let inputVeto = false;
  let disposed = false;
  const inputAllowed = () => !disposed && settings.enabled && !inputVeto;
  const companionVoiceAllowed = () => inputAllowed() && (options.isCompanionVoiceScope?.() ?? true);
  const effectiveSettings = () => ({ ...structuredClone(settings), enabled: inputAllowed() });
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
  let recoverySequence = 0;
  let recovery: MorpheusVoicePresence['recovery'];
  let question: MorpheusVoicePresence['question'];
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
  let followUpRevision = 0;
  const transcriptions = new Map<AbortController, boolean>();
  let cloudInputRevision = 0;
  let cloudInputStarting: AbortController | undefined;
  let cloudInput: {
    sessionId: string; sequence: number; byteLength: number; windowBytes: number; windowAt: number;
    controller: AbortController; session: MorpheusDeepgramRecognitionSession;
    result: Promise<MorpheusTranscriptionResult>; firstFrame: boolean; completed: boolean; busy: boolean; claimed: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | undefined;
  const cancelCloudInput = () => {
    cloudInputRevision += 1;
    cloudInputStarting?.abort(new DOMException('Voice input cancelled', 'AbortError'));
    if (cloudInputStarting) transcriptions.delete(cloudInputStarting);
    cloudInputStarting = undefined;
    if (!cloudInput) return;
    const input = cloudInput; cloudInput = undefined;
    clearTimeout(input.timer); input.controller.abort(new DOMException('Voice input cancelled', 'AbortError'));
    input.session.cancel(); transcriptions.delete(input.controller);
  };
  const clearFollowUp = (): void => {
    followUpRevision += 1;
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
      publish(ambientSession && ambientInputReady ? 'armed' : 'asleep');
    }
  };
  let currentPresence: MorpheusVoicePresence = {
    v: MORPHEUS_VOICE_VERSION,
    inputEnabled: inputAllowed(),
    settingsRevision,
    state: 'asleep',
    ambientEnabled: settings.ambientEnabled,
  };
  const publish = (state: MorpheusVoicePresenceState, reason?: string, wakeCommand?: string): MorpheusVoicePresence => {
    // Warm only during an actual addressed interaction, never on idle wake monitoring.
    // Input/audio authority is unchanged; this only loads the offline output model.
    if (inputAllowed() && settings.speakResponses && isIncludedVoiceEngine(settings.engine) && ['listening', 'transcribing', 'understanding'].includes(state)) {
      void options.localVoice?.warm?.().catch(() => undefined);
    }
    currentPresence = {
      v: MORPHEUS_VOICE_VERSION,
      inputEnabled: inputAllowed(),
      authorityRevision,
      settingsRevision,
      state,
      ambientEnabled: settings.ambientEnabled,
      ...(ambientSession ? {
        sessionStartedAt: ambientSession.startedAt,
        providerLabel: ambientSession.providerLabel,
      } : {}),
      ...(reason ? { reason } : {}),
      ...(speechFailure ? { speechFailure } : {}),
      ...(recovery ? { recovery } : {}),
      ...(question ? { question } : {}),
      ...(wakeSequence ? { wakeSequence } : {}),
      ...(wakeCommand ? { wakeCommand } : {}),
      ...(followUpUntil > Date.now() ? { followUpUntil: new Date(followUpUntil).toISOString() } : {}),
      ...(conversationTurn ? { conversationTurn } : {}),
    };
    options.emitPresence?.(structuredClone(currentPresence));
    return structuredClone(currentPresence);
  };
  const publishRecovery = (kind: NonNullable<MorpheusVoicePresence['recovery']>['kind']): void => {
    clearFollowUp();
    localCaptureUntil = 0;
    followUpPending = false;
    recovery = { kind, sequence: ++recoverySequence };
    publish(ambientSession && ambientInputReady && companionVoiceAllowed() ? 'armed' : 'asleep');
  };
  const conversationActive = (): boolean => conversationStartedAt > 0
    && Date.now() - conversationStartedAt <= MORPHEUS_VOICE_CONVERSATION_MAX_MS
    && conversationTurn < MORPHEUS_VOICE_CONVERSATION_MAX_TURNS;
  const openFollowUp = async (reason: 'wake' | 'result'): Promise<void> => {
    if (!companionVoiceAllowed() || !ambientSession || !ambientInputReady || !settings.handsFreeFollowUp && reason === 'result') return;
    const session = ambientSession, scopeRevision = ambientStartRevision;
    if (reason === 'wake' || !conversationActive()) {
      conversationStartedAt = Date.now();
      conversationTurn = 0;
    }
    if (!conversationActive()) return;
    clearFollowUp();
    const windowRevision = followUpRevision;
    conversationTurn += 1;
    followUpUntil = Date.now() + MORPHEUS_VOICE_FOLLOW_UP_MS;
    if (settings.localWakeEnabled) localAddressUntil = followUpUntil;
    await options.audit.recordControl({
      category: 'voice', event: reason === 'wake' ? 'conversation-started' : 'follow-up-opened',
      subjectId: session.sessionId,
      details: { turn: conversationTurn, expiresInMs: MORPHEUS_VOICE_FOLLOW_UP_MS },
      appVersion: options.appVersion,
    });
    if (!companionVoiceAllowed() || ambientSession !== session || scopeRevision !== ambientStartRevision
      || windowRevision !== followUpRevision) return;
    publish('armed');
    followUpTimer = setTimeout(() => {
      if (!companionVoiceAllowed() || ambientSession !== session || scopeRevision !== ambientStartRevision
        || windowRevision !== followUpRevision) return;
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
    const deepgram = await options.deepgramConnection?.snapshot();
    if (settings.engine === 'deepgram') {
      const configured = Boolean(options.deepgram && deepgram?.configured);
      return {
        settings: effectiveSettings(), presence: structuredClone(currentPresence), providers: [],
        transcriptionAvailable: inputAllowed() && configured, neuralSpeechAvailable: configured,
        captureFormat: 'pcm16-wav', speechFormat: 'pcm24', deepgram,
        providerLabel: 'Deepgram', speechProviderLabel: 'Deepgram Kit',
        ...(!configured ? { reason: 'Connect Deepgram securely in Voice settings, then test the connection.' }
          : !inputAllowed() ? { reason: 'Microphone is muted. Enable it in Voice settings.' } : {}),
      };
    }
    if (options.localVoice && isIncludedVoiceEngine(settings.engine)) {
      const ready = options.localVoice.ready();
      return { settings: { ...effectiveSettings(), engine: 'local' }, presence: structuredClone(currentPresence), providers: [],
        transcriptionAvailable: inputAllowed() && ready, neuralSpeechAvailable: ready, captureFormat: 'pcm16-wav', speechFormat: options.localVoice.synthesizeStream ? 'pcm24' : 'wav',
        availableSpeechVoices: ['cedar', 'coral'], providerLabel: 'Included local English voice', speechProviderLabel: 'Included local neural voice', deepgram,
        ...(!ready || !inputAllowed() ? { reason: !inputAllowed() ? 'Microphone is muted. Enable it in Voice settings.' : 'Included voice files are missing. Repair the Morpheus installation.' } : {}) };
    }
    const managed = options.getManagedRuntime?.();
    if (managed) {
      const available = inputAllowed() ? await managedStatus(managed)
        : { transcriptionAvailable: false, neuralSpeechAvailable: false };
      return { ...available, captureFormat: 'pcm16-wav', speechFormat: 'pcm24',
        settings: { ...effectiveSettings(), ...(available.modelId ? { modelId: available.modelId } : {}),
          ...(available.speechModelId ? { speechModelId: available.speechModelId } : {}) },
        presence: structuredClone(currentPresence), providers: [], providerLabel: 'Morpheus managed', speechProviderLabel: 'Morpheus managed', deepgram,
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
    if (!inputAllowed()) {
      return {
        settings: effectiveSettings(), presence: structuredClone(currentPresence), deepgram,
        transcriptionAvailable: false, neuralSpeechAvailable: false, providers,
        reason: 'Voice input is disabled.',
      };
    }
    const resolved = await resolveAccount(accounts);
    const speech = await resolveAccount(accounts, settings.speechProviderAccountId ?? settings.providerAccountId);
    return {
      settings: effectiveSettings(), presence: structuredClone(currentPresence), providers, deepgram,
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
    forceIncludedLocal = false,
  ): Promise<MorpheusTranscriptionResult> => {
    if (!inputAllowed()) throw new Error('Voice input is disabled.');
    if (!options.audit.isHealthy()) throw new Error('Voice transcription is blocked while Audit is unavailable.');
    if (ambient && (!ambientSession || !ambientInputReady)) throw new Error('Ambient voice is not armed.');
    const inputSettings = settings;
    const inputAuthority = authorityRevision;
    const inputSession = ambientSession?.sessionId;
    const checkInput = () => {
      if (inputAuthority !== authorityRevision || !inputAllowed() || settings !== inputSettings
        || (ambient && (!companionVoiceAllowed() || ambientSession?.sessionId !== inputSession))) {
        throw new DOMException('Voice input cancelled', 'AbortError');
      }
    };
    if (ambient && settings.localWakeEnabled) {
      if (!localCaptureUntil || Date.now() > localCaptureUntil) throw new Error('Say the wake phrase before recording a command.');
      localCaptureUntil = 0; // one bounded upload per admitted capture
    }
    const audio = decodeAudio(payload);
    if (forceIncludedLocal && !options.localVoice?.ready()) throw new Error('Included recognition is unavailable. Repair the local voice installation.');
    if (recovery) {
      recovery = undefined;
      publish(currentPresence.state);
    }
    if (settings.engine === 'deepgram' && !forceIncludedLocal) {
      if (!options.deepgram || !options.deepgramConnection) throw new Error('Connect Deepgram in Voice settings.');
      if (payload.mimeType !== 'audio/wav') throw new Error('Cloud voice requires WAV capture. Reopen Voice settings and retry.');
      const controller = new AbortController(); transcriptions.set(controller, ambient);
      const started = performance.now();
      try {
        checkInput();
        const credentials = await options.deepgramConnection.credentials();
        checkInput();
        if (!credentials) throw new Error('Connect Deepgram securely in Voice settings.');
        await options.audit.recordControl({ category: 'voice', event: 'transcription-started', subjectId: 'deepgram',
          details: { modelId: credentials.recognitionModel, bytes: audio.length, durationMs: payload.durationMs, ambient, costStatus: 'unknown' }, appVersion: options.appVersion });
        checkInput();
        if (ambient) publish('transcribing');
        const transcript = validateMorpheusLocalTranscript(await options.deepgram.transcribe(audio, controller.signal, { model: credentials.recognitionModel }));
        checkInput();
        await options.audit.recordControl({ category: 'voice', event: 'transcription-completed', subjectId: 'deepgram',
          details: { modelId: credentials.recognitionModel, durationMs: payload.durationMs, providerLatencyMs: Math.round(performance.now() - started), ambient, costStatus: 'unknown' }, appVersion: options.appVersion });
        checkInput();
        if (ambient) publish('armed');
        return { transcript, providerAccountId: 'deepgram', modelId: credentials.recognitionModel, durationMs: payload.durationMs, providerLatencyMs: Math.round(performance.now() - started) };
      } catch (error) {
        checkInput();
        if (error instanceof MorpheusNoSpeechError) publishRecovery('no-speech');
        else if (ambient) publish('error', error instanceof DeepgramVoiceError ? error.message : 'Cloud recognition failed. Check Voice settings and retry.');
        throw error;
      } finally { transcriptions.delete(controller); }
    }
    if (options.localVoice && (isIncludedVoiceEngine(settings.engine) || forceIncludedLocal)) {
      if (payload.mimeType !== 'audio/wav') throw new Error('Local voice needs WAV capture. Reopen Voice settings and retry.');
      const controller = new AbortController(); transcriptions.set(controller, ambient);
      const started = performance.now();
      try {
        checkInput();
        if (ambient) publish('transcribing');
        else if (settings.speakResponses) void options.localVoice.warm?.().catch(() => undefined);
        const decoded = await options.localVoice.transcribe(audio, controller.signal);
        checkInput();
        const transcript = validateMorpheusLocalTranscript(decoded);
        await options.audit.recordControl({ category: 'voice', event: 'transcription-completed', subjectId: 'included-local',
          details: { durationMs: payload.durationMs, providerLatencyMs: Math.round(performance.now() - started), ambient, modelId: 'whisper-tiny.en', costStatus: 'local' }, appVersion: options.appVersion });
        checkInput();
        if (ambient) publish('armed');
        return { transcript, providerAccountId: 'included-local', modelId: 'whisper-tiny.en', durationMs: payload.durationMs, providerLatencyMs: Math.round(performance.now() - started) };
      } catch (error) {
        checkInput();
        if (error instanceof MorpheusNoSpeechError) {
          await options.audit.recordControl({ category: 'voice', event: 'transcription-rejected', subjectId: 'included-local',
            details: { durationMs: payload.durationMs, providerLatencyMs: Math.round(performance.now() - started), ambient,
              modelId: 'whisper-tiny.en', costStatus: 'local', reason: 'no-speech' }, appVersion: options.appVersion });
          checkInput();
          // This records a repair cue, never a transcript or another capture grant.
          publishRecovery('no-speech');
        }
        throw error;
      } finally { transcriptions.delete(controller); }
    }
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
    // Automatic reply owners enforce speakResponses. An explicit Voice sample
    // remains usable while replies are quiet, without changing input consent.
    if (!settings.speakResponses && settings.engine !== 'deepgram'
      && !(options.localVoice && isIncludedVoiceEngine(settings.engine))) throw new Error('Spoken responses are disabled.');
    if (!options.audit.isHealthy()) throw new Error('Neural speech is blocked while Audit is unavailable.');
    const text = payload.text.trim();
    if (!text || text.length > MORPHEUS_SPEECH_MAX_TEXT_CHARS) {
      throw new Error('Speech text is empty or exceeds the permitted length.');
    }
    if (settings.engine === 'deepgram') {
      if (!options.deepgram || !options.deepgramConnection) throw new Error('Connect Deepgram in Voice settings.');
      const controller = new AbortController(); speechController = controller;
      const started = performance.now();
      const configuration = settings;
      const checkCloud = () => {
        checkCurrent();
        if (settings !== configuration || controller.signal.aborted) throw new DOMException('Speech cancelled', 'AbortError');
      };
      const timer = setTimeout(() => controller.abort(new DOMException('Cloud speech timed out', 'TimeoutError')), speechTimeoutMs); timer.unref?.();
      let firstAudioByteMs: number | undefined, sequence = 0, bytes = 0;
      try {
        checkCloud();
        if (!await options.deepgramConnection.credentials()) throw new Error('Connect Deepgram securely in Voice settings.');
        checkCloud();
        await options.audit.recordControl({ category: 'voice', event: 'speech-started', subjectId: 'deepgram',
          details: { modelId: 'flux-kit-en', textChars: text.length, costStatus: 'unknown' }, appVersion: options.appVersion });
        checkCloud(); publish('preparing-speech');
        let audio: Buffer;
        const streaming = Boolean(payload.streamId && options.emitSpeechChunk);
        if (streaming) {
          await options.deepgram.synthesizeStream(text, controller.signal, pcm => {
            checkCloud();
            bytes += pcm.length;
            if (!pcm.length || pcm.length % 2 || bytes > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) throw new Error('Cloud speech exceeded its audio limit.');
            firstAudioByteMs ??= Math.round(performance.now() - started);
            for (let offset = 0; offset < pcm.length; offset += 48 * 1024) {
              options.emitSpeechChunk!({ streamId: payload.streamId!, sequence: sequence++, mimeType: 'audio/pcm',
                audioBase64: pcm.subarray(offset, offset + 48 * 1024).toString('base64') });
            }
          });
          if (!bytes) throw new Error('Cloud speech returned no audio.');
          audio = Buffer.alloc(0);
        } else audio = await options.deepgram.synthesize(text, controller.signal);
        checkCloud();
        await options.audit.recordControl({ category: 'voice', event: 'speech-completed', subjectId: 'deepgram',
          details: { modelId: 'flux-kit-en', providerLatencyMs: Math.round(performance.now() - started), costStatus: 'unknown',
            ...(firstAudioByteMs !== undefined ? { firstAudioByteMs } : {}) }, appVersion: options.appVersion });
        checkCloud(); speechFailure = undefined;
        return { audioBase64: audio.toString('base64'), mimeType: streaming ? 'audio/pcm' : 'audio/wav',
          providerAccountId: 'deepgram', modelId: 'flux-kit-en', voice: settings.speechVoice,
          providerLatencyMs: Math.round(performance.now() - started), ...(firstAudioByteMs !== undefined ? { firstAudioByteMs } : {}),
          ...(streaming ? { pcmStream: { streamId: payload.streamId!, chunkCount: sequence, byteLength: bytes } } : {}) };
      } catch (error) { if (generation === speechGeneration) speechFailure = speechFailureKind(error); throw error; }
      finally {
        clearTimeout(timer);
        if (speechController === controller) speechController = null;
        if (generation === speechGeneration && currentPresence.state === 'preparing-speech') publish(ambientSession && ambientInputReady ? 'armed' : 'asleep');
      }
    }
    if (options.localVoice && isIncludedVoiceEngine(settings.engine)) {
      const controller = new AbortController(); speechController = controller;
      const started = performance.now();
      try {
        checkCurrent(); publish('preparing-speech');
        const streaming = Boolean(payload.streamId && options.localVoice.synthesizeStream);
        let firstAudioByteMs: number | undefined, sequence = 0, bytes = 0;
        const collected: Buffer[] = [];
        let audio: Buffer;
        if (streaming) {
          await options.localVoice.synthesizeStream!(text, settings.speechVoice, controller.signal, (pcm) => {
            checkCurrent();
            bytes += pcm.length;
            if (!pcm.length || bytes > MORPHEUS_SPEECH_MAX_AUDIO_BYTES || pcm.length % 2) throw new Error('Included speech exceeded its audio limit.');
            firstAudioByteMs ??= Math.round(performance.now() - started);
            if (!options.emitSpeechChunk) { collected.push(pcm); return; }
            for (let offset = 0; offset < pcm.length; offset += 48 * 1024) {
              options.emitSpeechChunk({ streamId: payload.streamId!, sequence: sequence++, mimeType: 'audio/pcm', source: 'included-local', audioBase64: pcm.subarray(offset, offset + 48 * 1024).toString('base64') });
            }
          });
          checkCurrent();
          if (!bytes) throw new Error('Included speech returned no audio.');
          audio = Buffer.concat(collected);
        } else audio = await options.localVoice.synthesize(text, settings.speechVoice, controller.signal);
        checkCurrent(); speechFailure = undefined;
        await options.audit.recordControl({ category: 'voice', event: 'speech-completed', subjectId: 'included-local',
          details: { modelId: 'kokoro-int8', providerLatencyMs: Math.round(performance.now() - started), ...(firstAudioByteMs !== undefined ? { firstAudioByteMs } : {}), costStatus: 'local' }, appVersion: options.appVersion });
        return { audioBase64: audio.toString('base64'), mimeType: streaming ? 'audio/pcm' : 'audio/wav', providerAccountId: 'included-local', modelId: 'kokoro-int8', voice: settings.speechVoice, providerLatencyMs: Math.round(performance.now() - started), ...(firstAudioByteMs !== undefined ? { firstAudioByteMs } : {}),
          ...(streaming && options.emitSpeechChunk ? { pcmStream: { streamId: payload.streamId!, chunkCount: sequence, byteLength: bytes } } : {}) };
      } catch (error) { if (generation === speechGeneration) speechFailure = 'unavailable'; throw error; }
      finally { if (speechController === controller) speechController = null; if (generation === speechGeneration && currentPresence.state === 'preparing-speech') publish(ambientSession && ambientInputReady ? 'armed' : 'asleep'); }
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
        let chunkCount = 0, byteLength = 0;
        const emitManagedChunk = payload.streamId && options.emitSpeechChunk ? (chunk: MorpheusSpeechChunk) => {
          chunkCount += 1; byteLength += Buffer.byteLength(chunk.audioBase64, 'base64');
          options.emitSpeechChunk!(chunk);
        } : undefined;
        const result = await createManagedVoiceOperation({ runtime: managed, audit: options.audit, appVersion: options.appVersion,
          signal: controller.signal, checkCurrent }).synthesize(text, settings.speechVoice, instructions, payload.streamId, emitManagedChunk);
        checkCurrent(); speechFailure = undefined;
        return { ...result, ...(emitManagedChunk ? { pcmStream: { streamId: payload.streamId!, chunkCount, byteLength } } : {}) };
      } catch (error) {
        if (generation === speechGeneration) speechFailure = 'unavailable';
        throw error;
      } finally {
        clearTimeout(timer);
        if (speechController === controller) speechController = null;
        if (generation === speechGeneration && currentPresence.state === 'preparing-speech') publish(ambientSession && ambientInputReady ? 'armed' : 'asleep');
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
        publish(ambientSession && ambientInputReady ? 'armed' : 'asleep');
      }
    }
  };

  const service: MorpheusVoiceService = {
    status,
    presence: () => structuredClone(currentPresence),

    async prepareOutput() {
      // This explicit preparation never selects a provider or sends text/audio.
      if (!inputAllowed() || !settings.speakResponses || settings.engine === 'provider'
        || !options.localVoice?.ready() || !options.localVoice.warm) return { prepared: false };
      const revision = preparationRevision, authority = authorityRevision, configuration = settings;
      await options.localVoice.warm();
      if (revision !== preparationRevision || authority !== authorityRevision || settings !== configuration) {
        throw new DOMException('Voice preparation cancelled', 'AbortError');
      }
      return { prepared: true };
    },

    async reconcileAmbientScope() {
      if (!companionVoiceAllowed()) {
        // endAmbientSession invalidates startup and stops native wake before its audit await.
        await service.endAmbientSession();
        return;
      }
      // Only the renderer's single acquisition owner may start a session on
      // return. Native hide must not silently bypass its permission-error latch.
    },

    async updateSettings(patch) {
      const updatingAuthority = authorityRevision;
      const updateRevision = ++settingsUpdateRevision;
      const candidate = {
        ...settings,
        enabled: inputAllowed(),
        ...patch,
        ...((patch.engine ?? settings.engine) === 'deepgram' || options.localVoice && isIncludedVoiceEngine(patch.engine ?? settings.engine) ? { localWakeEnabled: true } : {}),
        v: MORPHEUS_VOICE_VERSION,
      };
      const next = validateSettings(candidate);
      if (!next) throw new Error('Invalid Morpheus voice settings.');
      if (!next.enabled) {
        // Manual mute is an immediate runtime veto. Audit or disk latency cannot
        // keep recording or allow a late wake to execute. Failure stays muted.
        inputVeto = true;
        cancelCloudInput();
        recovery = undefined;
        question = undefined;
        preparationRevision += 1;
        for (const controller of transcriptions.keys()) controller.abort(new DOMException('Microphone muted', 'AbortError'));
        cancelSpeech();
        options.localVoice?.releaseWarm?.();
        void service.endAmbientSession().catch(() => undefined);
      }
      const enableAmbient = !settings.ambientEnabled && next.ambientEnabled;
      if (enableAmbient && next.enabled) {
        if (!options.audit.isHealthy()) throw new Error('Ambient voice is blocked while Audit is unavailable.');
        const managed = options.getManagedRuntime?.();
        if (next.engine === 'deepgram' ? !options.deepgram || !(await options.deepgramConnection?.snapshot())?.configured
          : options.localVoice && isIncludedVoiceEngine(next.engine) ? !options.localVoice.ready() : managed ? !(await managedStatus(managed, next.speechVoice)).transcriptionAvailable : !await resolveAccount()) {
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
        settings.engine !== next.engine || settings.inputDeviceId !== next.inputDeviceId || settings.localWakeEnabled !== next.localWakeEnabled || settings.wakePhrase !== next.wakePhrase
        || settings.providerAccountId !== next.providerAccountId || settings.modelId !== next.modelId));
      // Commit preferences atomically; the earlier manual-mute veto remains
      // authoritative even if persistence fails.
      if (updatingAuthority !== authorityRevision || updateRevision !== settingsUpdateRevision) throw new Error('Voice service changed. Retry the setting.');
      writeJsonAtomically(settingsPath, next);
      cancelCloudInput();
      for (const controller of transcriptions.keys()) controller.abort(new DOMException('Voice settings changed', 'AbortError'));
      if (settings.engine !== next.engine || !next.enabled || settings.speechProviderAccountId !== next.speechProviderAccountId
        || settings.replySpeechMode !== next.replySpeechMode
        || settings.providerAccountId !== next.providerAccountId
        || settings.speechModelId !== next.speechModelId || settings.speechVoice !== next.speechVoice) {
        cancelSpeech();
        speechFailure = undefined;
      }
      if (next.enabled && (!next.speakResponses || settings.engine !== next.engine || settings.speechVoice !== next.speechVoice)) {
        preparationRevision += 1;
        options.localVoice?.releaseWarm?.();
      }
      settings = structuredClone(next);
      settingsRevision += 1;
      if (patch.enabled === true) inputVeto = false;
      if (disableAmbient || restartAmbient || !next.enabled) await service.endAmbientSession();
      // Tray edits bypass the renderer's settings action. Publish the committed
      // revision even when an existing session does not change its audio state.
      currentPresence = { ...currentPresence, settingsRevision, ambientEnabled: settings.ambientEnabled, inputEnabled: inputAllowed() };
      options.emitPresence?.(structuredClone(currentPresence));
      if (settings.enabled && settings.ambientEnabled && companionVoiceAllowed()) await service.beginAmbientSession();
      else publish('asleep');
      return status();
    },

    transcribe: (payload) => transcribeWithMode(payload, false),
    async beginDeepgramInput() {
      if (!inputAllowed() || settings.engine !== 'deepgram') throw new Error('Enable Cloud voice in Voice settings before recording.');
      if (!options.audit.isHealthy() || !options.deepgram || !options.deepgramConnection) throw new Error('Cloud voice is unavailable. Check Voice settings.');
      cancelCloudInput();
      const revision = cloudInputRevision;
      const authority = authorityRevision, configuration = settings;
      const controller = new AbortController(); transcriptions.set(controller, false);
      cloudInputStarting = controller;
      const check = () => {
        if (!inputAllowed() || controller.signal.aborted || revision !== cloudInputRevision || authority !== authorityRevision || settings !== configuration) {
          throw new DOMException('Voice input cancelled', 'AbortError');
        }
      };
      try {
        const credentials = await options.deepgramConnection.credentials(); check();
        if (!credentials) throw new Error('Connect Deepgram securely in Voice settings.');
        const started = performance.now();
        const sessionId = `voice-${randomUUID()}`;
        await options.audit.recordControl({ category: 'voice', event: 'transcription-started', subjectId: 'deepgram',
          details: { modelId: credentials.recognitionModel, streaming: true, costStatus: 'unknown' }, appVersion: options.appVersion }); check();
        const session = await options.deepgram.createRecognitionSession({ signal: controller.signal, model: credentials.recognitionModel }); check();
        const input = {
          sessionId, sequence: 0, byteLength: 0, windowBytes: 0, windowAt: Date.now(),
          controller, session, firstFrame: true, completed: false, busy: false, claimed: false,
          result: Promise.resolve({} as MorpheusTranscriptionResult),
          timer: setTimeout(() => controller.abort(new DOMException('Voice input timed out', 'TimeoutError')), 35_000),
        };
        input.timer.unref?.();
        input.result = session.result.then(async text => {
          input.completed = true;
          check();
          if (cloudInput !== input || input.firstFrame) throw new DOMException('Voice input cancelled', 'AbortError');
          const transcript = validateMorpheusLocalTranscript(text);
          await options.audit.recordControl({ category: 'voice', event: 'transcription-completed', subjectId: 'deepgram',
            details: { modelId: credentials.recognitionModel, streaming: true, durationMs: Math.round(input.byteLength / 32),
              providerLatencyMs: Math.round(performance.now() - started), costStatus: 'unknown' }, appVersion: options.appVersion }); check();
          return { transcript, providerAccountId: 'deepgram', modelId: credentials.recognitionModel,
            durationMs: Math.round(input.byteLength / 32), providerLatencyMs: Math.round(performance.now() - started) };
        });
        void input.result.catch(() => undefined); // Wait/cancel owns delivery, never a detached rejection.
        cloudInput = input;
        cloudInputStarting = undefined;
        return { sessionId };
      } catch (error) {
        if (cloudInputStarting === controller) cloudInputStarting = undefined;
        controller.abort(); transcriptions.delete(controller); throw error;
      }
    },
    async feedDeepgramInput(frame) {
      const input = cloudInput;
      if (!isMorpheusWakeAudioFrame(frame) || !input || frame.sessionId !== input.sessionId || !inputAllowed()
        || input.controller.signal.aborted || settings.engine !== 'deepgram') throw new Error('Voice input is no longer active.');
      if (input.completed) return { ready: false };
      try {
        if (input.busy) throw new Error('Cloud microphone audio is out of sequence. Retry the microphone.');
        input.busy = true;
        if (frame.sequence !== input.sequence) throw new Error('Cloud microphone audio is out of sequence. Retry the microphone.');
        const pcm = Buffer.from(frame.pcmBase64, 'base64');
        if (pcm.length !== MORPHEUS_WAKE_FRAME_BYTES || pcm.toString('base64') !== frame.pcmBase64) throw new Error('Invalid cloud microphone audio.');
        const time = Date.now();
        if (time - input.windowAt >= 1000) { input.windowAt = time; input.windowBytes = 0; }
        input.windowBytes += pcm.length; input.byteLength += pcm.length;
        if (input.windowBytes > MORPHEUS_WAKE_FRAME_BYTES * 7 || input.byteLength > 30 * 32_000) throw new Error('Cloud microphone audio exceeded its live input limit.');
        input.sequence += 1;
        if (input.firstFrame) {
          await options.audit.recordControl({ category: 'voice', event: 'explicit-capture-started', subjectId: 'deepgram',
            details: {}, appVersion: options.appVersion });
          if (cloudInput !== input || !inputAllowed() || input.controller.signal.aborted) throw new DOMException('Voice input cancelled', 'AbortError');
          input.firstFrame = false; publish('listening');
        }
        input.session.writePcm(pcm);
        return { ready: true };
      } catch (error) { cancelCloudInput(); throw error; }
      finally { input.busy = false; }
    },
    async waitDeepgramInput({ sessionId }) {
      const input = cloudInput;
      if (!input || input.sessionId !== sessionId || input.claimed) throw new Error('Voice input is no longer active.');
      input.claimed = true;
      try { return await input.result; }
      finally {
        if (cloudInput === input) {
          cancelCloudInput();
          if (currentPresence.state === 'listening') publish(ambientSession && ambientInputReady ? 'armed' : 'asleep');
        }
      }
    },
    finishDeepgramInput({ sessionId }) {
      if (!cloudInput || cloudInput.sessionId !== sessionId || !inputAllowed()) return { finished: false };
      cloudInput.session.finish(); return { finished: true };
    },
    cancelDeepgramInput({ sessionId }) {
      if (!cloudInput || cloudInput.sessionId !== sessionId) return { cancelled: false };
      cancelCloudInput();
      if (currentPresence.state === 'listening') publish(ambientSession && ambientInputReady ? 'armed' : 'asleep');
      return { cancelled: true };
    },
    synthesize,
    cancelSpeech,
    invalidateService() {
      cancelCloudInput();
      authorityRevision += 1;
      recovery = undefined;
      question = undefined;
      preparationRevision += 1;
      options.localVoice?.releaseWarm?.();
      managedAvailability = null;
      for (const controller of transcriptions.keys()) controller.abort();
      cancelSpeech();
      // endAmbientSession clears wake/capture synchronously before its audit await.
      void service.endAmbientSession().catch(() => undefined);
      publish('asleep');
    },

    async beginAmbientSession() {
      if (!companionVoiceAllowed()) return service.endAmbientSession();
      if (ambientStarting && ambientStartingRevision !== ambientStartRevision) {
        await ambientStarting.catch(() => undefined);
        if (!companionVoiceAllowed()) return service.endAmbientSession();
      }
      if (ambientStarting) return ambientStarting;
      const start = async () => {
      if (ambientSession) return structuredClone(currentPresence);
      const startingAuthority = authorityRevision, startingSettings = settings, startingRevision = ambientStartRevision;
      const checkStart = () => {
        if (!companionVoiceAllowed() || startingAuthority !== authorityRevision || settings !== startingSettings || startingRevision !== ambientStartRevision) throw new DOMException('Voice session changed', 'AbortError');
      };
      if (!settings.enabled || !settings.ambientEnabled) throw new Error('Ambient voice is disabled.');
      if (!options.audit.isHealthy()) throw new Error('Ambient voice is blocked while Audit is unavailable.');
      const managed = options.getManagedRuntime?.();
      const available = managed ? await managedStatus(managed) : null;
      const resolved = settings.engine === 'deepgram' ? (options.deepgram && (await options.deepgramConnection?.snapshot())?.configured
        ? { account: { id: 'deepgram', label: 'Deepgram' } } : null)
        : options.localVoice && isIncludedVoiceEngine(settings.engine) ? (options.localVoice.ready() ? { account: { id: 'included-local', label: 'Included local English voice' } } : null) : managed ? (available?.transcriptionAvailable ? { account: { id: 'managed', label: 'Morpheus managed' } } : null) : await resolveAccount();
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
      return publish('asleep');
      };
      ambientStartingRevision = ambientStartRevision;
      const attempt = start();
      ambientStarting = attempt;
      try { return await attempt; } finally { if (ambientStarting === attempt) ambientStarting = null; }
    },

    async prepareAmbientInput() {
      // Every actual acquisition gets a fresh token/PCM origin. This also
      // retires an old renderer's stream after reload or a settings handoff.
      if (ambientSession) await service.endAmbientSession();
      const presence = await service.beginAmbientSession();
      return { sessionId: ambientSession?.sessionId ?? null, localWakeEnabled: settings.localWakeEnabled === true, presence };
    },

    async feedWakeAudio(frame) {
      if (!isMorpheusWakeAudioFrame(frame)) throw new Error('Invalid local wake audio frame.');
      const sessionId = frame.sessionId, startingRevision = ambientStartRevision, startingAuthority = authorityRevision;
      const checkStart = () => {
        if (!companionVoiceAllowed() || ambientSession?.sessionId !== sessionId || startingRevision !== ambientStartRevision
          || startingAuthority !== authorityRevision) throw new DOMException('Voice input stopped', 'AbortError');
      };
      checkStart();
      try {
        if (wakeAudioBusy || frame.sequence !== wakeAudioSequence) throw new Error('Local wake audio is out of sequence. Restart companion voice.');
        const pcm = Buffer.from(frame.pcmBase64, 'base64');
        if (pcm.length !== MORPHEUS_WAKE_FRAME_BYTES || pcm.toString('base64') !== frame.pcmBase64) throw new Error('Invalid local wake audio frame.');
        const time = Date.now();
        if (time - wakeAudioWindow >= 1000) { wakeAudioWindow = time; wakeAudioBytes = 0; }
        wakeAudioBytes += pcm.length;
        if (wakeAudioBytes > MORPHEUS_WAKE_FRAME_BYTES * 7) throw new Error('Local wake audio exceeded its live input rate. Restart companion voice.');
        wakeAudioSequence += 1;
        wakeAudioBusy = true;
        if (settings.localWakeEnabled) wakeAudio.append(pcm);
        if (!ambientInputReady) {
          if (settings.localWakeEnabled) {
            const controller = (options.startLocalWake ?? startWindowsWake)({
              phrase: settings.wakePhrase,
              onWake(_untrustedDictation, audioRange) {
                const interruptingSpeech = currentPresence.state === 'speaking' || currentPresence.state === 'preparing-speech';
                if (wakeVerificationInFlight || !ambientInputReady || !companionVoiceAllowed() || ambientSession?.sessionId !== sessionId
                  || startingRevision !== ambientStartRevision || ['listening', 'transcribing'].includes(currentPresence.state)
                  || (interruptingSpeech && !settings.bargeIn) || Date.now() - lastWakeAt < 1500) return;
                lastWakeAt = Date.now();
                wakeVerificationInFlight = true;
                // Native dictation is deliberately ignored. Only the original
                // bounded selected-stream audio and selected recognizer supply words.
                void (async () => {
                  if (!audioRange) throw new Error('The addressed audio was incomplete. Say the wake phrase and try again.');
                  const wave = wakeAudio.wave(audioRange);
                  await options.audit.recordControl({ category: 'voice', event: 'local-wake-detected',
                    subjectId: sessionId, details: {}, appVersion: options.appVersion });
                  checkStart();
                  if (interruptingSpeech) { followUpPending = false; cancelSpeech(); }
                  localAddressUntil = Date.now() + 5000;
                  await service.setAmbientListening(true);
                  let transcript: string;
                  try {
                    transcript = (await transcribeWithMode({ audioBase64: wave.toString('base64'), mimeType: 'audio/wav',
                      durationMs: Math.max(100, Math.round((wave.length - 44) / 32)) }, true, settings.engine !== 'deepgram')).transcript;
                  } finally {
                    if (ambientSession?.sessionId === sessionId && startingRevision === ambientStartRevision) await service.setAmbientListening(false);
                  }
                  checkStart();
                  const command = addressedLocalWakeTranscript(transcript, settings.wakePhrase);
                  if (command === null) {
                    await options.audit.recordControl({ category: 'voice', event: 'wake-verification-rejected',
                      subjectId: sessionId, details: { reason: 'wake-unverified' }, appVersion: options.appVersion });
                    checkStart();
                    publishRecovery('wake-unverified');
                    return;
                  }
                  wakeSequence += 1;
                  if (command) { clearFollowUp(); publish('understanding', undefined, command); }
                  else await openFollowUp('wake');
                })().catch((error) => {
                  if (!companionVoiceAllowed() || ambientSession?.sessionId !== sessionId || startingRevision !== ambientStartRevision) return;
                  if (error instanceof MorpheusNoSpeechError) return; // Audited repair already published by transcription.
                  void service.endAmbientSession().catch(() => undefined);
                  publish('error', error instanceof Error ? error.message : 'Local wake stopped. Restart companion voice.');
                }).finally(() => {
                  if (startingRevision === ambientStartRevision) wakeVerificationInFlight = false;
                });
              },
              onError() {
                if (!companionVoiceAllowed() || ambientSession?.sessionId !== sessionId || startingRevision !== ambientStartRevision) return;
                void service.endAmbientSession().catch(() => undefined);
                publish('error', 'Local wake stopped. Check your selected microphone and restart companion voice.');
              },
            });
            localWake = controller;
            await controller.ready;
            checkStart();
          }
          if (localWake) await localWake.pushAudio(pcm);
          checkStart();
          ambientInputReady = true;
          publish('armed');
        } else if (localWake) {
          await localWake.pushAudio(pcm);
          checkStart();
        }
        return { ready: true };
      } catch (error) {
        if (ambientSession?.sessionId === sessionId && startingRevision === ambientStartRevision) {
          await service.endAmbientSession();
          if (companionVoiceAllowed()) publish('error', 'Local microphone audio stopped. Check your selected microphone and restart companion voice.');
        }
        throw error;
      } finally {
        if (startingRevision === ambientStartRevision) wakeAudioBusy = false;
      }
    },

    async endAmbientSession() {
      ambientStartRevision += 1;
      recovery = undefined;
      question = undefined;
      lastWakeAt = 0;
      ambientInputReady = false;
      wakeAudio.clear();
      wakeAudioSequence = 0; wakeAudioBytes = 0; wakeAudioWindow = 0; wakeAudioBusy = false;
      wakeVerificationInFlight = false;
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
      // Publish the actual stop immediately; late audit completion must not
      // overwrite a newer companion session or an explicit speaking state.
      let stopAudit: Promise<unknown> | undefined;
      try {
        if (session) stopAudit = options.audit.recordControl({
          category: 'voice', event: 'ambient-session-ended', subjectId: session.sessionId,
          details: {}, appVersion: options.appVersion,
        });
      } finally {
        if (!['preparing-speech', 'speaking'].includes(currentPresence.state)) publish('asleep');
        else if (currentPresence.recovery || currentPresence.question) publish(currentPresence.state, currentPresence.reason);
      }
      await stopAudit;
      return structuredClone(currentPresence);
    },

    async setAmbientListening(listening) {
      if (!companionVoiceAllowed() || !ambientSession || !ambientInputReady) throw new DOMException('Ambient voice is suspended in conversation', 'AbortError');
      const session = ambientSession, revision = ambientStartRevision;
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
      if (!companionVoiceAllowed() || ambientSession !== session || revision !== ambientStartRevision) {
        throw new DOMException('Ambient voice changed', 'AbortError');
      }
      if (listening) recovery = undefined;
      return publish(listening ? 'listening' : 'armed');
    },

    transcribeAmbient: (payload) => transcribeWithMode(payload, true),

    setSpeaking(speaking) {
      if (speaking) {
        clearFollowUp();
        return publish('speaking');
      }
      // A real output gap is still synthesis, not an invitation to record speaker echo.
      if (speechController && !speechController.signal.aborted) return publish('preparing-speech');
      const next = publish(ambientSession && ambientInputReady && companionVoiceAllowed() ? 'armed' : 'asleep');
      if (followUpPending && ambientSession) {
        const session = ambientSession, revision = ambientStartRevision;
        followUpPending = false;
        void openFollowUp('result').catch(() => {
          if (companionVoiceAllowed() && ambientSession === session && revision === ambientStartRevision)
            publish('error', 'Voice follow-up stopped because Audit is unavailable.');
        });
      }
      return next;
    },

    observeObjective(event) {
      if (!ambientSession || !ambientInputReady || event.run.origin.type !== 'voice') return;
      if (event.state === 'understanding') {
        question = undefined;
        recovery = undefined;
        voiceObjectiveId = event.objectiveRunId;
        voiceObjectiveWakeSequence = wakeSequence;
      }
      if (voiceObjectiveId && voiceObjectiveId !== event.objectiveRunId) return;
      const questionEnded = Boolean(question && question.objectiveRunId === event.objectiveRunId && event.state !== 'needs-clarification');
      if (questionEnded) {
        question = undefined;
        if (event.state === 'cancelled') { followUpPending = false; clearFollowUp(); }
      }
      // A background result cannot close capture for a newer wake/utterance.
      if (event.state !== 'understanding' && (['listening', 'transcribing'].includes(currentPresence.state)
        || (['armed', 'understanding'].includes(currentPresence.state) && voiceObjectiveWakeSequence !== wakeSequence))) {
        if (questionEnded) publish(currentPresence.state, currentPresence.reason);
        return;
      }
      if (!conversationActive() && event.state === 'understanding') {
        conversationStartedAt = Date.now();
        conversationTurn = 0;
      }
      if (event.state === 'needs-clarification' && event.objectiveRunId) question = { objectiveRunId: event.objectiveRunId };
      const next = objectivePresence(event.state);
      if (next) publish(next, event.state === 'error' ? event.run.error?.message : undefined);
      if (['complete', 'needs-clarification', 'error', 'degraded'].includes(event.state)) {
        followUpPending = settings.handsFreeFollowUp;
        if (followUpPending && !settings.speakResponses) {
          const session = ambientSession, revision = ambientStartRevision;
          followUpPending = false;
          void openFollowUp('result').catch(() => {
            if (companionVoiceAllowed() && ambientSession === session && revision === ambientStartRevision)
              publish('error', 'Voice follow-up stopped because Audit is unavailable.');
          });
        }
      } else if (event.state === 'cancelled') {
        followUpPending = false;
        clearFollowUp();
      }
    },

    dispose() {
      cancelCloudInput();
      options.deepgram?.dispose();
      options.deepgramConnection?.dispose();
      disposed = true;
      recovery = undefined;
      question = undefined;
      authorityRevision += 1;
      preparationRevision += 1;
      ambientStartRevision += 1;
      for (const controller of transcriptions.keys()) controller.abort(new DOMException('Voice disposed', 'AbortError'));
      transcriptions.clear();
      localWake?.stop();
      localWake = null;
      clearFollowUp();
      cancelSpeech();
      ambientSession = null;
      ambientInputReady = false; wakeAudio.clear();
      options.localVoice?.dispose?.();
      currentPresence = {
        v: MORPHEUS_VOICE_VERSION, state: 'asleep', ambientEnabled: settings.ambientEnabled,
        inputEnabled: false,
      };
    },
  };

  return service;
}

export { decodeAudio as validateAndDecodeMorpheusAudio, validateSettings as validateMorpheusVoiceSettings };
