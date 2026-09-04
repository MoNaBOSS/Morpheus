import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function revision(directory: string): string | undefined {
  try {
    const data = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    return typeof data.morpheusBundleRevision === 'string' && /^[a-f0-9]{64}$/.test(data.morpheusBundleRevision)
      ? data.morpheusBundleRevision : undefined;
  } catch { return undefined; }
}

/** Called only for the existing fixed set of managed channel plugin mirrors. */
export function needsPluginBundleRefresh(sourceDirectory: string, installedDirectory: string): boolean {
  const sourceRevision = revision(sourceDirectory);
  return sourceRevision !== undefined && sourceRevision !== revision(installedDirectory);
}
