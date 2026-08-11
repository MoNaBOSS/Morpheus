import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createMorpheusObjectiveStore } from '@electron/services/morpheus/core/objective-store';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function run(id: string, state: MorpheusObjectiveRun['state']): MorpheusObjectiveRun {
  return {
    v: 1, objectiveRunId: id, objective: 'test', origin: { type: 'command-bar', commandText: 'test' }, state,
    createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z',
    workspaceId: 'morpheus-files', agentProfileId: 'general', iteration: 0, corrections: [],
    planIds: [], observations: [], artifacts: [],
  };
}

describe('objective history store', () => {
  it('persists bounded history but keeps active plans ephemeral', () => {
    const root = mkdtempSync(join(tmpdir(), 'morpheus-objectives-'));
    roots.push(root);
    const store = createMorpheusObjectiveStore({ userDataDir: root });
    store.put(run('objective-1', 'planning'));
    store.setActivePlan('objective-1', {
      v: 1, planId: 'plan-1', createdAt: '2026-08-11T00:00:00.000Z', status: 'draft',
      origin: { type: 'command-bar', commandText: 'test' }, objective: 'test', plannedBy: 'deterministic', steps: [],
    });
    expect(store.snapshot().plansByObjectiveRunId['objective-1']?.planId).toBe('plan-1');

    const reloaded = createMorpheusObjectiveStore({
      userDataDir: root,
      now: () => new Date('2026-08-11T01:00:00.000Z'),
    });
    expect(reloaded.snapshot().plansByObjectiveRunId).toEqual({});
    expect(reloaded.get('objective-1')).toMatchObject({
      state: 'error', error: { code: 'interrupted' }, completedAt: '2026-08-11T01:00:00.000Z',
    });
  });
});
