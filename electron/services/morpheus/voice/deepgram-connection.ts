import { join } from 'node:path';
import {
  MORPHEUS_DEEPGRAM_RECOGNITION_MODELS,
  type MorpheusDeepgramRecognitionModel,
  type MorpheusDeepgramVoiceConnectionPayload,
  type MorpheusDeepgramVoiceFailure,
  type MorpheusDeepgramVoiceStatus,
  type MorpheusDeepgramVoiceTestResult,
} from '@shared/morpheus/voice-types';
import type { SecretStore } from '../../secrets/secret-store';
import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

/** Reserved app-owned voice credential, separate from task-model accounts/defaults. */
export const MORPHEUS_DEEPGRAM_SECRET_ID = 'morpheus-deepgram-voice';
const TEST_TIMEOUT_MS = 15_000;

export type MorpheusDeepgramCredentials = {
  apiKey: string;
  recognitionModel: MorpheusDeepgramRecognitionModel;
  speechModel: 'flux-kit-en';
};

export class MorpheusDeepgramConnectionError extends Error {
  constructor(readonly kind: MorpheusDeepgramVoiceFailure) {
    super(`Deepgram voice connection: ${kind}.`);
    this.name = 'MorpheusDeepgramConnectionError';
  }
}

export interface MorpheusDeepgramConnectionService {
  snapshot(): Promise<MorpheusDeepgramVoiceStatus>;
  /** Main only. Never expose this method through a host route. */
  credentials(): Promise<MorpheusDeepgramCredentials>;
  save(payload: MorpheusDeepgramVoiceConnectionPayload): Promise<MorpheusDeepgramVoiceStatus>;
  remove(): Promise<MorpheusDeepgramVoiceStatus>;
  test(): Promise<MorpheusDeepgramVoiceTestResult>;
  dispose(): void;
}

function validModel(value: unknown): value is MorpheusDeepgramRecognitionModel {
  return MORPHEUS_DEEPGRAM_RECOGNITION_MODELS.includes(value as MorpheusDeepgramRecognitionModel);
}

/** Opaque bounded credential input. Errors deliberately exclude its value. */
export function validateDeepgramConnectionInput(value: unknown): MorpheusDeepgramVoiceConnectionPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MorpheusDeepgramConnectionError('unavailable');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'apiKey' && key !== 'recognitionModel')
    || (record.apiKey === undefined && record.recognitionModel === undefined)) {
    throw new MorpheusDeepgramConnectionError('unavailable');
  }
  if (record.apiKey !== undefined && (typeof record.apiKey !== 'string'
    || !/^[A-Za-z0-9_-]{16,256}$/.test(record.apiKey.trim()))) {
    throw new MorpheusDeepgramConnectionError('unavailable');
  }
  if (record.recognitionModel !== undefined && !validModel(record.recognitionModel)) {
    throw new MorpheusDeepgramConnectionError('unavailable');
  }
  return {
    ...(typeof record.apiKey === 'string' ? { apiKey: record.apiKey.trim() } : {}),
    ...(validModel(record.recognitionModel) ? { recognitionModel: record.recognitionModel } : {}),
  };
}

function safeFailure(error: unknown): MorpheusDeepgramVoiceFailure {
  if (error instanceof MorpheusDeepgramConnectionError) return error.kind;
  if (error && typeof error === 'object') {
    const value = error as { name?: unknown; kind?: unknown; status?: unknown };
    if (value.name === 'AbortError') return 'cancelled';
    if (['authentication', 'access', 'rate-limit', 'endpoint'].includes(String(value.kind))) {
      return value.kind as MorpheusDeepgramVoiceFailure;
    }
    if (value.status === 401) return 'authentication';
    if (value.status === 403) return 'access';
    if (value.status === 429) return 'rate-limit';
  }
  return 'unavailable';
}

