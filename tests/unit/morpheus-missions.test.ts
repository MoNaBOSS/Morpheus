import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createMorpheusMissionStore } from '@electron/services/morpheus/missions/mission-store';
import type { MorpheusObjectiveRun, MorpheusObjectiveSnapshot } from '@shared/morpheus/core/objective-types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'morpheus-missions-'));
  roots.push(value);
  return value;
}

function run(state: MorpheusObjectiveRun['state']): MorpheusObjectiveRun {
  return {
    v: 1,
    objectiveRunId: 'objective-1',
    missionId: 'mission-1',
    projectId: 'project-alpha',
    objective: 'Prepare a system brief',
    origin: { type: 'command-bar', commandText: 'Prepare a system brief' },
    state,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: state === 'complete' ? '2026-08-13T00:00:02.000Z' : '2026-08-13T00:00:01.000Z',
    startedAt: '2026-08-13T00:00:00.000Z',
    ...(state === 'complete' ? { completedAt: '2026-08-13T00:00:02.000Z' } : {}),
    workspaceId: 'morpheus-files',
    agentProfileId: 'general',
    route: {
      kind: 'direct-capability',
      plannerId: 'deterministic-v1',
      selectedAt: '2026-08-13T00:00:00.100Z',
      reason: 'Matched a registered capability before provider selection.',
    },
    iteration: 1,
    corrections: [],
    planIds: ['plan-1'],
    observations: [],
    artifacts: state === 'complete'
      ? [{ kind: 'report', artifactId: 'artifact-1', createdAt: '2026-08-13T00:00:02.000Z', data: { cpuCount: 8 } }]
      : [],
    ...(state === 'complete' ? { summary: 'System brief prepared.' } : {}),
  };
}

describe('Morpheus Mission store', () => {
  it('projects real objective state and persists lineage, route and artifacts', () => {
    const userDataDir = root();
    const store = createMorpheusMissionStore({ userDataDir });
    expect(store.projectObjective(run('executing'))).toMatchObject({
      missionId: 'mission-1', status: 'running', activeObjectiveRunId: 'objective-1',
      projectId: 'project-alpha', route: { kind: 'direct-capability' },
    });
    expect(store.projectObjective(run('complete'))).toMatchObject({
      status: 'completed', summary: 'System brief prepared.', objectiveRunIds: ['objective-1'],
    });

    const reloaded = createMorpheusMissionStore({ userDataDir });
    expect(reloaded.get('mission-1')).toMatchObject({
      status: 'completed', latestPlanId: 'plan-1', artifacts: [{ artifactId: 'artifact-1' }],
    });
    expect(reloaded.snapshot().activeMissionId).toBeNull();
  });

  it('reconciles an interrupted objective as failed rather than pretending it resumed', () => {
    const userDataDir = root();
    const first = createMorpheusMissionStore({ userDataDir });
    first.projectObjective(run('executing'));

    const interrupted = {
      ...run('error'),
      completedAt: '2026-08-13T01:00:00.000Z',
      updatedAt: '2026-08-13T01:00:00.000Z',
      error: { code: 'interrupted', message: 'Morpheus closed before this objective completed.' },
    } satisfies MorpheusObjectiveRun;
    const snapshot: MorpheusObjectiveSnapshot = {
      activeObjectiveRunId: null,
      runOrder: ['objective-1'],
      runsById: { 'objective-1': interrupted },
      plansByObjectiveRunId: {},
    };
    const second = createMorpheusMissionStore({ userDataDir });
    second.reconcile(snapshot);
    expect(second.get('mission-1')).toMatchObject({
      status: 'failed', error: { code: 'interrupted' },
    });
    expect(second.get('mission-1')).not.toHaveProperty('activeObjectiveRunId');
  });

  it('does not restore malformed local data as fabricated Mission state', () => {
    const userDataDir = root();
    const file = join(userDataDir, 'morpheus', 'missions.json');
    mkdirSync(join(userDataDir, 'morpheus'), { recursive: true });
    writeFileSync(file, JSON.stringify({ v: 1, missionOrder: ['mission-bad'], missionsById: {
      'mission-bad': { v: 1, missionId: 'mission-bad', objective: 'fake', status: 'running' },
    } }), { encoding: 'utf8', flag: 'w' });
    const store = createMorpheusMissionStore({ userDataDir });
    expect(store.snapshot().missionOrder).toEqual([]);
    store.reconcile({ activeObjectiveRunId: null, runOrder: [], runsById: {}, plansByObjectiveRunId: {} });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ v: 1, missionOrder: [], missionsById: {} });
  });
});
