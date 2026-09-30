import type { ProviderAccount, ProviderSecret } from '../../shared/providers/types';
import { resolveOpenClawProviderKey } from '../../utils/provider-keys';
import { getDefaultProviderAccountId, listProviderAccounts } from './provider-store';
import { getProviderSecret } from '../secrets/secret-store';
import { ensureProviderStoreMigrated } from './provider-migration';

export interface SelectedRuntimeProviderAccount {
  account: ProviderAccount;
  key?: string;
  verifiedKeys?: ReadonlySet<string>;
}

export function providerKeyFromSecret(secret: ProviderSecret | null | undefined): string | undefined {
  if (secret?.type === 'api_key') return secret.apiKey || undefined;
  if (secret?.type === 'local') return secret.apiKey || undefined;
  return undefined;
}

function isUsableWithoutKey(account: ProviderAccount, secret: ProviderSecret | null | undefined): boolean {
  return secret?.type === 'oauth' || account.authMode === 'oauth_browser'
    || account.authMode === 'oauth_device' || account.authMode === 'local';
}

function compareAccountIds(left: SelectedRuntimeProviderAccount, right: SelectedRuntimeProviderAccount): number {
  return left.account.id < right.account.id ? -1 : left.account.id > right.account.id ? 1 : 0;
}

/** Pick the one account whose credential an owned Gateway may use for each runtime provider. */
export function selectActiveRuntimeProviderAccounts(
  accounts: readonly ProviderAccount[],
  secretsByAccountId: ReadonlyMap<string, ProviderSecret | null>,
  defaultAccountId?: string,
): Map<string, SelectedRuntimeProviderAccount> {
  const groups = new Map<string, SelectedRuntimeProviderAccount[]>();
  const verifiedKeys = new Map<string, Set<string>>();
  for (const account of accounts) {
    const secret = secretsByAccountId.get(account.id);
    const key = providerKeyFromSecret(secret);
    const provider = resolveOpenClawProviderKey(account);
    if (key) {
      const keys = verifiedKeys.get(provider) ?? new Set<string>();
      keys.add(key);
      verifiedKeys.set(provider, keys);
    }
    if (account.enabled === false) continue;
    if (!key && !isUsableWithoutKey(account, secret)) continue;
    const group = groups.get(provider) ?? [];
    group.push({ account, key });
    groups.set(provider, group);
  }

  const selected = new Map<string, SelectedRuntimeProviderAccount>();
  for (const [provider, group] of groups) {
    group.sort(compareAccountIds);
    const explicitDefault = group.find(({ account }) => account.id === defaultAccountId);
    const markedDefault = group.find(({ account }) => account.isDefault);
    // Raw-key preference cannot survive replacing that key with a common ref.
    // Use a stable account ID so subsequent restarts retain the same account.
    const active = explicitDefault ?? markedDefault
      ?? group.find(({ key }) => !!key) ?? group[0];
    selected.set(provider, { ...active, verifiedKeys: verifiedKeys.get(provider) ?? new Set() });
  }
  return selected;
}

/** Read the protected account snapshot once so reconciliation and launch agree. */
export async function loadActiveRuntimeProviderAccounts(): Promise<Map<string, SelectedRuntimeProviderAccount>> {
  await ensureProviderStoreMigrated();
  const accounts = await listProviderAccounts();
  const defaultAccountId = await getDefaultProviderAccountId();
  const secrets = new Map(await Promise.all(accounts.map(async (account) => (
    [account.id, await getProviderSecret(account.id)] as const
  ))));
  return selectActiveRuntimeProviderAccounts(accounts, secrets, defaultAccountId);
}
