import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createProtectedProviderSecretStore,
  ProviderSecretProtectionUnavailableError,
  ProviderSecretRecoveryError,
  type LegacyProviderSecretStore,
  type ProviderSecretProtection,
} from '@electron/services/secrets/protected-provider-secret-store';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

function fixture() {
  const values = new Map<string, unknown>([
    ['providerSecrets', {}],
    ['apiKeys', {}],
  ]);
  let failCleanup = false;
  const legacyStore: LegacyProviderSecretStore = {
    path: 'synthetic-clawx-providers.json',
    get: (key) => values.get(key),
    set: (key, value) => {
      if (failCleanup && (key === 'providerSecrets' || key === 'apiKeys')) throw new Error('synthetic cleanup crash');
      values.set(key, value);
    },
  };
  const key = randomBytes(32);
  let available = true;
  let backend = 'dpapi';
  let failDecrypt = false;
  const protection: ProviderSecretProtection = {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (plain) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    },
    decryptString: (encrypted) => {
      if (failDecrypt) throw new Error('synthetic decrypt crash');
      const iv = encrypted.subarray(0, 12);
      const tag = encrypted.subarray(encrypted.length - 16);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]).toString('utf8');
    },
  };
  const create = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'morpheus-secret-test-'));
    directories.push(directory);
    const path = join(directory, 'clawx-provider-secrets.v1.json');
    return { path, store: createProtectedProviderSecretStore({ path, legacyStore, protection }) };
  };
  return {
    values,
    legacyStore,
    protection,
    create,
    setAvailable: (value: boolean) => { available = value; },
    setBackend: (value: string) => { backend = value; },
    setFailDecrypt: (value: boolean) => { failDecrypt = value; },
    setFailCleanup: (value: boolean) => { failCleanup = value; },
  };
}

