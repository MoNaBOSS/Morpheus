import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { getMorpheusActionDescriptor, isMorpheusActionId } from '@shared/morpheus/actions/registry';
import { validateParams } from '@shared/morpheus/capabilities/params';
import { buildPlanGraph } from '@shared/morpheus/plan/graph';
import type { ExecutionPlan, ExecutionStep, ExecutionStepResult } from '@shared/morpheus/execution-types';
import { EXECUTION_ORIGIN_TYPES } from '@shared/morpheus/execution-types';
import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

export type TaskCheckpoint = {
  v: 1;
  objectiveRunId: string;
  attempts: number;
  iteration: number;
  workspaceRoot?: string;
  plan?: ExecutionPlan;
  steps: ExecutionStepResult[];
  /** Fingerprints only; never another copy of file contents or provider prompts. */
  completedEffects: string[];
};

/** Only these read operations may be restarted after an uncertain interruption. */
export function isReplaySafeRead(actionId: ExecutionStep['capabilityId']): boolean {
  return ['system.report', 'system.storage', 'system.processes', 'file.readText',
    'file.list', 'file.search', 'site.verify'].includes(actionId);
}

export function actionFingerprint(step: ExecutionStep): string {
  const entries = Object.entries(step.params).sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify([step.capabilityId, entries])).digest('hex');
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Disk plans receive the same capability/parameter/graph checks as new plans. */
function validPlan(value: unknown): value is ExecutionPlan {
  if (!record(value) || value.v !== 1 || typeof value.planId !== 'string'
    || typeof value.objective !== 'string' || value.objective.length > 8000
    || typeof value.createdAt !== 'string' || !record(value.origin)
    || !EXECUTION_ORIGIN_TYPES.includes(value.origin.type as never)
    || !['provider', 'deterministic', 'openclaw'].includes(String(value.plannedBy))
    || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 12) return false;
  for (const step of value.steps) {
    if (!record(step) || typeof step.stepId !== 'string' || step.stepId.length > 100
      || !isMorpheusActionId(step.capabilityId) || typeof step.summaryKey !== 'string'
      || !Array.isArray(step.dependsOn) || !step.dependsOn.every((id) => typeof id === 'string')) return false;
    if (!validateParams(getMorpheusActionDescriptor(step.capabilityId).params, step.params).ok) return false;
  }
  return buildPlanGraph(value.steps as ExecutionStep[]).ok;
}

function validCheckpoint(value: unknown): value is TaskCheckpoint {
  if (!record(value) || value.v !== 1 || typeof value.objectiveRunId !== 'string'
    || !Number.isInteger(value.attempts) || Number(value.attempts) < 0 || Number(value.attempts) > 3
    || !Number.isInteger(value.iteration) || Number(value.iteration) < 0 || Number(value.iteration) > 3
    || !Array.isArray(value.steps) || value.steps.length > 12
    || !Array.isArray(value.completedEffects) || value.completedEffects.length > 24
    || !value.completedEffects.every((key) => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key))
    || (value.workspaceRoot !== undefined && typeof value.workspaceRoot !== 'string')
    || (value.plan !== undefined && !validPlan(value.plan))) return false;
  const plan = value.plan as ExecutionPlan | undefined;
  const ids = new Set<string>();
  for (const step of value.steps) {
    if (!record(step) || typeof step.stepId !== 'string' || ids.has(step.stepId)
      || !plan?.steps.some((candidate) => candidate.stepId === step.stepId)
      || !['running', 'succeeded', 'failed', 'skipped', 'cancelled', 'denied'].includes(String(step.status))) return false;
    if (step.artifact !== undefined) {
      if (!record(step.artifact) || typeof step.artifact.artifactId !== 'string'
        || !['file', 'report', 'process', 'website', 'schedule'].includes(String(step.artifact.kind))) return false;
      if (step.artifact.kind === 'file' && (typeof step.artifact.path !== 'string'
        || typeof step.artifact.contentSha256 !== 'string' || typeof step.artifact.bytes !== 'number')) return false;
    }
    ids.add(step.stepId);
  }
  return true;
}

export type MorpheusTaskCheckpoints = ReturnType<typeof createMorpheusTaskCheckpoints>;

