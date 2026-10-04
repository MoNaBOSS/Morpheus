import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureProviderStoreMigrated: vi.fn(),
  listProviderAccounts: vi.fn(),
  getProviderAccount: vi.fn(),
  deleteProviderAccount: vi.fn(),
  saveProviderAccount: vi.fn(),
  getActiveOpenClawProviders: vi.fn(),
  getOpenClawProvidersConfig: vi.fn(),
  getProviderApiKeyFromOpenClaw: vi.fn(),
  getOpenClawProviderKeyForType: vi.fn(),
  getAliasSourceTypes: vi.fn(),
  getProviderDefinition: vi.fn(),
  getApiKey: vi.fn(),
  getProviderSecret: vi.fn(),
  storeApiKey: vi.fn(),
  setDefaultProviderAccount: vi.fn(),
  setDefaultProvider: vi.fn(),
  hasApiKey: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock('@electron/services/providers/provider-migration', () => ({
  ensureProviderStoreMigrated: mocks.ensureProviderStoreMigrated,
}));

vi.mock('@electron/services/providers/provider-store', () => ({
  listProviderAccounts: mocks.listProviderAccounts,
  deleteProviderAccount: mocks.deleteProviderAccount,
  getProviderAccount: mocks.getProviderAccount,
  getDefaultProviderAccountId: vi.fn(),
  providerAccountToConfig: vi.fn(),
  providerConfigToAccount: vi.fn(),
  saveProviderAccount: mocks.saveProviderAccount,
  setDefaultProviderAccount: mocks.setDefaultProviderAccount,
}));

vi.mock('@electron/utils/openclaw-auth', () => ({
  getActiveOpenClawProviders: mocks.getActiveOpenClawProviders,
  getOpenClawProvidersConfig: mocks.getOpenClawProvidersConfig,
  getProviderApiKeyFromOpenClaw: mocks.getProviderApiKeyFromOpenClaw,
}));

vi.mock('@electron/utils/provider-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@electron/utils/provider-keys')>();
  return {
    ...actual,
    getOpenClawProviderKeyForType: mocks.getOpenClawProviderKeyForType,
    resolveOpenClawProviderKey: (account: { vendorId: string; id: string; authMode?: string }) => {
      if (account.authMode === 'oauth_browser' && account.vendorId === 'openai') {
        return 'openai';
      }
      return mocks.getOpenClawProviderKeyForType(account.vendorId, account.id);
    },
    getAliasSourceTypes: mocks.getAliasSourceTypes,
  };
});

vi.mock('@electron/utils/secure-storage', () => ({
  deleteApiKey: vi.fn(),
  deleteProvider: vi.fn(),
  getApiKey: mocks.getApiKey,
  hasApiKey: mocks.hasApiKey,
  saveProvider: vi.fn(),
  setDefaultProvider: mocks.setDefaultProvider,
  storeApiKey: mocks.storeApiKey,
}));

vi.mock('@electron/services/secrets/secret-store', () => ({ getProviderSecret: mocks.getProviderSecret }));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: vi.fn(),
  },
}));

vi.mock('@electron/shared/providers/registry', () => ({
  PROVIDER_DEFINITIONS: [],
  getProviderDefinition: mocks.getProviderDefinition,
}));

import { ProviderService } from '@electron/services/providers/provider-service';
import type { ProviderAccount } from '@electron/shared/providers/types';

