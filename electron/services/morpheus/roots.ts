/**
 * Approved filesystem roots for Morpheus native actions.
 *
 * Behind an interface so additional or policy-driven roots can be introduced
 * later without touching any call site.
 *
 * The default root sits under `app.getPath('userData')` because that location is
 * already write-approved by the existing file-preview sandbox in
 * `electron/main/ipc-handlers.ts`, so no new class of writable location is
 * introduced. A location under the user's Documents folder would.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { MorpheusRootKey } from '@shared/morpheus/actions/registry';
import { canonicalizeExistingDir } from '../../utils/morpheus-path-guard';

export interface MorpheusRootProvider {
  /** Absolute, canonical, already-created directory for `key`. */
  resolve(key: MorpheusRootKey): string;
}

export type MorpheusRootProviderOptions = {
  /** Base directory; in production this is `app.getPath('userData')`. */
  userDataDir: string;
};

/**
 * Canonicalizes every root once at construction and freezes the result. Doing
 * this per call would let a root be swapped between validation and use.
 */
export function createMorpheusRootProvider(options: MorpheusRootProviderOptions): MorpheusRootProvider {
  const roots = new Map<MorpheusRootKey, string>();

  const ensure = (key: MorpheusRootKey, absolutePath: string): void => {
    mkdirSync(absolutePath, { recursive: true });
    roots.set(key, canonicalizeExistingDir(absolutePath));
  };

  ensure('morpheusFiles', join(options.userDataDir, 'morpheus', 'files'));

  return {
    resolve(key: MorpheusRootKey): string {
      const root = roots.get(key);
      if (!root) throw new Error(`Unknown Morpheus root: ${key}`);
      return root;
    },
  };
}
