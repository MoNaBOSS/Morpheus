import { join } from 'node:path';

import {
  MORPHEUS_MISSION_VERSION,
  isMorpheusMissionId,
  type MorpheusMission,
  type MorpheusMissionsSnapshot,
  type MorpheusMissionStatus,
} from '@shared/morpheus/mission-types';
import {
  isObjectiveTerminalState,
  type MorpheusObjectiveRun,
  type MorpheusObjectiveSnapshot,
  type MorpheusSystemState,
} from '@shared/morpheus/core/objective-types';
import { isMorpheusGoalId } from '@shared/morpheus/goal-types';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

const MAX_MISSIONS = 250;
const MISSION_STATUSES: readonly MorpheusMissionStatus[] = Object.freeze([
  'planning',
  'waiting-for-permission',
  'running',
  'observing',
  'needs-input',
  'completed',
  'failed',
  'cancelled',
]);

type StoredMissions = {
  v: 1;
  missionOrder: string[];
  missionsById: Record<string, MorpheusMission>;
};

export interface MorpheusMissionStore {
  projectObjective(run: MorpheusObjectiveRun): MorpheusMission;
  reconcile(snapshot: MorpheusObjectiveSnapshot): void;
  get(missionId: string): MorpheusMission | undefined;
  snapshot(): MorpheusMissionsSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateStored(value: unknown): StoredMissions | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.missionOrder)
    || !isRecord(value.missionsById)) return null;
  const missionOrder = value.missionOrder
    .filter((id): id is string => isMorpheusMissionId(id))
    .slice(0, MAX_MISSIONS);
  const missionsById: Record<string, MorpheusMission> = {};
  for (const missionId of missionOrder) {
    const mission = value.missionsById[missionId];
    if (!isRecord(mission) || mission.v !== MORPHEUS_MISSION_VERSION
      || mission.missionId !== missionId || typeof mission.objective !== 'string'
      || !MISSION_STATUSES.includes(mission.status as MorpheusMissionStatus)
      || typeof mission.createdAt !== 'string' || typeof mission.updatedAt !== 'string'
      || !Array.isArray(mission.objectiveRunIds) || !Array.isArray(mission.artifacts)) continue;
    if (mission.goalId !== undefined && !isMorpheusGoalId(mission.goalId)) continue;
    missionsById[missionId] = structuredClone(mission) as MorpheusMission;
  }
  return {
    v: 1,
    missionOrder: missionOrder.filter((id) => Boolean(missionsById[id])),
    missionsById,
  };
}

function statusFromObjective(state: MorpheusSystemState): MorpheusMissionStatus {
  switch (state) {
    case 'understanding':
    case 'planning':
    case 'replanning':
      return 'planning';
    case 'waiting-for-approval':
      return 'waiting-for-permission';
    case 'executing':
      return 'running';
    case 'observing':
    case 'speaking':
      return 'observing';
    case 'complete':
      return 'completed';
    case 'needs-clarification':
      return 'needs-input';
    case 'cancelled':
      return 'cancelled';
    case 'degraded':
    case 'error':
      return 'failed';
    case 'ready':
    case 'listening':
      return 'planning';
  }
}

function fallbackMissionId(objectiveRunId: string): string {
  const safe = objectiveRunId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `mission-${(safe || 'legacy-objective').slice(0, 80)}`;
}

function mergeArtifacts(
  existing: MorpheusMission['artifacts'],
  incoming: MorpheusObjectiveRun['artifacts'],
): MorpheusMission['artifacts'] {
  const byId = new Map(existing.map((artifact) => [artifact.artifactId, artifact]));
  for (const artifact of incoming) byId.set(artifact.artifactId, artifact);
  return [...byId.values()];
}

