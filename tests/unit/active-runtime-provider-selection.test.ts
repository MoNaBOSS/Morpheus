// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ProviderAccount, ProviderSecret } from '@electron/shared/providers/types';
vi.mock('@electron/services/providers/provider-store', () => ({}));
vi.mock('@electron/services/secrets/secret-store', () => ({}));
vi.mock('@electron/services/providers/provider-migration', () => ({}));
import { selectActiveRuntimeProviderAccounts } from '@electron/services/providers/active-runtime-provider-selection';

function account(id: string, overrides: Partial<ProviderAccount> = {}): ProviderAccount {
  return { id, vendorId: 'openai', label: id, authMode: 'api_key', enabled: true,
    createdAt: '', updatedAt: '', ...overrides };
}
function secret(id: string, key: string): ProviderSecret {
  return { type: 'api_key', accountId: id, apiKey: key };
}

describe('active runtime provider selection', () => {
  it('prioritizes default OpenAI OAuth over static sibling keys', () => {
    const accounts = [account('a'), account('b', { authMode: 'oauth_browser' })];
    const selected = selectActiveRuntimeProviderAccounts(accounts, new Map([['a', secret('a', 'a-key')]]), 'b');
    expect(selected.get('openai')?.account.id).toBe('b');
    expect(selected.get('openai')?.key).toBeUndefined();
    expect(selected.get('openai')?.verifiedKeys).toEqual(new Set(['a-key']));
  });

  it('excludes disabled defaults but verifies their keys for cleanup', () => {
    const accounts = [account('a', { enabled: false, isDefault: true }), account('b')];
    const selected = selectActiveRuntimeProviderAccounts(accounts, new Map([
      ['a', secret('a', 'a-key')], ['b', secret('b', 'b-key')],
    ]), 'a');
    expect(selected.get('openai')?.account.id).toBe('b');
    expect(selected.get('openai')?.verifiedKeys).toEqual(new Set(['a-key', 'b-key']));
  });

  it('uses a stable tie-break for accounts and provider aliases', () => {
    const a = account('a', { vendorId: 'zai' });
    const b = account('b', { vendorId: 'zai-global' });
    const secrets = new Map([['a', secret('a', 'a-key')], ['b', secret('b', 'b-key')]]);
    expect(selectActiveRuntimeProviderAccounts([b, a], secrets).get('zai')?.key).toBe('a-key');
    expect(selectActiveRuntimeProviderAccounts([a, b], secrets).get('zai')?.key).toBe('a-key');
    expect(selectActiveRuntimeProviderAccounts([a, b], secrets, 'b').get('zai')?.key).toBe('b-key');
  });
});
