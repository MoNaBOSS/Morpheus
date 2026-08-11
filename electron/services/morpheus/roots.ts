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
import { MORPHEUS_DEFAULT_WORKSPACE_ID } from '@shared/morpheus/workspace-types';
import { canonicalizeExistingDir } from '../../utils/morpheus-path-guard';
import type { MorpheusWorkspaceStore } from './workspaces/workspace-store';

export interface MorpheusRootProvider {
  /** Absolute, canonical, already-created directory for `key`. */
  resolve(key: MorpheusRootKey): string;
  /** Captures one logical workspace as the immutable root for one execution. */
  forWorkspace(workspaceId?: string): MorpheusRootProvider;
}

export type MorpheusRootProviderOptions = {
  /** Base directory; in production this is `app.getPath('userData')`. */
  userDataDir: string;
  workspaces?: Pick<MorpheusWorkspaceStore, 'resolveRoot'>;
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

  ensure('morpheusFiles', options.workspaces?.resolveRoot(MORPHEUS_DEFAULT_WORKSPACE_ID)
    ?? join(options.userDataDir, 'morpheus', 'files'));

  const scoped = (workspaceId?: string): MorpheusRootProvider => {
    const selectedRoot = workspaceId && options.workspaces
      ? options.workspaces.resolveRoot(workspaceId)
      : roots.get('morpheusFiles');
    if (!selectedRoot) throw new Error('Morpheus workspace root is unavailable');
    const capturedRoot = canonicalizeExistingDir(selectedRoot);
    return {
      resolve(key) {
        if (key !== 'morpheusFiles') throw new Error(`Unknown Morpheus root: ${key}`);
        return capturedRoot;
      },
      forWorkspace(nextWorkspaceId) {
        return scoped(nextWorkspaceId);
      },
    };
  };

  return scoped();
}
