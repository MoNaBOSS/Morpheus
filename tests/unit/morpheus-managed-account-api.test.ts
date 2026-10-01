// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createManagedAccountApi } from '../../electron/services/managed-account-api';

const protection = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')),
  decryptString: (value: Buffer) => value.toString().split('').reverse().join(''),
};

describe('managed account host integration', () => {
  it('fails closed when configuration is missing or insecure', async () => {
    const fetcher = vi.fn();
    const service = createManagedAccountApi({ env: {}, userDataDir: '/unused', protection, fetch: fetcher, openExternal: vi.fn() });
    expect(await service.api.status()).toMatchObject({ configured: false, access: { state: 'not-configured' } });
    expect(await service.api.googleSignIn()).toMatchObject({ success: false, error: 'not-configured' });
    expect(await service.api.status()).toMatchObject({ runtimeReady: false });
    await expect(service.api.setMode({ mode: 'managed' })).rejects.toThrow('integration is not available');
    expect(service.getRuntime()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('connects email identity, protected persistence and allowance status without exposing tokens', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'morpheus-account-api-'));
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/otp')) return Response.json({});
      if (url.endsWith('/verify')) return Response.json({ access_token: 'private-token', refresh_token: 'private-refresh', expires_in: 3600, user: { id: 'account-a' } });
      if (url.endsWith('/v1/account')) {
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer private-token' });
        return Response.json({ accountId: 'account-a', tier: 'basic', enabled: false, expiresAt: null, features: [],
          allowance: { currency: 'USD', unit: 'micro-usd', granted: 0, spent: 0, reserved: 0, available: 0 }, billing: 'not-configured' });
      }
      if (url.includes('/logout')) return new Response(null, { status: 204 });
      throw new Error('Unexpected endpoint');
    });
    const env = { MORPHEUS_MANAGED_ORIGIN: 'https://managed.test', MORPHEUS_AUTH_ORIGIN: 'https://auth.test', MORPHEUS_AUTH_PUBLISHABLE_KEY: 'public' };
    const onInvalidated = vi.fn();
    const create = (deployment = env) => createManagedAccountApi({ env: deployment, userDataDir: directory, protection, fetch: fetcher, openExternal: vi.fn(), onInvalidated });
    try {
      const service = create();
      expect(await service.api.status()).toMatchObject({ signedIn: false });
      expect(await service.api.requestEmailCode({ email: 'person@example.test' })).toEqual({ success: true });
      expect(await service.api.verifyEmailCode({ code: '123456' })).toEqual({ success: true });
      const status = await service.api.status();
      await expect(service.api.setMode({ mode: 'managed' })).rejects.toThrow('integration is not available');
      expect(status).toMatchObject({ signedIn: true, access: { state: 'ready', account: { tier: 'basic' } } });
      expect(JSON.stringify(status)).not.toContain('private-');
      const restarted = create(); expect(await restarted.api.status()).toMatchObject({ signedIn: true });
      const changedDeployment = create({ ...env, MORPHEUS_MANAGED_ORIGIN: 'https://other.test' });
      expect(await changedDeployment.api.status()).toMatchObject({ signedIn: false });
      expect(await restarted.api.signOut()).toEqual({ success: true });
      expect(onInvalidated).toHaveBeenCalledTimes(2); // request sign-in, then sign-out; rejected mode did not mutate.
      expect(await restarted.api.status()).toMatchObject({ signedIn: false });
      service.dispose(); restarted.dispose(); changedDeployment.dispose();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