function makeAccount(overrides: Partial<ProviderAccount> = {}): ProviderAccount {
  return {
    id: 'test-account',
    vendorId: 'moonshot' as ProviderAccount['vendorId'],
    label: 'Test',
    authMode: 'api_key' as ProviderAccount['authMode'],
    enabled: true,
    isDefault: false,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Default mock: getOpenClawProviderKeyForType maps type to itself,
 * except minimax-portal-cn → minimax-portal (alias).
 */
function setupDefaultKeyMapping() {
  mocks.getOpenClawProviderKeyForType.mockImplementation(
    (type: string) => type === 'minimax-portal-cn' ? 'minimax-portal' : type,
  );
}

describe('ProviderService preserves account identity across sibling creation and default changes', () => {
  let service: ProviderService;
  let accounts: ProviderAccount[];
  let keys: Map<string, string>;

  beforeEach(() => {
    vi.resetAllMocks();
    setupDefaultKeyMapping();
    accounts = [makeAccount({ id: 'imported', vendorId: 'openrouter', model: 'openrouter/auto',
      baseUrl: 'https://original.example/v1', isDefault: true })];
    keys = new Map();
    mocks.listProviderAccounts.mockImplementation(async () => accounts);
    mocks.getProviderAccount.mockImplementation(async (id: string) => accounts.find((account) => account.id === id) ?? null);
    mocks.getApiKey.mockImplementation(async (id: string) => keys.get(id) ?? null);
    mocks.getProviderSecret.mockResolvedValue(null);
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue('synthetic-imported-key');
    mocks.storeApiKey.mockImplementation(async (id: string, key: string) => { keys.set(id, key); return true; });
    mocks.saveProviderAccount.mockImplementation(async (account: ProviderAccount) => { accounts.push(account); });
    service = new ProviderService();
  });

  it.each(['api_key', undefined] as const)('protects the sole imported API key before adding its first sibling with legacy mode %s', async (authMode) => {
    accounts[0] = { ...accounts[0], authMode: authMode as ProviderAccount['authMode'] };
    const original = structuredClone(accounts[0]);
    const sibling = makeAccount({ id: 'second', vendorId: 'openrouter', model: 'openai/other-model',
      baseUrl: 'https://second.example/v1' });
    await service.createAccount(sibling, 'synthetic-second-key');
    expect(mocks.storeApiKey.mock.calls).toEqual([
      ['imported', 'synthetic-imported-key'], ['second', 'synthetic-second-key'],
    ]);
    expect(mocks.storeApiKey.mock.invocationCallOrder[0]).toBeLessThan(mocks.saveProviderAccount.mock.invocationCallOrder[0]);
    expect(accounts).toEqual([original, sibling]);
    expect(mocks.setDefaultProviderAccount).not.toHaveBeenCalled();
    mocks.getProviderApiKeyFromOpenClaw.mockClear();
    expect(await service.getAccountRuntimeApiKey('imported')).toBe('synthetic-imported-key');
    expect(await service.getAccountRuntimeApiKey('second')).toBe('synthetic-second-key');
    await service.setDefaultAccount('imported');
    expect(mocks.setDefaultProviderAccount).toHaveBeenCalledExactlyOnceWith('imported');
    expect(mocks.getProviderApiKeyFromOpenClaw).not.toHaveBeenCalled();
  });

  it('does not write a new account or default when protecting the imported credential fails', async () => {
    const original = structuredClone(accounts);
    mocks.storeApiKey.mockRejectedValueOnce(new Error('Protected storage unavailable'));
    await expect(service.createAccount(makeAccount({ id: 'second', vendorId: 'openrouter' }), 'synthetic-second-key'))
      .rejects.toThrow('Protected storage unavailable');
    expect(accounts).toEqual(original);
    expect(keys.size).toBe(0);
    expect(mocks.storeApiKey).toHaveBeenCalledExactlyOnceWith('imported', 'synthetic-imported-key');
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
    expect(mocks.setDefaultProviderAccount).not.toHaveBeenCalled();
    expect(mocks.setDefaultProvider).not.toHaveBeenCalled();
  });

  it.each(['oauth_browser', 'oauth_device', 'local'] as const)('does not bind static legacy auth to an existing %s account', async (authMode) => {
    accounts[0] = { ...accounts[0], authMode };
    await service.createAccount(makeAccount({ id: 'second', vendorId: 'openrouter' }));
    expect(mocks.storeApiKey).not.toHaveBeenCalled();
    expect(mocks.getProviderApiKeyFromOpenClaw).not.toHaveBeenCalled();
  });

  it('does not bind static legacy auth over an existing OAuth secret', async () => {
    mocks.getProviderSecret.mockResolvedValue({ type: 'oauth', accountId: 'imported', accessToken: 'synthetic-token' });
    await service.createAccount(makeAccount({ id: 'second', vendorId: 'openrouter' }));
    expect(mocks.storeApiKey).not.toHaveBeenCalled();
    expect(mocks.getProviderApiKeyFromOpenClaw).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: true, key: undefined, error: 'API key' },
    { enabled: false, key: 'synthetic-disabled-key', error: 'disabled' },
  ])('refuses an unready sibling default without changing saved metadata ($error)', async ({ enabled, key, error }) => {
    keys.set('imported', 'synthetic-original-key');
    accounts.push(makeAccount({ id: 'second', vendorId: 'openrouter', enabled, model: 'openai/other-model', baseUrl: 'https://second.example/v1' }));
    if (key) keys.set('second', key);
    const original = structuredClone(accounts);
    await expect(service.setDefaultAccount('second')).rejects.toThrow(error);
    expect(accounts).toEqual(original);
    expect(mocks.setDefaultProviderAccount).not.toHaveBeenCalled();
    expect(mocks.setDefaultProvider).not.toHaveBeenCalled();
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
    expect(mocks.getProviderApiKeyFromOpenClaw).not.toHaveBeenCalled();
  });

  it.each(['local', 'oauth_browser', 'oauth_device'] as const)('keeps no-static-key default compatibility for %s accounts', async (authMode) => {
    accounts.push(makeAccount({ id: 'second', vendorId: 'openrouter', authMode }));
    await service.setDefaultAccount('second');
    expect(mocks.setDefaultProviderAccount).toHaveBeenCalledExactlyOnceWith('second');
    expect(mocks.setDefaultProvider).toHaveBeenCalledExactlyOnceWith('second');
  });

  it('retains sole legacy API-key fallback when authMode was absent without rewriting the record', async () => {
    accounts[0] = { ...accounts[0], authMode: undefined as unknown as ProviderAccount['authMode'] };
    const original = structuredClone(accounts[0]);
    expect(await service.getAccountRuntimeApiKey('imported')).toBe('synthetic-imported-key');
    await service.setDefaultAccount('imported');
    expect(accounts[0]).toEqual(original);
    expect(mocks.setDefaultProviderAccount).toHaveBeenCalledWith('imported');
  });
});

describe('ProviderService.listAccounts preserves saved accounts while importing runtime-only providers', () => {
  let service: ProviderService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureProviderStoreMigrated.mockResolvedValue(undefined);
    setupDefaultKeyMapping();
    mocks.getAliasSourceTypes.mockReturnValue([]);
    mocks.getProviderDefinition.mockReturnValue(undefined);
    mocks.getOpenClawProvidersConfig.mockResolvedValue({ providers: {}, defaultModel: undefined });
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue(null);
    mocks.getApiKey.mockResolvedValue(null);
    mocks.hasApiKey.mockResolvedValue(false);
    mocks.listProviderAccounts.mockResolvedValue([]);
    mocks.getProviderAccount.mockImplementation(async (id: string) => (await mocks.listProviderAccounts()).find((account: ProviderAccount) => account.id === id) ?? null);
    service = new ProviderService();
  });

  it('retains both OpenRouter models, all settings and the selected default across repeated list snapshots', async () => {
    const saved = [makeAccount({ id: 'retained', vendorId: 'openrouter', model: 'fixture/retained', isDefault: true,
      headers: { 'X-Route': 'retained' }, metadata: { customModels: ['fixture/retained'] } }),
    makeAccount({ id: 'edited', vendorId: 'openrouter', model: 'fixture/edited', baseUrl: 'https://other.example/v1' })];
    mocks.listProviderAccounts.mockResolvedValue(saved);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openrouter']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({ providers: { openrouter: { models: [{ id: 'runtime/model' }] } }, defaultModel: 'openrouter/runtime/model' });
    expect(await service.listAccounts()).toEqual(saved);
    expect(await service.listAccounts()).toEqual(saved);
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
  });

  it('retains saved accounts when activeProviders is empty', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({ id: 'moonshot-1', vendorId: 'moonshot' as ProviderAccount['vendorId'] }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set<string>());

    const result = await service.listAccounts();

    expect(result).toEqual(await mocks.listProviderAccounts());
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
  });

  it('retains saved accounts absent from openclaw.json', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({ id: 'moonshot-1', vendorId: 'moonshot' as ProviderAccount['vendorId'] }),
      makeAccount({ id: 'custom-orphan', vendorId: 'custom' as ProviderAccount['vendorId'] }),
    ]);
    // Only moonshot is active — custom is NOT in openclaw.json
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['moonshot']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { moonshot: { baseUrl: 'https://api.moonshot.cn/v1' } },
      defaultModel: undefined,
    });

    const result = await service.listAccounts();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('moonshot-1');
  });

  it('seeds new account from openclaw.json when no store match exists', async () => {
    mocks.listProviderAccounts.mockResolvedValue([]); // empty store
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['siliconflow']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1' } },
      defaultModel: undefined,
    });

    const result = await service.listAccounts();

    expect(mocks.saveProviderAccount).toHaveBeenCalledTimes(1);
    expect(mocks.saveProviderAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'siliconflow' }),
    );
    expect(result).toHaveLength(1);
  });

  it('seeds custom model metadata from openclaw provider model lists', async () => {
    mocks.listProviderAccounts.mockResolvedValue([]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['custom-model-hub']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {
        'custom-model-hub': {
          baseUrl: 'http://127.0.0.1:3100/v1',
          api: 'openai-completions',
          models: [
            { id: 'gpt-5.4', name: 'gpt-5.4' },
            { id: 'claude-sonnet-4', name: 'claude-sonnet-4' },
            { id: 'gpt-5.4', name: 'duplicate' },
          ],
        },
      },
      defaultModel: 'custom-model-hub/gpt-5.4',
    });

    const result = await service.listAccounts();

    expect(mocks.saveProviderAccount).toHaveBeenCalledWith(expect.objectContaining({
      id: 'custom-model-hub',
      model: 'custom-model-hub/gpt-5.4',
      metadata: { customModels: ['gpt-5.4', 'claude-sonnet-4'] },
    }));
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'custom-model-hub',
      metadata: { customModels: ['gpt-5.4', 'claude-sonnet-4'] },
    }));
  });

  it('uses store metadata when match exists (does not re-seed)', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({ id: 'moonshot', vendorId: 'moonshot' as ProviderAccount['vendorId'], label: 'My Moonshot' }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['moonshot']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { moonshot: { baseUrl: 'https://api.moonshot.cn/v1' } },
      defaultModel: undefined,
    });

    const result = await service.listAccounts();

    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('My Moonshot');
  });

  it('retains custom model metadata and explicit model despite different runtime settings', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'custom-model-hub',
        vendorId: 'custom' as ProviderAccount['vendorId'],
        label: 'Model Hub',
        model: 'custom-model-hub/gpt-5.4',
        metadata: { customModels: ['gpt-5.4', 'claude-sonnet-4', 'gemini-2.5-pro'] },
      }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['custom-model-hub']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {
        'custom-model-hub': {
          baseUrl: 'http://127.0.0.1:3100/v1',
          api: 'openai-completions',
          models: [
            { id: 'claude-sonnet-4', name: 'claude-sonnet-4' },
            { id: 'gpt-5.4', name: 'gpt-5.4' },
          ],
        },
      },
      defaultModel: 'custom-model-hub/claude-sonnet-4',
    });

    const result = await service.listAccounts();

    expect(result).toEqual(await mocks.listProviderAccounts());
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
  });

  it('preserves existing non-default provider model while syncing metadata', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'openrouter-work',
        vendorId: 'openrouter' as ProviderAccount['vendorId'],
        label: 'OpenRouter Work',
        model: 'openrouter/openai/gpt-5.5',
      }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openrouter']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {
        openrouter: {
          baseUrl: 'https://openrouter.ai/api/v1',
          api: 'openai-completions',
        },
      },
      defaultModel: 'openai/gpt-5.4',
    });

    const result = await service.listAccounts();

    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'openrouter-work',
      model: 'openrouter/openai/gpt-5.5',
    }));
  });

  it('retains saved OpenAI API-key and OAuth accounts sharing a runtime key', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'openai-oauth-1',
        vendorId: 'openai' as ProviderAccount['vendorId'],
        authMode: 'oauth_browser',
        label: 'OpenAI Codex',
      }),
      makeAccount({
        id: 'openai',
        vendorId: 'openai' as ProviderAccount['vendorId'],
        authMode: 'api_key',
        label: 'OpenAI',
      }),
    ]);
    mocks.getApiKey.mockResolvedValue(null);
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue(null);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openai']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {
        openai: {
          baseUrl: 'https://chatgpt.com/backend-api/codex',
          api: 'openai-chatgpt-responses',
        },
      },
      defaultModel: 'openai/gpt-5.5',
    });

    const result = await service.listAccounts();

    expect(result).toEqual(await mocks.listProviderAccounts());
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
  });

  it('retains keyless OpenAI settings when OAuth is active only via auth profile', async () => {
    // Runtime OAuth authority does not prove that another saved account is stale.
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'openai-oauth-1',
        vendorId: 'openai' as ProviderAccount['vendorId'],
        authMode: 'oauth_browser',
        label: 'OpenAI Codex',
      }),
      makeAccount({
        id: 'openai',
        vendorId: 'openai' as ProviderAccount['vendorId'],
        authMode: 'api_key',
        label: 'OpenAI',
      }),
    ]);
    mocks.getApiKey.mockResolvedValue(null);
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue(null);
    // Active set as produced by getActiveOpenClawProviders() when only the
    // OpenAI OAuth profile exists in the auth store.
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openai']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { openai: {} },
      defaultModel: undefined,
    });

    const result = await service.listAccounts();

    expect(result).toEqual(await mocks.listProviderAccounts());
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
  });

  it('matches OpenAI browser OAuth accounts to the canonical openai runtime key', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'openai-oauth-1',
        vendorId: 'openai' as ProviderAccount['vendorId'],
        authMode: 'oauth_browser',
        label: 'OpenAI Codex',
      }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openai']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {},
      defaultModel: 'openai/gpt-5.5',
    });

    const result = await service.listAccounts();

    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('openai-oauth-1');
    expect(result[0].authMode).toBe('oauth_browser');
  });

  it('retains saved keyless OpenAI settings after OAuth is removed', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'openai',
        vendorId: 'openai' as ProviderAccount['vendorId'],
        authMode: 'api_key',
        label: 'OpenAI',
      }),
    ]);
    mocks.getApiKey.mockResolvedValue(null);
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue(null);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openai']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {},
      defaultModel: 'minimax-portal/MiniMax-M3',
    });

    const result = await service.listAccounts();

    expect(result).toEqual(await mocks.listProviderAccounts());
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
  });

  it('keeps openai visible when only OpenClaw auth-profiles has the API key', async () => {
    mocks.listProviderAccounts.mockResolvedValue([]);
    mocks.getApiKey.mockResolvedValue(null);
    mocks.getProviderApiKeyFromOpenClaw.mockImplementation(async (provider: string) => (
      provider === 'openai' ? 'sk-openclaw-imported' : null
    ));
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openai']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {
        openai: { baseUrl: 'https://api.openai.com/v1', api: 'openai-responses' },
      },
      defaultModel: 'openai/gpt-5.5',
    });
    mocks.getProviderDefinition.mockImplementation((key: string) => {
      if (key === 'openai') {
        return {
          id: 'openai',
          name: 'OpenAI',
          defaultAuthMode: 'api_key',
          defaultModelId: 'gpt-5.5',
          providerConfig: {
            baseUrl: 'https://api.openai.com/v1',
            api: 'openai-responses',
          },
        };
      }
      return undefined;
    });

    const result = await service.listAccounts();

    expect(mocks.saveProviderAccount).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'openai',
      vendorId: 'openai',
      authMode: 'api_key',
    }));
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
  });

  it('matches UUID-based store account to openclaw key via getOpenClawProviderKeyForType', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({ id: 'openrouter-uuid-1234', vendorId: 'openrouter' as ProviderAccount['vendorId'] }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openrouter']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { openrouter: { baseUrl: 'https://openrouter.ai/api/v1' } },
      defaultModel: undefined,
    });

    const result = await service.listAccounts();

    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('openrouter-uuid-1234');
  });

  it('retains both saved MiniMax aliases sharing a runtime key', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'minimax-portal',
        vendorId: 'minimax-portal' as ProviderAccount['vendorId'],
        label: 'MiniMax (Global)',
        updatedAt: '2026-03-20T00:00:00.000Z',
      }),
      makeAccount({
        id: 'minimax-portal-cn-uuid',
        vendorId: 'minimax-portal-cn' as ProviderAccount['vendorId'],
        label: 'MiniMax (CN)',
        updatedAt: '2026-03-21T00:00:00.000Z',
      }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['minimax-portal']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { 'minimax-portal': { baseUrl: 'https://api.minimaxi.com/anthropic' } },
      defaultModel: undefined,
    });

    const result = await service.listAccounts();

    expect(result).toEqual(await mocks.listProviderAccounts());
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
  });

  it('shows only one CN when only CN account exists (no phantom)', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'minimax-portal-cn-uuid',
        vendorId: 'minimax-portal-cn' as ProviderAccount['vendorId'],
        label: 'MiniMax (CN)',
      }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['minimax-portal']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { 'minimax-portal': { baseUrl: 'https://api.minimaxi.com/anthropic' } },
      defaultModel: undefined,
    });

    const result = await service.listAccounts();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('minimax-portal-cn-uuid');
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
  });

  it('retains every saved MiniMax account regardless of update ordering', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'minimax-portal-cn-uuid1',
        vendorId: 'minimax-portal-cn' as ProviderAccount['vendorId'],
        updatedAt: '2026-03-20T00:00:00.000Z',
      }),
      makeAccount({
        id: 'minimax-portal-cn-uuid2',
        vendorId: 'minimax-portal-cn' as ProviderAccount['vendorId'],
        updatedAt: '2026-03-21T00:00:00.000Z',
      }),
      makeAccount({
        id: 'minimax-portal-cn-uuid3',
        vendorId: 'minimax-portal-cn' as ProviderAccount['vendorId'],
        updatedAt: '2026-03-22T00:00:00.000Z',
      }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['minimax-portal']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { 'minimax-portal': {} },
      defaultModel: undefined,
    });

    const result = await service.listAccounts();

    expect(result).toEqual(await mocks.listProviderAccounts());
    expect(mocks.deleteProviderAccount).not.toHaveBeenCalled();
    expect(mocks.saveProviderAccount).not.toHaveBeenCalled();
  });

  it('handles multiple active providers from openclaw.json correctly', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({ id: 'openrouter-uuid', vendorId: 'openrouter' as ProviderAccount['vendorId'] }),
      makeAccount({ id: 'minimax-portal-cn-uuid', vendorId: 'minimax-portal-cn' as ProviderAccount['vendorId'] }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openrouter', 'minimax-portal']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {
        openrouter: { baseUrl: 'https://openrouter.ai/api/v1' },
        'minimax-portal': { baseUrl: 'https://api.minimaxi.com/anthropic' },
      },
      defaultModel: undefined,
    });

    const result = await service.listAccounts();

    expect(result).toHaveLength(2);
    const ids = result.map((a: ProviderAccount) => a.id);
    expect(ids).toContain('openrouter-uuid');
    expect(ids).toContain('minimax-portal-cn-uuid');
  });

  it('seeds a MiniMax CN account when minimax-portal baseUrl points at the CN endpoint', async () => {
    mocks.listProviderAccounts.mockResolvedValue([]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['minimax-portal']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {
        'minimax-portal': { baseUrl: 'https://api.minimaxi.com/anthropic' },
      },
      defaultModel: undefined,
    });
    mocks.getProviderDefinition.mockImplementation((key: string) => {
      if (key === 'minimax-portal-cn') {
        return {
          id: 'minimax-portal-cn',
          name: 'MiniMax (CN)',
          defaultAuthMode: 'oauth_device',
          defaultModelId: 'MiniMax-M2.7',
          providerConfig: {
            baseUrl: 'https://api.minimaxi.com/anthropic',
            api: 'anthropic-messages',
          },
        };
      }
      return undefined;
    });

    const result = await service.listAccounts();

    expect(mocks.saveProviderAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'minimax-portal',
        vendorId: 'minimax-portal-cn',
        label: 'MiniMax (CN)',
        baseUrl: 'https://api.minimaxi.com/anthropic',
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'minimax-portal',
      vendorId: 'minimax-portal-cn',
      label: 'MiniMax (CN)',
    }));
  });

  it('seeds builtin providers discovered from auth profiles without explicit models.providers entries', async () => {
    mocks.listProviderAccounts.mockResolvedValue([]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openai', 'anthropic']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: {
        anthropic: {},
      },
      defaultModel: undefined,
    });
    mocks.getProviderDefinition.mockImplementation((key: string) => {
      if (key === 'openai') {
        return {
          id: 'openai',
          name: 'OpenAI',
          defaultAuthMode: 'oauth_browser',
          defaultModelId: 'gpt-5.2',
          providerConfig: {
            baseUrl: 'https://api.openai.com/v1',
            api: 'openai-responses',
          },
        };
      }
      if (key === 'anthropic') {
        return {
          id: 'anthropic',
          name: 'Anthropic',
          defaultAuthMode: 'api_key',
          defaultModelId: 'claude-opus-4-8',
        };
      }
      return undefined;
    });

    const result = await service.listAccounts();

    expect(mocks.saveProviderAccount).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result).toEqual([
      expect.objectContaining({
        id: 'anthropic',
        vendorId: 'anthropic',
        authMode: 'api_key',
        model: 'claude-opus-4-8',
      }),
    ]);
  });
});