export function createMorpheusMissionStore(options: {
  userDataDir: string;
  maxMissions?: number;
}): MorpheusMissionStore {
  const maxMissions = options.maxMissions ?? MAX_MISSIONS;
  const file = join(options.userDataDir, 'morpheus', 'missions.json');
  const loaded = readValidatedJson(file, validateStored);
  const missionOrder = [...(loaded?.missionOrder ?? [])];
  const missionsById = new Map<string, MorpheusMission>(
    Object.entries(loaded?.missionsById ?? {}).map(([id, mission]) => [id, structuredClone(mission)]),
  );

  const trim = (): void => {
    while (missionOrder.length > maxMissions) {
      const removed = missionOrder.pop();
      if (removed) missionsById.delete(removed);
    }
  };

  const flush = (): void => {
    trim();
    writeJsonAtomically(file, {
      v: 1,
      missionOrder,
      missionsById: Object.fromEntries(missionOrder.flatMap((id) => {
        const mission = missionsById.get(id);
        return mission ? [[id, mission]] : [];
      })),
    } satisfies StoredMissions);
  };

  const project = (run: MorpheusObjectiveRun, persist: boolean): MorpheusMission => {
    const missionId = run.missionId && isMorpheusMissionId(run.missionId)
      ? run.missionId
      : fallbackMissionId(run.objectiveRunId);
    const existing = missionsById.get(missionId);
    const status = statusFromObjective(run.state);
    const terminal = isObjectiveTerminalState(run.state);
    const objectiveRunIds = existing?.objectiveRunIds.includes(run.objectiveRunId)
      ? [...existing.objectiveRunIds]
      : [...(existing?.objectiveRunIds ?? []), run.objectiveRunId];
    const mission: MorpheusMission = {
      v: MORPHEUS_MISSION_VERSION,
      missionId,
      objective: run.objective,
      origin: structuredClone(run.origin),
      status,
      createdAt: existing?.createdAt ?? run.createdAt,
      updatedAt: run.updatedAt,
      startedAt: existing?.startedAt ?? run.startedAt,
      ...(terminal && run.completedAt ? { completedAt: run.completedAt } : {}),
      ...(run.projectId ? { projectId: run.projectId } : existing?.projectId ? { projectId: existing.projectId } : {}),
      ...(run.goalId ? { goalId: run.goalId } : existing?.goalId ? { goalId: existing.goalId } : {}),
      ...(run.workspaceId ? { workspaceId: run.workspaceId } : {}),
      ...(run.agentProfileId ? { agentProfileId: run.agentProfileId } : {}),
      objectiveRunIds,
      ...(!terminal ? { activeObjectiveRunId: run.objectiveRunId } : {}),
      ...(run.planIds.at(-1) ? { latestPlanId: run.planIds.at(-1) as string } : {}),
      ...(run.route ? { route: structuredClone(run.route) } : existing?.route ? { route: existing.route } : {}),
      artifacts: mergeArtifacts(existing?.artifacts ?? [], run.artifacts),
      ...(run.summary ? { summary: run.summary } : {}),
      ...(run.error ? { error: structuredClone(run.error) } : {}),
    };
    missionsById.set(missionId, mission);
    const currentIndex = missionOrder.indexOf(missionId);
    if (currentIndex >= 0) missionOrder.splice(currentIndex, 1);
    missionOrder.unshift(missionId);
    if (persist) flush();
    return structuredClone(mission);
  };

  return {
    projectObjective: (run) => project(run, true),
    reconcile(snapshot) {
      const activeRunIds = new Set(snapshot.runOrder);
      for (const mission of missionsById.values()) {
        if (!mission.activeObjectiveRunId || activeRunIds.has(mission.activeObjectiveRunId)) continue;
        missionsById.set(mission.missionId, {
          ...mission,
          status: 'failed',
          activeObjectiveRunId: undefined,
          completedAt: mission.updatedAt,
          error: { code: 'interrupted', message: 'Morpheus closed before this Mission completed.' },
        });
      }
      for (const objectiveRunId of [...snapshot.runOrder].reverse()) {
        const run = snapshot.runsById[objectiveRunId];
        if (run) project(run, false);
      }
      flush();
    },
    get(missionId) {
      const mission = missionsById.get(missionId);
      return mission ? structuredClone(mission) : undefined;
    },
    snapshot() {
      const order = missionOrder.filter((id) => missionsById.has(id));
      const activeMissionId = order.find((id) => {
        const status = missionsById.get(id)?.status;
        return status ? !['completed', 'failed', 'cancelled', 'needs-input'].includes(status) : false;
      }) ?? null;
      return {
        activeMissionId,
        missionOrder: [...order],
        missionsById: Object.fromEntries(order.map((id) => [id, structuredClone(missionsById.get(id) as MorpheusMission)])),
      };
    },
  };
}
