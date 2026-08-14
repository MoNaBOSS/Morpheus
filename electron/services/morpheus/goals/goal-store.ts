import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  MORPHEUS_GOAL_VERSION,
  isMorpheusGoalId,
  type MorpheusGoal,
  type MorpheusGoalDraft,
  type MorpheusGoalHistoryEntry,
  type MorpheusGoalMilestone,
  type MorpheusGoalMilestoneDraft,
  type MorpheusGoalsSnapshot,
} from '@shared/morpheus/goal-types';
import { isMorpheusMissionId } from '@shared/morpheus/mission-types';
import { isObjectiveTerminalState, type MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

const MAX_GOALS = 100;
const MAX_MILESTONES = 50;
const MAX_HISTORY = 100;
const STATUSES = ['active', 'paused', 'completed', 'abandoned'] as const;
const MILESTONE_STATUSES = ['pending', 'in-progress', 'completed', 'skipped'] as const;

type StoredGoals = { v: 1; goals: MorpheusGoal[] };

export interface MorpheusGoalStore {
  list(): MorpheusGoalsSnapshot;
  get(goalId: string): MorpheusGoal | undefined;
  save(draft: MorpheusGoalDraft): MorpheusGoal;
  remove(goalId: string): MorpheusGoal | null;
  markContinued(goalId: string, objectiveRunId: string, missionId?: string): MorpheusGoal;
  projectObjective(run: MorpheusObjectiveRun): MorpheusGoal | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validText(value: unknown, max: number, empty = false): value is string {
  return typeof value === 'string' && value.length <= max && (empty || Boolean(value.trim()));
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00`));
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateMilestone(value: unknown): MorpheusGoalMilestone | null {
  if (!isRecord(value) || typeof value.milestoneId !== 'string'
    || !/^milestone-[a-z0-9][a-z0-9-]{0,95}$/i.test(value.milestoneId)
    || !validText(value.title, 160)
    || !MILESTONE_STATUSES.includes(value.status as typeof MILESTONE_STATUSES[number])) return null;
  if (value.targetDate !== undefined && !validDate(value.targetDate)) return null;
  if (value.completedAt !== undefined && !validIso(value.completedAt)) return null;
  return structuredClone(value) as MorpheusGoalMilestone;
}

function validateHistory(value: unknown): MorpheusGoalHistoryEntry | null {
  if (!isRecord(value) || typeof value.historyId !== 'string' || value.historyId.length > 120
    || !validIso(value.ts) || !validText(value.summary, 500)
    || !['created', 'updated', 'continued', 'mission-completed', 'mission-failed', 'status-changed'].includes(String(value.type))) return null;
  if (value.missionId !== undefined && !isMorpheusMissionId(value.missionId)) return null;
  if (value.objectiveRunId !== undefined && (typeof value.objectiveRunId !== 'string' || value.objectiveRunId.length > 120)) return null;
  return structuredClone(value) as MorpheusGoalHistoryEntry;
}

export function validateMorpheusGoal(value: unknown): MorpheusGoal | null {
  if (!isRecord(value) || value.v !== MORPHEUS_GOAL_VERSION || !isMorpheusGoalId(value.goalId)
    || !validText(value.name, 100) || !validText(value.objective, 2_000)
    || !validText(value.successCriteria, 2_000, true) || !validText(value.nextAction, 2_000, true)
    || !STATUSES.includes(value.status as typeof STATUSES[number])
    || typeof value.projectId !== 'string' || typeof value.workspaceId !== 'string'
    || typeof value.agentProfileId !== 'string' || !validIso(value.createdAt) || !validIso(value.updatedAt)
    || !Array.isArray(value.milestones) || value.milestones.length > MAX_MILESTONES
    || !Array.isArray(value.missionIds) || !Array.isArray(value.history)) return null;
  if (value.targetDate !== undefined && !validDate(value.targetDate)) return null;
  if (value.completedAt !== undefined && !validIso(value.completedAt)) return null;
  const milestones = value.milestones.map(validateMilestone);
  const history = value.history.slice(-MAX_HISTORY).map(validateHistory);
  if (milestones.some((item) => !item) || history.some((item) => !item)
    || value.missionIds.some((id) => !isMorpheusMissionId(id))) return null;
  return {
    ...(structuredClone(value) as MorpheusGoal),
    milestones: milestones as MorpheusGoalMilestone[],
    history: history as MorpheusGoalHistoryEntry[],
  };
}

function validateStored(value: unknown): StoredGoals | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.goals)) return null;
  const goals = value.goals.map(validateMorpheusGoal);
  if (goals.some((goal) => !goal) || goals.length > MAX_GOALS) return null;
  return { v: 1, goals: goals as MorpheusGoal[] };
}

export function createMorpheusGoalStore(options: {
  userDataDir: string;
  now?: () => Date;
  createId?: () => string;
  createChildId?: () => string;
}): MorpheusGoalStore {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `goal-${randomUUID()}`);
  const createChildId = options.createChildId ?? (() => randomUUID());
  const file = join(options.userDataDir, 'morpheus', 'goals.json');
  const byId = new Map<string, MorpheusGoal>();
  for (const goal of readValidatedJson(file, validateStored)?.goals ?? []) {
    byId.set(goal.goalId, structuredClone(goal));
  }

  const flush = (): void => writeJsonAtomically(file, { v: 1, goals: [...byId.values()] } satisfies StoredGoals);
  const history = (
    type: MorpheusGoalHistoryEntry['type'],
    summary: string,
    extra: Pick<MorpheusGoalHistoryEntry, 'missionId' | 'objectiveRunId'> = {},
  ): MorpheusGoalHistoryEntry => ({
    historyId: `history-${createChildId()}`,
    ts: now().toISOString(), type, summary, ...extra,
  });
  const saveWithRollback = (goal: MorpheusGoal, existing?: MorpheusGoal): MorpheusGoal => {
    byId.set(goal.goalId, goal);
    try { flush(); } catch (error) {
      if (existing) byId.set(existing.goalId, existing); else byId.delete(goal.goalId);
      throw error;
    }
    return structuredClone(goal);
  };

  const normalizeMilestones = (
    drafts: readonly MorpheusGoalMilestoneDraft[],
    existing: MorpheusGoal | undefined,
    stamp: string,
  ): MorpheusGoalMilestone[] => {
    if (drafts.length > MAX_MILESTONES) throw new Error('Goal milestone limit reached');
    return drafts.map((draft) => {
      const title = draft.title.trim();
      if (!title || title.length > 160 || !MILESTONE_STATUSES.includes(draft.status)) {
        throw new Error('Invalid Goal milestone');
      }
      if (draft.targetDate !== undefined && !validDate(draft.targetDate)) throw new Error('Invalid milestone target date');
      const milestoneId = draft.milestoneId ?? `milestone-${createChildId()}`;
      if (!/^milestone-[a-z0-9][a-z0-9-]{0,95}$/i.test(milestoneId)) throw new Error('Invalid milestone id');
      const prior = existing?.milestones.find((milestone) => milestone.milestoneId === milestoneId);
      return {
        milestoneId, title, status: draft.status,
        ...(draft.targetDate ? { targetDate: draft.targetDate } : {}),
        ...(draft.status === 'completed'
          ? { completedAt: prior?.completedAt ?? stamp }
          : {}),
      };
    });
  };

  return {
    list: () => ({
      goals: [...byId.values()]
        .sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || b.updatedAt.localeCompare(a.updatedAt))
        .map((goal) => structuredClone(goal)),
    }),
    get(goalId) {
      const goal = byId.get(goalId);
      return goal ? structuredClone(goal) : undefined;
    },
    save(draft) {
      const goalId = draft.goalId ?? createId();
      if (!isMorpheusGoalId(goalId)) throw new Error('Invalid Goal id');
      const existing = byId.get(goalId);
      if (!existing && byId.size >= MAX_GOALS) throw new Error('Goal limit reached');
      const name = draft.name.trim();
      const objective = draft.objective.trim();
      const successCriteria = draft.successCriteria.trim();
      const nextAction = draft.nextAction.trim();
      if (!name || name.length > 100 || !objective || objective.length > 2_000
        || successCriteria.length > 2_000 || nextAction.length > 2_000) throw new Error('Invalid Goal text');
      if (!STATUSES.includes(draft.status)) throw new Error('Invalid Goal status');
      if (draft.targetDate !== undefined && !validDate(draft.targetDate)) throw new Error('Invalid Goal target date');
      const stamp = now().toISOString();
      const statusChanged = Boolean(existing && existing.status !== draft.status);
      const entries = [...(existing?.history ?? []), history(
        existing ? statusChanged ? 'status-changed' : 'updated' : 'created',
        existing ? statusChanged ? `Status changed to ${draft.status}.` : 'Goal updated.' : 'Goal created.',
      )].slice(-MAX_HISTORY);
      const goal: MorpheusGoal = {
        v: MORPHEUS_GOAL_VERSION, goalId, name, objective, successCriteria,
        status: draft.status, projectId: draft.projectId, workspaceId: draft.workspaceId,
        agentProfileId: draft.agentProfileId, nextAction,
        ...(draft.targetDate ? { targetDate: draft.targetDate } : {}),
        milestones: normalizeMilestones(draft.milestones, existing, stamp),
        missionIds: existing?.missionIds ?? [], history: entries,
        createdAt: existing?.createdAt ?? stamp, updatedAt: stamp,
        ...(draft.status === 'completed' ? { completedAt: existing?.completedAt ?? stamp } : {}),
      };
      if (!validateMorpheusGoal(goal)) throw new Error('Invalid Goal');
      return saveWithRollback(goal, existing);
    },
    remove(goalId) {
      const existing = byId.get(goalId);
      if (!existing) return null;
      byId.delete(goalId);
      try { flush(); } catch (error) { byId.set(goalId, existing); throw error; }
      return structuredClone(existing);
    },
    markContinued(goalId, objectiveRunId, missionId) {
      const existing = byId.get(goalId);
      if (!existing) throw new Error('Unknown Goal');
      const entry = history('continued', 'Started the next Goal action.', { objectiveRunId, missionId });
      const goal = {
        ...existing,
        missionIds: missionId && !existing.missionIds.includes(missionId)
          ? [...existing.missionIds, missionId] : existing.missionIds,
        history: [...existing.history, entry].slice(-MAX_HISTORY),
        updatedAt: entry.ts,
      };
      return saveWithRollback(goal, existing);
    },
    projectObjective(run) {
      if (!run.goalId || !isMorpheusGoalId(run.goalId)) return undefined;
      const existing = byId.get(run.goalId);
      if (!existing) return undefined;
      const missionIds = run.missionId && !existing.missionIds.includes(run.missionId)
        ? [...existing.missionIds, run.missionId] : existing.missionIds;
      let entries = existing.history;
      if (isObjectiveTerminalState(run.state)
        && !entries.some((entry) => entry.objectiveRunId === run.objectiveRunId
          && (entry.type === 'mission-completed' || entry.type === 'mission-failed'))) {
        const success = run.state === 'complete';
        entries = [...entries, history(
          success ? 'mission-completed' : 'mission-failed',
          success ? run.summary ?? 'Goal Mission completed.' : run.error?.message ?? run.clarification ?? 'Goal Mission did not complete.',
          { missionId: run.missionId, objectiveRunId: run.objectiveRunId },
        )].slice(-MAX_HISTORY);
      }
      const goal = { ...existing, missionIds, history: entries, updatedAt: run.updatedAt };
      return saveWithRollback(goal, existing);
    },
  };
}
