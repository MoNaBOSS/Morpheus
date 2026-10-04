import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayManager } from '@electron/gateway/manager';
import type { ProviderConfig } from '@electron/utils/secure-storage';

const mocks = vi.hoisted(() => ({
  getProviderAccount: vi.fn(),
  listProviderAccounts: vi.fn(),
  getProviderSecret: vi.fn(),
  getAllProviders: vi.fn(),
  getApiKey: vi.fn(),
  getDefaultProvider: vi.fn(),
  getProvider: vi.fn(),
  getProviderConfig: vi.fn(),
  getProviderDefaultModel: vi.fn(),
  removeProviderFromOpenClaw: vi.fn(),
  removeProviderKeyFromOpenClaw: vi.fn(),
  removeAppOwnedProviderRuntimeKeyRefs: vi.fn(),
  saveOAuthTokenToOpenClaw: vi.fn(),
  activateOpenClawOAuthProfile: vi.fn(),
  loadActiveRuntimeProviderAccounts: vi.fn(),
  reconcileAppOwnedProviderModelKeysBeforeLaunch: vi.fn(),
  saveProviderKeyToOpenClaw: vi.fn(),
  saveProviderKeyRefToOpenClaw: vi.fn(),
  setOpenClawDefaultModel: vi.fn(),
  setOpenClawDefaultModelWithOverride: vi.fn(),
  syncProviderConfigToOpenClaw: vi.fn(),
  updateAgentModelProvider: vi.fn(),
  updateSingleAgentModelProvider: vi.fn(),
  getProviderApiKeyFromOpenClaw: vi.fn(),
  listAgentsSnapshot: vi.fn(),
}));

vi.mock('@electron/services/providers/provider-store', () => ({
  getProviderAccount: mocks.getProviderAccount,
  listProviderAccounts: mocks.listProviderAccounts,
}));

vi.mock('@electron/services/secrets/secret-store', () => ({
  getProviderSecret: mocks.getProviderSecret,
}));
vi.mock('@electron/services/providers/active-runtime-provider-selection', async (importOriginal) => ({
  ...await importOriginal<typeof import('@electron/services/providers/active-runtime-provider-selection')>(),
  loadActiveRuntimeProviderAccounts: mocks.loadActiveRuntimeProviderAccounts,
}));
vi.mock('@electron/gateway/provider-model-key-reconciliation', () => ({
  reconcileAppOwnedProviderModelKeysBeforeLaunch: mocks.reconcileAppOwnedProviderModelKeysBeforeLaunch,
}));

vi.mock('@electron/utils/secure-storage', () => ({
  getAllProviders: mocks.getAllProviders,
  getApiKey: mocks.getApiKey,
  getDefaultProvider: mocks.getDefaultProvider,
  getProvider: mocks.getProvider,
}));

vi.mock('@electron/utils/provider-registry', () => ({
  getProviderConfig: mocks.getProviderConfig,
  getProviderDefaultModel: mocks.getProviderDefaultModel,
}));

vi.mock('@electron/utils/openclaw-auth', () => ({
  ensureAnthropicMessagesModelMaxTokens: vi.fn().mockResolvedValue([]),
  ensureOpenClawProviderAgentRuntimePins: vi.fn().mockResolvedValue([]),
  migrateAllAgentAuthProfilesToSqlite: vi.fn().mockResolvedValue(undefined),
  pruneInvalidApiProviderEntries: vi.fn().mockResolvedValue([]),
  removeProviderFromOpenClaw: mocks.removeProviderFromOpenClaw,
  removeProviderKeyFromOpenClaw: mocks.removeProviderKeyFromOpenClaw,
  removeAppOwnedProviderRuntimeKeyRefs: mocks.removeAppOwnedProviderRuntimeKeyRefs,
  saveOAuthTokenToOpenClaw: mocks.saveOAuthTokenToOpenClaw,
  activateOpenClawOAuthProfile: mocks.activateOpenClawOAuthProfile,
  saveProviderKeyToOpenClaw: mocks.saveProviderKeyToOpenClaw,
  saveProviderKeyRefToOpenClaw: mocks.saveProviderKeyRefToOpenClaw,
  OPENAI_CODEX_OAUTH_PROVIDER_CONFIG: {
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    api: 'openai-chatgpt-responses',
  },
  setOpenClawDefaultModel: mocks.setOpenClawDefaultModel,
  setOpenClawDefaultModelWithOverride: mocks.setOpenClawDefaultModelWithOverride,
  syncProviderConfigToOpenClaw: mocks.syncProviderConfigToOpenClaw,
  updateAgentModelProvider: mocks.updateAgentModelProvider,
  updateSingleAgentModelProvider: mocks.updateSingleAgentModelProvider,
  getProviderApiKeyFromOpenClaw: mocks.getProviderApiKeyFromOpenClaw,
}));

vi.mock('@electron/utils/agent-config', () => ({
  listAgentsSnapshot: mocks.listAgentsSnapshot,
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  getProviderModelRef,
  getProviderFallbackModelRefs,
  reconcileProviderBeforeStaticKeyReplacement,
  reconcileProviderBeforeRuntimeKeyChange,
  syncAgentModelOverrideToRuntime,
  syncDefaultProviderToRuntime,
  syncDeletedProviderApiKeyToRuntime,
  syncDeletedProviderToRuntime,
  syncSavedProviderToRuntime,
  syncProviderApiKeyToRuntime,
  syncUpdatedProviderToRuntime,
  syncAllProviderAuthToRuntime,
  finishProviderSecretDeletionToRuntime,
} from '@electron/services/providers/provider-runtime-sync';

function createProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'moonshot',
    name: 'Moonshot',
    type: 'moonshot',
    model: 'kimi-k2.6',
    enabled: true,
    createdAt: '2026-03-14T00:00:00.000Z',
    updatedAt: '2026-03-14T00:00:00.000Z',
    ...overrides,
  };
}

