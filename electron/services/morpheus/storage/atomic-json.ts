/** Small crash-safe JSON persistence primitive for Main-owned Morpheus state. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function readValidatedJson<T>(path: string, validate: (value: unknown) => T | null): T | null {
  try {
    return validate(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

export function writeJsonAtomically(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

