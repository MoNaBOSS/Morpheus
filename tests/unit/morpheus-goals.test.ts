import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { morpheusGoalProgress } from '@shared/morpheus/goal-types';
import { createMorpheusGoalStore } from '@electron/services/morpheus/goals/goal-store';
import { createMorpheusGoalService } from '@electron/services/morpheus/goals/goal-service';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function directory(): string {
  const value = mkdtempSync(join(tmpdir(), 'morpheus-goals-'));
  directories.push(value);
  return value;
}

const BASE_DRAFT = {
  name: 'Launch a sustainable product',
  objective: 'Build and launch a useful software product.',
  successCriteria: 'A real customer can install and use it.',
  status: 'active' as const,
  targetDate: '2026-09-30',
  projectId: 'personal',
  workspaceId: 'morpheus-files',
  agentProfileId: 'general',
  nextAction: 'Create the launch brief.',
  milestones: [
    { title: 'Define the offer', status: 'completed' as const },
    { title: 'Ship the first release', status: 'in-progress' as const },
  ],
};

describe('Morpheus Goals', () => {
  it('derives progress from milestones and survives restart with bounded Mission lineage', () => {
    const userDataDir = directory();
    let child = 0;
    const store = createMorpheusGoalStore({
      userDataDir,
      now: () => new Date('2026-08-14T08:00:00.000Z'),
      createId: () => 'goal-product-launch',
      createChildId: () => `child-${++child}`,
    });
    const goal = store.save(BASE_DRAFT);
    expect(morpheusGoalProgress(goal)).toBe(50);
    expect(goal.history).toHaveLength(1);

    store.projectObjective({
      v: 1, objectiveRunId: 'objective-goal-1', missionId: 'mission-goal-1', goalId: goal.goalId,
      objective: goal.nextAction, origin: { type: 'goal', goalId: goal.goalId }, state: 'complete',
      createdAt: '2026-08-14T08:00:00.000Z', updatedAt: '2026-08-14T08:01:00.000Z',
      completedAt: '2026-08-14T08:01:00.000Z', workspaceId: goal.workspaceId,
      agentProfileId: goal.agentProfileId, iteration: 1, corrections: [], planIds: ['plan-goal'],
      observations: [], artifacts: [], summary: 'Launch brief created.',
    });
    // Re-projecting the same terminal Objective must not duplicate history.
    store.projectObjective({
      v: 1, objectiveRunId: 'objective-goal-1', missionId: 'mission-goal-1', goalId: goal.goalId,
      objective: goal.nextAction, origin: { type: 'goal', goalId: goal.goalId }, state: 'complete',
      createdAt: '2026-08-14T08:00:00.000Z', updatedAt: '2026-08-14T08:01:00.000Z',
      completedAt: '2026-08-14T08:01:00.000Z', workspaceId: goal.workspaceId,
      agentProfileId: goal.agentProfileId, iteration: 1, corrections: [], planIds: ['plan-goal'],
      observations: [], artifacts: [], summary: 'Launch brief created.',
    });

    const restored = createMorpheusGoalStore({ userDataDir }).get(goal.goalId);
    expect(restored?.missionIds).toEqual(['mission-goal-1']);
    expect(restored?.history.filter((entry) => entry.type === 'mission-completed')).toHaveLength(1);
  });

  it('validates exact context and continues through Objective Core with a Goal origin', async () => {
    const store = createMorpheusGoalStore({ userDataDir: directory(), createId: () => 'goal-context' });
    const submitInternal = vi.fn(async () => ({
      objectiveRunId: 'objective-next', missionId: 'mission-next', accepted: true,
    }));
    const audit = { recordControl: vi.fn(async () => undefined) };
    const service = createMorpheusGoalService({
      store,
      objectives: { submitInternal } as never,
      projects: { get: () => ({ enabled: true, workspaceId: 'morpheus-files' }) } as never,
      workspaces: { get: () => ({ enabled: true, available: true }) } as never,
      agents: { get: () => ({ enabled: true }) } as never,
      audit: audit as never,
      appVersion: '1.0.0',
      createId: () => 'goal-context',
    });
    const saved = await service.save(BASE_DRAFT);
    const result = await service.continue(saved.goal?.goalId ?? 'missing');
    expect(result.accepted).toBe(true);
    expect(submitInternal).toHaveBeenCalledWith(expect.objectContaining({
      objective: BASE_DRAFT.nextAction,
      goalId: 'goal-context',
      origin: { type: 'goal', goalId: 'goal-context', agentProfileId: 'general' },
      workspaceId: 'morpheus-files',
      projectId: 'personal',
    }));
    expect(store.get('goal-context')?.history.some((entry) => entry.type === 'continued')).toBe(true);
  });
});
