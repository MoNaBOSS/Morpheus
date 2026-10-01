// @vitest-environment node
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createProtectedManagedSessionStore, type ManagedSessionStore } from '../../electron/services/morpheus/managed/session-store';
import { createManagedClient } from '../../electron/services/morpheus/managed/managed-client';
import type { ManagedSession } from '../../shared/morpheus/managed-types';

const session = { accountId: 'a', expiresAt: 5000, accessToken: 'private-token', refreshToken: 'private-refresh' };
function sessions(): ManagedSessionStore {
  let value: ManagedSession | null = { ...session };
  return { get: async () => value, set: async (next) => { value = next; }, clear: async () => { value = null; } };
}
const account = { accountId: 'a', tier: 'trial', enabled: true, expiresAt: 5000, features: ['planning'],
  allowance: { currency: 'USD', unit: 'micro-usd', granted: 100, spent: 0, reserved: 0, available: 100 }, billing: 'not-configured' };

describe('managed Main client', () => {
  it('reports unavailable configuration without fabricating an account', async () => {
    const fetcher = vi.fn();
    expect(await createManagedClient({ sessions: sessions(), fetch: fetcher }).status()).toEqual({ state: 'not-configured', account: null });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('separates signed-out and expired session states', async () => {
    const store = sessions(); const fetcher = vi.fn();
    const client = createManagedClient({ sessions: store, fetch: fetcher, origin: 'https://managed.test', now: () => 5000 });
    expect((await client.status()).state).toBe('session-expired');
    await client.signOut(); expect((await client.status()).state).toBe('signed-out');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('exposes verified account data, never session credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(account));
    const client = createManagedClient({ sessions: sessions(), fetch: fetcher, origin: 'https://managed.test', now: () => 1000 });
    const status = await client.status();
    expect(status).toEqual({ state: 'ready', account });
    expect(JSON.stringify(status)).not.toContain('private-token');
    expect(fetcher).toHaveBeenCalledWith(new URL('https://managed.test/v1/account'), expect.objectContaining({ redirect: 'error' }));
  });
  it('rejects identity mismatch and does not return cached entitlement on outage', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...account, accountId: 'b' })).mockRejectedValueOnce(new Error('offline'));
    const client = createManagedClient({ sessions: sessions(), fetch: fetcher, origin: 'https://managed.test', now: () => 1000 });
    expect((await client.status()).state).toBe('unavailable');
    expect((await client.status()).state).toBe('unavailable');
  });
  it('discards a response arriving after sign-out', async () => {
    const store = sessions();
    let respond!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
    const client = createManagedClient({ sessions: store, fetch: fetcher, origin: 'https://managed.test', now: () => 1000 });
    const result = client.execute({ requestId: 'r1', route: 'planner', input: {} });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await client.signOut(); respond(Response.json({ output: 'stale' }));
    await expect(result).rejects.toThrow('Managed session changed');
  });
  it('does not retry or fall back on allowance exhaustion', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('private provider detail', { status: 402 }));
    const client = createManagedClient({ sessions: sessions(), fetch: fetcher, origin: 'https://managed.test', now: () => 1000 });
    await expect(client.execute({ requestId: 'r1', route: 'planner', input: {} })).rejects.toThrow('Managed request failed (402)');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('rejects insecure origins', () => {
    expect(() => createManagedClient({ sessions: sessions(), origin: 'http://managed.test' })).toThrow('Invalid managed service origin');
  });
  it('aborts active text transport on invalidation and blocks session-resolution races before sending', async () => {
    let resolveSession!: (value: ManagedSession) => void;
    const delayed = new Promise<ManagedSession>((resolve) => { resolveSession = resolve; });
    const fetcher = vi.fn<typeof fetch>();
    const client = createManagedClient({ origin: 'https://managed.test', sessions: { ...sessions(), get: () => delayed }, fetch: fetcher, now: () => 1000 });
    const result = client.execute({ requestId: 'race', route: 'planning', input: {} });
    client.invalidate(); resolveSession(session);
    await expect(result).rejects.toThrow('Managed session changed'); expect(fetcher).not.toHaveBeenCalled();
    const activeFetch = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const active = createManagedClient({ origin: 'https://managed.test', sessions: sessions(), fetch: activeFetch, now: () => 1000 });
    const pending = active.execute({ requestId: 'active', route: 'planning', input: {} });
    const assertion = expect(pending).rejects.toThrow('aborted');
    await vi.waitFor(() => expect(activeFetch).toHaveBeenCalledOnce()); active.invalidate(); await assertion;
  });
});

describe('protected managed session persistence', () => {
  it('round-trips ciphertext, refuses plaintext fallback and isolates local logout', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'morpheus-session-'));
    const path = join(directory, 'managed-session');
    const key = randomBytes(32);
    let available = true;
    // Real authenticated encryption verifies persistence. This is not evidence
    // of Windows DPAPI/macOS Keychain behavior; Electron is injected in production.
    const protection = {
      isEncryptionAvailable: () => available,
      encryptString(value: string) {
        const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
      },
      decryptString(value: Buffer) {
        const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
        cipher.setAuthTag(value.subarray(12, 28));
        return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8');
      },
    };
    try {
      const store = createProtectedManagedSessionStore({ path, protection });
      expect(await store.get()).toBeNull();
      await store.set(session);
      expect((await readFile(path)).includes(Buffer.from('private-token'))).toBe(false);
      expect(await createProtectedManagedSessionStore({ path, protection }).get()).toEqual(session);
      available = false; await expect(store.get()).rejects.toThrow('protection unavailable');
      await expect(store.set(session)).rejects.toThrow('protection unavailable');
      available = true;
      const plaintext = createProtectedManagedSessionStore({ path, protection: { ...protection, getSelectedStorageBackend: () => 'basic_text' } });
      await expect(plaintext.get()).rejects.toThrow('protection unavailable');
      await store.clear(); expect(await store.get()).toBeNull();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
