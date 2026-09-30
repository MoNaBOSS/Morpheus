import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { ProviderSecret } from '../../shared/providers/types';

export interface SecretStore {
  get(accountId: string): Promise<ProviderSecret | null>;
  set(secret: ProviderSecret): Promise<void>;
  delete(accountId: string): Promise<void>;
  listAccountIds(): Promise<string[]>;
}

export interface ProviderSecretProtection {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface LegacyProviderSecretStore {
  path: string;
  get(key: 'providerSecrets' | 'apiKeys' | 'providerSecretVaultVersion'): unknown;
  set(key: 'providerSecrets' | 'apiKeys' | 'providerSecretVaultVersion', value: Record<string, unknown> | number): void;
}

type ProtectedRecord =
  | { phase: 'prepared' | 'committed'; ciphertext: string; source: 'migration' | 'replacement' }
  | { phase: 'deleted'; cleanup?: { salt: string; providerSecret?: string; apiKey?: string } };

interface ProtectedEnvelope {
  version: 1;
  records: Record<string, ProtectedRecord>;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export class ProviderSecretProtectionUnavailableError extends Error {
  constructor() {
    super('Provider secret protection is unavailable on this device. Reconnect when protected storage is available.');
    this.name = 'ProviderSecretProtectionUnavailableError';
  }
}

export class ProviderSecretRecoveryError extends Error {
  constructor() {
    super('Provider secrets could not be verified on this device. Existing records were retained for recovery.');
    this.name = 'ProviderSecretRecoveryError';
  }
}

function recordMap(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new ProviderSecretRecoveryError();
}

function own(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function validSecret(value: unknown, accountId: string): value is ProviderSecret {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const secret = value as Record<string, unknown>;
  if (secret.accountId !== accountId) return false;
  if (secret.type === 'api_key') return typeof secret.apiKey === 'string' && secret.apiKey.length > 0;
  if (secret.type === 'local') return secret.apiKey === undefined || typeof secret.apiKey === 'string';
  if (secret.type === 'oauth') {
    return typeof secret.accessToken === 'string'
      && typeof secret.refreshToken === 'string'
      && typeof secret.expiresAt === 'number'
      && Number.isFinite(secret.expiresAt)
      && (secret.scopes === undefined || (Array.isArray(secret.scopes) && secret.scopes.every((scope: unknown) => typeof scope === 'string')))
      && (secret.email === undefined || typeof secret.email === 'string')
      && (secret.subject === undefined || typeof secret.subject === 'string');
  }
  return false;
}

function legacySecret(store: LegacyProviderSecretStore, accountId: string): ProviderSecret | null {
  const raw = own(recordMap(store.get('providerSecrets')), accountId);
  const apiKey = own(recordMap(store.get('apiKeys')), accountId);
  if (raw !== undefined) {
    if (!validSecret(raw, accountId)) throw new ProviderSecretRecoveryError();
    const expectedKey = raw.type === 'api_key' || raw.type === 'local' ? raw.apiKey : undefined;
    if (apiKey !== undefined && apiKey !== expectedKey) throw new ProviderSecretRecoveryError();
    return raw;
  }
  if (apiKey === undefined) return null;
  if (typeof apiKey !== 'string' || !apiKey) throw new ProviderSecretRecoveryError();
  return { type: 'api_key', accountId, apiKey };
}

function emptyEnvelope(): ProtectedEnvelope {
  return { version: 1, records: Object.create(null) as Record<string, ProtectedRecord> };
}

function parseEnvelope(raw: string): ProtectedEnvelope {
  try {
    const parsed = JSON.parse(raw) as ProtectedEnvelope;
    if (parsed?.version !== 1 || !parsed.records || typeof parsed.records !== 'object' || Array.isArray(parsed.records)) {
      throw new Error('Invalid envelope');
    }
    const records = Object.create(null) as Record<string, ProtectedRecord>;
    for (const [id, record] of Object.entries(parsed.records)) {
      if (!record || typeof record !== 'object') throw new Error('Invalid record');
      if (record.phase === 'deleted') {
        const cleanup = record.cleanup;
        if (cleanup !== undefined && (typeof cleanup !== 'object' || cleanup === null
          || typeof cleanup.salt !== 'string' || !/^[a-f0-9]{32}$/.test(cleanup.salt)
          || (cleanup.providerSecret !== undefined && !/^[a-f0-9]{64}$/.test(cleanup.providerSecret))
          || (cleanup.apiKey !== undefined && !/^[a-f0-9]{64}$/.test(cleanup.apiKey)))) {
          throw new Error('Invalid deletion marker');
        }
        records[id] = cleanup ? { phase: 'deleted', cleanup } : { phase: 'deleted' };
      } else if ((record.phase === 'prepared' || record.phase === 'committed')
        && (record.source === 'migration' || record.source === 'replacement')
        && typeof record.ciphertext === 'string'
        && /^[A-Za-z0-9+/]+={0,2}$/.test(record.ciphertext)) {
        records[id] = record;
      } else {
        throw new Error('Invalid record');
      }
    }
    return { version: 1, records };
  } catch {
    throw new ProviderSecretRecoveryError();
  }
}

/** App-owned protected file. Only synthetic fixtures should inject alternate stores. */
export function createProtectedProviderSecretStore(options: {
  path: string;
  protection: ProviderSecretProtection;
  legacyStore: LegacyProviderSecretStore;
}): SecretStore {
  let tail: Promise<unknown> = Promise.resolve();
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.catch(() => undefined);
    return result;
  };

  function requireProtection(): void {
    if (!options.protection.isEncryptionAvailable()
      || options.protection.getSelectedStorageBackend?.() === 'basic_text') {
      throw new ProviderSecretProtectionUnavailableError();
    }
  }

  async function readEnvelope(): Promise<ProtectedEnvelope> {
    const expectedVersion = options.legacyStore.get('providerSecretVaultVersion');
    if (expectedVersion !== undefined && expectedVersion !== 1) throw new ProviderSecretRecoveryError();
    let raw: string;
    try {
      raw = await readFile(options.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (expectedVersion !== undefined) throw new ProviderSecretRecoveryError();
        return emptyEnvelope();
      }
      throw error;
    }
    if (Buffer.byteLength(raw) > MAX_FILE_BYTES) throw new ProviderSecretRecoveryError();
    return parseEnvelope(raw);
  }

  async function writeEnvelope(envelope: ProtectedEnvelope): Promise<void> {
    const contents = JSON.stringify(envelope);
    if (Buffer.byteLength(contents) > MAX_FILE_BYTES) throw new ProviderSecretRecoveryError();
    await mkdir(dirname(options.path), { recursive: true, mode: 0o700 });
    const temporary = `${options.path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(contents, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, options.path);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  function decrypt(record: Exclude<ProtectedRecord, { phase: 'deleted' }>, accountId: string): ProviderSecret {
    try {
      const plaintext = options.protection.decryptString(Buffer.from(record.ciphertext, 'base64'));
      const parsed = JSON.parse(plaintext) as { version?: unknown; secret?: unknown };
      if (parsed.version !== 1 || !validSecret(parsed.secret, accountId)) throw new Error('Invalid secret');
      return parsed.secret;
    } catch {
      throw new ProviderSecretRecoveryError();
    }
  }

  function encrypt(secret: ProviderSecret): string {
    try {
      return options.protection.encryptString(JSON.stringify({ version: 1, secret })).toString('base64');
    } catch {
      throw new ProviderSecretProtectionUnavailableError();
    }
  }

  async function verify(accountId: string, expected: ProviderSecret): Promise<void> {
    const record = (await readEnvelope()).records[accountId];
    if (!record || record.phase === 'deleted' || !isDeepStrictEqual(decrypt(record, accountId), expected)) {
      throw new ProviderSecretRecoveryError();
    }
  }

  function markVaultExpected(): void {
    if (options.legacyStore.get('providerSecretVaultVersion') !== 1) {
      options.legacyStore.set('providerSecretVaultVersion', 1);
    }
  }

  function digest(value: unknown, salt: string): string {
    return createHash('sha256').update(salt).update(JSON.stringify(value)).digest('hex');
  }

  function deletionCleanup(accountId: string): Extract<ProtectedRecord, { phase: 'deleted' }>['cleanup'] {
    const secret = own(recordMap(options.legacyStore.get('providerSecrets')), accountId);
    const key = own(recordMap(options.legacyStore.get('apiKeys')), accountId);
    if (secret === undefined && key === undefined) return undefined;
    const salt = randomUUID().replaceAll('-', '');
    return {
      salt,
      ...(secret !== undefined ? { providerSecret: digest(secret, salt) } : {}),
      ...(key !== undefined ? { apiKey: digest(key, salt) } : {}),
    };
  }

  function cleanLegacy(
    accountId: string,
    secret: ProviderSecret | null,
    cleanup?: Extract<ProtectedRecord, { phase: 'deleted' }>['cleanup'],
  ): void {
    const secrets = recordMap(options.legacyStore.get('providerSecrets'));
    const existingSecret = own(secrets, accountId);
    const keys = recordMap(options.legacyStore.get('apiKeys'));
    const existingKey = own(keys, accountId);
    const migratedKey = secret?.type === 'api_key' || secret?.type === 'local' ? secret.apiKey : undefined;
    if (existingSecret !== undefined && !(secret && isDeepStrictEqual(existingSecret, secret))
      && !(cleanup?.providerSecret && digest(existingSecret, cleanup.salt) === cleanup.providerSecret)) {
      throw new ProviderSecretRecoveryError();
    }
    if (existingKey !== undefined && !(typeof migratedKey === 'string' && existingKey === migratedKey)
      && !(cleanup?.apiKey && digest(existingKey, cleanup.salt) === cleanup.apiKey)) {
      throw new ProviderSecretRecoveryError();
    }
    if (existingSecret !== undefined) {
      const next = { ...secrets };
      delete next[accountId];
      options.legacyStore.set('providerSecrets', next);
    }
    if (existingKey !== undefined) {
      const next = { ...keys };
      delete next[accountId];
      options.legacyStore.set('apiKeys', next);
    }
  }

  async function load(accountId: string): Promise<ProviderSecret | null> {
    requireProtection();
    const envelope = await readEnvelope();
    const record = envelope.records[accountId];
    if (record?.phase === 'deleted') {
      markVaultExpected();
      cleanLegacy(accountId, null, record.cleanup);
      return null;
    }
    if (record) {
      const secret = decrypt(record, accountId);
      if (record.phase === 'prepared') {
        envelope.records[accountId] = { ...record, phase: 'committed' };
        await writeEnvelope(envelope);
        await verify(accountId, secret);
      }
      markVaultExpected();
      cleanLegacy(accountId, secret);
      return secret;
    }

    const secret = legacySecret(options.legacyStore, accountId);
    if (!secret) return null;
    envelope.records[accountId] = { phase: 'prepared', source: 'migration', ciphertext: encrypt(secret) };
    await writeEnvelope(envelope);
    await verify(accountId, secret);
    envelope.records[accountId] = { ...envelope.records[accountId], phase: 'committed' } as ProtectedRecord;
    await writeEnvelope(envelope);
    await verify(accountId, secret);
    markVaultExpected();
    cleanLegacy(accountId, secret);
    return secret;
  }

  return {
    get: (accountId) => serialized(() => load(accountId)),
    set: (secret) => serialized(async () => {
      requireProtection();
      if (!validSecret(secret, secret.accountId)) throw new ProviderSecretRecoveryError();
      await load(secret.accountId);
      const envelope = await readEnvelope();
      envelope.records[secret.accountId] = { phase: 'prepared', source: 'replacement', ciphertext: encrypt(secret) };
      await writeEnvelope(envelope);
      await verify(secret.accountId, secret);
      envelope.records[secret.accountId] = { ...envelope.records[secret.accountId], phase: 'committed' } as ProtectedRecord;
      await writeEnvelope(envelope);
      await verify(secret.accountId, secret);
      markVaultExpected();
      cleanLegacy(secret.accountId, secret);
    }),
    delete: (accountId) => serialized(async () => {
      requireProtection();
      await load(accountId);
      const envelope = await readEnvelope();
      envelope.records[accountId] = { phase: 'deleted', cleanup: deletionCleanup(accountId) };
      await writeEnvelope(envelope);
      if ((await readEnvelope()).records[accountId]?.phase !== 'deleted') throw new ProviderSecretRecoveryError();
      markVaultExpected();
      const record = envelope.records[accountId];
      cleanLegacy(accountId, null, record.phase === 'deleted' ? record.cleanup : undefined);
    }),
    listAccountIds: () => serialized(async () => {
      requireProtection();
      const envelope = await readEnvelope();
      const ids = new Set([
        ...Object.keys(envelope.records),
        ...Object.keys(recordMap(options.legacyStore.get('providerSecrets'))),
        ...Object.keys(recordMap(options.legacyStore.get('apiKeys'))),
      ]);
      const active: string[] = [];
      for (const id of ids) if (await load(id)) active.push(id);
      return active;
    }),
  };
}
