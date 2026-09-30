// @vitest-environment node

import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { testHome, testUserData } = vi.hoisted(() => {
  const suffix = Math.random().toString(36).slice(2);
  return {
    testHome: `/tmp/clawx-openclaw-image-gen-${suffix}`,
    testUserData: `/tmp/clawx-openclaw-image-gen-user-data-${suffix}`,
  };
});

const ensureImagePluginInstalledMock = vi.hoisted(() => vi.fn());

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  const mocked = {
    ...actual,
    homedir: () => testHome,
  };
  return {
    ...mocked,
    default: mocked,
  };
});

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => testUserData,
    getVersion: () => '0.0.0-test',
  },
}));

vi.mock('@electron/utils/paths', async () => {
  const actual = await vi.importActual<typeof import('@electron/utils/paths')>('@electron/utils/paths');
  const resolvedDir = join(testHome, '.openclaw-test-openclaw');
  return {
    ...actual,
    getOpenClawResolvedDir: () => resolvedDir,
    getOpenClawDir: () => resolvedDir,
  };
});

vi.mock('@electron/utils/plugin-install', () => ({
  ensureClawXOpenAiImagePluginInstalled: ensureImagePluginInstalledMock,
}));

const keyStoreMocks = vi.hoisted(() => ({
  getApiKey: vi.fn().mockResolvedValue(null),
  storeApiKey: vi.fn().mockResolvedValue(true),
  deleteApiKey: vi.fn().mockResolvedValue(true),
}));

vi.mock('@electron/utils/secure-storage', () => keyStoreMocks);

async function writeOpenClawJson(config: unknown): Promise<void> {
  const openclawDir = join(testHome, '.openclaw');
  await mkdir(openclawDir, { recursive: true });
  await writeFile(join(openclawDir, 'openclaw.json'), JSON.stringify(config, null, 2), 'utf8');
}

async function readOpenClawJson(): Promise<Record<string, unknown>> {
  const content = await readFile(join(testHome, '.openclaw', 'openclaw.json'), 'utf8');
  return JSON.parse(content) as Record<string, unknown>;
}

