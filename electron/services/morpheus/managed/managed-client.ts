import { z } from 'zod';
import type { ManagedClientStatus, ManagedRequest } from '../../../../shared/morpheus/managed-types';
import type { ManagedSessionStore } from './session-store';
import {
  MANAGED_AUDIO_CHUNK_BYTES, MANAGED_MAX_AUDIO_RESPONSE_BYTES, MANAGED_MAX_STREAM_BYTES, MANAGED_MAX_STREAM_LINE_BYTES,
  managedAudioFrameSchema, managedCapabilitiesSchema, managedReceiptSchema,
  type ManagedExecutionResult,
} from '../../../../shared/morpheus/managed-model-types';
import type { ManagedRequestReceipt } from '../../../../shared/morpheus/managed-types';

const amount = z.number().int().nonnegative().max(1_000_000_000_000);
const statusSchema = z.object({
  accountId: z.string().min(1).max(128), tier: z.enum(['basic', 'trial', 'premium']),
  enabled: z.boolean(), expiresAt: z.number().int().positive().safe().nullable(),
  features: z.array(z.enum(['conversation', 'planning', 'transcription', 'speech'])).max(4),
  allowance: z.object({ currency: z.literal('USD'), unit: z.literal('micro-usd'),
    granted: amount, spent: amount, reserved: amount, available: amount }).strict(),
  billing: z.literal('not-configured'),
}).strict();

export type { ManagedClientStatus } from '../../../../shared/morpheus/managed-types';

/** Main-only transport. Host API integration follows real desktop sign-in.
 * Origin is deployment configuration, never renderer input. No silent BYOK fallback.
 */
