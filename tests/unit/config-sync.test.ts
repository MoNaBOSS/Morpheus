import { describe, expect, it, vi } from 'vitest';
import type { ProviderAccount } from '@electron/shared/providers/types';
vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getVersion: () => 'test' } }));
vi.mock('@electron/utils/secure-storage', () => ({ getApiKey: vi.fn().mockResolvedValue(null) }));
import { stripSystemdSupervisorEnv } from '@electron/gateway/config-sync-env';

describe('stripSystemdSupervisorEnv', () => {
  it('removes systemd supervisor marker env vars', () => {
    const env = {
      PATH: '/usr/bin:/bin',
      OPENCLAW_SYSTEMD_UNIT: 'openclaw-gateway.service',
      INVOCATION_ID: 'abc123',
      SYSTEMD_EXEC_PID: '777',
      JOURNAL_STREAM: '8:12345',
      OTHER: 'keep-me',
    };

    const result = stripSystemdSupervisorEnv(env);

    expect(result).toEqual({
      PATH: '/usr/bin:/bin',
      OTHER: 'keep-me',
    });
  });

  it('keeps unrelated variables unchanged', () => {
    const env = {
      NODE_ENV: 'production',
      OPENCLAW_GATEWAY_TOKEN: 'token',
      CLAWDBOT_SKIP_CHANNELS: '0',
    };

    expect(stripSystemdSupervisorEnv(env)).toEqual(env);
  });

  it('does not mutate source env object', () => {
    const env = {
      OPENCLAW_SYSTEMD_UNIT: 'openclaw-gateway.service',
      VALUE: '1',
    };
    const before = { ...env };

    const result = stripSystemdSupervisorEnv(env);

    expect(env).toEqual(before);
    expect(result).toEqual({ VALUE: '1' });
  });
});

describe('selected provider launch environment', () => {
  it('injects only the selected sibling key for both native and common env refs', async () => {
    const { loadProviderEnv } = await import('@electron/gateway/config-sync');
    const { getRuntimeProviderSecretEnvVar } = await import('@electron/services/providers/provider-runtime-secret-ref');
    const result = await loadProviderEnv(new Map([['anthropic', {
      account: { id: 'b', vendorId: 'anthropic' } as ProviderAccount,
      key: 'selected-key', verifiedKeys: new Set(['inactive-key', 'selected-key']),
    }]]));
    expect(result.providerEnv.ANTHROPIC_API_KEY).toBe('selected-key');
    expect(result.providerEnv[getRuntimeProviderSecretEnvVar('anthropic')]).toBe('selected-key');
    expect(Object.values(result.providerEnv)).not.toContain('inactive-key');
    expect(result.loadedProviderKeyCount).toBe(1);
  });

  it('clears inherited OpenAI static env values when the selected account uses OAuth', async () => {
    const { loadProviderEnv } = await import('@electron/gateway/config-sync');
    const { getRuntimeProviderSecretEnvVar } = await import('@electron/services/providers/provider-runtime-secret-ref');
    const result = await loadProviderEnv(new Map([['openai', {
      account: { id: 'oauth', vendorId: 'openai', authMode: 'oauth_browser' } as ProviderAccount,
      verifiedKeys: new Set(['inactive-key']),
    }]]));
    const env = { OPENAI_API_KEY: 'inherited-key', [getRuntimeProviderSecretEnvVar('openai')]: 'inherited-runtime-key', ...result.providerEnv };
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env[getRuntimeProviderSecretEnvVar('openai')]).toBeUndefined();
    expect(result.loadedProviderKeyCount).toBe(0);
  });
});
