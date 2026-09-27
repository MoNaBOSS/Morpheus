import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ManagedSession } from '../../../../shared/morpheus/managed-types';

const sessionSchema = z.object({
  accountId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/),
  expiresAt: z.number().int().positive().safe(),
  accessToken: z.string().min(1).max(8192).regex(/^\S+$/),
  refreshToken: z.string().min(1).max(8192).regex(/^\S+$/).optional(),
}).strict();

export interface ManagedSessionStore {
  get(): Promise<ManagedSession | null>;
  set(session: ManagedSession): Promise<void>;
  clear(): Promise<void>;
}

/** Main-owned file, separate from BYOK accounts. Inject Electron safeStorage
 * after app.ready. Refuse unavailable/plaintext protection; never downgrade.
 */
export function createProtectedManagedSessionStore(options: {
  path: string;
  protection: {
    isEncryptionAvailable(): boolean;
    getSelectedStorageBackend?(): string;
    encryptString(value: string): Buffer;
    decryptString(value: Buffer): string;
  };
}): ManagedSessionStore {
  let tail: Promise<unknown> = Promise.resolve();
  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation);
    tail = result.catch(() => undefined);
    return result;
  }
  const requireProtection = () => {
    if (!options.protection.isEncryptionAvailable()
      || options.protection.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('Managed session protection unavailable');
    }
  };
  return {
    get: () => serialized(async () => {
      let contents: Buffer;
      try { contents = await readFile(options.path); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
      requireProtection();
      if (contents.byteLength > 64 * 1024) throw new Error('Invalid managed session');
      return sessionSchema.parse(JSON.parse(options.protection.decryptString(contents)));
    }),
    set: (session) => serialized(async () => {
      const valid = sessionSchema.parse(session);
      requireProtection();
      const contents = options.protection.encryptString(JSON.stringify(valid));
      await mkdir(dirname(options.path), { recursive: true, mode: 0o700 });
      const temporary = `${options.path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 });
        await rename(temporary, options.path);
      } finally { await unlink(temporary).catch(() => undefined); }
    }),
    clear: () => serialized(async () => {
      try { await unlink(options.path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }),
  };
}
