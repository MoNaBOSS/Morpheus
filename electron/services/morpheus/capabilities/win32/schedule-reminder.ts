import { MORPHEUS_DEFAULT_WORKSPACE_ID } from '@shared/morpheus/workspace-types';
import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';
import type { MorpheusScheduler } from '../../schedules/scheduler';

const MAX_ADVANCE_MS = 366 * 24 * 60 * 60 * 1_000;

/**
 * Creates a reversible Morpheus schedule containing one bounded notification.
 * It never accepts a command, executable, URL, environment or filesystem path.
 */
export function createWin32ScheduleReminderCapability(options: {
  scheduler: Pick<MorpheusScheduler, 'createReminder'>;
  now?: () => Date;
}): MorpheusCapability<'reminder.schedule'> {
  const now = options.now ?? (() => new Date());
  return {
    actionId: 'reminder.schedule',
    platform: 'win32',

    async resolve(
      params: MorpheusParamsFor<'reminder.schedule'>,
      context: MorpheusCapabilityContext,
    ): Promise<MorpheusResolution> {
      const title = params.title.trim();
      const body = params.body.trim();
      const runAt = new Date(params.runAt);
      const delay = runAt.getTime() - now().getTime();
      if (!title || !body) {
        throw new MorpheusCapabilityError('invalid-params', 'Reminder title and message are required');
      }
      if (!Number.isFinite(runAt.getTime()) || delay <= 0 || delay > MAX_ADVANCE_MS) {
        throw new MorpheusCapabilityError('invalid-params', 'Reminder time must be within the next 366 days');
      }

      return {
        target: { kind: 'none' },
        execute: async (): Promise<MorpheusActionResult> => ({
          kind: 'scheduled-reminder',
          ...options.scheduler.createReminder({
            title,
            body,
            runAt: runAt.toISOString(),
            repeatDaily: params.repeatDaily ?? false,
            workspaceId: context.workspaceId ?? MORPHEUS_DEFAULT_WORKSPACE_ID,
          }),
        }),
      };
    },
  };
}