export function createMorpheusDeepgramConnectionService(options: {
  dataDir: string;
  secretStore: SecretStore;
  /** Fixed endpoint adapter; cannot execute tools or accept a caller-supplied URL. */
  probe: (credentials: MorpheusDeepgramCredentials, signal: AbortSignal) => Promise<void>;
  /** Immediately invalidates voice authority/streams before credential mutation. */
  onChanged?: () => void | Promise<void>;
}): MorpheusDeepgramConnectionService {
  const path = join(options.dataDir, 'deepgram-voice.v1.json');
  const saved = readValidatedJson(path, (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.v !== 1 || !validModel(record.recognitionModel)
      || Object.keys(record).some((key) => key !== 'v' && key !== 'recognitionModel')) return null;
    return { recognitionModel: record.recognitionModel };
  });
  let recognitionModel = saved?.recognitionModel ?? 'nova-3';
  let revision = 0;
  let disposed = false;
  let tail: Promise<unknown> = Promise.resolve();
  const tests = new Set<AbortController>();
  const metadata = (configured: boolean): MorpheusDeepgramVoiceStatus => ({
    configured, recognitionModel, speechModel: 'flux-kit-en', storage: 'protected',
  });
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.catch(() => undefined);
    return result;
  };

  function assertActive(): void {
    if (disposed) throw new MorpheusDeepgramConnectionError('cancelled');
  }

  async function key(): Promise<string | null> {
    assertActive();
    try {
      const secret = await options.secretStore.get(MORPHEUS_DEEPGRAM_SECRET_ID);
      if (!secret) return null;
      if (secret.type !== 'api_key' || !/^[A-Za-z0-9_-]{16,256}$/.test(secret.apiKey)) {
        throw new MorpheusDeepgramConnectionError('storage');
      }
      return secret.apiKey;
    } catch (error) {
      if (error instanceof MorpheusDeepgramConnectionError) throw error;
      throw new MorpheusDeepgramConnectionError('storage');
    }
  }

  function invalidate(): void | Promise<void> {
    revision += 1;
    for (const controller of tests) controller.abort();
    return options.onChanged?.();
  }

  const service: MorpheusDeepgramConnectionService = {
    async snapshot() {
      try { return metadata(Boolean(await key())); }
      catch { return { ...metadata(false), reason: 'storage' }; }
    },
    async credentials() {
      const generation = revision;
      const apiKey = await key();
      if (!apiKey) throw new MorpheusDeepgramConnectionError('not-configured');
      assertActive();
      if (generation !== revision) throw new MorpheusDeepgramConnectionError('cancelled');
      return { apiKey, recognitionModel, speechModel: 'flux-kit-en' };
    },
    save(payload) {
      const validated = validateDeepgramConnectionInput(payload);
      return serialized(async () => {
        assertActive();
        try { await invalidate(); }
        catch { throw new MorpheusDeepgramConnectionError('unavailable'); }
        try {
          if (validated.apiKey) {
            await options.secretStore.set({
              type: 'api_key', accountId: MORPHEUS_DEEPGRAM_SECRET_ID, apiKey: validated.apiKey,
            });
          } else if (!await key()) {
            throw new MorpheusDeepgramConnectionError('not-configured');
          }
          const nextModel = validated.recognitionModel ?? recognitionModel;
          writeJsonAtomically(path, { v: 1, recognitionModel: nextModel });
          recognitionModel = nextModel;
        } catch (error) {
          if (error instanceof MorpheusDeepgramConnectionError) throw error;
          throw new MorpheusDeepgramConnectionError('storage');
        }
        return service.snapshot();
      });
    },
    remove() {
      return serialized(async () => {
        assertActive();
        try { await invalidate(); }
        catch { throw new MorpheusDeepgramConnectionError('unavailable'); }
        try { await options.secretStore.delete(MORPHEUS_DEEPGRAM_SECRET_ID); }
        catch { throw new MorpheusDeepgramConnectionError('storage'); }
        return service.snapshot();
      });
    },
    async test() {
      const controller = new AbortController();
      const generation = revision;
      tests.add(controller);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      try {
        const credentials = await service.credentials();
        if (controller.signal.aborted || generation !== revision) {
          throw new MorpheusDeepgramConnectionError('cancelled');
        }
        const interrupted = new Promise<never>((_, reject) => {
          onAbort = () => reject(new MorpheusDeepgramConnectionError('cancelled'));
          controller.signal.addEventListener('abort', onAbort, { once: true });
          timer = setTimeout(() => {
            reject(new MorpheusDeepgramConnectionError('unavailable'));
            controller.abort();
          }, TEST_TIMEOUT_MS);
        });
        await Promise.race([options.probe(credentials, controller.signal), interrupted]);
        if (controller.signal.aborted || generation !== revision || disposed) {
          throw new MorpheusDeepgramConnectionError('cancelled');
        }
        return { ok: true, recognition: true, speech: true };
      } catch (error) {
        return { ok: false, recognition: false, speech: false, reason: safeFailure(error) };
      } finally {
        if (timer) clearTimeout(timer);
        if (onAbort) controller.signal.removeEventListener('abort', onAbort);
        controller.abort();
        tests.delete(controller);
      }
    },
    dispose() {
      disposed = true;
      revision += 1;
      for (const controller of tests) controller.abort();
    },
  };
  return service;
}
