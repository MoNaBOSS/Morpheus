import { join } from 'node:path';
import { createProtectedProviderSecretStore, type SecretStore } from '../secrets/protected-provider-secret-store';
import { createPublicationJournal } from './journal';
import { createPublicationService, type PublicationServiceOptions } from './service';

/** Separate protected namespace. There have never been plaintext publication
 * credentials: no legacy source, AI-provider lookup, CLI config or env fallback. */
export function createPublicationOwner(options: Pick<PublicationServiceOptions, 'workspaces' | 'audit' | 'appVersion'> & { userDataDir: string }) {
  const directory = join(options.userDataDir, 'morpheus', 'publication');
  let vault: Promise<SecretStore> | undefined;
  const target = () => vault ??= import('electron').then(({ safeStorage }) => createProtectedProviderSecretStore({
    path: join(directory, 'credentials.v1.json'), protection: safeStorage,
    legacyStore: { path: '', get: () => undefined, set: (key) => {
      if (key !== 'providerSecretVaultVersion') throw new Error('Publication has no plaintext credential store.');
    } },
  }));
  const secrets: SecretStore = {
    get: async (id) => (await target()).get(id),
    set: async (secret) => (await target()).set(secret),
    delete: async (id) => (await target()).delete(id),
    listAccountIds: async () => (await target()).listAccountIds(),
  };
  return createPublicationService({ ...options, secrets, journal: createPublicationJournal(join(directory, 'receipts.v1.json')) });
}
