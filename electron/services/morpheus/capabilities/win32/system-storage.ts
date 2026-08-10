/** Aggregate storage facts for the approved Morpheus files root. */
import { statfsSync } from 'node:fs';

import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';

import type {
  MorpheusCapability,
  MorpheusCapabilityContext,
  MorpheusResolution,
} from '../../capability-registry';

export const win32SystemStorageCapability: MorpheusCapability<'system.storage'> = {
  actionId: 'system.storage',
  platform: 'win32',

  async resolve(
    _params: MorpheusParamsFor<'system.storage'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const root = context.roots.resolve('morpheusFiles');
    return {
      target: { kind: 'folder', path: root, workspaceRoot: root },
      execute: async (): Promise<MorpheusActionResult> => {
        const stats = statfsSync(root);
        const blockSize = Number(stats.bsize);
        const totalBytes = blockSize * Number(stats.blocks);
        const freeBytes = Math.min(totalBytes, blockSize * Number(stats.bavail));
        return {
          kind: 'storage',
          root: 'morpheusFiles',
          totalBytes,
          freeBytes,
          usedBytes: Math.max(0, totalBytes - freeBytes),
        };
      },
    };
  },
};
