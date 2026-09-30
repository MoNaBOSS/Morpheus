// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  listProviderAccounts: vi.fn(),
  getDefaultProviderAccountId: vi.fn(),
  getProviderSecret: vi.fn(),
  getApiKey: vi.fn(),
  ensureProviderStoreMigrated: vi.fn(),
  saveProviderKeyRefToOpenClaw: vi.fn(),
}));

vi.mock('@electron/services/providers/provider-store', () => ({
  listProviderAccounts: mocks.listProviderAccounts,
  getDefaultProviderAccountId: mocks.getDefaultProviderAccountId,
}));
vi.mock('@electron/services/secrets/secret-store', () => ({
  getProviderSecret: mocks.getProviderSecret,
}));
vi.mock('@electron/utils/secure-storage', () => ({
  getApiKey: mocks.getApiKey,
}));
vi.mock('@electron/services/providers/provider-migration', () => ({
  ensureProviderStoreMigrated: mocks.ensureProviderStoreMigrated,
}));
vi.mock('@electron/utils/openclaw-auth', () => ({
  saveProviderKeyRefToOpenClaw: mocks.saveProviderKeyRefToOpenClaw,
}));

import { reconcileAppOwnedProviderModelKeysBeforeLaunch } from '@electron/gateway/provider-model-key-reconciliation';
import { getRuntimeProviderSecretEnvVar } from '@electron/services/providers/provider-runtime-secret-ref';

