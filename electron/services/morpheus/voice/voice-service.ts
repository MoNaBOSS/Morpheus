import { join } from 'node:path';

import type { ProviderAccount } from '../../../shared/providers/types';
import type { ProviderService } from '../../providers/provider-service';
import {
  MORPHEUS_VOICE_MAX_AUDIO_BYTES,
  MORPHEUS_VOICE_MAX_DURATION_MS,
  MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS,
  MORPHEUS_VOICE_MIME_TYPES,
  MORPHEUS_VOICE_VERSION,
  type MorpheusTranscribeAudioPayload,
  type MorpheusTranscriptionResult,
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
  autoSubmitTranscript: true,
});

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export interface MorpheusVoiceService {
  status(): Promise<MorpheusVoiceStatus>;
  updateSettings(patch: MorpheusVoiceSettingsPatch): Promise<MorpheusVoiceStatus>;
  transcribe(payload: MorpheusTranscribeAudioPayload): Promise<MorpheusTranscriptionResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateSettings(value: unknown): MorpheusVoiceSettings | null {
  if (!isRecord(value) || value.v !== MORPHEUS_VOICE_VERSION) return null;
  if (typeof value.enabled !== 'boolean' || typeof value.speakResponses !== 'boolean'
    || typeof value.autoSubmitTranscript !== 'boolean') return null;
  if (value.providerAccountId !== null && (typeof value.providerAccountId !== 'string'
    || !/^[A-Za-z0-9._-]{1,128}$/.test(value.providerAccountId))) return null;
  if (typeof value.modelId !== 'string' || !value.modelId.trim() || value.modelId.length > 200) return null;
  return value as MorpheusVoiceSettings;
}

function eligibleAccount(account: ProviderAccount): boolean {
  return account.enabled
    && account.authMode !== 'oauth_browser'
    && (account.vendorId === 'openai' || account.vendorId === 'custom');
}

function baseUrl(account: ProviderAccount): URL {
  const value = account.baseUrl ?? (account.vendorId === 'openai' ? 'https://api.openai.com/v1' : '');
  if (!value) throw new Error('The transcription provider has no endpoint configured.');
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) {
    throw new Error('Transcription endpoints must use HTTPS, except for explicit loopback providers.');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/audio/transcriptions`.replace(/\/+/g, '/');
  return url;
}

function safeHeaders(account: ProviderAccount, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
  for (const [name, value] of Object.entries(account.headers ?? {})) {
    const lower = name.toLowerCase();
    if ((!lower.startsWith('x-') && lower !== 'http-referer')
      || ['authorization', 'x-api-key', 'host', 'content-length', 'cookie'].includes(lower)) continue;
    if (typeof value === 'string' && value.length <= 1_000) headers[name] = value;
  }
  if (account.vendorId === 'openrouter') headers['X-OpenRouter-Title'] = 'Morpheus';
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

export function createMorpheusVoiceService(options: {
  userDataDir: string;
  providerService: ProviderService;
  audit: MorpheusAuditSink;
  appVersion: string;
  fetchImpl?: typeof fetch;
}): MorpheusVoiceService {
  const settingsPath = join(options.userDataDir, 'morpheus', 'voice-settings.json');
  let settings = readValidatedJson(settingsPath, validateSettings) ?? structuredClone(DEFAULT_VOICE_SETTINGS);
  const save = (): void => writeJsonAtomically(settingsPath, settings);

  const resolveAccount = async (
    accountCandidates?: ProviderAccount[],
  ): Promise<{ account: ProviderAccount; apiKey: string } | null> => {
    const accounts = accountCandidates
      ?? (await options.providerService.listAccounts()).filter(eligibleAccount);
    const selected = settings.providerAccountId
      ? accounts.find((account) => account.id === settings.providerAccountId)
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
        settings: structuredClone(settings),
        transcriptionAvailable: false,
        providers,
        reason: 'Voice input is disabled.',
      };
    }
    const resolved = await resolveAccount(accounts);
    return resolved
      ? {
          settings: structuredClone(settings),
          transcriptionAvailable: true,
          providers,
          providerLabel: resolved.account.label,
        }
      : {
          settings: structuredClone(settings),
          transcriptionAvailable: false,
          providers,
          reason: 'Configure an API-key OpenAI or compatible transcription provider.',
        };
  };

  return {
    status,

    async updateSettings(patch) {
      const next = validateSettings({ ...settings, ...patch, v: MORPHEUS_VOICE_VERSION });
      if (!next) throw new Error('Invalid Morpheus voice settings.');
      await options.audit.recordControl({
        category: 'voice', event: 'settings-updated',
        details: {
          enabled: next.enabled,
          speakResponses: next.speakResponses,
          autoSubmitTranscript: next.autoSubmitTranscript,
          providerConfigured: Boolean(next.providerAccountId),
        },
        appVersion: options.appVersion,
      });
      settings = structuredClone(next);
      save();
      return status();
    },

    async transcribe(payload) {
      if (!settings.enabled) throw new Error('Voice input is disabled.');
      if (!options.audit.isHealthy()) throw new Error('Voice transcription is blocked while Audit is unavailable.');
      const audio = decodeAudio(payload);
      const resolved = await resolveAccount();
      if (!resolved) throw new Error('No compatible transcription provider is configured.');
      const endpoint = baseUrl(resolved.account);
      const modelId = settings.modelId.trim();

      // Persist metadata before disclosure to an external provider. Audio and
      // transcript are deliberately absent from both this record and history.
      await options.audit.recordControl({
        category: 'voice', event: 'transcription-started', subjectId: resolved.account.id,
        details: {
          bytes: audio.length,
          durationMs: payload.durationMs,
          mimeType: payload.mimeType,
          modelId,
        },
        appVersion: options.appVersion,
      });

      const form = new FormData();
      form.append('model', modelId);
      form.append('file', new Blob([audio], { type: payload.mimeType }), `morpheus-voice.${audioExtension(payload.mimeType)}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new DOMException('Transcription timed out', 'TimeoutError')), 60_000);
      timer.unref?.();
      let response: Response;
      try {
        response = await (options.fetchImpl ?? fetch)(endpoint, {
          method: 'POST', headers: safeHeaders(resolved.account, resolved.apiKey),
          body: form, signal: controller.signal, redirect: 'error',
        });
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

      await options.audit.recordControl({
        category: 'voice', event: 'transcription-completed', subjectId: resolved.account.id,
        details: { durationMs: payload.durationMs, transcriptChars: transcript.length, modelId },
        appVersion: options.appVersion,
      });
      return {
        transcript,
        providerAccountId: resolved.account.id,
        modelId,
        durationMs: payload.durationMs,
      };
    },
  };
}

export { decodeAudio as validateAndDecodeMorpheusAudio };
