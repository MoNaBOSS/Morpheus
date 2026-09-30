import { dirname, join } from 'node:path';
import type { ProviderSecret } from '../../shared/providers/types';
import { getClawXProviderStore } from '../providers/store-instance';
import {
  createProtectedProviderSecretStore,
  type LegacyProviderSecretStore,
  type SecretStore,
} from './protected-provider-secret-store';

export type { SecretStore } from './protected-provider-secret-store';

/** Main-process adapter; Electron is imported only when a secret operation runs. */
export class ElectronStoreSecretStore implements SecretStore {
  private delegate: Promise<SecretStore> | null = null;

  private async target(): Promise<SecretStore> {
    this.delegate ??= Promise.all([getClawXProviderStore(), import('electron')]).then(([legacyStore, electron]) =>
      createProtectedProviderSecretStore({
        path: join(dirname(legacyStore.path), 'clawx-provider-secrets.v1.json'),
        legacyStore: legacyStore as LegacyProviderSecretStore,
        protection: electron.safeStorage,
      }));
    return this.delegate;
  }

  async get(accountId: string): Promise<ProviderSecret | null> { return (await this.target()).get(accountId); }
  async set(secret: ProviderSecret): Promise<void> { return (await this.target()).set(secret); }
  async delete(accountId: string): Promise<void> { return (await this.target()).delete(accountId); }
  async listAccountIds(): Promise<string[]> { return (await this.target()).listAccountIds(); }
}

const secretStore = new ElectronStoreSecretStore();

export function getSecretStore(): SecretStore { return secretStore; }
export async function getProviderSecret(accountId: string): Promise<ProviderSecret | null> { return secretStore.get(accountId); }
export async function setProviderSecret(secret: ProviderSecret): Promise<void> { await secretStore.set(secret); }
export async function deleteProviderSecret(accountId: string): Promise<void> { await secretStore.delete(accountId); }
