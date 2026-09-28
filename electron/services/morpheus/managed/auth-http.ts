import { z } from 'zod';
import type { ManagedSession } from '@shared/morpheus/managed-types';

export class ManagedAuthError extends Error {
  constructor(public readonly code: 'auth-failed' | 'rate-limited' = 'auth-failed') { super(code); }
}

export function requireHttpsOrigin(value: string): URL {
  const origin = new URL(value);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Invalid managed origin');
  }
  return origin;
}

/** Bounded, non-redirecting Auth API calls. Error bodies/tokens never leave Main. */
export function createManagedAuthHttp(options: { origin: string; publishableKey: string; fetch?: typeof fetch; now?: () => number }) {
  const origin = requireHttpsOrigin(options.origin);
  const key = z.string().min(1).max(4096).regex(/^\S+$/).parse(options.publishableKey);
  const transport = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  async function post(path: string, body: unknown, token?: string): Promise<unknown> {
    const response = await transport(new URL(`/auth/v1/${path}`, origin), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ManagedAuthError(response.status === 429 ? 'rate-limited' : 'auth-failed');
    }
    if (response.status === 204) return null;
    const reader = response.body?.getReader();
    if (!reader) throw new ManagedAuthError();
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 64 * 1024) throw new ManagedAuthError();
        chunks.push(part.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  function session(value: unknown): ManagedSession {
    const data = z.object({
      access_token: z.string().min(1).max(8192).regex(/^\S+$/),
      refresh_token: z.string().min(1).max(8192).regex(/^\S+$/),
      expires_in: z.number().int().positive().max(86400 * 7),
      user: z.object({ id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/) }),
    }).parse(value);
    return { accountId: data.user.id, accessToken: data.access_token, refreshToken: data.refresh_token,
      expiresAt: now() + data.expires_in * 1000 };
  }
  return {
    googleUrl(redirectUrl: string, challenge: string) {
      const url = new URL('/auth/v1/authorize', origin);
      url.search = new URLSearchParams({ provider: 'google', redirect_to: redirectUrl,
        code_challenge: challenge, code_challenge_method: 's256' }).toString();
      return url.toString();
    },
    async exchange(code: string, verifier: string) { return session(await post('token?grant_type=pkce', { auth_code: code, code_verifier: verifier })); },
    async requestEmail(email: string) { await post('otp', { email, create_user: true }); },
    async verifyEmail(email: string, token: string) { return session(await post('verify', { email, token, type: 'email' })); },
    async refresh(refreshToken: string) { return session(await post('token?grant_type=refresh_token', { refresh_token: refreshToken })); },
    async revoke(accessToken: string) { await post('logout?scope=local', {}, accessToken); },
  };
}
export type ManagedAuthHttp = ReturnType<typeof createManagedAuthHttp>;