describe('protected provider secret migration', () => {
  it('migrates both legacy maps, verifies encrypted data and removes matching plaintext only', async () => {
    const setup = fixture();
    setup.values.set('providerSecrets', {
      first: { type: 'api_key', accountId: 'first', apiKey: 'synthetic-first-secret' },
    });
    setup.values.set('apiKeys', { first: 'synthetic-first-secret', second: 'synthetic-second-secret' });
    const { path, store } = await setup.create();

    expect((await store.listAccountIds()).sort()).toEqual(['first', 'second']);
    expect(await store.get('first')).toEqual({ type: 'api_key', accountId: 'first', apiKey: 'synthetic-first-secret' });
    expect(await store.get('second')).toEqual({ type: 'api_key', accountId: 'second', apiKey: 'synthetic-second-secret' });
    expect(setup.values.get('providerSecrets')).toEqual({});
    expect(setup.values.get('apiKeys')).toEqual({});
    expect(setup.values.get('providerSecretVaultVersion')).toBe(1);
    const onDisk = await readFile(path, 'utf8');
    expect(onDisk).toContain('"version":1');
    expect(onDisk).not.toContain('synthetic-first-secret');
    expect(onDisk).not.toContain('synthetic-second-secret');

    const restart = createProtectedProviderSecretStore({ path, protection: setup.protection, legacyStore: setup.legacyStore });
    expect(await restart.get('first')).toEqual({ type: 'api_key', accountId: 'first', apiKey: 'synthetic-first-secret' });
  });

  it('resumes a prepared migration after decryption fails without removing legacy data', async () => {
    const setup = fixture();
    setup.values.set('providerSecrets', { old: { type: 'api_key', accountId: 'old', apiKey: 'synthetic-old-secret' } });
    const { path, store } = await setup.create();
    setup.setFailDecrypt(true);
    await expect(store.get('old')).rejects.toBeInstanceOf(ProviderSecretRecoveryError);
    expect(setup.values.get('providerSecrets')).toEqual({ old: { type: 'api_key', accountId: 'old', apiKey: 'synthetic-old-secret' } });
    expect((await readFile(path, 'utf8'))).toContain('"phase":"prepared"');

    setup.setFailDecrypt(false);
    const restart = createProtectedProviderSecretStore({ path, protection: setup.protection, legacyStore: setup.legacyStore });
    expect(await restart.get('old')).toEqual({ type: 'api_key', accountId: 'old', apiKey: 'synthetic-old-secret' });
    expect(setup.values.get('providerSecrets')).toEqual({});
    expect((await readFile(path, 'utf8'))).toContain('"phase":"committed"');
  });

  it('resumes cleanup after a crash', async () => {
    const setup = fixture();
    setup.values.set('providerSecrets', { old: { type: 'api_key', accountId: 'old', apiKey: 'synthetic-old-secret' } });
    const { path, store } = await setup.create();
    setup.setFailCleanup(true);
    await expect(store.get('old')).rejects.toThrow('synthetic cleanup crash');
    expect(setup.values.get('providerSecretVaultVersion')).toBe(1);
    setup.setFailCleanup(false);
    const restart = createProtectedProviderSecretStore({ path, protection: setup.protection, legacyStore: setup.legacyStore });
    expect(await restart.get('old')).toEqual({ type: 'api_key', accountId: 'old', apiKey: 'synthetic-old-secret' });
    expect(setup.values.get('providerSecrets')).toEqual({});
  });

  it('retains conflicting legacy fields without committing either value', async () => {
    const setup = fixture();
    const old = { type: 'api_key', accountId: 'old', apiKey: 'synthetic-canonical-secret' };
    setup.values.set('providerSecrets', { old });
    setup.values.set('apiKeys', { old: 'synthetic-other-secret' });
    const { path, store } = await setup.create();
    await expect(store.get('old')).rejects.toBeInstanceOf(ProviderSecretRecoveryError);
    expect(setup.values.get('providerSecrets')).toEqual({ old });
    expect(setup.values.get('apiKeys')).toEqual({ old: 'synthetic-other-secret' });
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed when OS protection is unavailable or plaintext-backed', async () => {
    const setup = fixture();
    setup.values.set('apiKeys', { old: 'synthetic-old-secret' });
    const { path, store } = await setup.create();
    setup.setAvailable(false);
    await expect(store.get('old')).rejects.toBeInstanceOf(ProviderSecretProtectionUnavailableError);
    await expect(store.set({ type: 'api_key', accountId: 'new', apiKey: 'synthetic-new-secret' }))
      .rejects.toBeInstanceOf(ProviderSecretProtectionUnavailableError);
    await expect(store.listAccountIds()).rejects.toBeInstanceOf(ProviderSecretProtectionUnavailableError);
    expect(setup.values.get('apiKeys')).toEqual({ old: 'synthetic-old-secret' });
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
    setup.setAvailable(true);
    setup.setBackend('basic_text');
    await expect(store.get('old')).rejects.toBeInstanceOf(ProviderSecretProtectionUnavailableError);
  });

  it('treats a missing expected vault and unsupported schema as recovery failures', async () => {
    const setup = fixture();
    const { path, store } = await setup.create();
    await store.set({ type: 'api_key', accountId: 'new', apiKey: 'synthetic-new-secret' });
    await unlink(path);
    await expect(store.get('new')).rejects.toBeInstanceOf(ProviderSecretRecoveryError);
    await writeFile(path, JSON.stringify({ version: 2, records: {} }));
    await expect(store.get('new')).rejects.toBeInstanceOf(ProviderSecretRecoveryError);
  });

  it('retains malformed legacy maps and does not turn them into an empty profile', async () => {
    const setup = fixture();
    setup.values.set('providerSecrets', ['synthetic-unparsed-value']);
    const { path, store } = await setup.create();
    await expect(store.get('old')).rejects.toBeInstanceOf(ProviderSecretRecoveryError);
    expect(setup.values.get('providerSecrets')).toEqual(['synthetic-unparsed-value']);
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('uses a tombstone so interrupted deletion cannot resurrect an old plaintext key', async () => {
    const setup = fixture();
    setup.values.set('providerSecrets', { old: { type: 'api_key', accountId: 'old', apiKey: 'synthetic-old-secret' } });
    const { path, store } = await setup.create();
    await store.get('old');
    const originalGet = setup.legacyStore.get;
    let apiKeyReads = 0;
    setup.legacyStore.get = (key) => {
      if (key === 'apiKeys' && ++apiKeyReads === 2) {
        // A legacy writer races after the pre-delete read but before the tombstone.
        setup.values.set('apiKeys', { old: 'synthetic-old-secret' });
      }
      return originalGet(key);
    };
    setup.setFailCleanup(true);
    await expect(store.delete('old')).rejects.toThrow('synthetic cleanup crash');
    expect(setup.values.get('apiKeys')).toEqual({ old: 'synthetic-old-secret' });
    expect((await readFile(path, 'utf8'))).not.toContain('synthetic-old-secret');
    setup.setFailCleanup(false);
    const restart = createProtectedProviderSecretStore({ path, protection: setup.protection, legacyStore: setup.legacyStore });
    expect(await restart.get('old')).toBeNull();
    expect(setup.values.get('apiKeys')).toEqual({});
  });
});
