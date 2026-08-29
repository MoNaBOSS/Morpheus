import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { ProviderAccount } from '../../../shared/providers/types';
import type { ProviderService } from '../../providers/provider-service';
import type { MorpheusObjectiveEvent, MorpheusSystemState } from '@shared/morpheus/core/objective-types';
import {
  MORPHEUS_AMBIENT_MAX_SILENCE_MS,
  MORPHEUS_AMBIENT_MAX_UTTERANCE_MS,
  MORPHEUS_AMBIENT_MIN_SILENCE_MS,
  MORPHEUS_AMBIENT_MIN_UTTERANCE_MS,
  MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN,
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
} from '@shared/morpheus/voice-types';

import type { MorpheusAuditSink } from '../audit';
import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

const DEFAULT_VOICE_SETTINGS: MorpheusVoiceSettings = Object.freeze({
  v: MORPHEUS_VOICE_VERSION,
  enabled: true,
  providerAccountId: null,
  modelId: 'whisper-1',
  speakResponses: true,
  speechProviderAccountId: null,
  speechModelId: 'gpt-4o-mini-tts',
  speechVoice: 'onyx',
  autoSubmitTranscript: true,
  ambientEnabled: false,
  wakePhrase: 'Morpheus',
  ambientSilenceMs: 1_000,
  ambientMaxUtteranceMs: 20_000,
  bargeIn: true,
});

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export interface MorpheusVoiceService {
  status(): Promise<MorpheusVoiceStatus>;
  presence(): MorpheusVoicePresence;
  updateSettings(patch: MorpheusVoiceSettingsPatch): Promise<MorpheusVoiceStatus>;
  transcribe(payload: MorpheusTranscribeAudioPayload): Promise<MorpheusTranscriptionResult>;
  synthesize(payload: MorpheusSynthesizeSpeechPayload): Promise<MorpheusSynthesizeSpeechResult>;
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
  if (!isRecord(value) || ![1, 2, MORPHEUS_VOICE_VERSION].includes(value.v as number)) return null;
  if (typeof value.enabled !== 'boolean' || typeof value.speakResponses !== 'boolean'
    || typeof value.autoSubmitTranscript !== 'boolean' || !validProviderId(value.providerAccountId)) return null;
  if (typeof value.modelId !== 'string' || !value.modelId.trim() || value.modelId.length > 200) return null;

  const migrated = value.v === MORPHEUS_VOICE_VERSION
    ? value
    : { ...DEFAULT_VOICE_SETTINGS, ...value, v: MORPHEUS_VOICE_VERSION };
  const {
    ambientEnabled, bargeIn, wakePhrase, ambientSilenceMs, ambientMaxUtteranceMs,
    speechProviderAccountId, speechModelId, speechVoice,
  } = migrated;
  if (typeof ambientEnabled !== 'boolean' || typeof bargeIn !== 'boolean') return null;
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
    wakePhrase: wakePhrase.trim(),
    ambientSilenceMs,
    ambientMaxUtteranceMs,
    bargeIn,
  };
}

function eligibleAccount(account: ProviderAccount): boolean {
  return account.enabled
    && account.authMode !== 'oauth_browser'
    && (account.vendorId === 'openai' || account.vendorId === 'custom');
}

