import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMorpheusScheduleStore, validateMorpheusSchedule } from '../../electron/services/morpheus/schedules/schedule-store';
import { createMorpheusScheduler, nextRunFor } from '../../electron/services/morpheus/schedules/scheduler';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'morpheus-schedule-'));
  roots.push(value);
  return value;
}

describe('Morpheus scheduling', () => {
  it('computes bounded once, interval and local-daily next runs', () => {
    const now = new Date('2026-08-10T10:00:00.000Z');
    expect(nextRunFor({ type: 'once', runAt: '2026-08-11T10:00:00.000Z' }, now))
      .toBe('2026-08-11T10:00:00.000Z');
    expect(nextRunFor({ type: 'once', runAt: '2026-08-11T10:00:00.000Z' }, now, true)).toBeUndefined();
    expect(nextRunFor({ type: 'interval', everyMinutes: 30 }, now)).toBe('2026-08-10T10:30:00.000Z');
    expect(Date.parse(nextRunFor({ type: 'daily', localTime: '23:30' }, now)!)).toBeGreaterThan(now.getTime());
  });

  it('rejects invalid persisted schedules rather than widening timing input', () => {
    expect(validateMorpheusSchedule({
      v: 1, scheduleId: 'daily', name: 'Daily', workflowId: 'system-brief', enabled: true,
      trigger: { type: 'interval', everyMinutes: 0 },
      createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', lastStatus: 'never',
    })).toBeNull();
  });

  it('runs a workflow through a schedule-specific origin and persists the real outcome', async () => {
    const store = createMorpheusScheduleStore({ userDataDir: root() });
    const prepare = vi.fn(() => ({ planId: 'plan-scheduled' }));
    const executePlan = vi.fn(async () => ({ planId: 'plan-scheduled', status: 'completed' as const, steps: [] }));
    const scheduler = createMorpheusScheduler({
      store,
      workflows: {
        get: vi.fn(() => ({ workflowId: 'system-brief', agentProfileId: 'general' })),
        prepare,
      } as never,
      runtime: { executePlan } as never,
      now: () => new Date('2026-08-10T10:00:00.000Z'),
      createId: () => 'schedule-1',
    });
    scheduler.save({
      name: 'System brief every hour', workflowId: 'system-brief', enabled: true,
      trigger: { type: 'interval', everyMinutes: 60 },
    });
    const result = await scheduler.runNow('schedule-1');
    expect(result.status).toBe('completed');
    expect(prepare).toHaveBeenCalledWith({
      workflowId: 'system-brief',
      trigger: 'schedule',
      origin: {
        type: 'schedule', scheduleId: 'schedule-1', workflowId: 'system-brief', agentProfileId: 'general',
      },
    });
    expect(executePlan).toHaveBeenCalledWith({ planId: 'plan-scheduled' });
    expect(store.get('schedule-1')?.lastStatus).toBe('completed');
  });

  it('runs an app-startup schedule at most once per application session', async () => {
    const store = createMorpheusScheduleStore({ userDataDir: root() });
    const executePlan = vi.fn(async () => ({ planId: 'p', status: 'completed' as const, steps: [] }));
    const scheduler = createMorpheusScheduler({
      store,
      workflows: {
        get: vi.fn(() => ({ workflowId: 'system-brief', agentProfileId: 'general' })),
        prepare: vi.fn(() => ({ planId: 'p' })),
      } as never,
      runtime: { executePlan } as never,
      now: () => new Date('2026-08-10T10:00:00.000Z'),
      createId: () => 'startup-1',
    });
    scheduler.save({ name: 'Startup brief', workflowId: 'system-brief', enabled: true, trigger: { type: 'app-startup' } });
    await scheduler.tick();
    await scheduler.tick();
    expect(executePlan).toHaveBeenCalledOnce();
  });
});
