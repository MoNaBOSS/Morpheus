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

import { deleteApiKey, getAllProviders, getApiKey, getDefaultProvider, getProvider, hasApiKey, listStoredKeyIds, storeApiKey } from '@electron/utils/secure-storage';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.getSecret.mockResolvedValue(null);
  mocks.setSecret.mockResolvedValue(undefined);
  mocks.deleteSecret.mockResolvedValue(undefined);
  mocks.listAccountIds.mockResolvedValue([]);
});

describe('legacy provider key adapter', () => {
  it('prefers the saved modern default over a stale legacy default without rewriting either value', async () => {
    mocks.legacyGet.mockImplementation((key: string) => key === 'defaultProviderAccountId' ? 'saved-modern-default'
      : key === 'defaultProvider' ? 'stale-legacy-default' : undefined);
    await expect(getDefaultProvider()).resolves.toBe('saved-modern-default');
    expect(mocks.legacySet).not.toHaveBeenCalled();
  });

  it('keeps legacy-only default compatibility when a modern account default is absent', async () => {
    mocks.legacyGet.mockImplementation((key: string) => key === 'defaultProvider' ? 'legacy-only-default' : undefined);
    await expect(getDefaultProvider()).resolves.toBe('legacy-only-default');
    expect(mocks.legacySet).not.toHaveBeenCalled();
  });

  it('reads the modern model and endpoint ahead of a stale same-ID legacy OAuth entry', async () => {
    const modern = { id: 'oauth', vendorId: 'minimax-portal', label: 'Saved OAuth', authMode: 'oauth_device',
      model: 'new-model', baseUrl: 'https://saved.example/v1', apiProtocol: 'anthropic-messages', enabled: true,
      createdAt: '2026-01-01', updatedAt: '2026-02-01' };
    const legacy = { id: modern.id, type: modern.vendorId, name: 'Stale OAuth', model: 'old-model', baseUrl: 'https://stale.example/v1' };
    mocks.legacyGet.mockImplementation((key: string) => key === 'providerAccounts' ? { oauth: modern }
      : key === 'providers' ? { oauth: legacy } : undefined);
    await expect(getProvider(modern.id)).resolves.toMatchObject({ id: modern.id, name: modern.label, model: modern.model,
      baseUrl: modern.baseUrl, apiProtocol: modern.apiProtocol, updatedAt: modern.updatedAt });
    expect(mocks.legacySet).not.toHaveBeenCalled();
  });

  it('keeps all modern sibling configs visible when device OAuth has populated the legacy store', async () => {
    const oauth = { id: 'oauth', vendorId: 'minimax-portal', label: 'Saved OAuth', authMode: 'oauth_device', model: 'new-model', enabled: true };
    const first = { id: 'openrouter-first', vendorId: 'openrouter', label: 'First', authMode: 'api_key', model: 'openrouter/auto', enabled: true };
    const second = { ...first, id: 'openrouter-second', label: 'Second', model: 'openai/second-model' };
    const legacyOnly = { id: 'legacy-only', name: 'Legacy Only', type: 'moonshot', model: 'legacy-model' };
    mocks.legacyGet.mockImplementation((key: string) => key === 'providerAccounts' ? { oauth, [first.id]: first, [second.id]: second }
      : key === 'providers' ? { oauth: { id: 'oauth', name: 'Old OAuth', type: 'minimax-portal', model: 'old-model' }, [legacyOnly.id]: legacyOnly } : undefined);
    const providers = await getAllProviders();
    expect(providers.map(({ id, model }) => ({ id, model }))).toEqual([
      { id: oauth.id, model: oauth.model }, { id: first.id, model: first.model },
      { id: second.id, model: second.model }, { id: legacyOnly.id, model: legacyOnly.model },
    ]);
    expect(mocks.legacySet).not.toHaveBeenCalled();
  });

  it('retains legacy-only provider lookup and listing when no modern accounts exist', async () => {
    const legacy = { id: 'legacy-only', name: 'Legacy Only', type: 'moonshot', model: 'legacy-model' };
    mocks.legacyGet.mockImplementation((key: string) => key === 'providers' ? { [legacy.id]: legacy } : undefined);
    await expect(getProvider(legacy.id)).resolves.toEqual(legacy);
    await expect(getAllProviders()).resolves.toEqual([legacy]);
    await expect(getProvider('missing')).resolves.toBeNull();
    expect(mocks.legacySet).not.toHaveBeenCalled();
  });
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
