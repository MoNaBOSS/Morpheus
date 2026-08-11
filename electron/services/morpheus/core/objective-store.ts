import { join } from 'node:path';

import {
  MORPHEUS_OBJECTIVE_VERSION,
  isObjectiveTerminalState,
  type MorpheusObjectiveRun,
  type MorpheusObjectiveSnapshot,
} from '@shared/morpheus/core/objective-types';
import type { ExecutionPlan } from '@shared/morpheus/execution-types';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

const MAX_OBJECTIVE_HISTORY = 100;

type StoredObjectives = {
  v: 1;
  runOrder: string[];
  runsById: Record<string, MorpheusObjectiveRun>;
};

export interface MorpheusObjectiveStore {
  put(run: MorpheusObjectiveRun): MorpheusObjectiveRun;
  get(objectiveRunId: string): MorpheusObjectiveRun | undefined;
  setActivePlan(objectiveRunId: string, plan: ExecutionPlan | null): void;
  snapshot(): MorpheusObjectiveSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Objective history is display-only. Validation still rejects malformed local
 * state so a corrupted profile cannot fabricate active work in the UI.
 */
function validateStored(value: unknown): StoredObjectives | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.runOrder) || !isRecord(value.runsById)) return null;
  const runOrder = value.runOrder.filter((id): id is string => typeof id === 'string').slice(0, MAX_OBJECTIVE_HISTORY);
  const runsById: Record<string, MorpheusObjectiveRun> = {};
  for (const id of runOrder) {
    const run = value.runsById[id];
    if (!isRecord(run) || run.v !== MORPHEUS_OBJECTIVE_VERSION || run.objectiveRunId !== id) continue;
    if (typeof run.objective !== 'string' || typeof run.state !== 'string'
      || typeof run.createdAt !== 'string' || typeof run.updatedAt !== 'string'
      || !Array.isArray(run.planIds) || !Array.isArray(run.observations) || !Array.isArray(run.artifacts)) continue;
    runsById[id] = structuredClone(run) as MorpheusObjectiveRun;
  }
  return { v: 1, runOrder: runOrder.filter((id) => Boolean(runsById[id])), runsById };
}

export function createMorpheusObjectiveStore(options: {
  userDataDir: string;
  now?: () => Date;
  maxHistory?: number;
}): MorpheusObjectiveStore {
  const now = options.now ?? (() => new Date());
  const maxHistory = options.maxHistory ?? MAX_OBJECTIVE_HISTORY;
  const file = join(options.userDataDir, 'morpheus', 'objective-history.json');
  const loaded = readValidatedJson(file, validateStored);
  const runOrder = [...(loaded?.runOrder ?? [])];
  const runsById = new Map<string, MorpheusObjectiveRun>(
    Object.entries(loaded?.runsById ?? {}).map(([id, run]) => [id, structuredClone(run)]),
  );
  const activePlans = new Map<string, ExecutionPlan>();

  // A process restart cannot resume an in-flight provider request or native
  // operation safely. Preserve the evidence and mark it interrupted instead of
  // pretending it is still executing.
  let repaired = false;
  for (const [id, run] of runsById) {
    if (isObjectiveTerminalState(run.state)) continue;
    const timestamp = now().toISOString();
    runsById.set(id, {
      ...run,
      state: 'error',
      updatedAt: timestamp,
      completedAt: timestamp,
      error: { code: 'interrupted', message: 'Morpheus closed before this objective completed.' },
    });
    repaired = true;
  }

  const flush = (): void => {
    const ordered = runOrder.slice(0, maxHistory);
    const stored: StoredObjectives = {
      v: 1,
      runOrder: ordered,
      runsById: Object.fromEntries(ordered.flatMap((id) => {
        const run = runsById.get(id);
        return run ? [[id, run]] : [];
      })),
    };
    writeJsonAtomically(file, stored);
  };
  if (repaired) flush();

  return {
    put(run) {
      const copy = structuredClone(run);
      runsById.set(run.objectiveRunId, copy);
      const existing = runOrder.indexOf(run.objectiveRunId);
      if (existing >= 0) runOrder.splice(existing, 1);
      runOrder.unshift(run.objectiveRunId);
      while (runOrder.length > maxHistory) {
        const removed = runOrder.pop();
        if (removed) {
          runsById.delete(removed);
          activePlans.delete(removed);
        }
      }
      flush();
      return structuredClone(copy);
    },

    get(objectiveRunId) {
      const run = runsById.get(objectiveRunId);
      return run ? structuredClone(run) : undefined;
    },

    setActivePlan(objectiveRunId, plan) {
      if (plan) activePlans.set(objectiveRunId, structuredClone(plan));
      else activePlans.delete(objectiveRunId);
    },

    snapshot() {
      const ordered = runOrder.filter((id) => runsById.has(id));
      const activeObjectiveRunId = ordered.find((id) => {
        const run = runsById.get(id);
        return run ? !isObjectiveTerminalState(run.state) : false;
      }) ?? null;
      return {
        activeObjectiveRunId,
        runOrder: [...ordered],
        runsById: Object.fromEntries(ordered.map((id) => [id, structuredClone(runsById.get(id) as MorpheusObjectiveRun)])),
        plansByObjectiveRunId: Object.fromEntries(
          [...activePlans.entries()].map(([id, plan]) => [id, structuredClone(plan)]),
        ),
      };
    },
  };
}