describe('pre-spawn app-owned model key reconciliation', () => {
  let root: string;
  let configPath: string;
  let modelsPath: string;
  const rawKey = 'synthetic-old-static-key';
  const provider = 'custom-12345678';

  beforeEach(async () => {
    vi.clearAllMocks();
    root = await mkdtemp(join(tmpdir(), 'morpheus-model-ref-'));
    configPath = join(root, 'openclaw.json');
    modelsPath = join(root, 'agents', 'main', 'agent', 'models.json');
    await mkdir(join(root, 'agents', 'main', 'agent'), { recursive: true });
    mocks.listProviderAccounts.mockResolvedValue([{ id: 'custom-12345678', vendorId: 'custom', authMode: 'api_key' }]);
    mocks.getDefaultProviderAccountId.mockResolvedValue(undefined);
    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', accountId: 'custom-12345678', apiKey: rawKey });
    mocks.getApiKey.mockResolvedValue(null);
    mocks.ensureProviderStoreMigrated.mockResolvedValue(undefined);
    mocks.saveProviderKeyRefToOpenClaw.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function reconcile(): Promise<void> {
    await reconcileAppOwnedProviderModelKeysBeforeLaunch({ configPath, stateDir: root });
  }

  it('converts matching legacy config and agent model keys without preserving raw bytes', async () => {
    await writeFile(configPath, JSON.stringify({ models: { providers: { [provider]: { api: 'openai-completions', apiKey: rawKey } } } }));
    await writeFile(modelsPath, JSON.stringify({ providers: { [provider]: { apiKey: rawKey, models: [{ id: 'test' }] } } }));

    await reconcile();

    const configRaw = await readFile(configPath, 'utf8');
    const modelsRaw = await readFile(modelsPath, 'utf8');
    const envVar = getRuntimeProviderSecretEnvVar(provider);
    expect(JSON.parse(configRaw).models.providers[provider].apiKey).toEqual({ source: 'env', provider: 'default', id: envVar });
    expect(JSON.parse(modelsRaw).providers[provider].apiKey).toBe(envVar);
    expect(configRaw + modelsRaw).not.toContain(rawKey);
  });

  it('is idempotent for an already-referenced provider', async () => {
    const envVar = getRuntimeProviderSecretEnvVar(provider);
    const config = JSON.stringify({ models: { providers: { [provider]: { apiKey: { source: 'env', provider: 'default', id: envVar } } } } });
    const models = JSON.stringify({ providers: { [provider]: { apiKey: envVar } } });
    await writeFile(configPath, config);
    await writeFile(modelsPath, models);

    await reconcile();

    expect(await readFile(configPath, 'utf8')).toBe(config);
    expect(await readFile(modelsPath, 'utf8')).toBe(models);
  });

  it('preserves conflicting imported values and refuses partial reconciliation', async () => {
    const config = JSON.stringify({ models: { providers: { [provider]: { apiKey: rawKey } } } });
    const models = JSON.stringify({ providers: { [provider]: { apiKey: 'different-imported-key' } } });
    await writeFile(configPath, config);
    await writeFile(modelsPath, models);

    await expect(reconcile()).rejects.toThrow('Unverified OpenClaw models credential');

    expect(await readFile(configPath, 'utf8')).toBe(config);
    expect(await readFile(modelsPath, 'utf8')).toBe(models);
  });

  it('fails closed without changing files when protected key verification is unavailable', async () => {
    const config = JSON.stringify({ models: { providers: { [provider]: { apiKey: rawKey } } } });
    await writeFile(configPath, config);
    mocks.getProviderSecret.mockRejectedValue(new Error('protected storage unavailable'));

    await expect(reconcile()).rejects.toThrow('protected storage unavailable');

    expect(await readFile(configPath, 'utf8')).toBe(config);
  });

  it('retries image-relay auth-profile cleanup before an owned Gateway spawn', async () => {
    mocks.listProviderAccounts.mockResolvedValue([]);
    mocks.getApiKey.mockResolvedValue(rawKey);
    await writeFile(configPath, JSON.stringify({ models: { providers: {
      'clawx-openai-image': { apiKey: rawKey },
    } } }));

    await reconcile();

    const envVar = getRuntimeProviderSecretEnvVar('clawx-openai-image');
    expect(mocks.saveProviderKeyRefToOpenClaw).toHaveBeenCalledWith('clawx-openai-image', envVar, [rawKey]);
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { models: { providers: Record<string, { apiKey: unknown }> } };
    expect(config.models.providers['clawx-openai-image'].apiKey).toEqual({ source: 'env', provider: 'default', id: envVar });
  });

  it('selects the default sibling and scrubs every verified sibling without changing vault keys', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      { id: 'a', vendorId: 'anthropic', authMode: 'api_key' },
      { id: 'b', vendorId: 'anthropic', authMode: 'api_key' },
    ]);
    mocks.getDefaultProviderAccountId.mockResolvedValue('b');
    mocks.getProviderSecret.mockImplementation(async (id: string) => ({ type: 'api_key', apiKey: `key-${id}` }));
    await writeFile(configPath, JSON.stringify({ models: { providers: { anthropic: { apiKey: 'key-a' } } } }));
    await writeFile(modelsPath, JSON.stringify({ providers: { anthropic: { apiKey: 'key-b' } } }));
    const selected = await reconcileAppOwnedProviderModelKeysBeforeLaunch({ configPath, stateDir: root });
    expect(selected.get('anthropic')?.key).toBe('key-b');
    expect(await readFile(configPath, 'utf8')).not.toContain('key-a');
    expect(await readFile(modelsPath, 'utf8')).not.toContain('key-b');
  });

  it('keeps selection stable across restarts after scrubbing a different sibling raw key', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      { id: 'a', vendorId: 'anthropic', authMode: 'api_key' },
      { id: 'b', vendorId: 'anthropic', authMode: 'api_key' },
    ]);
    mocks.getProviderSecret.mockImplementation(async (id: string) => ({ type: 'api_key', apiKey: `key-${id}` }));
    await writeFile(configPath, JSON.stringify({ models: { providers: { anthropic: { apiKey: 'key-b' } } } }));
    const selected = await reconcileAppOwnedProviderModelKeysBeforeLaunch({ configPath, stateDir: root });
    expect(selected.get('anthropic')?.account.id).toBe('a');
    mocks.listProviderAccounts.mockResolvedValue([
      { id: 'b', vendorId: 'anthropic', authMode: 'api_key' },
      { id: 'a', vendorId: 'anthropic', authMode: 'api_key' },
    ]);
    const restarted = await reconcileAppOwnedProviderModelKeysBeforeLaunch({ configPath, stateDir: root });
    expect(restarted.get('anthropic')?.account.id).toBe('a');
  });

  it('removes sibling static credentials when default OpenAI uses OAuth', async () => {
    mocks.listProviderAccounts.mockResolvedValue([
      { id: 'a', vendorId: 'openai', authMode: 'api_key' },
      { id: 'b', vendorId: 'openai', authMode: 'oauth_browser' },
    ]);
    mocks.getDefaultProviderAccountId.mockResolvedValue('b');
    mocks.getProviderSecret.mockImplementation(async (id: string) => id === 'a' ? { type: 'api_key', apiKey: rawKey } : { type: 'oauth' });
    await writeFile(configPath, JSON.stringify({ models: { providers: { openai: { apiKey: rawKey } } } }));
    await writeFile(modelsPath, JSON.stringify({ providers: { openai: { apiKey: getRuntimeProviderSecretEnvVar('openai') } } }));
    const selected = await reconcileAppOwnedProviderModelKeysBeforeLaunch({ configPath, stateDir: root });
    expect(selected.get('openai')?.key).toBeUndefined();
    expect(JSON.parse(await readFile(configPath, 'utf8')).models.providers.openai).not.toHaveProperty('apiKey');
    expect(JSON.parse(await readFile(modelsPath, 'utf8')).providers.openai).not.toHaveProperty('apiKey');
  });
});
