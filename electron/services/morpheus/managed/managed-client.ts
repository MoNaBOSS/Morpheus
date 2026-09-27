import { z } from 'zod';
import type { ManagedAccountStatus, ManagedRequest } from '../../../../shared/morpheus/managed-types';
import type { ManagedSessionStore } from './session-store';

const amount = z.number().int().nonnegative().max(1_000_000_000_000);
const statusSchema = z.object({
  accountId: z.string().min(1).max(128), tier: z.enum(['basic', 'trial', 'premium']),
  enabled: z.boolean(), expiresAt: z.number().int().positive().safe().nullable(),
  features: z.array(z.enum(['conversation', 'planning', 'transcription', 'speech'])).max(4),
  allowance: z.object({ currency: z.literal('USD'), unit: z.literal('micro-usd'),
    granted: amount, spent: amount, reserved: amount, available: amount }).strict(),
  billing: z.literal('not-configured'),
}).strict();

export type ManagedClientStatus =
  | { state: 'not-configured' | 'signed-out' | 'session-expired' | 'unavailable'; account: null }
  | { state: 'ready'; account: ManagedAccountStatus };

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
  async function call(path: string, body?: unknown, signal?: AbortSignal) {
    const startedGeneration = generation;
    if (!origin) throw new Error('Managed service not configured');
    const session = await options.sessions.get();
    if (!session || session.expiresAt <= now()) throw new Error('Managed session unavailable');
    const response = await transport(new URL(path, origin), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(35_000), ...(signal ? [signal] : [])]),
    });
    // Never return a raw upstream body/error to a renderer or local log.
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Managed request failed (${response.status})`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Invalid managed response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2 * 1024 * 1024) throw new Error('Managed response too large');
        chunks.push(part.value);
      }
      const currentSession = await options.sessions.get();
      if (startedGeneration !== generation || currentSession?.accountId !== session.accountId
        || currentSession.accessToken !== session.accessToken || currentSession.expiresAt <= now()) {
        throw new Error('Managed session changed');
      }
      return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown, accountId: session.accountId };
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  return {
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
    async signOut(): Promise<void> { generation += 1; await options.sessions.clear(); },
  };
}
