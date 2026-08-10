/** Opens a validated public URL through Electron's external browser bridge. */
import { shell } from 'electron';

import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';

export const win32OpenUrlCapability: MorpheusCapability<'web.openUrl'> = {
  actionId: 'web.openUrl',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'web.openUrl'>,
    _context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    let parsed: URL;
    try { parsed = new URL(params.url); } catch {
      throw new MorpheusCapabilityError('invalid-params', 'URL is invalid');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new MorpheusCapabilityError('invalid-params', 'Only http and https URLs are allowed');
    }
    const url = parsed.toString();
    return {
      target: { kind: 'none' },
      execute: async (): Promise<MorpheusActionResult> => {
        try {
          await shell.openExternal(url);
        } catch {
          throw new MorpheusCapabilityError('execution-failed', 'The URL could not be opened');
        }
        return { kind: 'url', url };
      },
    };
  },
};
