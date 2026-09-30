import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { closeElectronApp, expect, test } from './fixtures/electron';

test('migrates a copied synthetic legacy profile and decrypts it after same-user Windows restart', async ({
  electronApp, launchElectronApp, userDataDir,
}) => {
  test.skip(process.platform !== 'win32', 'Windows protected-store acceptance fixture');
  const result = await build({
    entryPoints: [resolve('electron/services/secrets/protected-provider-secret-store.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    write: false,
  });
  const modulePath = join(userDataDir, 'synthetic-protected-store.cjs');
  const vaultPath = join(userDataDir, 'synthetic-provider-vault.json');
  const legacyPath = join(userDataDir, 'synthetic-legacy-marker.json');
  await writeFile(modulePath, result.outputFiles[0].contents);
  const paths = { modulePath, vaultPath, legacyPath };

  const first = await electronApp.evaluate(async (_electron, input) => {
    const { safeStorage } = process.mainModule!.require('electron') as typeof import('electron');
    const fs = process.mainModule!.require('node:fs') as typeof import('node:fs');
    const module = process.mainModule!.require(input.modulePath) as typeof import('../../electron/services/secrets/protected-provider-secret-store');
    const legacyStore = {
      path: input.legacyPath,
      get(key: string): unknown {
        return fs.existsSync(input.legacyPath)
          ? (JSON.parse(fs.readFileSync(input.legacyPath, 'utf8')) as Record<string, unknown>)[key]
          : undefined;
      },
      set(key: string, value: unknown): void {
        const previous = fs.existsSync(input.legacyPath)
          ? JSON.parse(fs.readFileSync(input.legacyPath, 'utf8')) as Record<string, unknown>
          : {};
        fs.writeFileSync(input.legacyPath, JSON.stringify({ ...previous, [key]: value }));
      },
    };
    const store = module.createProtectedProviderSecretStore({
      path: input.vaultPath, protection: safeStorage, legacyStore,
    });
    // Rehearse legacy-profile upgrade with disposable synthetic data only.
    // Existing metadata is outside secret migration and must survive unchanged.
    legacyStore.set('apiKeys', { 'synthetic-e2e': 'synthetic-secret-never-real' });
    legacyStore.set('providerSecrets', { 'synthetic-e2e': {
      type: 'api_key', accountId: 'synthetic-e2e', apiKey: 'synthetic-secret-never-real',
    } });
    legacyStore.set('providerAccounts', { 'synthetic-e2e': { model: 'fixture-model', enabled: true } });
    legacyStore.set('defaultProviderAccountId', 'synthetic-e2e');
    const migrated = await store.get('synthetic-e2e');
    return {
      encrypted: safeStorage.isEncryptionAvailable(),
      backend: safeStorage.getSelectedStorageBackend?.() ?? 'not-exposed',
      migrated: migrated?.type === 'api_key',
      legacyKeys: legacyStore.get('apiKeys'),
      legacySecrets: legacyStore.get('providerSecrets'),
      accounts: legacyStore.get('providerAccounts'),
      defaultId: legacyStore.get('defaultProviderAccountId'),
    };
  }, paths);
  expect(first.encrypted).toBe(true);
  expect(first.backend).not.toBe('basic_text');
  expect(first.migrated).toBe(true);
  expect(first.legacyKeys).toEqual({});
  expect(first.legacySecrets).toEqual({});
  expect(first.accounts).toEqual({ 'synthetic-e2e': { model: 'fixture-model', enabled: true } });
  expect(first.defaultId).toBe('synthetic-e2e');
  expect(await readFile(vaultPath, 'utf8')).not.toContain('synthetic-secret-never-real');
  expect(await readFile(legacyPath, 'utf8')).not.toContain('synthetic-secret-never-real');

  await closeElectronApp(electronApp);
  const relaunched = await launchElectronApp();
  try {
    const recovered = await relaunched.evaluate(async (_electron, input) => {
      const { safeStorage } = process.mainModule!.require('electron') as typeof import('electron');
      const fs = process.mainModule!.require('node:fs') as typeof import('node:fs');
      const module = process.mainModule!.require(input.modulePath) as typeof import('../../electron/services/secrets/protected-provider-secret-store');
      const legacyStore = {
        path: input.legacyPath,
        get(key: string): unknown {
          return fs.existsSync(input.legacyPath)
            ? (JSON.parse(fs.readFileSync(input.legacyPath, 'utf8')) as Record<string, unknown>)[key]
            : undefined;
        },
        set(key: string, value: unknown): void {
          const previous = fs.existsSync(input.legacyPath)
            ? JSON.parse(fs.readFileSync(input.legacyPath, 'utf8')) as Record<string, unknown>
            : {};
          fs.writeFileSync(input.legacyPath, JSON.stringify({ ...previous, [key]: value }));
        },
      };
      const store = module.createProtectedProviderSecretStore({
        path: input.vaultPath, protection: safeStorage, legacyStore,
      });
      return await store.get('synthetic-e2e');
    }, paths);
    expect(recovered).toEqual({ type: 'api_key', accountId: 'synthetic-e2e', apiKey: 'synthetic-secret-never-real' });
  } finally {
    await closeElectronApp(relaunched);
  }
});
