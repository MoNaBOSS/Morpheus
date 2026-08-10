/**
 * Operating-system notification.
 *
 * `low` risk on purpose: it reads nothing, discloses nothing to anyone but the
 * person sitting at the machine, and leaves no durable state. Prompting for it
 * would train users to dismiss dialogs without reading them, which is the
 * failure mode the permission model exists to avoid. Strict still asks, because
 * Strict's contract is that anything beyond a privacy-safe read confirms.
 */
import { Notification } from 'electron';

import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';

export const win32NotifyCapability: MorpheusCapability<'system.notify'> = {
  actionId: 'system.notify',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'system.notify'>,
    _context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const title = params.title;
    const body = params.body ?? '';

    return {
      target: { kind: 'none' },
      execute: async (): Promise<MorpheusActionResult> => {
        if (!Notification.isSupported()) {
          // Truthful failure rather than pretending it was shown.
          throw new MorpheusCapabilityError('unsupported-platform', 'Notifications are unavailable on this system');
        }
        // Title and body are already bounded single-line `shortText` at the
        // transport boundary, so nothing here can inject markup or newlines
        // into the shell's notification surface.
        new Notification({ title, body }).show();
        return { kind: 'notification', title, body };
      },
    };
  },
};