describe('openclaw-image-generation helpers', () => {
  beforeEach(async () => {
    vi.resetModules();
    ensureImagePluginInstalledMock.mockReset();
    ensureImagePluginInstalledMock.mockResolvedValue({ installed: true });
    keyStoreMocks.getApiKey.mockReset().mockResolvedValue(null);
    keyStoreMocks.storeApiKey.mockReset().mockResolvedValue(true);
    keyStoreMocks.deleteApiKey.mockReset().mockResolvedValue(true);
    await rm(testHome, { recursive: true, force: true });
    await rm(testUserData, { recursive: true, force: true });
  });

  it('stores a new image relay key in the protected store and writes only SecretRefs', async () => {
    const { applyOpenAiImageRelaySettings } = await import('@electron/utils/openclaw-image-generation');
    await applyOpenAiImageRelaySettings({
      enabled: true,
      baseUrl: 'https://relay.example.com',
      apiKey: 'synthetic-image-key',
      model: 'gpt-image-2',
    });

    expect(keyStoreMocks.storeApiKey).toHaveBeenCalledWith('clawx-openai-image', 'synthetic-image-key');
    const config = await readOpenClawJson();
    const provider = ((config.models as Record<string, unknown>).providers as Record<string, unknown>)['clawx-openai-image'] as Record<string, unknown>;
    expect(provider.apiKey).toMatchObject({ source: 'env', provider: 'default' });
    const authPath = join(testHome, '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
    const auth = JSON.parse(await readFile(authPath, 'utf8')) as { profiles: Record<string, Record<string, unknown>> };
    expect(auth.profiles['clawx-openai-image:default'].keyRef).toEqual(provider.apiKey);
    expect(JSON.stringify(config) + JSON.stringify(auth)).not.toContain('synthetic-image-key');
  });

  it('does not claim a live relay update when the Gateway cannot receive the new env', async () => {
    const manager = {
      getStatus: vi.fn(() => ({ state: 'running' as const })),
      restartOwnedForProviderSecretChange: vi.fn().mockResolvedValue(false),
    };
    const { applyOpenAiImageRelaySettings } = await import('@electron/utils/openclaw-image-generation');
    await expect(applyOpenAiImageRelaySettings({
      enabled: true,
      baseUrl: 'https://relay.example.com',
      apiKey: 'synthetic-image-key',
    }, manager as Parameters<typeof applyOpenAiImageRelaySettings>[1]))
      .rejects.toThrow('Gateway restart with the updated environment is required');
    expect(keyStoreMocks.storeApiKey).toHaveBeenCalledOnce();
    expect(manager.restartOwnedForProviderSecretChange).toHaveBeenCalledOnce();
  });

  it('converts the verified old relay model key before replacing the protected key', async () => {
    keyStoreMocks.getApiKey.mockResolvedValue('synthetic-old-relay-key');
    await writeOpenClawJson({
      models: { providers: {
        'clawx-openai-image': {
          baseUrl: 'https://old.example.com/v1',
          apiKey: 'synthetic-old-relay-key',
          models: [{ id: 'old-model' }],
        },
      } },
    });
    const agentDir = join(testHome, '.openclaw', 'agents', 'main', 'agent');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'models.json'), JSON.stringify({
      providers: { 'clawx-openai-image': { apiKey: 'synthetic-old-relay-key' } },
    }), 'utf8');
    await writeFile(join(agentDir, 'auth-profiles.json'), JSON.stringify({
      version: 1,
      profiles: { 'clawx-openai-image:default': {
        type: 'api_key', provider: 'clawx-openai-image', key: 'synthetic-old-relay-key',
      } },
    }), 'utf8');
    let configAtProtectedWrite: Record<string, unknown> | undefined;
    let modelsAtProtectedWrite: string | undefined;
    let authAtProtectedWrite: string | undefined;
    keyStoreMocks.storeApiKey.mockImplementation(async () => {
      configAtProtectedWrite = await readOpenClawJson();
      modelsAtProtectedWrite = await readFile(join(agentDir, 'models.json'), 'utf8');
      authAtProtectedWrite = await readFile(join(agentDir, 'auth-profiles.json'), 'utf8');
      return true;
    });

    const { applyOpenAiImageRelaySettings } = await import('@electron/utils/openclaw-image-generation');
    await applyOpenAiImageRelaySettings({
      enabled: true,
      baseUrl: 'https://new.example.com',
      apiKey: 'synthetic-new-relay-key',
    });

    const atWrite = ((configAtProtectedWrite?.models as Record<string, unknown>).providers as Record<string, unknown>)['clawx-openai-image'] as Record<string, unknown>;
    expect(atWrite.baseUrl).toBe('https://old.example.com/v1');
    expect(atWrite.apiKey).toMatchObject({ source: 'env', provider: 'default' });
    expect(JSON.stringify(configAtProtectedWrite)).not.toContain('synthetic-old-relay-key');
    expect(modelsAtProtectedWrite).not.toContain('synthetic-old-relay-key');
    expect(authAtProtectedWrite).not.toContain('synthetic-old-relay-key');
    expect(keyStoreMocks.storeApiKey).toHaveBeenCalledWith('clawx-openai-image', 'synthetic-new-relay-key');
  });

  it('does not replace a relay key when the owned Gateway cannot restart with the old key', async () => {
    keyStoreMocks.getApiKey.mockResolvedValue('synthetic-old-relay-key');
    await writeOpenClawJson({
      models: { providers: { 'clawx-openai-image': { apiKey: 'synthetic-old-relay-key' } } },
    });
    const manager = {
      getStatus: vi.fn(() => ({ state: 'running' as const })),
      restartOwnedForProviderSecretChange: vi.fn().mockResolvedValue(false),
    };
    const { applyOpenAiImageRelaySettings } = await import('@electron/utils/openclaw-image-generation');
    await expect(applyOpenAiImageRelaySettings({
      enabled: true,
      baseUrl: 'https://new.example.com',
      apiKey: 'synthetic-new-relay-key',
    }, manager as Parameters<typeof applyOpenAiImageRelaySettings>[1]))
      .rejects.toThrow('Image relay key was not replaced');

    expect(manager.restartOwnedForProviderSecretChange).toHaveBeenCalledOnce();
    expect(keyStoreMocks.storeApiKey).not.toHaveBeenCalled();
    const config = await readOpenClawJson();
    const relay = ((config.models as Record<string, unknown>).providers as Record<string, unknown>)['clawx-openai-image'] as Record<string, unknown>;
    expect(relay.apiKey).toMatchObject({ source: 'env', provider: 'default' });
  });

  it('rejects a first protected relay key that conflicts with a legacy credential', async () => {
    await writeOpenClawJson({
      models: { providers: { 'clawx-openai-image': { apiKey: 'synthetic-imported-key' } } },
    });
    const { applyOpenAiImageRelaySettings } = await import('@electron/utils/openclaw-image-generation');
    await expect(applyOpenAiImageRelaySettings({
      enabled: true, baseUrl: 'https://relay.example.com', apiKey: 'synthetic-new-key',
    })).rejects.toThrow('Existing image relay credential is unverified');
    expect(keyStoreMocks.storeApiKey).not.toHaveBeenCalled();
    const config = await readOpenClawJson();
    const relay = ((config.models as Record<string, unknown>).providers as Record<string, unknown>)['clawx-openai-image'] as Record<string, unknown>;
    expect(relay.apiKey).toBe('synthetic-imported-key');
  });

  it('adopts an explicitly re-entered matching legacy relay key without retaining raw auth', async () => {
    const agentDir = join(testHome, '.openclaw', 'agents', 'main', 'agent');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'auth-profiles.json'), JSON.stringify({
      version: 1,
      profiles: { 'clawx-openai-image:default': {
        type: 'api_key', provider: 'clawx-openai-image', key: 'synthetic-reentered-key',
      } },
    }), 'utf8');
    const { applyOpenAiImageRelaySettings } = await import('@electron/utils/openclaw-image-generation');
    await applyOpenAiImageRelaySettings({
      enabled: true, baseUrl: 'https://relay.example.com', apiKey: 'synthetic-reentered-key',
    });
    expect(keyStoreMocks.storeApiKey).toHaveBeenCalledWith('clawx-openai-image', 'synthetic-reentered-key');
    const auth = await readFile(join(agentDir, 'auth-profiles.json'), 'utf8');
    expect(auth).not.toContain('synthetic-reentered-key');
    expect(JSON.parse(auth).profiles['clawx-openai-image:default'].keyRef).toMatchObject({ source: 'env' });
  });

  it('parses and validates provider/model refs', async () => {
    const {
      parseProviderFromModelRef,
      isValidImageModelRef,
    } = await import('@electron/utils/openclaw-image-generation');

    expect(parseProviderFromModelRef('openai/gpt-image-2')).toBe('openai');
    expect(parseProviderFromModelRef('invalid')).toBeNull();
    expect(isValidImageModelRef('google/gemini-3.1-flash-image-preview')).toBe(true);
    expect(isValidImageModelRef('no-slash')).toBe(false);
  });

  it('reads and writes agents.defaults.imageGenerationModel', async () => {
    await writeOpenClawJson({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4o' },
        },
      },
    });

    const {
      readImageGenerationConfig,
      setImageGenerationConfig,
    } = await import('@electron/utils/openclaw-image-generation');

    expect(await readImageGenerationConfig()).toEqual({
      primary: null,
      fallbacks: [],
      timeoutMs: null,
    });

    await setImageGenerationConfig({
      primary: 'openai/gpt-image-2',
      fallbacks: ['google/gemini-3.1-flash-image-preview'],
      timeoutMs: 120_000,
    });

    const saved = await readOpenClawJson();
    const defaults = (saved.agents as Record<string, unknown>).defaults as Record<string, unknown>;
    expect(defaults.imageGenerationModel).toEqual({
      primary: 'openai/gpt-image-2',
      fallbacks: ['google/gemini-3.1-flash-image-preview'],
      timeoutMs: 120_000,
    });
    expect(defaults.mediaGenerationAutoProviderFallback).toBe(false);

    expect(await readImageGenerationConfig()).toEqual({
      primary: 'openai/gpt-image-2',
      fallbacks: ['google/gemini-3.1-flash-image-preview'],
      timeoutMs: 120_000,
    });
  });

  it('preserves non-UI image model fields when updating image generation settings', async () => {
    await writeOpenClawJson({
      agents: {
        defaults: {
          imageGenerationModel: {
            primary: 'openai/old-image',
            timeoutMs: 30_000,
            maxPixels: 4_194_304,
          },
        },
      },
    });
    const { setImageGenerationConfig } = await import('@electron/utils/openclaw-image-generation');

    await setImageGenerationConfig({
      primary: 'openai/gpt-image-2',
      fallbacks: [],
      timeoutMs: null,
    });

    const saved = await readOpenClawJson();
    const defaults = (saved.agents as Record<string, unknown>).defaults as Record<string, unknown>;
    expect(defaults.imageGenerationModel).toEqual({
      primary: 'openai/gpt-image-2',
      maxPixels: 4_194_304,
    });
  });

  it('updates image generation settings on the running coordinator snapshot', async () => {
    await writeOpenClawJson({ localOnly: true });
    let runningConfig: Record<string, unknown> = {
      gatewayOnly: true,
      agents: { defaults: { model: { primary: 'openai/gpt-4o' } } },
    };
    const manager = {
      getStatus: vi.fn(() => ({ state: 'running' as const })),
      rpc: vi.fn(async (method: string, params: unknown) => {
        if (method === 'config.get') return { raw: JSON.stringify(runningConfig), hash: 'hash-1' };
        if (method === 'config.set') {
          runningConfig = JSON.parse((params as { raw: string }).raw) as Record<string, unknown>;
          return { ok: true };
        }
        throw new Error(`Unexpected RPC method: ${method}`);
      }),
    };
    const { registerOpenClawConfigCoordinator } = await import('@electron/gateway/config-delivery');
    registerOpenClawConfigCoordinator(manager);
    const { setImageGenerationConfig } = await import('@electron/utils/openclaw-image-generation');

    const result = await setImageGenerationConfig({
      primary: 'openai/gpt-image-2',
      fallbacks: [],
      timeoutMs: null,
    });

    expect(result).toEqual({
      primary: 'openai/gpt-image-2',
      fallbacks: [],
      timeoutMs: null,
    });
    expect(runningConfig).toMatchObject({
      gatewayOnly: true,
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4o' },
          imageGenerationModel: { primary: 'openai/gpt-image-2' },
          mediaGenerationAutoProviderFallback: false,
        },
      },
    });
    expect(await readOpenClawJson()).toEqual({ localOnly: true });
  });

  it('builds the image settings view from one authoritative config snapshot', async () => {
    const runningConfig = {
      agents: {
        defaults: { imageGenerationModel: { primary: 'openai/gpt-image-2' } },
        list: [{ id: 'main', name: 'Main', default: true }],
      },
    };
    const manager = {
      getStatus: vi.fn(() => ({ state: 'running' as const })),
      rpc: vi.fn(async (method: string) => {
        if (method === 'config.get') {
          return { raw: JSON.stringify(runningConfig), hash: 'hash-1' };
        }
        throw new Error(`Unexpected RPC method: ${method}`);
      }),
    };
    const { registerOpenClawConfigCoordinator } = await import('@electron/gateway/config-delivery');
    registerOpenClawConfigCoordinator(manager);
    const { getImageGenerationSettingsSnapshot } = await import('@electron/utils/openclaw-image-generation');

    const snapshot = await getImageGenerationSettingsSnapshot();

    expect(snapshot.config.primary).toBe('openai/gpt-image-2');
    expect(snapshot.defaultAgentId).toBe('main');
    expect(manager.rpc).toHaveBeenCalledOnce();
    expect(manager.rpc).toHaveBeenCalledWith('config.get', {});
  });

  it('does not enable the relay when its plugin cannot be installed', async () => {
    await writeOpenClawJson({ existing: true });
    ensureImagePluginInstalledMock.mockResolvedValue({
      installed: false,
      warning: 'plugin mirror missing',
    });
    const { applyOpenAiImageRelaySettings } = await import('@electron/utils/openclaw-image-generation');

    await expect(applyOpenAiImageRelaySettings({
      enabled: true,
      baseUrl: 'https://relay.example.com',
      apiKey: 'sk-test',
    })).rejects.toThrow('plugin mirror missing');

    await expect(readOpenClawJson()).resolves.toEqual({ existing: true });
  });
});
