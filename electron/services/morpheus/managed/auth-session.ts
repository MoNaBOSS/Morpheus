import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { ManagedAuthResult, ManagedAuthState, ManagedSession } from '@shared/morpheus/managed-types';
import type { ManagedSessionStore } from './session-store';
import { ManagedAuthError, type ManagedAuthHttp } from './auth-http';
import { createManagedAuthCallback, type ManagedAuthCallback } from './auth-callback';

export function createManagedAuthSession(options: {
  sessions: ManagedSessionStore;
  http?: ManagedAuthHttp;
  openExternal(url: string): Promise<void>;
  callback?: () => Promise<ManagedAuthCallback>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let generation = 0;
  let state: ManagedAuthState = 'idle';
  let pending: ManagedAuthCallback | undefined;
  let email: string | undefined;
  let emailExpiresAt = 0;
  let nextEmailAt = 0;
  let refresh: Promise<ManagedSession | null> | undefined;
  let emailBusy = false;
  const resultError = (error: unknown): ManagedAuthResult => ({ success: false,
    error: error instanceof z.ZodError ? 'invalid-input' : error instanceof ManagedAuthError ? error.code : 'auth-failed' });
  function cancel() {
    generation += 1; pending?.cancel(); pending = undefined; email = undefined;
    state = 'idle'; refresh = undefined;
  }
  async function save(session: ManagedSession, expected: number): Promise<boolean> {
    if (generation !== expected) return false;
    await options.sessions.set(session);
    if (generation !== expected) return false;
    state = 'signed-in'; return true;
  }
  return {
    configured: Boolean(options.http),
    state: () => state,
    cancel,
    async google(): Promise<ManagedAuthResult> {
      if (!options.http) return { success: false, error: 'not-configured' };
      cancel(); const expected = generation; state = 'browser';
      try {
        const callback = await (options.callback ?? createManagedAuthCallback)();
        if (expected !== generation) { callback.cancel(); return { success: false, error: 'cancelled' }; }
        pending = callback;
        const verifier = randomBytes(32).toString('base64url');
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        // Observe the code before openExternal so early cancellation is handled.
        void callback.code.then(async (code) => {
          if (expected !== generation) return;
          const session = await options.http!.exchange(code, verifier);
          await save(session, expected);
        }).catch(() => { if (generation === expected) state = 'error'; }).finally(() => {
          if (generation === expected) pending = undefined;
        });
        await options.openExternal(options.http.googleUrl(callback.redirectUrl, challenge));
        return { success: true };
      } catch (error) {
        if (generation === expected) { pending?.cancel(); pending = undefined; state = 'error'; }
        return resultError(error);
      }
    },
    async requestEmail(payload: unknown): Promise<ManagedAuthResult> {
      if (!options.http) return { success: false, error: 'not-configured' };
      try {
        const input = z.object({ email: z.string().trim().email().max(254) }).strict().parse(payload);
        if (emailBusy || now() < nextEmailAt) return { success: false, error: 'rate-limited' };
        cancel(); const expected = generation; emailBusy = true; nextEmailAt = now() + 60_000;
        try {
          await options.http.requestEmail(input.email);
          if (expected !== generation) return { success: false, error: 'cancelled' };
          email = input.email; emailExpiresAt = now() + 10 * 60_000; state = 'email-code';
          return { success: true };
        } finally { emailBusy = false; }
      } catch (error) { return resultError(error); }
    },
    async verifyEmail(payload: unknown): Promise<ManagedAuthResult> {
      if (!options.http) return { success: false, error: 'not-configured' };
      try {
        const input = z.object({ code: z.string().regex(/^\d{6}$/) }).strict().parse(payload);
        if (!email || now() >= emailExpiresAt || emailBusy) throw new ManagedAuthError();
        const expected = generation; emailBusy = true;
        try {
          const session = await options.http.verifyEmail(email, input.code);
          if (!await save(session, expected)) return { success: false, error: 'cancelled' };
          email = undefined; return { success: true };
        } finally { emailBusy = false; }
      } catch (error) { return resultError(error); }
    },
    async session(): Promise<ManagedSession | null> {
      const current = await options.sessions.get();
      if (!current || current.expiresAt > now() + 60_000 || !current.refreshToken || !options.http) return current;
      if (refresh) return refresh;
      const expected = generation;
      const operation = (async () => {
        const next = await options.http!.refresh(current.refreshToken!);
        const stillCurrent = await options.sessions.get();
        if (expected !== generation || stillCurrent?.accessToken !== current.accessToken) return null;
        if (next.accountId !== current.accountId) throw new ManagedAuthError();
        return await save(next, expected) ? next : null;
      })();
      refresh = operation;
      try { return await operation; }
      finally { if (refresh === operation) refresh = undefined; }
    },
    async signOut(): Promise<ManagedAuthResult> {
      cancel(); const expected = generation;
      let current: ManagedSession | null = null;
      try { current = await options.sessions.get(); } catch { /* Allow removal of unreadable sessions. */ }
      if (generation !== expected) return { success: false, error: 'cancelled' };
      try { await options.sessions.clear(); }
      catch { return { success: false, error: 'storage-unavailable' }; }
      if (current && options.http) {
        // Local logout is immediate even during a provider outage. Remote token
        // revocation is best effort; the issuer's access-token expiry still applies.
        void options.http.revoke(current.accessToken).catch(() => undefined);
      }
      return { success: true };
    },
  };
}
