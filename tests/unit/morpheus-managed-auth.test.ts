// @vitest-environment node
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createManagedAuthSession } from '../../electron/services/morpheus/managed/auth-session';
import { createManagedAuthCallback } from '../../electron/services/morpheus/managed/auth-callback';
import { createManagedAuthHttp } from '../../electron/services/morpheus/managed/auth-http';
import type { ManagedSession } from '../../shared/morpheus/managed-types';

const session: ManagedSession = { accountId: 'a', expiresAt: 5000, accessToken: 'token', refreshToken: 'refresh' };
function setup() {
  let stored: ManagedSession | null = null;
  const sessions = { get: vi.fn(async () => stored), set: vi.fn(async (value: ManagedSession) => { stored = value; }), clear: vi.fn(async () => { stored = null; }) };
  const http = { googleUrl: vi.fn((redirect: string, challenge: string) => `https://auth.test/?redirect=${encodeURIComponent(redirect)}&challenge=${challenge}`),
    exchange: vi.fn(async () => session), requestEmail: vi.fn(async () => undefined), verifyEmail: vi.fn(async () => session),
    refresh: vi.fn(async () => ({ ...session, accessToken: 'new-token', expiresAt: 100000 })), revoke: vi.fn(async () => undefined) };
  const openExternal = vi.fn(async () => undefined);
  return { sessions, http, openExternal, stored: () => stored };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('managed session lifecycle', () => {
  it('keeps unconfigured auth explicit', async () => {
    const { sessions, openExternal } = setup();
    const auth = createManagedAuthSession({ sessions, openExternal });
    expect(await auth.google()).toEqual({ success: false, error: 'not-configured' });
    expect(openExternal).not.toHaveBeenCalled();
  });
  it('binds Google exchange to a fresh S256 verifier and persists before signed-in', async () => {
    const fixture = setup(); const code = deferred<string>();
    const auth = createManagedAuthSession({ ...fixture, callback: async () => ({ redirectUrl: 'http://127.0.0.1/callback', code: code.promise, cancel() {} }) });
    expect(await auth.google()).toEqual({ success: true }); expect(auth.state()).toBe('browser');
    code.resolve('auth-code');
    await vi.waitFor(() => expect(auth.state()).toBe('signed-in'));
    const verifier = fixture.http.exchange.mock.calls[0] as unknown as [string, string];
    expect(verifier[0]).toBe('auth-code');
    expect(verifier[1].length).toBeGreaterThanOrEqual(43);
    expect(fixture.http.googleUrl).toHaveBeenCalledWith(expect.any(String), createHash('sha256').update(verifier[1]).digest('base64url'));
    expect(fixture.stored()).toEqual(session);
  });
  it('does not restore a Google session after sign-out during code exchange', async () => {
    const fixture = setup(); const response = deferred<ManagedSession>(); const code = deferred<string>();
    fixture.http.exchange.mockImplementation(() => response.promise);
    const auth = createManagedAuthSession({ ...fixture, callback: async () => ({ redirectUrl: 'http://127.0.0.1/callback', code: code.promise, cancel() {} }) });
    await auth.google(); code.resolve('code'); await vi.waitFor(() => expect(fixture.http.exchange).toHaveBeenCalled());
    await auth.signOut(); response.resolve(session); await Promise.resolve(); await Promise.resolve();
    expect(fixture.stored()).toBeNull(); expect(fixture.sessions.set).not.toHaveBeenCalled();
  });
  it('validates email/code input and rate-limits code requests', async () => {
    const fixture = setup(); const auth = createManagedAuthSession({ ...fixture, now: () => 1000 });
    expect((await auth.requestEmail({ email: 'bad', origin: 'https://evil.test' })).success).toBe(false);
    expect(await auth.requestEmail({ email: 'person@example.test' })).toEqual({ success: true });
    expect(auth.state()).toBe('email-code');
    expect(await auth.requestEmail({ email: 'person@example.test' })).toMatchObject({ error: 'rate-limited' });
    expect((await auth.verifyEmail({ code: 'bad' })).success).toBe(false);
    expect(await auth.verifyEmail({ code: '123456' })).toEqual({ success: true });
    expect(fixture.http.verifyEmail).toHaveBeenCalledWith('person@example.test', '123456');
    expect(fixture.stored()).toEqual(session);
  });
  it('single-flights token refresh and persists the rotated refresh token', async () => {
    const fixture = setup(); await fixture.sessions.set(session);
    const response = deferred<ManagedSession>(); fixture.http.refresh.mockImplementation(() => response.promise);
    const auth = createManagedAuthSession({ ...fixture, now: () => 1000 });
    const calls = [auth.session(), auth.session(), auth.session()];
    await vi.waitFor(() => expect(fixture.http.refresh).toHaveBeenCalledOnce());
    const next = { ...session, accessToken: 'new', refreshToken: 'rotated', expiresAt: 100000 };
    response.resolve(next);
    expect(await Promise.all(calls)).toEqual([next, next, next]); expect(fixture.stored()).toEqual(next);
  });
  it('discards refresh results after logout and rejects a changed account', async () => {
    const fixture = setup(); await fixture.sessions.set(session);
    const response = deferred<ManagedSession>(); fixture.http.refresh.mockImplementation(() => response.promise);
    const auth = createManagedAuthSession({ ...fixture, now: () => 1000 });
    const call = auth.session(); await vi.waitFor(() => expect(fixture.http.refresh).toHaveBeenCalled());
    await auth.signOut(); response.resolve({ ...session, accessToken: 'late' });
    expect(await call).toBeNull(); expect(fixture.stored()).toBeNull();
    await fixture.sessions.set(session); fixture.http.refresh.mockResolvedValue({ ...session, accountId: 'b' });
    await expect(auth.session()).rejects.toThrow('auth-failed'); expect(fixture.stored()?.accountId).toBe('a');
  });
  it('does not overwrite credentials on a transient refresh failure', async () => {
    const fixture = setup(); await fixture.sessions.set(session);
    fixture.http.refresh.mockRejectedValue(new Error('network failure'));
    const auth = createManagedAuthSession({ ...fixture, now: () => 1000 });
    await expect(auth.session()).rejects.toThrow(); expect(fixture.stored()).toEqual(session);
  });
});

describe('desktop PKCE callback', () => {
  it('rejects an incorrect nonce and consumes only the matching callback', async () => {
    const callback = await createManagedAuthCallback(0);
    try {
      const address = new URL(callback.redirectUrl);
      const malformedStatus = await new Promise<number | undefined>((resolve, reject) => {
        const req = request({ hostname: address.hostname, port: address.port, path: 'http://[' }, (response) => {
          response.resume(); resolve(response.statusCode);
        });
        req.once('error', reject); req.end();
      });
      expect(malformedStatus).toBe(400);
      const invalid = new URL(callback.redirectUrl); invalid.searchParams.set('state', 'other'); invalid.searchParams.set('code', 'code');
      expect((await fetch(invalid)).status).toBe(400);
      const valid = new URL(callback.redirectUrl); valid.searchParams.set('code', 'bound-code');
      expect((await fetch(valid)).status).toBe(200); expect(await callback.code).toBe('bound-code');
      await expect(fetch(valid)).rejects.toThrow();
    } finally { callback.cancel(); }
  });
  it('cancels a listener and rejects duplicate code fields', async () => {
    const callback = await createManagedAuthCallback(0);
    const url = new URL(callback.redirectUrl); url.searchParams.append('code', 'a'); url.searchParams.append('code', 'b');
    expect((await fetch(url)).status).toBe(400); await expect(callback.code).rejects.toThrow('cancelled');
    const cancelled = await createManagedAuthCallback(0); cancelled.cancel(); await expect(cancelled.code).rejects.toThrow('cancelled');
  });
});

describe('hosted auth transport', () => {
  it('uses verified endpoints and keeps token responses in Main', async () => {
    const response = { access_token: 'token', refresh_token: 'refresh', expires_in: 3600, user: { id: 'a' } };
    const transport = vi.fn(async () => Response.json(response));
    const http = createManagedAuthHttp({ origin: 'https://auth.test', publishableKey: 'public', fetch: transport, now: () => 1000 });
    expect(await http.exchange('code', 'verifier')).toMatchObject({ accountId: 'a', expiresAt: 3601000 });
    expect(transport).toHaveBeenCalledWith(new URL('https://auth.test/auth/v1/token?grant_type=pkce'), expect.objectContaining({
      redirect: 'error', body: JSON.stringify({ auth_code: 'code', code_verifier: 'verifier' }),
    }));
    const url = new URL(http.googleUrl('http://127.0.0.1:43821/callback', 'challenge'));
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
  });
  it('rejects oversized/error responses without including provider content', async () => {
    const transport = vi.fn(async () => new Response('private secret', { status: 400 }));
    const http = createManagedAuthHttp({ origin: 'https://auth.test', publishableKey: 'public', fetch: transport });
    await expect(http.requestEmail('a@example.test')).rejects.toThrow('auth-failed');
    transport.mockResolvedValue(new Response('x'.repeat(70000)));
    await expect(http.refresh('refresh')).rejects.toThrow('auth-failed');
  });
});