function createGateway(state: 'running' | 'stopped' = 'running') {
  const gateway = {
    debouncedReload: vi.fn(),
    debouncedRestart: vi.fn(),
    restart: vi.fn(),
    restartOwnedForProviderSecretChange: vi.fn().mockResolvedValue(true),
    getStatus: vi.fn(() => ({ state } as ReturnType<GatewayManager['getStatus']>)),
    deliverProviderConfiguration: vi.fn(),
  };
  gateway.deliverProviderConfiguration.mockImplementation(async (deliver) => {
    await deliver(false);
    return state === 'stopped' || await gateway.restartOwnedForProviderSecretChange();
  });
  return gateway;
}

function expectNoGatewayLifecycleCalls(gateway: ReturnType<typeof createGateway>): void {
  expect(gateway.debouncedReload).not.toHaveBeenCalled();
  expect(gateway.debouncedRestart).not.toHaveBeenCalled();
  expect(gateway.restart).not.toHaveBeenCalled();
}

describe('provider-runtime-sync config delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderAccount.mockResolvedValue(null);
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map());
    mocks.getProviderSecret.mockResolvedValue(undefined);
    mocks.getAllProviders.mockResolvedValue([]);
    mocks.getApiKey.mockResolvedValue('sk-test');
    mocks.getDefaultProvider.mockResolvedValue('moonshot');
    mocks.getProvider.mockResolvedValue(createProvider());
    mocks.getProviderDefaultModel.mockReturnValue('kimi-k2.6');
    mocks.getProviderConfig.mockReturnValue({
      api: 'openai-completions',
      baseUrl: 'https://api.moonshot.cn/v1',
      apiKeyEnv: 'MOONSHOT_API_KEY',
    });
    mocks.syncProviderConfigToOpenClaw.mockResolvedValue(undefined);
    mocks.setOpenClawDefaultModel.mockResolvedValue(undefined);
    mocks.setOpenClawDefaultModelWithOverride.mockResolvedValue(undefined);
    mocks.saveProviderKeyToOpenClaw.mockResolvedValue(undefined);
    mocks.saveProviderKeyRefToOpenClaw.mockResolvedValue(undefined);
    mocks.removeProviderFromOpenClaw.mockResolvedValue(undefined);
    mocks.removeProviderKeyFromOpenClaw.mockResolvedValue(undefined);
    mocks.updateAgentModelProvider.mockResolvedValue(undefined);
    mocks.updateSingleAgentModelProvider.mockResolvedValue(undefined);
    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue(null);
    mocks.listProviderAccounts.mockResolvedValue([]);
    mocks.listAgentsSnapshot.mockResolvedValue({ agents: [] });
  });

  it.each([
    ['openrouter/auto', 'openrouter/auto', 'openrouter/openrouter/auto'],
    ['openrouter/free', 'openrouter/free', 'openrouter/openrouter/free'],
    ['openrouter/openrouter/auto', 'openrouter/auto', 'openrouter/openrouter/auto'],
    ['openrouter/openrouter/free', 'openrouter/free', 'openrouter/openrouter/free'],
    ['openai/gpt-test', 'openai/gpt-test', 'openrouter/openai/gpt-test'],
    ['openrouter/openai/gpt-test', 'openai/gpt-test', 'openrouter/openai/gpt-test'],
    ['openrouter-work/openai/gpt-test', 'openai/gpt-test', 'openrouter/openai/gpt-test'],
  ])('retains OpenRouter native model %s through saved config and explicit default selection', async (model, nativeModel, runtimeRef) => {
    const provider = createProvider({ id: 'openrouter-work', type: 'openrouter', model,
      baseUrl: 'https://openrouter.ai/api/v1', apiProtocol: 'openai-completions' });
    mocks.getProvider.mockResolvedValue(provider);
    mocks.getDefaultProvider.mockResolvedValue(provider.id);
    mocks.getProviderConfig.mockReturnValue({ api: 'openai-completions', baseUrl: provider.baseUrl, apiKeyEnv: 'OPENROUTER_API_KEY' });
    await syncUpdatedProviderToRuntime(provider, undefined);
    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledExactlyOnceWith('openrouter', nativeModel,
      expect.objectContaining({ api: 'openai-completions', baseUrl: provider.baseUrl }));
    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenCalledExactlyOnceWith('openrouter', runtimeRef,
      expect.objectContaining({ api: 'openai-completions', baseUrl: provider.baseUrl }), []);
    expect(provider.model).toBe(model);
    expect(getProviderModelRef(provider)).toBe(runtimeRef);
    mocks.setOpenClawDefaultModelWithOverride.mockClear();
    await syncDefaultProviderToRuntime(provider.id);
    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenCalledExactlyOnceWith('openrouter', runtimeRef,
      expect.objectContaining({ api: 'openai-completions', baseUrl: provider.baseUrl }), []);
  });

  it('preserves and deduplicates native OpenRouter fallback ids and fallback account models', async () => {
    const provider = createProvider({ id: 'openrouter-work', type: 'openrouter', model: 'openrouter/auto',
      fallbackModels: ['openrouter/free', 'openrouter/openrouter/free', 'openrouter-work/openai/gpt-test'],
      fallbackProviderIds: ['openrouter-personal'] });
    mocks.getAllProviders.mockResolvedValue([provider, createProvider({ id: 'openrouter-personal', type: 'openrouter', model: 'openrouter/auto' })]);
    expect(await getProviderFallbackModelRefs(provider)).toEqual([
      'openrouter/openrouter/free', 'openrouter/openai/gpt-test', 'openrouter/openrouter/auto',
    ]);
  });

  it('does not schedule an independent reload or restart after saving provider config', async () => {
    const gateway = createGateway('running');
    await syncSavedProviderToRuntime(createProvider(), undefined, gateway as GatewayManager);

    expectNoGatewayLifecycleCalls(gateway);
  });

  it('enters owned configuration delivery before writing a new static SecretRef config', async () => {
    const gateway = createGateway();
    await syncSavedProviderToRuntime(createProvider(), undefined, gateway as GatewayManager);
    expect(gateway.deliverProviderConfiguration.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.syncProviderConfigToOpenClaw.mock.invocationCallOrder[0]);
    expect(gateway.deliverProviderConfiguration.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.saveProviderKeyRefToOpenClaw.mock.invocationCallOrder[0]);
  });

  it('reconciles the current selected sibling after a queued inactive save before fresh launch', async () => {
    const inactive = createProvider({ id: 'first', type: 'openrouter', model: 'openai/old', baseUrl: 'https://first.example/v1' });
    const current = createProvider({ id: 'second', type: 'openrouter', model: 'openrouter/auto',
      baseUrl: 'https://second.example/v1', apiProtocol: 'openai-completions' });
    const account = { ...current, vendorId: 'openrouter', authMode: 'api_key' };
    const gateway = createGateway();
    let launchConfig: unknown;
    gateway.deliverProviderConfiguration.mockImplementation(async (deliver) => {
      // The default switched while this request waited for the previous stage.
      mocks.getDefaultProvider.mockResolvedValue(current.id);
      mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map([
        ['openrouter', { account, key: 'synthetic-current-key', verifiedKeys: new Set(['synthetic-current-key']) }],
      ]));
      const isCurrent = await deliver(true);
      expect(await isCurrent()).toBe(true);
      launchConfig = mocks.syncProviderConfigToOpenClaw.mock.calls.at(-1);
      return true;
    });
    mocks.getProvider.mockImplementation(async (id) => id === current.id ? current : inactive);
    mocks.getAllProviders.mockResolvedValue([inactive, current]);
    mocks.getProviderSecret.mockImplementation(async (id) => ({ type: 'api_key', apiKey: id === current.id ? 'synthetic-current-key' : 'synthetic-inactive-key' }));
    mocks.getApiKey.mockImplementation(async (id) => id === current.id ? 'synthetic-current-key' : 'synthetic-inactive-key');
    await syncSavedProviderToRuntime(inactive, 'synthetic-inactive-key', gateway as GatewayManager);
    expect(launchConfig).toEqual(['openrouter', 'openrouter/auto', expect.objectContaining({
      baseUrl: current.baseUrl, api: current.apiProtocol, apiKeyRef: expect.objectContaining({ source: 'env' }),
    })]);
    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenLastCalledWith('openrouter', 'openrouter/openrouter/auto',
      expect.objectContaining({ baseUrl: current.baseUrl }), []);
    expect(JSON.stringify(mocks.saveProviderKeyRefToOpenClaw.mock.calls)).not.toContain('synthetic-inactive-key');
  });

  it('rejects a selection changed during delivery rather than launching stale config', async () => {
    const gateway = createGateway();
    gateway.deliverProviderConfiguration.mockImplementation(async (deliver) => {
      const isCurrent = await deliver(true);
      if (!await isCurrent()) throw new Error('Provider selection changed during configuration delivery; retry the operation');
      await gateway.restartOwnedForProviderSecretChange();
      return true;
    });
    mocks.syncProviderConfigToOpenClaw.mockImplementationOnce(async () => {
      mocks.getDefaultProvider.mockResolvedValue('a-new-default');
    });
    await expect(syncSavedProviderToRuntime(createProvider(), undefined, gateway as GatewayManager))
      .rejects.toThrow('Provider selection changed during configuration delivery');
    expect(gateway.restartOwnedForProviderSecretChange).not.toHaveBeenCalled();
  });

  it('writes a static-key SecretRef and restarts only an owned running Gateway', async () => {
    const gateway = createGateway('running');
    const rawKey = 'synthetic-app-key';
    mocks.getApiKey.mockResolvedValue(rawKey);
    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', apiKey: rawKey });
    await syncSavedProviderToRuntime(createProvider(), rawKey, gateway as GatewayManager);

    expect(mocks.saveProviderKeyRefToOpenClaw).toHaveBeenCalledWith(
      'moonshot',
      expect.stringMatching(/^MORPHEUS_PROVIDER_KEY_[A-F0-9]{24}$/),
      [rawKey],
    );
    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'moonshot',
      'kimi-k2.6',
      expect.objectContaining({
        apiKeyRef: {
          source: 'env', provider: 'default',
          id: expect.stringMatching(/^MORPHEUS_PROVIDER_KEY_[A-F0-9]{24}$/),
        },
      }),
    );
    expect(gateway.restartOwnedForProviderSecretChange).toHaveBeenCalledOnce();
    expect(mocks.saveProviderKeyToOpenClaw).not.toHaveBeenCalled();
    expect(mocks.syncProviderConfigToOpenClaw.mock.invocationCallOrder[0])
      .toBeLessThan(gateway.restartOwnedForProviderSecretChange.mock.invocationCallOrder[0]);
    expect(JSON.stringify(mocks.syncProviderConfigToOpenClaw.mock.calls)).not.toContain(rawKey);
  });

  it('reports a running external Gateway that cannot receive the new environment', async () => {
    const gateway = createGateway('running');
    gateway.restartOwnedForProviderSecretChange.mockResolvedValue(false);
    await expect(syncProviderApiKeyToRuntime('moonshot', 'moonshot', 'synthetic-app-key', undefined, gateway as GatewayManager))
      .rejects.toThrow('Gateway restart with the updated environment is required');
  });

  it('replaces a legacy config key after a key-only Settings update', async () => {
    const gateway = createGateway('running');
    mocks.getApiKey.mockResolvedValue('synthetic-new-key');
    await syncProviderApiKeyToRuntime(
      'moonshot', 'moonshot', 'synthetic-new-key', 'synthetic-old-key', gateway as GatewayManager,
    );

    expect(mocks.saveProviderKeyRefToOpenClaw).toHaveBeenCalledWith(
      'moonshot', expect.any(String), ['synthetic-new-key', 'synthetic-old-key'],
    );
    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'moonshot', 'kimi-k2.6', expect.objectContaining({
        apiKeyRef: expect.objectContaining({ source: 'env' }),
      }),
    );
    expect(mocks.syncProviderConfigToOpenClaw.mock.invocationCallOrder[0])
      .toBeLessThan(gateway.restartOwnedForProviderSecretChange.mock.invocationCallOrder[0]);
  });

  it('reconciles the verified old key before a protected rotation', async () => {
    mocks.getApiKey.mockResolvedValue('synthetic-old-key');
    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', apiKey: 'synthetic-old-key' });
    const gateway = createGateway('running');

    await reconcileProviderBeforeStaticKeyReplacement(
      createProvider(), 'synthetic-old-key', 'synthetic-new-key', gateway as GatewayManager,
    );

    expect(mocks.saveProviderKeyRefToOpenClaw).toHaveBeenCalledWith(
      'moonshot', expect.any(String), ['synthetic-old-key', 'synthetic-old-key'],
    );
    expect(gateway.restartOwnedForProviderSecretChange).toHaveBeenCalledOnce();
    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'moonshot', 'kimi-k2.6', expect.objectContaining({ apiKeyRef: expect.objectContaining({ source: 'env' }) }),
    );
  });

  it('does not touch runtime files if the stored key changed during rotation', async () => {
    mocks.getApiKey.mockResolvedValue('different-current-key');
    await expect(reconcileProviderBeforeStaticKeyReplacement(
      createProvider(), 'synthetic-old-key', 'synthetic-new-key', createGateway() as GatewayManager,
    )).rejects.toThrow('Provider key changed during replacement');
    expect(mocks.saveProviderKeyRefToOpenClaw).not.toHaveBeenCalled();
    expect(mocks.syncProviderConfigToOpenClaw).not.toHaveBeenCalled();
  });

  it('clears an abandoned runtime secret reference before changing vendor metadata', async () => {
    await reconcileProviderBeforeRuntimeKeyChange(createProvider(), 'openrouter', 'synthetic-old-key');
    expect(mocks.removeAppOwnedProviderRuntimeKeyRefs).toHaveBeenCalledWith(
      'moonshot', expect.stringMatching(/^MORPHEUS_PROVIDER_KEY_/), 'synthetic-old-key',
    );
    expect(mocks.removeProviderKeyFromOpenClaw).toHaveBeenCalledWith('moonshot', undefined, 'synthetic-old-key');
  });

  it('keeps a shared runtime reference when a sibling account still supplies it', async () => {
    mocks.listProviderAccounts.mockResolvedValue([{ id: 'moonshot-sibling', vendorId: 'moonshot' }]);
    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', apiKey: 'synthetic-sibling-key' });
    await reconcileProviderBeforeRuntimeKeyChange(createProvider(), 'openrouter', 'synthetic-old-key');
    expect(mocks.removeAppOwnedProviderRuntimeKeyRefs).not.toHaveBeenCalled();
  });

  it('propagates per-agent model registry sync failures after saving provider config', async () => {
    mocks.listAgentsSnapshot.mockRejectedValueOnce(new Error('models.json sync unavailable'));

    await expect(syncSavedProviderToRuntime(createProvider(), undefined))
      .rejects.toThrow('models.json sync unavailable');
  });

  it('does not schedule an independent reload or restart after deleting provider config', async () => {
    const gateway = createGateway('running');
    await syncDeletedProviderToRuntime(createProvider(), 'moonshot', gateway as GatewayManager);

    expectNoGatewayLifecycleCalls(gateway);
  });

  it('removes both runtime and stored account keys when deleting a custom provider', async () => {
    const gateway = createGateway('running');
    const customProvider = createProvider({
      id: 'moonshot-cn',
      type: 'custom',
      baseUrl: 'https://api.moonshot.cn/v1',
    });

    await syncDeletedProviderToRuntime(customProvider, 'moonshot-cn', gateway as GatewayManager);

    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledWith('custom-moonshot');
    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledWith('moonshot-cn');
    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledTimes(2);
    expectNoGatewayLifecycleCalls(gateway);
  });

  it('also removes bare openai config when deleting Codex OAuth without an API key', async () => {
    const gateway = createGateway('running');
    const openaiOAuthProvider = createProvider({
      id: 'openai-oauth-1',
      type: 'openai',
      model: 'gpt-5.5',
    });

    mocks.getProviderApiKeyFromOpenClaw.mockResolvedValue(null);
    mocks.listProviderAccounts.mockResolvedValue([
      {
        id: 'openai-oauth-1',
        vendorId: 'openai',
        authMode: 'oauth_browser',
        label: 'OpenAI Codex',
        enabled: true,
        isDefault: false,
        createdAt: '2026-03-14T00:00:00.000Z',
        updatedAt: '2026-03-14T00:00:00.000Z',
      },
    ]);
    mocks.getApiKey.mockResolvedValue(null);

    await syncDeletedProviderToRuntime(
      openaiOAuthProvider,
      'openai-oauth-1',
      gateway as GatewayManager,
      'openai',
    );

    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledWith('openai');
    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledWith('openai-oauth-1');
    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledWith('openai');
    expectNoGatewayLifecycleCalls(gateway);
  });

  it('only clears the api-key profile when deleting a provider api key', async () => {
    const openaiProvider = createProvider({
      id: 'openai-personal',
      type: 'openai',
    });

    await syncDeletedProviderApiKeyToRuntime(openaiProvider, 'openai-personal');

    expect(mocks.removeProviderKeyFromOpenClaw).toHaveBeenCalledWith('openai', undefined, undefined);
    expect(mocks.removeProviderFromOpenClaw).not.toHaveBeenCalled();
  });

  it('keeps the shared runtime slot when another account survives deletion', async () => {
    mocks.listProviderAccounts.mockResolvedValue([{ id: 'surviving', vendorId: 'moonshot', enabled: true }]);
    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', accountId: 'surviving', apiKey: 'synthetic-surviving-key' });
    await syncDeletedProviderToRuntime(createProvider(), 'moonshot');
    await syncDeletedProviderApiKeyToRuntime(createProvider(), 'moonshot', undefined, 'deleted-key');
    expect(mocks.removeProviderFromOpenClaw).not.toHaveBeenCalled();
    expect(mocks.removeProviderKeyFromOpenClaw).not.toHaveBeenCalled();
    expect(mocks.reconcileAppOwnedProviderModelKeysBeforeLaunch).toHaveBeenCalledTimes(2);
  });

  it('refreshes the owned child environment after protected key deletion', async () => {
    const gateway = createGateway();
    await finishProviderSecretDeletionToRuntime(gateway as GatewayManager);
    expect(gateway.restartOwnedForProviderSecretChange).toHaveBeenCalledOnce();
  });

  it.each(['clear-key', 'delete-account'] as const)('retires owned refs before %s when a retained sibling has no usable credential', async (action) => {
    const original = createProvider({ id: 'original', type: 'openrouter', model: 'openrouter/auto' });
    const sibling = { id: 'keyless', vendorId: 'openrouter', authMode: 'api_key', enabled: true,
      model: 'openai/retained-model', baseUrl: 'https://retained.example/v1' };
    const savedSibling = structuredClone(sibling);
    const ownKey = 'synthetic-deleted-key';
    mocks.listProviderAccounts.mockResolvedValue([sibling]);
    mocks.getProviderSecret.mockResolvedValue(null);
    mocks.getApiKey.mockResolvedValue(ownKey);
    let ownedModelRef = true;
    let ownedAuthRef = true;
    mocks.removeAppOwnedProviderRuntimeKeyRefs.mockImplementation(async () => { ownedModelRef = false; });
    mocks.removeProviderKeyFromOpenClaw.mockImplementation(async () => { ownedAuthRef = false; });
    if (action === 'clear-key') await syncDeletedProviderApiKeyToRuntime(original, original.id, undefined, ownKey);
    else await syncDeletedProviderToRuntime(original, original.id);
    expect(mocks.removeAppOwnedProviderRuntimeKeyRefs).toHaveBeenCalledExactlyOnceWith('openrouter',
      expect.stringMatching(/^MORPHEUS_PROVIDER_KEY_[A-F0-9]{24}$/), ownKey);
    expect(mocks.removeProviderKeyFromOpenClaw).toHaveBeenCalledExactlyOnceWith('openrouter', undefined, ownKey);
    expect(mocks.removeProviderFromOpenClaw).not.toHaveBeenCalled();
    expect(mocks.reconcileAppOwnedProviderModelKeysBeforeLaunch).not.toHaveBeenCalled();
    const protectedDelete = vi.fn(async () => { expect(ownedModelRef || ownedAuthRef).toBe(false); });
    await protectedDelete();
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map());
    const gateway = createGateway();
    gateway.restartOwnedForProviderSecretChange.mockImplementation(async () => {
      expect(ownedModelRef || ownedAuthRef).toBe(false);
      return true;
    });
    await finishProviderSecretDeletionToRuntime(gateway as GatewayManager);
    expect(mocks.removeProviderKeyFromOpenClaw.mock.invocationCallOrder[0]).toBeLessThan(protectedDelete.mock.invocationCallOrder[0]);
    expect(protectedDelete.mock.invocationCallOrder[0]).toBeLessThan(gateway.restartOwnedForProviderSecretChange.mock.invocationCallOrder[0]);
    expect(sibling).toEqual(savedSibling);
  });

  it('delivers the selected surviving endpoint, model and agent mapping before restarting after default key removal', async () => {
    const gateway = createGateway();
    const original = createProvider({ id: 'original', type: 'openrouter', model: 'openrouter/auto',
      baseUrl: 'https://original.example/v1', apiProtocol: 'openai-completions' });
    const survivor = createProvider({ id: 'survivor', type: 'openrouter', model: 'openai/survivor-model',
      baseUrl: 'https://survivor.example/v1', apiProtocol: 'openai-completions' });
    const account = { ...survivor, vendorId: 'openrouter', authMode: 'api_key', label: 'Survivor' };
    const ownKey = 'synthetic-surviving-key';
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map([
      ['openrouter', { account, key: ownKey, verifiedKeys: new Set([ownKey]) }],
    ]));
    mocks.getProvider.mockImplementation(async (id: string) => id === 'original' ? original : id === 'survivor' ? survivor : null);
    mocks.getDefaultProvider.mockResolvedValue('original');
    mocks.getAllProviders.mockResolvedValue([survivor, original]); // inactive config must not win by iteration order
    mocks.getApiKey.mockImplementation(async (id: string) => id === 'survivor' ? ownKey : null);
    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', accountId: 'survivor', apiKey: ownKey });
    mocks.listAgentsSnapshot.mockResolvedValue({ agents: [{ id: 'agent-one', modelRef: 'openrouter/openai/agent-model' }] });
    const savedSnapshot = structuredClone([original, survivor]);
    await finishProviderSecretDeletionToRuntime(gateway as GatewayManager);
    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith('openrouter', 'openai/survivor-model',
      expect.objectContaining({ baseUrl: survivor.baseUrl, api: 'openai-completions', apiKeyRef: expect.objectContaining({ source: 'env' }) }));
    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenCalledWith('openrouter', 'openrouter/openai/survivor-model',
      expect.objectContaining({ baseUrl: survivor.baseUrl, apiKeyRef: expect.objectContaining({ source: 'env' }) }), []);
    expect(mocks.updateSingleAgentModelProvider).toHaveBeenCalledWith('agent-one', 'openrouter',
      expect.objectContaining({ baseUrl: survivor.baseUrl, models: [expect.objectContaining({ id: 'openai/agent-model' })] }));
    expect(mocks.syncProviderConfigToOpenClaw.mock.invocationCallOrder[0])
      .toBeLessThan(gateway.restartOwnedForProviderSecretChange.mock.invocationCallOrder[0]);
    expect(mocks.setOpenClawDefaultModelWithOverride.mock.invocationCallOrder[0])
      .toBeLessThan(gateway.restartOwnedForProviderSecretChange.mock.invocationCallOrder[0]);
    expect(mocks.updateSingleAgentModelProvider.mock.invocationCallOrder[0])
      .toBeLessThan(gateway.restartOwnedForProviderSecretChange.mock.invocationCallOrder[0]);
    expect(gateway.restartOwnedForProviderSecretChange).toHaveBeenCalledOnce();
    expect([original, survivor]).toEqual(savedSnapshot);
    expect(JSON.stringify(mocks.syncProviderConfigToOpenClaw.mock.calls)).not.toContain(ownKey);
    expect(JSON.stringify(mocks.setOpenClawDefaultModelWithOverride.mock.calls)).not.toContain(ownKey);
  });

  it('cleans a now-proven imported credential into a SecretRef while keeping the imported account model', async () => {
    const provider = createProvider({ id: 'imported', type: 'openrouter', model: 'openrouter/auto',
      baseUrl: 'https://original.example/v1', apiProtocol: 'openai-completions' });
    const key = 'synthetic-imported-key';
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map([
      ['openrouter', { account: { id: provider.id, vendorId: provider.type }, key, verifiedKeys: new Set([key, 'synthetic-sibling-key']) }],
    ]));
    mocks.getProvider.mockResolvedValue(provider);
    mocks.getDefaultProvider.mockResolvedValue(provider.id);
    mocks.getApiKey.mockResolvedValue(key);
    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', accountId: provider.id, apiKey: key });
    await syncAllProviderAuthToRuntime();
    await syncUpdatedProviderToRuntime(provider, undefined);
    expect(mocks.saveProviderKeyRefToOpenClaw).toHaveBeenCalledWith('openrouter', expect.stringMatching(/^MORPHEUS_PROVIDER_KEY_/),
      [key, 'synthetic-sibling-key'], undefined, { activate: true });
    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith('openrouter', 'openrouter/auto',
      expect.objectContaining({ apiKeyRef: expect.objectContaining({ source: 'env' }), baseUrl: provider.baseUrl }));
    expect(JSON.stringify(mocks.syncProviderConfigToOpenClaw.mock.calls)).not.toContain(key);
    expect(provider.model).toBe('openrouter/auto');
  });

  it.each(['key-only', 'account-update', 'saved'] as const)('restores the chosen default primary after its own key returns through %s before refreshing env', async (path) => {
    const gateway = createGateway();
    const original = createProvider({ id: 'original', type: 'openrouter', model: 'openrouter/auto',
      baseUrl: 'https://original.example/v1', apiProtocol: 'openai-completions' });
    const survivor = createProvider({ id: 'survivor', type: 'openrouter', model: 'openai/survivor-model',
      baseUrl: 'https://survivor.example/v1', apiProtocol: 'openai-completions' });
    const ownKey = 'synthetic-restored-original-key';
    mocks.getProvider.mockImplementation(async (id: string) => id === 'original' ? original : id === 'survivor' ? survivor : null);
    mocks.getDefaultProvider.mockResolvedValue('original');
    mocks.getAllProviders.mockResolvedValue([original, survivor]);
    mocks.getApiKey.mockImplementation(async (id: string) => id === 'survivor' ? 'synthetic-survivor-key' : null);
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map([
      ['openrouter', { account: { ...survivor, vendorId: survivor.type }, key: 'synthetic-survivor-key', verifiedKeys: new Set(['synthetic-survivor-key']) }],
    ]));
    await finishProviderSecretDeletionToRuntime();
    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenLastCalledWith('openrouter', 'openrouter/openai/survivor-model',
      expect.objectContaining({ baseUrl: survivor.baseUrl }), []);
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map([
      ['openrouter', { account: { ...original, vendorId: original.type }, key: ownKey, verifiedKeys: new Set([ownKey, 'synthetic-survivor-key']) }],
    ]));
    mocks.getApiKey.mockImplementation(async (id: string) => id === 'original' ? ownKey : 'synthetic-survivor-key');
    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', accountId: original.id, apiKey: ownKey });
    if (path === 'key-only') await syncProviderApiKeyToRuntime(original.type, original.id, ownKey, undefined, gateway as GatewayManager);
    else if (path === 'account-update') await syncUpdatedProviderToRuntime(original, ownKey, gateway as GatewayManager);
    else await syncSavedProviderToRuntime(original, ownKey, gateway as GatewayManager);
    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenLastCalledWith('openrouter', 'openrouter/openrouter/auto',
      expect.objectContaining({ baseUrl: original.baseUrl, apiKeyRef: expect.objectContaining({ source: 'env' }) }), []);
    expect(mocks.syncProviderConfigToOpenClaw.mock.invocationCallOrder.at(-1))
      .toBeLessThan(gateway.restartOwnedForProviderSecretChange.mock.invocationCallOrder[0]);
    expect(mocks.setOpenClawDefaultModelWithOverride.mock.invocationCallOrder.at(-1))
      .toBeLessThan(gateway.restartOwnedForProviderSecretChange.mock.invocationCallOrder[0]);
    expect(gateway.restartOwnedForProviderSecretChange).toHaveBeenCalledOnce();
  });

  it('matches the previous literal key when deleting an app-owned legacy profile', async () => {
    await syncDeletedProviderApiKeyToRuntime(createProvider(), 'moonshot', undefined, 'synthetic-old-key');
    expect(mocks.removeAppOwnedProviderRuntimeKeyRefs).toHaveBeenCalledWith(
      'moonshot', expect.stringMatching(/^MORPHEUS_PROVIDER_KEY_/), 'synthetic-old-key',
    );
    expect(mocks.removeProviderKeyFromOpenClaw).toHaveBeenCalledWith(
      'moonshot', undefined, 'synthetic-old-key',
    );
  });

  it('does not replay stale OAuth during startup provider reconciliation', async () => {
    const account = {
      id: 'openai-personal', vendorId: 'openai', label: 'OpenAI',
      authMode: 'oauth_browser', enabled: true,
      createdAt: '2026-03-14T00:00:00.000Z', updatedAt: '2026-03-14T00:00:00.000Z',
    };
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map([
      ['openai', { account, verifiedKeys: new Set(['synthetic-sibling-key']) }],
    ]));
    mocks.getProviderSecret.mockResolvedValue({
      type: 'oauth', accessToken: 'stale-access', refreshToken: 'stale-refresh', expiresAt: 1,
    });

    await syncAllProviderAuthToRuntime();

    expect(mocks.saveOAuthTokenToOpenClaw).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({ access: 'stale-access' }),
      undefined,
      { onlyIfMissing: true, activate: false },
    );
    expect(mocks.activateOpenClawOAuthProfile).toHaveBeenCalledWith('openai');
    expect(mocks.saveProviderKeyRefToOpenClaw).toHaveBeenCalledWith(
      'openai', expect.any(String), ['synthetic-sibling-key'], undefined, { activate: false },
    );
  });

  it('does not let an inactive sibling key hijack the selected runtime account', async () => {
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map([
      ['moonshot', { account: { id: 'selected-sibling' }, key: 'selected-key' }],
    ]));
    const gateway = createGateway();
    await syncSavedProviderToRuntime(createProvider(), 'inactive-key', gateway as GatewayManager);
    await syncProviderApiKeyToRuntime('moonshot', 'moonshot', 'inactive-key', undefined, gateway as GatewayManager);
    expect(mocks.saveProviderKeyRefToOpenClaw).not.toHaveBeenCalled();
    expect(mocks.syncProviderConfigToOpenClaw).not.toHaveBeenCalled();
    expect(gateway.deliverProviderConfiguration).toHaveBeenCalledTimes(2);
    // The manager compares unchanged selected env; no inactive account writes.
    expectNoGatewayLifecycleCalls(gateway);
  });

  it('reconciles old inactive sibling keys before vault rotation without activating them', async () => {
    mocks.getApiKey.mockResolvedValue('inactive-old');
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map([
      ['moonshot', { account: { id: 'selected-oauth' }, verifiedKeys: new Set(['inactive-old']) }],
    ]));
    await reconcileProviderBeforeStaticKeyReplacement(createProvider(), 'inactive-old', 'inactive-new');
    expect(mocks.saveProviderKeyRefToOpenClaw).toHaveBeenCalledWith(
      'moonshot', expect.any(String), ['inactive-old', 'inactive-old'], undefined, { activate: false },
    );
    expect(mocks.reconcileAppOwnedProviderModelKeysBeforeLaunch).toHaveBeenCalledOnce();
    expect(mocks.syncProviderConfigToOpenClaw).not.toHaveBeenCalled();
  });

  it('does not schedule an independent reload or restart after switching the default provider', async () => {
    const gateway = createGateway('running');
    await syncDefaultProviderToRuntime('moonshot', gateway as GatewayManager);

    expectNoGatewayLifecycleCalls(gateway);
  });

  it('skips refresh after switching default provider when gateway is stopped', async () => {
    const gateway = createGateway('stopped');
    await syncDefaultProviderToRuntime('moonshot', gateway as GatewayManager);

    expectNoGatewayLifecycleCalls(gateway);
  });

  it('uses gpt-5.6-luna as the browser OAuth cost-aware default model for OpenAI', async () => {
    mocks.getProvider.mockResolvedValue(
      createProvider({
        id: 'openai-personal',
        type: 'openai',
        model: undefined,
      }),
    );
    mocks.getProviderAccount.mockResolvedValue({ authMode: 'oauth_browser' });
    mocks.getProviderSecret.mockResolvedValue({
      type: 'oauth',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 123,
      email: 'user@example.com',
      subject: 'project-1',
    });

    const gateway = createGateway('running');
    await syncDefaultProviderToRuntime('openai-personal', gateway as GatewayManager);
    expect(mocks.activateOpenClawOAuthProfile).toHaveBeenCalledWith('openai');
    expect(mocks.removeAppOwnedProviderRuntimeKeyRefs).toHaveBeenCalledWith('openai', expect.any(String));
    expect(gateway.restartOwnedForProviderSecretChange).toHaveBeenCalledOnce();

    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenCalledWith(
      'openai',
      'openai/gpt-5.6-luna',
      {
        baseUrl: 'https://chatgpt.com/backend-api/codex',
        api: 'openai-chatgpt-responses',
      },
      expect.any(Array),
    );
  });

  it('normalizes a provider-prefixed model before updating OpenAI runtime config', async () => {
    const openaiProvider = createProvider({
      id: 'openai-personal',
      type: 'openai',
      model: 'openai/gpt-5.6',
    });
    mocks.getProviderAccount.mockResolvedValue({ authMode: 'oauth_browser' });
    mocks.getDefaultProvider.mockResolvedValue(openaiProvider.id);
    mocks.getProviderConfig.mockReturnValue({
      api: 'openai-responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnv: 'OPENAI_API_KEY',
    });

    await syncUpdatedProviderToRuntime(openaiProvider, undefined);

    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'openai',
      'gpt-5.6',
      expect.objectContaining({
        api: 'openai-responses',
        baseUrl: 'https://api.openai.com/v1',
      }),
    );
    expect(mocks.setOpenClawDefaultModel).toHaveBeenCalledWith(
      'openai',
      'openai/gpt-5.6',
      [],
    );
  });

  it('syncs a targeted agent model override to runtime provider registry', async () => {
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map([
      ['ark', { account: { id: 'ark', vendorId: 'ark', authMode: 'api_key' }, key: 'synthetic-ark-key' }],
    ]));
    mocks.getAllProviders.mockResolvedValue([
      createProvider({
        id: 'ark',
        type: 'ark',
        model: 'doubao-pro',
      }),
    ]);
    mocks.getProviderConfig.mockImplementation((providerType: string) => {
      if (providerType === 'ark') {
        return {
          api: 'openai-completions',
          baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          apiKeyEnv: 'ARK_API_KEY',
        };
      }
      return {
        api: 'openai-completions',
        baseUrl: 'https://api.moonshot.cn/v1',
        apiKeyEnv: 'MOONSHOT_API_KEY',
      };
    });
    mocks.listAgentsSnapshot.mockResolvedValue({
      agents: [
        {
          id: 'coder',
          modelRef: 'ark/ark-code-latest',
        },
      ],
    });

    await syncAgentModelOverrideToRuntime('coder');

    expect(mocks.updateSingleAgentModelProvider).toHaveBeenCalledWith(
      'coder',
      'ark',
      expect.objectContaining({
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        api: 'openai-completions',
        models: [{ id: 'ark-code-latest', name: 'ark-code-latest', cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
      }),
    );
  });

  it('does not map an unavailable saved sibling endpoint to an agent when no account is selected', async () => {
    mocks.getAllProviders.mockResolvedValue([
      createProvider({ id: 'keyless', type: 'openrouter', baseUrl: 'https://keyless.example/v1' }),
      createProvider({ id: 'disabled', type: 'openrouter', baseUrl: 'https://disabled.example/v1', enabled: false }),
    ]);
    mocks.loadActiveRuntimeProviderAccounts.mockResolvedValue(new Map());
    mocks.listAgentsSnapshot.mockResolvedValue({ agents: [{ id: 'coder', modelRef: 'openrouter/openai/test' }] });
    await syncAgentModelOverrideToRuntime('coder');
    expect(mocks.updateSingleAgentModelProvider).not.toHaveBeenCalled();
  });

  it('writes the explicit default endpoint and model before the owned child receives the selected key', async () => {
    const gateway = createGateway();
    const provider = createProvider({ id: 'second', type: 'openrouter', model: 'openrouter/free',
      baseUrl: 'https://second.example/v1', apiProtocol: 'openai-completions' });
    mocks.getProvider.mockResolvedValue(provider);
    await syncDefaultProviderToRuntime(provider.id, gateway as GatewayManager);
    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenCalledWith('openrouter', 'openrouter/openrouter/free',
      expect.objectContaining({ baseUrl: provider.baseUrl, apiKeyRef: expect.objectContaining({ source: 'env' }) }), []);
    expect(mocks.setOpenClawDefaultModelWithOverride.mock.invocationCallOrder[0])
      .toBeLessThan(gateway.restartOwnedForProviderSecretChange.mock.invocationCallOrder[0]);
    expect(gateway.restartOwnedForProviderSecretChange).toHaveBeenCalledOnce();
  });

  it('syncs Ollama provider config to runtime without adding model prefix', async () => {
    const ollamaProvider = createProvider({
      id: 'ollamafd',
      type: 'ollama',
      name: 'Ollama',
      model: 'qwen3:30b',
      baseUrl: 'http://localhost:11434/v1',
    });

    mocks.getProviderConfig.mockReturnValue(undefined);
    mocks.getProviderSecret.mockResolvedValue({ type: 'local', apiKey: 'ollama-local' });
    mocks.getProvider.mockResolvedValue(ollamaProvider);

    const gateway = createGateway('running');
    await syncSavedProviderToRuntime(ollamaProvider, undefined, gateway as GatewayManager);

    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'ollama-ollamafd',
      'qwen3:30b',
      expect.objectContaining({
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
      }),
    );
    expectNoGatewayLifecycleCalls(gateway);
  });

  it('syncs Ollama as default provider with correct baseUrl and api protocol', async () => {
    const ollamaProvider = createProvider({
      id: 'ollamafd',
      type: 'ollama',
      name: 'Ollama',
      model: 'qwen3:30b',
      baseUrl: 'http://localhost:11434/v1',
    });

    mocks.getProvider.mockResolvedValue(ollamaProvider);
    mocks.getDefaultProvider.mockResolvedValue('ollamafd');
    mocks.getProviderConfig.mockReturnValue(undefined);
    mocks.getApiKey.mockResolvedValue('ollama-local');

    const gateway = createGateway('running');
    await syncDefaultProviderToRuntime('ollamafd', gateway as GatewayManager);

    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenCalledWith(
      'ollama-ollamafd',
      'ollama-ollamafd/qwen3:30b',
      expect.objectContaining({
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
      }),
      expect.any(Array),
    );
  });
  it('syncs updated Ollama provider as default with correct override config', async () => {
    const ollamaProvider = createProvider({
      id: 'ollamafd',
      type: 'ollama',
      name: 'Ollama',
      model: 'qwen3:30b',
      baseUrl: 'http://localhost:11434/v1',
    });

    mocks.getProviderConfig.mockReturnValue(undefined);
    mocks.getProviderSecret.mockResolvedValue({ type: 'local', apiKey: 'ollama-local' });
    mocks.getDefaultProvider.mockResolvedValue('ollamafd');
    mocks.getProvider.mockResolvedValue(ollamaProvider);

    const gateway = createGateway('running');
    await syncUpdatedProviderToRuntime(ollamaProvider, undefined, gateway as GatewayManager);

    // Should use the custom/ollama branch with explicit override
    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenCalledWith(
      'ollama-ollamafd',
      'ollama-ollamafd/qwen3:30b',
      expect.objectContaining({
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
      }),
      expect.any(Array),
    );
    // Should NOT call the non-override path
    expect(mocks.setOpenClawDefaultModel).not.toHaveBeenCalled();
    expectNoGatewayLifecycleCalls(gateway);
  });

  it('removes Ollama provider from runtime on delete', async () => {
    const ollamaProvider = createProvider({
      id: 'ollamafd',
      type: 'ollama',
      name: 'Ollama',
      model: 'qwen3:30b',
      baseUrl: 'http://localhost:11434/v1',
    });

    const gateway = createGateway('running');
    await syncDeletedProviderToRuntime(ollamaProvider, 'ollamafd', gateway as GatewayManager);

    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledWith('ollama-ollamafd');
    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledWith('ollamafd');
    expectNoGatewayLifecycleCalls(gateway);
  });

  it('does not schedule an independent reload or restart after updating provider config', async () => {
    const gateway = createGateway('running');

    await syncUpdatedProviderToRuntime(createProvider(), undefined, gateway as GatewayManager);

    expectNoGatewayLifecycleCalls(gateway);
  });
});
