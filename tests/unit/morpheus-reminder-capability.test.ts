import { describe, expect, it, vi } from 'vitest';

import { createWin32ScheduleReminderCapability } from '@electron/services/morpheus/capabilities/win32/schedule-reminder';
import type { MorpheusCapabilityContext } from '@electron/services/morpheus/capability-registry';

const context: MorpheusCapabilityContext = {
  roots: { resolve: () => 'C:\\Morpheus Files' },
  appVersion: '1.0.0',
  env: {},
  workspaceId: 'workspace-client',
};

describe('reminder.schedule capability', () => {
  it('creates a bounded reminder in the current Main-owned workspace', async () => {
    const createReminder = vi.fn(() => ({
      scheduleId: 'schedule-1', workflowId: 'reminder-1',
      triggerType: 'once' as const, nextRunAt: '2026-08-11T10:00:00.000Z',
    }));
    const capability = createWin32ScheduleReminderCapability({
      scheduler: { createReminder },
      now: () => new Date('2026-08-10T10:00:00.000Z'),
    });
    const resolution = await capability.resolve({
      title: 'Launch check', body: 'Review the launch plan.',
      runAt: '2026-08-11T10:00:00.000Z', repeatDaily: false,
    }, context);

    await expect(resolution.execute()).resolves.toEqual({
      kind: 'scheduled-reminder', scheduleId: 'schedule-1', workflowId: 'reminder-1',
      triggerType: 'once', nextRunAt: '2026-08-11T10:00:00.000Z',
    });
    expect(createReminder).toHaveBeenCalledWith({
      title: 'Launch check', body: 'Review the launch plan.',
      runAt: '2026-08-11T10:00:00.000Z', repeatDaily: false,
      workspaceId: 'workspace-client',
    });
  });

  it('rejects past and excessively distant times before creating anything', async () => {
    const createReminder = vi.fn();
    const capability = createWin32ScheduleReminderCapability({
      scheduler: { createReminder },
      now: () => new Date('2026-08-10T10:00:00.000Z'),
    });
    await expect(capability.resolve({
      title: 'Past', body: 'No', runAt: '2026-08-10T09:59:00.000Z', repeatDaily: false,
    }, context)).rejects.toMatchObject({ code: 'invalid-params' });
    await expect(capability.resolve({
      title: 'Far', body: 'No', runAt: '2028-08-10T10:00:00.000Z', repeatDaily: false,
    }, context)).rejects.toMatchObject({ code: 'invalid-params' });
    expect(createReminder).not.toHaveBeenCalled();
  });
});
