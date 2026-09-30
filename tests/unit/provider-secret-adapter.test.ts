import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  getSecret: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  listAccountIds: vi.fn(),
  legacyGet: vi.fn(),
  legacySet: vi.fn(),
}));

vi.mock('@electron/services/providers/provider-migration', () => ({ ensureProviderStoreMigrated: mocks.ensureMigrated }));
vi.mock('@electron/services/providers/store-instance', () => ({
  getClawXProviderStore: async () => ({ get: mocks.legacyGet, set: mocks.legacySet }),
}));
vi.mock('@electron/services/secrets/secret-store', () => ({
  getProviderSecret: mocks.getSecret,
  setProviderSecret: mocks.setSecret,
  deleteProviderSecret: mocks.deleteSecret,
  getSecretStore: () => ({ get: mocks.getSecret, listAccountIds: mocks.listAccountIds }),
}));
vi.mock('@electron/utils/openclaw-auth', () => ({ getActiveOpenClawProviders: vi.fn() }));

import { deleteApiKey, getApiKey, hasApiKey, listStoredKeyIds, storeApiKey } from '@electron/utils/secure-storage';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.getSecret.mockResolvedValue(null);
  mocks.setSecret.mockResolvedValue(undefined);
  mocks.deleteSecret.mockResolvedValue(undefined);
  mocks.listAccountIds.mockResolvedValue([]);
});

describe('legacy provider key adapter', () => {
  it('writes only the protected store and propagates protection failure', async () => {
    await expect(storeApiKey('first', 'synthetic-secret')).resolves.toBe(true);
    expect(mocks.setSecret).toHaveBeenCalledWith({ type: 'api_key', accountId: 'first', apiKey: 'synthetic-secret' });
    expect(mocks.legacySet).not.toHaveBeenCalled();

    mocks.setSecret.mockRejectedValueOnce(new Error('protection unavailable'));
    await expect(storeApiKey('first', 'synthetic-new-secret')).rejects.toThrow('protection unavailable');
    expect(mocks.legacySet).not.toHaveBeenCalled();
  });

  it('distinguishes an absent key from protected-read failure without plaintext fallback', async () => {
    mocks.legacyGet.mockReturnValue({ first: 'synthetic-plaintext-secret' });
    await expect(getApiKey('first')).resolves.toBeNull();
    await expect(hasApiKey('first')).resolves.toBe(false);
    mocks.getSecret.mockRejectedValue(new Error('cannot decrypt'));
    await expect(getApiKey('first')).rejects.toThrow('cannot decrypt');
    await expect(hasApiKey('first')).rejects.toThrow('cannot decrypt');
    expect(mocks.legacyGet).not.toHaveBeenCalled();
  });

  it('lists only protected API/local keys and propagates vault failure', async () => {
    mocks.listAccountIds.mockResolvedValue(['first', 'oauth', 'local']);
    mocks.getSecret.mockImplementation(async (id: string) => {
      if (id === 'first') return { type: 'api_key', accountId: id, apiKey: 'synthetic-secret' };
      if (id === 'local') return { type: 'local', accountId: id, apiKey: 'synthetic-local-secret' };
      return { type: 'oauth', accountId: id, accessToken: 'synthetic-token', refreshToken: 'synthetic-refresh', expiresAt: 1 };
    });
    await expect(listStoredKeyIds()).resolves.toEqual(['first', 'local']);
    mocks.listAccountIds.mockRejectedValue(new Error('protection unavailable'));
    await expect(listStoredKeyIds()).rejects.toThrow('protection unavailable');
  });

  it('does not remove legacy plaintext before verified protected deletion', async () => {
    mocks.deleteSecret.mockRejectedValueOnce(new Error('cannot decrypt'));
    await expect(deleteApiKey('first')).rejects.toThrow('cannot decrypt');
    expect(mocks.legacySet).not.toHaveBeenCalled();
  });
});