function providerEndpoint(account: ProviderAccount, suffix: '/audio/transcriptions' | '/audio/speech'): URL {
  const value = account.baseUrl ?? (account.vendorId === 'openai' ? 'https://api.openai.com/v1' : '');
  if (!value) throw new Error('The voice provider has no endpoint configured.');
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) {
    throw new Error('Voice endpoints must use HTTPS, except for explicit loopback providers.');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}${suffix}`.replace(/\/+/g, '/');
  return url;
}

function speechInstructions(personality: 'adaptive' | 'concise' | 'warm' | 'witty'): string {
  if (personality === 'concise') return 'Speak briefly, clearly, and directly. Avoid filler.';
  if (personality === 'warm') return 'Speak naturally and warmly, like a trusted capable companion.';
  if (personality === 'witty') return 'Speak with calm confidence and subtle human wit. Never turn the result into a performance.';
  return 'Speak naturally, calmly, and confidently. Match the seriousness of the result.';
}

async function readBoundedAudio(response: Response): Promise<Buffer> {
  if (!response.body) {
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || audio.length > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) {
      throw new Error('Speech provider returned empty or oversized audio.');
    }
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
      if (total > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw new Error('Speech provider response exceeded the permitted size.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error('Speech provider returned empty or oversized audio.');
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
  now?: () => Date;
  emitPresence?: (presence: MorpheusVoicePresence) => void;
}): MorpheusVoiceService {
  const now = options.now ?? (() => new Date());
  const transcriptionTimeoutMs = options.transcriptionTimeoutMs ?? MORPHEUS_VOICE_PROVIDER_TIMEOUT_MS;
  const speechTimeoutMs = options.speechTimeoutMs ?? MORPHEUS_VOICE_PROVIDER_TIMEOUT_MS;
  const settingsPath = join(options.userDataDir, 'morpheus', 'voice-settings.json');
  let settings = readValidatedJson(settingsPath, validateSettings) ?? structuredClone(DEFAULT_VOICE_SETTINGS);
  let ambientSession: { sessionId: string; startedAt: string; providerLabel: string } | null = null;
  let currentPresence: MorpheusVoicePresence = {
    v: MORPHEUS_VOICE_VERSION,
    state: 'asleep',
    ambientEnabled: settings.ambientEnabled,
  };
  const save = (): void => writeJsonAtomically(settingsPath, settings);

  const publish = (state: MorpheusVoicePresenceState, reason?: string): MorpheusVoicePresence => {
    currentPresence = {
      v: MORPHEUS_VOICE_VERSION,
      state,
      ambientEnabled: settings.ambientEnabled,
      ...(ambientSession ? {
        sessionStartedAt: ambientSession.startedAt,
        providerLabel: ambientSession.providerLabel,
      } : {}),
      ...(reason ? { reason } : {}),
    };
    options.emitPresence?.(structuredClone(currentPresence));
    return structuredClone(currentPresence);
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
    const accounts = (await options.providerService.listAccounts()).filter(eligibleAccount);
    const providers: MorpheusVoiceProviderOption[] = await Promise.all(accounts.map(async (account) => ({
      accountId: account.id,
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
        reason: 'Configure an API-key OpenAI or compatible transcription provider.',
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
    const audio = decodeAudio(payload);
    const resolved = await resolveAccount();
    if (!resolved) throw new Error('No compatible transcription provider is configured.');
    const endpoint = providerEndpoint(resolved.account, '/audio/transcriptions');
    const modelId = settings.modelId.trim();

    await options.audit.recordControl({
      category: 'voice', event: 'transcription-started', subjectId: resolved.account.id,
      details: {
        bytes: audio.length, durationMs: payload.durationMs,
        mimeType: payload.mimeType, modelId, ambient,
      },
      appVersion: options.appVersion,
    });
    if (ambient) publish('transcribing');

    try {
      const form = new FormData();
      form.append('model', modelId);
      form.append('file', new Blob([audio], { type: payload.mimeType }), `morpheus-voice.${audioExtension(payload.mimeType)}`);
      const controller = new AbortController();
      let timedOut = false;
      const providerStartedAt = Date.now();
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('Transcription timed out', 'TimeoutError'));
      }, transcriptionTimeoutMs);
      timer.unref?.();
      let response: Response;
      try {
        try {
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
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new Error(`Transcription provider returned HTTP ${response.status}.`);
      const raw = await response.text();
      if (raw.length > 64 * 1024) throw new Error('Transcription response was too large.');
      let body: unknown;
      try { body = JSON.parse(raw); } catch { throw new Error('Transcription provider returned invalid JSON.'); }
      const transcript = isRecord(body) && typeof body.text === 'string' ? body.text.trim() : '';
      if (!transcript || transcript.length > MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS) {
        throw new Error('Transcription provider returned an empty or oversized transcript.');
      }
      const providerLatencyMs = Math.max(0, Date.now() - providerStartedAt);

      await options.audit.recordControl({
        category: 'voice', event: 'transcription-completed', subjectId: resolved.account.id,
        details: {
          durationMs: payload.durationMs, transcriptChars: transcript.length,
          providerLatencyMs, modelId, ambient,
        },
        appVersion: options.appVersion,
      });
      if (ambient) publish('armed');
      return {
        transcript, providerAccountId: resolved.account.id, modelId,
        durationMs: payload.durationMs, providerLatencyMs,
      };
    } catch (error) {
      try {
        await options.audit.recordControl({
          category: 'voice', event: 'transcription-failed', subjectId: resolved.account.id,
          details: { durationMs: payload.durationMs, modelId, ambient }, appVersion: options.appVersion,
        });
      } finally {
        if (ambient) publish('error', 'Transcription failed. Ambient voice remains armed for retry.');
      }
      throw error;
    }
  };

  const synthesize = async (
    payload: MorpheusSynthesizeSpeechPayload,
  ): Promise<MorpheusSynthesizeSpeechResult> => {
    if (!settings.speakResponses) throw new Error('Spoken responses are disabled.');
    if (!options.audit.isHealthy()) throw new Error('Neural speech is blocked while Audit is unavailable.');
    const text = payload.text.trim();
    if (!text || text.length > MORPHEUS_SPEECH_MAX_TEXT_CHARS) {
      throw new Error('Speech text is empty or exceeds the permitted length.');
    }
    const resolved = await resolveAccount(
      undefined,
      settings.speechProviderAccountId ?? settings.providerAccountId,
    );
    if (!resolved) throw new Error('No compatible neural speech provider is configured.');
    const endpoint = providerEndpoint(resolved.account, '/audio/speech');
    const modelId = settings.speechModelId.trim();
    const voice = settings.speechVoice;

    await options.audit.recordControl({
      category: 'voice', event: 'speech-started', subjectId: resolved.account.id,
      details: { textChars: text.length, modelId, voice }, appVersion: options.appVersion,
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
      let response: Response;
      try {
        response = await (options.fetchImpl ?? fetch)(endpoint, {
          method: 'POST',
          headers: { ...safeHeaders(resolved.account, resolved.apiKey), 'content-type': 'application/json' },
          body: JSON.stringify({
            model: modelId,
            input: text,
            voice,
            response_format: 'mp3',
            ...(modelId.startsWith('gpt-4o')
              ? { instructions: speechInstructions(options.getPersonality?.() ?? 'adaptive') }
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
      if (!response.ok) throw new Error(`Speech provider returned HTTP ${response.status}.`);
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) {
        throw new Error('Speech provider response exceeded the permitted size.');
      }
      const audio = await readBoundedAudio(response);
      const providerLatencyMs = Math.max(0, Date.now() - startedAt);
      await options.audit.recordControl({
        category: 'voice', event: 'speech-completed', subjectId: resolved.account.id,
        details: { textChars: text.length, bytes: audio.length, modelId, voice, providerLatencyMs },
        appVersion: options.appVersion,
      });
      return {
        audioBase64: audio.toString('base64'), mimeType: 'audio/mpeg',
        providerAccountId: resolved.account.id, modelId, voice, providerLatencyMs,
      };
    } catch (error) {
      await options.audit.recordControl({
        category: 'voice', event: 'speech-failed', subjectId: resolved.account.id,
        details: { textChars: text.length, modelId, voice }, appVersion: options.appVersion,
      });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const service: MorpheusVoiceService = {
    status,
    presence: () => structuredClone(currentPresence),

    async updateSettings(patch) {
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
        if (!await resolveAccount()) throw new Error('No compatible transcription provider is configured.');
      }
      await options.audit.recordControl({
        category: 'voice', event: 'settings-updated',
        details: {
          enabled: next.enabled, ambientEnabled: next.ambientEnabled,
          speakResponses: next.speakResponses, autoSubmitTranscript: next.autoSubmitTranscript,
          providerConfigured: Boolean(next.providerAccountId),
          speechProviderConfigured: Boolean(next.speechProviderAccountId),
          speechModelId: next.speechModelId, speechVoice: next.speechVoice,
          wakePhraseChars: next.wakePhrase.length,
        },
        appVersion: options.appVersion,
      });
      const disableAmbient = settings.ambientEnabled && !next.ambientEnabled;
      settings = structuredClone(next);
      save();
      if (disableAmbient) await service.endAmbientSession();
      else if (settings.ambientEnabled) await service.beginAmbientSession();
      else publish('asleep');
      return status();
    },

    transcribe: (payload) => transcribeWithMode(payload, false),
    synthesize,

    async beginAmbientSession() {
      if (ambientSession) return structuredClone(currentPresence);
      if (!settings.enabled || !settings.ambientEnabled) throw new Error('Ambient voice is disabled.');
      if (!options.audit.isHealthy()) throw new Error('Ambient voice is blocked while Audit is unavailable.');
      const resolved = await resolveAccount();
      if (!resolved) {
        publish('error', 'Configure a compatible transcription provider before enabling ambient voice.');
        throw new Error('No compatible transcription provider is configured.');
      }
      const startedAt = now().toISOString();
      const sessionId = `voice-${randomUUID()}`;
      await options.audit.recordControl({
        category: 'voice', event: 'ambient-session-started', subjectId: sessionId,
        details: { providerAccountId: resolved.account.id, modelId: settings.modelId },
        appVersion: options.appVersion,
      });
      ambientSession = { sessionId, startedAt, providerLabel: resolved.account.label };
      return publish('armed');
    },

    async endAmbientSession() {
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
      return publish(speaking ? 'speaking' : settings.ambientEnabled ? 'armed' : 'asleep');
    },

    observeObjective(event) {
      if (!ambientSession || event.run.origin.type !== 'voice') return;
      const next = objectivePresence(event.state);
      if (next) publish(next, event.state === 'error' ? event.run.error?.message : undefined);
    },

    dispose() {
      ambientSession = null;
      currentPresence = {
        v: MORPHEUS_VOICE_VERSION, state: 'asleep', ambientEnabled: settings.ambientEnabled,
      };
    },
  };

  return service;
}

export { decodeAudio as validateAndDecodeMorpheusAudio, validateSettings as validateMorpheusVoiceSettings };
