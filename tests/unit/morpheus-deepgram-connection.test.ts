import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMorpheusDeepgramConnectionService,
  MORPHEUS_DEEPGRAM_SECRET_ID,
  validateDeepgramConnectionInput,
  type MorpheusDeepgramCredentials,
} from '@electron/services/morpheus/voice/deepgram-connection';
import {
  createProtectedProviderSecretStore,
  type LegacyProviderSecretStore,
  type ProviderSecretProtection,
} from '@electron/services/secrets/protected-provider-secret-store';
import type { SecretStore } from '@electron/services/secrets/secret-store';

const KEY = 'synthetic-deepgram-key-1234567890';
const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'morpheus-deepgram-test-'));
  directories.push(dataDir);
  const values = new Map<string, unknown>([['providerSecrets', {}], ['apiKeys', {}], ['defaultProviderAccountId', 'existing-task']]);
  const legacyStore: LegacyProviderSecretStore = {
    path: join(dataDir, 'providers.json'), get: (name) => values.get(name), set: (name, value) => { values.set(name, value); },
  };
  const cipherKey = randomBytes(32);
  const protection: ProviderSecretProtection = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'dpapi',
    encryptString: (text) => {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', cipherKey, iv);
      return Buffer.concat([iv, cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    },
    decryptString: (bytes) => {
      const decipher = createDecipheriv('aes-256-gcm', cipherKey, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8');
    },
  };
  const secretPath = join(dataDir, 'protected-secrets.json');
  const secretStore = createProtectedProviderSecretStore({ path: secretPath, legacyStore, protection });
  const probe = vi.fn(async (_credentials: MorpheusDeepgramCredentials, _signal: AbortSignal): Promise<void> => undefined);
  const onChanged = vi.fn();
  const create = () => createMorpheusDeepgramConnectionService({ dataDir, secretStore, probe, onChanged });
  return { dataDir, values, secretStore, secretPath, probe, onChanged, create };
}

describe('protected optional Deepgram voice connection', () => {
  it('starts unconfigured without contacting a provider or changing task accounts', async () => {
    const setup = await fixture(), service = setup.create();
    await expect(service.snapshot()).resolves.toEqual({ configured: false, recognitionModel: 'nova-3', speechModel: 'flux-kit-en', storage: 'protected' });
    await expect(service.test()).resolves.toEqual({ ok: false, recognition: false, speech: false, reason: 'not-configured' });
    expect(setup.probe).not.toHaveBeenCalled();
    expect(setup.onChanged).not.toHaveBeenCalled();
    expect(setup.values.get('defaultProviderAccountId')).toBe('existing-task');
  });

  it('stores only an encrypted reserved credential and safe preferences, persisting without exposing it', async () => {
    const setup = await fixture(), service = setup.create();
    await service.save({ apiKey: KEY, recognitionModel: 'flux-general-en' });
    const envelope = await readFile(setup.secretPath, 'utf8');
    const preferences = await readFile(join(setup.dataDir, 'deepgram-voice.v1.json'), 'utf8');
    expect(envelope).not.toContain(KEY);
    expect(preferences).not.toContain('apiKey');
    expect(preferences).not.toContain(KEY);
    expect(setup.values.get('providerSecrets')).toEqual({});
    expect(setup.values.get('apiKeys')).toEqual({});
    expect(setup.values.get('defaultProviderAccountId')).toBe('existing-task');
    expect(await setup.secretStore.get(MORPHEUS_DEEPGRAM_SECRET_ID)).toEqual({ type: 'api_key', accountId: MORPHEUS_DEEPGRAM_SECRET_ID, apiKey: KEY });
    const restored = setup.create();
    expect(await restored.snapshot()).toEqual({ configured: true, recognitionModel: 'flux-general-en', speechModel: 'flux-kit-en', storage: 'protected' });
    expect(JSON.stringify(await restored.snapshot())).not.toContain(KEY);
    expect(setup.probe).not.toHaveBeenCalled();
  });

  it('changes the recognition model without requiring or rewriting the protected key', async () => {
    const setup = await fixture(), service = setup.create();
    await service.save({ apiKey: KEY });
    const previousEnvelope = await readFile(setup.secretPath, 'utf8');
    await service.save({ recognitionModel: 'flux-general-en' });
    expect(await readFile(setup.secretPath, 'utf8')).toBe(previousEnvelope);
    await expect(service.credentials()).resolves.toEqual({ apiKey: KEY, recognitionModel: 'flux-general-en', speechModel: 'flux-kit-en' });
    expect(setup.onChanged).toHaveBeenCalledTimes(2);
  });

  it('rejects an unconfigured model-only change and bounds all write-only input', async () => {
    const setup = await fixture(), service = setup.create();
    await expect(service.save({ recognitionModel: 'flux-general-en' })).rejects.toMatchObject({ kind: 'not-configured' });
    for (const value of [null, [], {}, { apiKey: '' }, { apiKey: 'x'.repeat(257) }, { apiKey: `bad\n${KEY}` },
      { apiKey: KEY, endpoint: 'https://example.com' }, { recognitionModel: 'invented' }]) {
      expect(() => validateDeepgramConnectionInput(value)).toThrow();
    }
    expect(() => validateDeepgramConnectionInput({ apiKey: `\n${KEY}\n` })).not.toThrow();
  });

  it('passes credential only to the Main-owned probe and returns no raw provider response', async () => {
    const setup = await fixture(), service = setup.create();
    await service.save({ apiKey: KEY });
    await expect(service.test()).resolves.toEqual({ ok: true, recognition: true, speech: true });
    expect(setup.probe).toHaveBeenCalledWith({ apiKey: KEY, recognitionModel: 'nova-3', speechModel: 'flux-kit-en' }, expect.any(AbortSignal));
    setup.probe.mockRejectedValueOnce(Object.assign(new Error(`raw provider response ${KEY}`), { kind: 'authentication' }));
    const result = await service.test();
    expect(result).toEqual({ ok: false, recognition: false, speech: false, reason: 'authentication' });
    expect(JSON.stringify(result)).not.toContain(KEY);
    setup.probe.mockRejectedValueOnce(Object.assign(new Error(`raw endpoint response ${KEY}`), { kind: 'endpoint' }));
    await expect(service.test()).resolves.toMatchObject({ ok: false, reason: 'endpoint' });
  });

  it('aborts a stale connection test before removing its credential and ignores late success', async () => {
    const setup = await fixture(), service = setup.create();
    await service.save({ apiKey: KEY });
    let finish!: () => void;
    setup.probe.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const testing = service.test();
    await vi.waitFor(() => expect(setup.probe).toHaveBeenCalledOnce());
    await expect(service.remove()).resolves.toMatchObject({ configured: false });
    await expect(testing).resolves.toEqual({ ok: false, recognition: false, speech: false, reason: 'cancelled' });
    finish();
    await expect(setup.secretStore.get(MORPHEUS_DEEPGRAM_SECRET_ID)).resolves.toBeNull();
    expect(setup.values.get('defaultProviderAccountId')).toBe('existing-task');
  });

  it('fails closed without persisting plaintext when protected storage is unavailable', async () => {
    const setup = await fixture();
    const denied = { ...setup.secretStore,
      get: vi.fn(async () => { throw new Error(`storage failure ${KEY}`); }),
      set: vi.fn(async () => { throw new Error(`storage failure ${KEY}`); }),
    } as SecretStore;
    const service = createMorpheusDeepgramConnectionService({ dataDir: setup.dataDir, secretStore: denied, probe: setup.probe });
    await expect(service.snapshot()).resolves.toMatchObject({ configured: false, reason: 'storage' });
    await expect(service.save({ apiKey: KEY })).rejects.toMatchObject({ kind: 'storage' });
    await expect(service.test()).resolves.toMatchObject({ ok: false, reason: 'storage' });
    expect(setup.probe).not.toHaveBeenCalled();
    await expect(readFile(join(setup.dataDir, 'deepgram-voice.v1.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('invalidates active voice authority before a replacement key reaches storage', async () => {
    const setup = await fixture();
    const order: string[] = [];
    const store = { ...setup.secretStore, set: async (...args: Parameters<SecretStore['set']>) => {
      order.push('store'); await setup.secretStore.set(...args);
    } };
    const service = createMorpheusDeepgramConnectionService({ dataDir: setup.dataDir, secretStore: store,
      probe: setup.probe, onChanged: () => { order.push('invalidate'); } });
    await service.save({ apiKey: KEY });
    expect(order).toEqual(['invalidate', 'store']);
  });

  it('rejects a credential read begun before a connection replacement', async () => {
    const setup = await fixture();
    let completeRead!: (value: Awaited<ReturnType<SecretStore['get']>>) => void;
    const store = { ...setup.secretStore, get: vi.fn().mockImplementationOnce(() =>
      new Promise<Awaited<ReturnType<SecretStore['get']>>>((resolve) => { completeRead = resolve; }))
      .mockImplementation((id) => setup.secretStore.get(id)) };
    const service = createMorpheusDeepgramConnectionService({ dataDir: setup.dataDir, secretStore: store, probe: setup.probe });
    const reading = service.credentials();
    const rejected = expect(reading).rejects.toMatchObject({ kind: 'cancelled' });
    await service.save({ apiKey: KEY, recognitionModel: 'flux-general-en' });
    completeRead({ type: 'api_key', accountId: MORPHEUS_DEEPGRAM_SECRET_ID, apiKey: 'synthetic-old-key-1234567890' });
    await rejected;
  });

  it('bounds a provider that never resolves and cancels it', async () => {
    const setup = await fixture(), service = setup.create();
    await service.save({ apiKey: KEY });
    setup.probe.mockImplementationOnce(() => new Promise<void>(() => undefined));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const testing = service.test();
    await vi.waitFor(() => expect(setup.probe).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(testing).resolves.toMatchObject({ ok: false, reason: 'unavailable' });
    expect(setup.probe.mock.calls[0][1].aborted).toBe(true);
    service.dispose();
    await expect(service.credentials()).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
