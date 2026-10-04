import type { ProviderConnectionTestResult } from '@shared/host-api/contract';
import type { ProviderAccount } from '../../shared/providers/types';
import { validateProviderAccess } from './provider-validation';

type SavedProviderConnectionOwner = {
  getAccount: (accountId: string) => Promise<ProviderAccount | null>;
  getAccountRuntimeApiKey: (accountId: string) => Promise<string | null>;
};

/** This boundary accepts identity only. Secrets and endpoint overrides never cross it. */
export function createSavedProviderConnectionTest(owner: SavedProviderConnectionOwner) {
  return async (payload: unknown): Promise<ProviderConnectionTestResult> => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).length !== 1 || !Object.hasOwn(payload, 'accountId')) {
      return { success: false, code: 'invalid-request' };
    }
    const accountId = (payload as { accountId?: unknown }).accountId;
    if (typeof accountId !== 'string' || !accountId.trim() || accountId.length > 256) {
      return { success: false, code: 'invalid-request' };
    }
    try {
      const account = await owner.getAccount(accountId.trim());
      if (!account) return { success: false, code: 'not-found' };
      if (!account.enabled) return { success: false, code: 'disabled' };
      // OAuth and local engines do not share a safe, universal no-inference test.
      // Preserve their capability; do not turn the old local no-op into a success.
      if (account.authMode !== 'api_key' || account.vendorId === 'ollama') {
        return { success: false, code: 'unsupported' };
      }
      const apiKey = await owner.getAccountRuntimeApiKey(account.id);
      if (!apiKey?.trim()) return { success: false, code: 'missing-key' };
      const current = await owner.getAccount(account.id);
      if (!current || JSON.stringify([
        current.updatedAt, current.vendorId, current.baseUrl, current.apiProtocol,
        current.headers, current.authMode, current.enabled,
      ]) !== JSON.stringify([
        account.updatedAt, account.vendorId, account.baseUrl, account.apiProtocol,
        account.headers, account.authMode, account.enabled,
      ])) return { success: false, code: 'invalid-request' };
      return await validateProviderAccess(account.vendorId, apiKey, {
        baseUrl: account.baseUrl,
        apiProtocol: account.apiProtocol,
        headers: account.headers,
      });
    } catch {
      // Protected storage failures may include secret material. Never relay them.
      return { success: false, code: 'storage' };
    }
  };
}