export function createMorpheusTaskCheckpoints(userDataDir: string) {
  const file = join(userDataDir, 'morpheus', 'task-checkpoints.json');
  const loaded = readValidatedJson(file, (value): TaskCheckpoint[] | null => {
    if (!record(value) || value.v !== 1 || !Array.isArray(value.entries) || value.entries.length > 100) return null;
    return value.entries.filter(validCheckpoint);
  }) ?? [];
  let entries = new Map(loaded.map((entry) => [entry.objectiveRunId, entry]));
  const commit = (id: string, checkpoint: TaskCheckpoint | null): void => {
    const next = new Map(entries);
    if (checkpoint) next.set(id, structuredClone(checkpoint));
    else next.delete(id);
    if (next.size > 100) throw new Error('Too many pending task checkpoints.');
    // Replace in-memory state only after persistence succeeds.
    writeJsonAtomically(file, { v: 1, entries: [...next.values()] });
    entries = next;
  };
  const get = (id: string) => {
    const entry = entries.get(id);
    return entry ? structuredClone(entry) : undefined;
  };
  return {
    get,
    begin(id: string, workspaceRoot?: string) {
      commit(id, { v: 1, objectiveRunId: id, attempts: 0, iteration: 0, workspaceRoot, steps: [], completedEffects: [] });
    },
    setPlan(id: string, plan: ExecutionPlan, iteration: number) {
      const entry = get(id);
      if (!entry) throw new Error('Missing task checkpoint.');
      if (entry.plan?.planId === plan.planId) return;
      commit(id, { ...entry, plan, iteration, steps: [] });
    },
    recordStep(planId: string, result: ExecutionStepResult) {
      const entry = [...entries.values()].find((candidate) => candidate.plan?.planId === planId);
      if (!entry) return; // Legacy direct plans have no objective checkpoint.
      const step = entry.plan!.steps.find((candidate) => candidate.stepId === result.stepId);
      if (!step) throw new Error('Unknown checkpoint step.');
      const effects = new Set(entry.completedEffects);
      if (['running', 'succeeded'].includes(result.status) && !isReplaySafeRead(step.capabilityId)) effects.add(actionFingerprint(step));
      commit(entry.objectiveRunId, {
        ...entry, steps: [...entry.steps.filter((item) => item.stepId !== result.stepId), result],
        completedEffects: [...effects],
      });
    },
    claim(id: string) {
      const entry = get(id);
      if (!entry || entry.attempts >= 3) throw new Error('This task reached its restart recovery limit.');
      commit(id, { ...entry, attempts: entry.attempts + 1 });
    },
    remove(id: string) { if (entries.has(id)) commit(id, null); },
  };
}

/** Returns only conclusive outcomes. Unknown effects stop this task, not others. */
export async function reconcileTaskCheckpoint(checkpoint: TaskCheckpoint, root: string): Promise<ExecutionStepResult[]> {
  if (checkpoint.workspaceRoot && await realpath(checkpoint.workspaceRoot) !== await realpath(root)) {
    throw new Error('The task workspace changed since it stopped. Review it before continuing.');
  }
  const retained: ExecutionStepResult[] = [];
  for (const result of checkpoint.steps) {
    const step = checkpoint.plan?.steps.find((candidate) => candidate.stepId === result.stepId);
    if (!step) throw new Error('The recovery checkpoint does not match its plan.');
    if (result.status === 'running') {
      if (!isReplaySafeRead(step.capabilityId)) {
        throw new Error(`Morpheus stopped during ${step.capabilityId}. Its outcome needs checking before this task can continue.`);
      }
      continue;
    }
    retained.push(result);
  }
  // Verify the final recorded version of each file; a later step may legitimately
  // have appended to a file created by an earlier step in this same plan.
  const files = new Map<string, Extract<NonNullable<ExecutionStepResult['artifact']>, { kind: 'file' }>>();
  for (const result of retained) if (result.status === 'succeeded' && result.artifact?.kind === 'file') {
    files.set(result.artifact.path, result.artifact);
  }
  if (files.size) {
    const canonicalRoot = await realpath(root);
    for (const artifact of files.values()) {
      const canonicalPath = await realpath(artifact.path);
      const rel = relative(canonicalRoot, canonicalPath);
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('A recovery artifact is outside its workspace.');
      const info = await stat(canonicalPath);
      if (!info.isFile() || info.size !== artifact.bytes || info.size > 32 * 1024 * 1024) {
        throw new Error('A completed file changed since the task stopped. Review it before continuing.');
      }
      const digest = createHash('sha256').update(await readFile(canonicalPath)).digest('hex').slice(0, 16);
      if (digest !== artifact.contentSha256) throw new Error('A completed file changed since the task stopped. Review it before continuing.');
    }
  }
  return retained;
}
