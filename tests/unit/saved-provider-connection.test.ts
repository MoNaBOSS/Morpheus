import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAccount } from '@electron/shared/providers/types';

const fetchProbe = vi.hoisted(() => vi.fn());
vi.mock('@electron/utils/proxy-fetch', () => ({ proxyAwareFetch: fetchProbe }));
import { createSavedProviderConnectionTest } from '@electron/services/providers/saved-provider-connection';
import { validateProviderAccess } from '@electron/services/providers/provider-validation';

const key = 'synthetic-private-credential';
const account: ProviderAccount = {
  id: 'saved-account', vendorId: 'custom', label: 'Saved account', authMode: 'api_key',
  baseUrl: 'https://synthetic.example/v1', apiProtocol: 'openai-completions', model: 'saved-model',
  enabled: true, isDefault: true, createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z',
};

function owner(saved: ProviderAccount | null = account) {
  return {
    getAccount: vi.fn().mockResolvedValue(saved),
    getAccountRuntimeApiKey: vi.fn().mockResolvedValue(key),
  };
}

beforeEach(() => {
  fetchProbe.mockReset();
  fetchProbe.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
});

describe('saved provider connection authority', () => {
  it('resolves the saved key and endpoint in Main and returns only a sanitized access result', async () => {
    const saved = owner();
    const result = await createSavedProviderConnectionTest(saved)({ accountId: account.id });
    expect(result).toEqual({ success: true, code: 'connected' });
    expect(saved.getAccountRuntimeApiKey).toHaveBeenCalledWith(account.id);
    expect(fetchProbe).toHaveBeenCalledExactlyOnceWith('https://synthetic.example/v1/models?limit=1',
      expect.objectContaining({ method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${key}` }, signal: expect.any(AbortSignal) }));
    expect(JSON.stringify(result)).not.toContain(key);
  });

  it.each([
    null, [], {}, { accountId: '' }, { accountId: 42 },
    { accountId: account.id, apiKey: key }, { accountId: account.id, baseUrl: 'https://override.example' },
    { accountId: account.id, options: { modelId: 'override' } },
  ])('rejects malformed identities and all renderer overrides before touching storage: %j', async (payload) => {
    const saved = owner();
    expect(await createSavedProviderConnectionTest(saved)(payload)).toEqual({ success: false, code: 'invalid-request' });
    expect(saved.getAccount).not.toHaveBeenCalled();
    expect(saved.getAccountRuntimeApiKey).not.toHaveBeenCalled();
    expect(fetchProbe).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'not-found'], [{ ...account, enabled: false }, 'disabled'],
    [{ ...account, authMode: 'oauth_browser' }, 'unsupported'],
    [{ ...account, authMode: 'oauth_device' }, 'unsupported'],
    [{ ...account, authMode: 'local', vendorId: 'ollama' }, 'unsupported'],
  ] as const)('does not fabricate access for absent, disabled, OAuth or local accounts', async (savedAccount, code) => {
    const saved = owner(savedAccount as ProviderAccount | null);
    expect(await createSavedProviderConnectionTest(saved)({ accountId: account.id })).toEqual({ success: false, code });
    expect(saved.getAccountRuntimeApiKey).not.toHaveBeenCalled();
    expect(fetchProbe).not.toHaveBeenCalled();
  });

  it('distinguishes missing credentials and protected-read failure without leaking the exception', async () => {
    const saved = owner(); saved.getAccountRuntimeApiKey.mockResolvedValueOnce(null);
    expect(await createSavedProviderConnectionTest(saved)({ accountId: account.id })).toEqual({ success: false, code: 'missing-key' });
    saved.getAccountRuntimeApiKey.mockRejectedValueOnce(new Error(`Cannot decrypt ${key}`));
    expect(await createSavedProviderConnectionTest(saved)({ accountId: account.id })).toEqual({ success: false, code: 'storage' });
    expect(fetchProbe).not.toHaveBeenCalled();
  });

  it.each([
    { baseUrl: 'https://changed.example/v1' }, { vendorId: 'openai' }, { headers: { 'User-Agent': 'changed' } },
  ])('refuses configuration replaced while the protected credential was loading', async (changes) => {
    const saved = owner();
    saved.getAccount.mockResolvedValueOnce(account).mockResolvedValueOnce({ ...account, ...changes });
    expect(await createSavedProviderConnectionTest(saved)({ accountId: account.id })).toEqual({ success: false, code: 'invalid-request' });
    expect(fetchProbe).not.toHaveBeenCalled();
  });
});

describe('no-inference access probe', () => {
  it.each([[401, 'authentication'], [403, 'authentication'], [429, 'rate-limited'], [404, 'unsupported'], [405, 'unsupported'], [503, 'service']] as const)(
    'classifies HTTP %s without an inference fallback or raw error', async (status, code) => {
      fetchProbe.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: `private ${key}` } }), { status }));
      expect(await validateProviderAccess('custom', key, { baseUrl: account.baseUrl })).toEqual({ success: false, code });
      expect(fetchProbe).toHaveBeenCalledTimes(1);
      expect(fetchProbe.mock.calls[0][1].method).toBe('GET');
    });

  it('recognizes auth-like 400s and sanitizes secret-bearing network failures', async () => {
    fetchProbe.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: `private ${key}` } }), { status: 400 }));
    expect(await validateProviderAccess('custom', key, { baseUrl: account.baseUrl })).toEqual({ success: false, code: 'authentication' });
    fetchProbe.mockRejectedValueOnce(new Error(`offline https://host/?key=${key}`));
    expect(await validateProviderAccess('google', key)).toEqual({ success: false, code: 'network' });
  });

  it('does not log even a partial credential or secret-bearing URL', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fetchProbe.mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }));
      expect(await validateProviderAccess('google', key)).toEqual({ success: true, code: 'connected' });
      expect(fetchProbe.mock.calls[0][0]).toContain(`key=${key}`);
      expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    } finally { log.mockRestore(); error.mockRestore(); }
  });

  it.each([
    'https://user:password@synthetic.example/v1', 'https://synthetic.example/v1?key=private',
    'https://synthetic.example/v1#private', 'file:///private', 'http://remote.example/v1', 'not a URL',
  ])('rejects unsafe or invalid saved endpoint %s without sending a credential', async (baseUrl) => {
    expect(await validateProviderAccess('custom', key, { baseUrl })).toEqual({ success: false, code: 'invalid-config' });
    expect(fetchProbe).not.toHaveBeenCalled();
  });

  it('keeps loopback compatible services usable and unsupported protocols honest', async () => {
    expect(await validateProviderAccess('custom', key, { baseUrl: 'http://127.0.0.1:1234/v1' })).toEqual({ success: true, code: 'connected' });
    expect(await validateProviderAccess('custom', key, { baseUrl: account.baseUrl, apiProtocol: 'bedrock-converse-stream' })).toEqual({ success: false, code: 'unsupported' });
    expect(fetchProbe).toHaveBeenCalledTimes(1);
  });

  it.each([
    '<html>Login to continue</html>', '{}', '{"data":{}}', '{"models":[]}',
    '{"error":{"message":"provider failure"},"data":[]}',
  ])('rejects misleading HTTP 200 access body %s', async (body) => {
    fetchProbe.mockResolvedValueOnce(new Response(body, { status: 200 }));
    expect(await validateProviderAccess('custom', key, { baseUrl: account.baseUrl })).toEqual({ success: false, code: 'service' });
    expect(fetchProbe).toHaveBeenCalledTimes(1);
  });

  it('rejects an authentication error envelope even when HTTP is 200', async () => {
    fetchProbe.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: `private ${key}` } }), { status: 200 }));
    expect(await validateProviderAccess('custom', key, { baseUrl: account.baseUrl })).toEqual({ success: false, code: 'authentication' });
  });

  it('bounds the untrusted response to 64 KiB without accepting a valid oversized model list', async () => {
    fetchProbe.mockResolvedValueOnce(new Response(JSON.stringify({ data: [], padding: 'a'.repeat(65 * 1024) }), { status: 200 }));
    expect(await validateProviderAccess('custom', key, { baseUrl: account.baseUrl })).toEqual({ success: false, code: 'service' });
  });

  it('accepts provider-specific no-prompt response shapes', async () => {
    for (const [vendor, body] of [['anthropic', { data: [] }], ['google', { models: [] }], ['openrouter', { data: { is_free_tier: true } }]] as const) {
      fetchProbe.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
      expect(await validateProviderAccess(vendor, key)).toEqual({ success: true, code: 'connected' });
    }
    expect(fetchProbe.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    expect(fetchProbe).toHaveBeenLastCalledWith('https://openrouter.ai/api/v1/key', expect.objectContaining({ method: 'GET' }));
  });

  it('honors an explicitly saved custom Google protocol without sending a chat probe', async () => {
    fetchProbe.mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    expect(await validateProviderAccess('custom', key, { baseUrl: 'https://synthetic.example/v1beta', apiProtocol: 'google-generative-ai' })).toEqual({ success: true, code: 'connected' });
    expect(fetchProbe).toHaveBeenCalledExactlyOnceWith(`https://synthetic.example/v1beta/models?pageSize=1&key=${key}`, expect.objectContaining({ method: 'GET', headers: {} }));
  });

  it('preserves saved User-Agent without allowing saved headers to replace protected authentication', async () => {
    const saved = owner({ ...account, headers: { 'user-agent': 'Morpheus-test', Authorization: 'ignored', Cookie: 'ignored' } });
    expect(await createSavedProviderConnectionTest(saved)({ accountId: account.id })).toEqual({ success: true, code: 'connected' });
    expect(fetchProbe).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      credentials: 'omit', headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'Morpheus-test' },
    }));
  });
});
