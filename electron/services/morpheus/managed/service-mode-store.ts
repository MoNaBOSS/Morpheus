import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export type ManagedServiceMode = 'byok' | 'managed';
const schema = z.object({ version: z.literal(1), mode: z.enum(['byok', 'managed']) }).strict();
/** Non-secret explicit billing choice. Missing files default to BYOK; corruption
 * fails selected managed access closed instead of accidentally spending BYOK. */
export function createManagedServiceModeStore(path: string) {
  let mode: ManagedServiceMode = 'byok'; let available = true;
  try {
    const bytes = readFileSync(path); if (bytes.length > 512) throw new Error('Invalid service mode');
    mode = schema.parse(JSON.parse(bytes.toString('utf8'))).mode;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { mode = 'managed'; available = false; }
  }
  return {
    get: () => mode,
    available: () => available,
    set(next: ManagedServiceMode) {
      const valid = schema.parse({ version: 1, mode: next });
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); const temporary = `${path}.${randomUUID()}.tmp`;
      try { writeFileSync(temporary, JSON.stringify(valid), { flag: 'wx', mode: 0o600 }); renameSync(temporary, path); mode = valid.mode; available = true; }
      finally { try { unlinkSync(temporary); } catch { /* Successful rename removed it. */ } }
    },
  };
}
