import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMorpheusProactiveStore } from '@electron/services/morpheus/proactive/proactive-store';
import {
  createMorpheusProactiveService,
  isInsideMorpheusQuietHours,
} from '@electron/services/morpheus/proactive/proactive-service';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function directory(): string {
  const value = mkdtempSync(join(tmpdir(), 'morpheus-proactive-'));
  directories.push(value);
  return value;
}

describe('Morpheus proactive attention', () => {
  it('deduplicates exact facts and preserves dismiss/snooze state across refresh and restart', () => {
    const userDataDir = directory();
    let id = 0;
    let stamp = new Date('2026-08-14T08:00:00.000Z');
    const store = createMorpheusProactiveStore({
      userDataDir, now: () => stamp, createId: () => `attention-fact-${++id}`,
    });
    const fact = {
      sourceType: 'mission' as const, sourceId: 'mission-one', sourceFingerprint: 'mission:one:failed:1',
      presentationKey: 'mission-failed' as const,
      title: 'Mission needs attention', detail: 'A real failure.', severity: 'attention' as const,
    };
    const first = store.upsertFact(fact);
    store.dismiss(first.attentionId);
    expect(store.upsertFact(fact).status).toBe('dismissed');

    const reminder = store.createReminder({
      title: 'Review the launch', detail: 'Check readiness.', dueAt: '2026-08-14T09:00:00.000Z',
    });
    store.snooze(reminder.attentionId, '2026-08-14T10:00:00.000Z');
    stamp = new Date('2026-08-14T10:01:00.000Z');
    store.reopenDue(stamp);
    expect(store.get(reminder.attentionId)?.status).toBe('open');

    const restored = createMorpheusProactiveStore({ userDataDir });
    expect(restored.get(first.attentionId)?.status).toBe('dismissed');
    expect(restored.get(reminder.attentionId)?.status).toBe('open');
  });

  it('handles overnight quiet hours without suppressing factual Today state', () => {
    const settings = createMorpheusProactiveStore({ userDataDir: directory() }).settings();
    expect(isInsideMorpheusQuietHours(settings, new Date('2026-08-14T23:00:00'))).toBe(true);
    expect(isInsideMorpheusQuietHours(settings, new Date('2026-08-14T07:00:00'))).toBe(true);
    expect(isInsideMorpheusQuietHours(settings, new Date('2026-08-14T12:00:00'))).toBe(false);
  });

  it('derives real Mission attention and submits notifications through Objective Core', async () => {
    const now = () => new Date('2026-08-14T12:00:00.000Z');
    const store = createMorpheusProactiveStore({
      userDataDir: directory(), now, createId: () => 'attention-failed-mission',
    });
    store.updateSettings({ notificationsEnabled: true });
    const submitInternal = vi.fn(async () => ({ objectiveRunId: 'objective-notify', accepted: true }));
    const waitForTerminal = vi.fn(async () => ({ state: 'complete' }));
    const service = createMorpheusProactiveService({
      store,
      missions: {
        snapshot: () => ({
          activeMissionId: null, missionOrder: ['mission-failed'],
          missionsById: {
            'mission-failed': {
              missionId: 'mission-failed', status: 'failed', updatedAt: '2026-08-14T11:00:00.000Z',
              objective: 'Create the launch brief', error: { code: 'failed', message: 'File was unavailable.' },
            },
          },
        }),
        get: vi.fn(),
      } as never,
      goals: { list: () => ({ goals: [] }), get: vi.fn() } as never,
      schedules: { list: () => ({ schedules: [] }) } as never,
      objectives: { submitInternal, waitForTerminal } as never,
      audit: { recordControl: vi.fn(async () => undefined) } as never,
      appVersion: '1.0.0', now, createId: () => 'attention-failed-mission',
    });

    await service.tick();
    expect(submitInternal).toHaveBeenCalledWith(expect.objectContaining({
      origin: { type: 'proactive', attentionId: 'attention-failed-mission' },
      preparedPlan: expect.objectContaining({
        steps: [expect.objectContaining({ capabilityId: 'system.notify' })],
      }),
    }));
    expect(waitForTerminal).toHaveBeenCalledWith('objective-notify');
    expect(store.get('attention-failed-mission')?.lastNotifiedAt).toBe('2026-08-14T12:00:00.000Z');
  });

  it('audits an exact derived item before it becomes visible and keeps routine fingerprints stable', async () => {
    const events: string[] = [];
    const store = createMorpheusProactiveStore({
      userDataDir: directory(),
      createId: () => 'attention-store-fallback',
    });
    const completedMission = (missionId: string) => ({
      missionId, status: 'completed', updatedAt: '2026-08-14T11:00:00.000Z',
      objective: 'Prepare the weekly report',
    });
    const missionOrder = ['mission-4', 'mission-3', 'mission-2', 'mission-1'];
    const missionsById = Object.fromEntries(missionOrder.map((id) => [id, completedMission(id)]));
    const service = createMorpheusProactiveService({
      store,
      missions: {
        snapshot: () => ({ activeMissionId: null, missionOrder, missionsById }),
        get: (id: string) => missionsById[id],
      } as never,
      goals: { list: () => ({ goals: [] }), get: vi.fn(), markContinued: vi.fn() } as never,
      schedules: { list: () => ({ schedules: [] }) } as never,
      objectives: {} as never,
      audit: {
        recordControl: vi.fn(async (entry: { event: string }) => {
          events.push(entry.event);
          expect(store.list()).toHaveLength(0);
        }),
      } as never,
      appVersion: '1.0.0',
      createId: () => 'attention-routine',
    });

    await service.refresh();
    expect(events).toEqual(['attention-created']);
    expect(store.get('attention-routine')?.sourceFingerprint).toMatch(/^routine:[a-f0-9]{24}$/);
    await service.refresh();
    expect(events).toEqual(['attention-created']);
  });
});
