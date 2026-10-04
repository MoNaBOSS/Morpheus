import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAccount, ProviderConfig } from '@electron/shared/providers/types';

const memory = vi.hoisted(() => ({ data: {} as Record<string, unknown>, set: vi.fn() }));
vi.mock('@electron/services/providers/store-instance', () => ({
  getClawXProviderStore: async () => ({
    get: (key: string) => memory.data[key],
    set: (key: string, value: unknown) => { memory.set(key, value); memory.data[key] = value; },
    delete: (key: string) => { delete memory.data[key]; },
  }),
}));
import { ensureProviderStoreMigrated } from '@electron/services/providers/provider-migration';

const legacy: ProviderConfig = {
  id: 'openrouter', name: 'Stale Legacy', type: 'openrouter', model: 'openai/stale-model',
  baseUrl: 'https://stale.example/v1', enabled: true,
  createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
};
const retained: ProviderAccount = {
  id: 'openrouter', label: 'Saved Connection', vendorId: 'openrouter', authMode: 'api_key',
  model: 'openrouter/auto', baseUrl: 'https://saved.example/v1', enabled: false, isDefault: false,
  metadata: { customModels: ['openrouter/auto', 'openrouter/free'], customSetting: true },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('provider schema-zero migration preserves existing saved identities', () => {
  beforeEach(() => {
    memory.set.mockClear();
    memory.data = { schemaVersion: 0, providers: { openrouter: structuredClone(legacy) },
      providerAccounts: { openrouter: structuredClone(retained) },
      apiKeys: { openrouter: 'synthetic-legacy-store-value' },
      providerSecrets: { openrouter: { encrypted: 'synthetic-protected-blob' } } };
  });

  it('does not overwrite saved settings or protected/legacy credentials with a same-ID legacy entry', async () => {
    const snapshot = structuredClone(memory.data);
    await ensureProviderStoreMigrated();
    expect(memory.data.providerAccounts).toEqual(snapshot.providerAccounts);
    expect(memory.data.apiKeys).toEqual(snapshot.apiKeys);
    expect(memory.data.providerSecrets).toEqual(snapshot.providerSecrets);
    expect(memory.data.providers).toEqual({});
    expect(memory.data.schemaVersion).toBe(2);
    expect(memory.set.mock.calls.map(([key]) => key)).toEqual(['providers', 'schemaVersion']);
  });

  it('preserves the existing default and does not mark a newly imported stale legacy default', async () => {
    const existingDefault = { ...retained, id: 'saved-default', label: 'Current Default', enabled: true, isDefault: true };
    memory.data.providerAccounts = { openrouter: structuredClone(retained), 'saved-default': existingDefault };
    memory.data.defaultProviderAccountId = existingDefault.id;
    memory.data.defaultProvider = 'legacy-default';
    memory.data.providers = { openrouter: structuredClone(legacy), 'legacy-default': { ...legacy, id: 'legacy-default' } };
    await ensureProviderStoreMigrated();
    expect(memory.data.defaultProviderAccountId).toBe(existingDefault.id);
    const accounts = memory.data.providerAccounts as Record<string, ProviderAccount>;
    expect(accounts.openrouter).toEqual(retained);
    expect(accounts['saved-default']).toEqual(existingDefault);
    expect(accounts['legacy-default'].isDefault).toBe(false);
  });

  it('uses a legacy default only when its saved identity exists without overwriting that identity', async () => {
    memory.data.defaultProvider = 'openrouter';
    await ensureProviderStoreMigrated();
    expect(memory.data.defaultProviderAccountId).toBe('openrouter');
    expect((memory.data.providerAccounts as Record<string, ProviderAccount>).openrouter).toEqual(retained);
  });

  it('does not select a missing legacy default identity', async () => {
    memory.data.defaultProvider = 'missing-legacy-id';
    await ensureProviderStoreMigrated();
    expect(memory.data.defaultProviderAccountId).toBeUndefined();
    expect(memory.set).not.toHaveBeenCalledWith('defaultProviderAccountId', expect.anything());
  });
});