export function createManagedClient(options: {
  origin?: string;
  sessions: ManagedSessionStore;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const origin = options.origin ? new URL(options.origin) : null;
  if (origin && (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)) {
    throw new Error('Invalid managed service origin');
  }
  const transport = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let generation = 0;
  const active = new Set<AbortController>();
  const invalidate = () => { generation += 1; for (const controller of active) controller.abort(); active.clear(); };
  async function call(path: string, body?: unknown, signal?: AbortSignal) {
    const startedGeneration = generation;
    if (!origin) throw new Error('Managed service not configured');
    const controller = new AbortController(); active.add(controller);
    const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(35_000), ...(signal ? [signal] : [])]);
    let releaseReader: (() => Promise<void>) | undefined;
    const current = () => { if (startedGeneration !== generation) throw new Error('Managed session changed'); combined.throwIfAborted(); };
    try {
      current();
      const session = await options.sessions.get(); current();
      if (!session || session.expiresAt <= now()) throw new Error('Managed session unavailable');
      const response = await transport(new URL(path, origin), {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error',
        signal: combined,
      });
      // Never return a raw upstream body/error to a renderer or local log.
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Managed request failed (${response.status})`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Invalid managed response');
      releaseReader = async () => { await reader.cancel().catch(() => undefined); reader.releaseLock(); };
      const chunks: Uint8Array[] = [];
      let size = 0;
      current();
      while (true) {
        current(); const part = await reader.read(); current();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2 * 1024 * 1024) throw new Error('Managed response too large');
        chunks.push(part.value);
      }
      const currentSession = await options.sessions.get(); current();
      if (startedGeneration !== generation || currentSession?.accountId !== session.accountId
        || currentSession.accessToken !== session.accessToken || currentSession.expiresAt <= now()) {
        throw new Error('Managed session changed');
      }
      return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown, accountId: session.accountId };
    } finally { controller.abort(); active.delete(controller); await releaseReader?.(); }
  }
  return {
    getGeneration: () => generation,
    invalidate,
    async status(): Promise<ManagedClientStatus> {
      if (!origin) return { state: 'not-configured', account: null };
      try {
        const session = await options.sessions.get();
        if (!session) return { state: 'signed-out', account: null };
        if (session.expiresAt <= now()) return { state: 'session-expired', account: null };
        const { data, accountId } = await call('/v1/account');
        const account = statusSchema.parse(data);
        if (account.accountId !== accountId) throw new Error('Managed identity mismatch');
        return { state: 'ready', account };
      } catch { return { state: 'unavailable', account: null }; }
    },
    /** Results remain untrusted data; local typed execution still checks policy. */
    async execute(request: ManagedRequest, signal?: AbortSignal): Promise<unknown> {
      return (await call('/v1/execute', request, signal)).data;
    },
    async transcribe(request: ManagedRequest, signal?: AbortSignal): Promise<unknown> {
      return (await call('/v1/audio/transcription', request, signal)).data;
    },
    async capabilities(signal?: AbortSignal) { return managedCapabilitiesSchema.parse((await call('/v1/capabilities', undefined, signal)).data); },
    async receipt(requestId: string, signal?: AbortSignal): Promise<ManagedRequestReceipt> {
      const safeId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/).parse(requestId);
      const value = z.object({ receipt: managedReceiptSchema }).strict().parse((await call(`/v1/requests/${encodeURIComponent(safeId)}`, undefined, signal)).data);
      if (value.receipt.requestId !== safeId) throw new Error('Managed receipt mismatch');
      return value.receipt;
    },
    /** Framed ephemeral PCM audio. No automatic resend of a missing/lost result.
     * Account/cancellation validity is checked before every chunk callback. */
    async synthesize(request: ManagedRequest, onAudio: (bytes: Uint8Array) => void | Promise<void>, signal?: AbortSignal): Promise<ManagedExecutionResult<unknown>> {
      if (!origin) throw new Error('Managed service not configured');
      const startedGeneration = generation; const session = await options.sessions.get();
      if (!session || session.expiresAt <= now()) throw new Error('Managed session unavailable');
      const controller = new AbortController(); active.add(controller);
      const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(125_000), ...(signal ? [signal] : [])]);
      const current = async () => {
        combined.throwIfAborted(); const value = await options.sessions.get();
        if (startedGeneration !== generation || value?.accountId !== session.accountId || value.accessToken !== session.accessToken || value.expiresAt <= now()) throw new Error('Managed session changed');
        combined.throwIfAborted();
      };
      let releaseReader: (() => Promise<void>) | undefined;
      try {
        await current();
        const response = await transport(new URL('/v1/execute-stream', origin), { method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(request), redirect: 'error', signal: combined });
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Managed request failed (${response.status})`); }
        if (response.headers.get('content-type')?.split(';')[0] !== 'application/x-ndjson' || !response.body) {
          await response.body?.cancel(); throw new Error('Managed output unavailable; inspect the original receipt');
        }
        const reader = response.body.getReader();
        releaseReader = async () => { await reader.cancel().catch(() => undefined); reader.releaseLock(); };
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let buffered = ''; let totalBytes = 0; let audioBytes = 0; let sequence = 0; let admitted = false;
        let result: ManagedExecutionResult<unknown> | undefined;
        const checkReceipt = (receipt: ManagedRequestReceipt) => {
          if (receipt.requestId !== request.requestId || receipt.route !== request.route || receipt.objectiveId !== (request.objectiveId ?? null)
            || receipt.turnId !== request.turnId || receipt.workerRunId !== request.workerRunId || receipt.speechId !== request.speechId) throw new Error('Managed receipt mismatch');
        };
        const consume = async (line: string) => {
          if (Buffer.byteLength(line, 'utf8') > MANAGED_MAX_STREAM_LINE_BYTES || result) throw new Error('Invalid managed stream');
          const frame = managedAudioFrameSchema.parse(JSON.parse(line)); await current();
          if (frame.type === 'receipt') {
            if (admitted || sequence !== 0 || frame.receipt.state !== 'dispatched') throw new Error('Invalid managed admission');
            checkReceipt(frame.receipt); admitted = true;
          } else if (frame.type === 'audio') {
            if (!admitted || frame.sequence !== sequence++) throw new Error('Invalid managed audio sequence');
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(frame.audioBase64)) throw new Error('Invalid managed audio');
            const bytes = Buffer.from(frame.audioBase64, 'base64');
            if (bytes.toString('base64') !== frame.audioBase64 || bytes.length === 0 || bytes.length > MANAGED_AUDIO_CHUNK_BYTES) throw new Error('Invalid managed audio');
            audioBytes += bytes.length;
            if (audioBytes > MANAGED_MAX_AUDIO_RESPONSE_BYTES) throw new Error('Managed response too large');
            await current(); await onAudio(bytes); await current();
          } else if (frame.type === 'error') {
            checkReceipt(frame.receipt); throw new Error('Managed outcome uncertain; inspect the original receipt');
          } else {
            checkReceipt(frame.receipt);
            if (!admitted || audioBytes !== frame.output.bytes || !['settled', 'uncertain'].includes(frame.receipt.state)) throw new Error('Invalid managed completion');
            result = { output: frame.output, receipt: frame.receipt };
          }
        };
        for (;;) {
          await current(); const next = await reader.read(); if (next.done) break;
          totalBytes += next.value.byteLength;
          if (totalBytes > MANAGED_MAX_STREAM_BYTES) throw new Error('Managed response too large');
          buffered += decoder.decode(next.value, { stream: true });
          let end: number;
          while ((end = buffered.indexOf('\n')) >= 0) { const line = buffered.slice(0, end); buffered = buffered.slice(end + 1); if (!line) throw new Error('Invalid managed stream'); await consume(line); }
          if (Buffer.byteLength(buffered, 'utf8') > MANAGED_MAX_STREAM_LINE_BYTES) throw new Error('Managed response too large');
        }
        buffered += decoder.decode();
        if (buffered || !result) throw new Error('Managed stream ended without a receipt');
        await current(); return result;
      } finally {
        controller.abort(); active.delete(controller);
        await releaseReader?.();
      }
    },
    async signOut(): Promise<void> { invalidate(); await options.sessions.clear(); },
  };
}

export type ManagedClient = ReturnType<typeof createManagedClient>;