describe('ProviderService.listAccountsKeyInfo', () => {
  let service: ProviderService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureProviderStoreMigrated.mockResolvedValue(undefined);
    setupDefaultKeyMapping();
    mocks.getAliasSourceTypes.mockReturnValue([]);
    mocks.getProviderDefinition.mockReturnValue(undefined);
    mocks.getOpenClawProvidersConfig.mockResolvedValue({ providers: {}, defaultModel: undefined });
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue(null);
    mocks.getApiKey.mockResolvedValue(null);
    mocks.hasApiKey.mockResolvedValue(false);
    mocks.getProviderAccount.mockImplementation(async (id: string) => (await mocks.listProviderAccounts()).find((account: ProviderAccount) => account.id === id) ?? null);
    service = new ProviderService();
  });

  it('never attributes shared runtime auth to a keyless sibling, including disabled accounts', async () => {
    const accounts = [makeAccount({ id: 'configured', vendorId: 'openrouter', isDefault: true }),
      makeAccount({ id: 'keyless', vendorId: 'openrouter', enabled: false })];
    mocks.listProviderAccounts.mockResolvedValue(accounts);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openrouter']));
    mocks.getApiKey.mockImplementation(async (id: string) => id === 'configured' ? 'synthetic-own-key' : id === 'openrouter' ? 'synthetic-legacy-key' : null);
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue('synthetic-runtime-key');
    expect(await service.listAccountsKeyInfo()).toEqual([
      { accountId: 'configured', hasKey: true, keyMasked: 'synt*********-key' },
      { accountId: 'keyless', hasKey: false, keyMasked: null },
    ]);
    expect(await service.getAccountRuntimeApiKey('configured')).toBe('synthetic-own-key');
    expect(await service.getAccountRuntimeApiKey('keyless')).toBeNull();
    expect(await service.hasAccountApiKey('keyless')).toBe(false);
    expect(await service.hasAccountApiKey('missing')).toBe(false);
    expect(mocks.getProviderApiKeyFromOpenClaw).not.toHaveBeenCalled();
    expect(mocks.getApiKey).not.toHaveBeenCalledWith('openrouter');
  });

  it('does not attribute a sole OpenAI static runtime key to an OAuth account', async () => {
    mocks.listProviderAccounts.mockResolvedValue([makeAccount({ id: 'oauth', vendorId: 'openai', authMode: 'oauth_browser' })]);
    mocks.getApiKey.mockResolvedValue(null);
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue('synthetic-unrelated-static');
    expect(await service.getAccountRuntimeApiKey('oauth')).toBeNull();
    expect(await service.hasAccountApiKey('oauth')).toBe(false);
    expect(mocks.getProviderApiKeyFromOpenClaw).not.toHaveBeenCalled();
  });

  it('uses imported OpenClaw runtime auth when no app-owned key exists', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'custom-ui-account-id',
        vendorId: 'custom' as ProviderAccount['vendorId'],
      }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['custom-runtime']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { 'custom-runtime': { baseUrl: 'https://llm.example.com/v1' } },
      defaultModel: undefined,
    });
    mocks.getOpenClawProviderKeyForType.mockReturnValue('custom-runtime');
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue('sk-openclaw-runtime-key');

    const result = await service.listAccountsKeyInfo();

    expect(mocks.getProviderApiKeyFromOpenClaw).toHaveBeenCalledWith('custom-runtime');
    expect(mocks.getApiKey).toHaveBeenCalledWith('custom-ui-account-id');
    expect(result).toEqual([
      {
        accountId: 'custom-ui-account-id',
        hasKey: true,
        keyMasked: 'sk-o***************-key',
      },
    ]);
  });

  it('prefers the protected app-owned key over imported OpenClaw runtime auth', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      makeAccount({
        id: 'openrouter-ui-account-id',
        vendorId: 'openrouter' as ProviderAccount['vendorId'],
      }),
    ]);
    mocks.getActiveOpenClawProviders.mockResolvedValue(new Set(['openrouter']));
    mocks.getOpenClawProvidersConfig.mockResolvedValue({
      providers: { openrouter: { baseUrl: 'https://openrouter.ai/api/v1' } },
      defaultModel: undefined,
    });
    mocks.getOpenClawProviderKeyForType.mockReturnValue('openrouter');
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue('sk-stale-imported-key');
    mocks.getApiKey.mockImplementation(async (id: string) => (
      id === 'openrouter-ui-account-id' ? 'sk-local-provider-key' : null
    ));

    const result = await service.listAccountsKeyInfo();

    expect(mocks.getProviderApiKeyFromOpenClaw).not.toHaveBeenCalled();
    expect(mocks.getApiKey).toHaveBeenCalledWith('openrouter-ui-account-id');
    expect(result[0]).toMatchObject({
      accountId: 'openrouter-ui-account-id',
      hasKey: true,
    });
  });
});
