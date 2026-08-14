import { randomUUID } from 'node:crypto';

import type {
  MorpheusGoal,
  MorpheusGoalDraft,
  MorpheusGoalResult,
  MorpheusGoalsSnapshot,
} from '@shared/morpheus/goal-types';
import type { SubmitMorpheusObjectiveResult } from '@shared/morpheus/core/objective-types';

import type { MorpheusAgentProfileStore } from '../agents/profile-store';
import type { MorpheusAuditSink } from '../audit';
import type { MorpheusObjectiveOrchestrator } from '../core/objective-orchestrator';
import type { MorpheusProjectStore } from '../projects/project-store';
import type { MorpheusWorkspaceStore } from '../workspaces/workspace-store';
import type { MorpheusGoalStore } from './goal-store';

export interface MorpheusGoalService {
  list(): MorpheusGoalsSnapshot;
  get(goalId: string): MorpheusGoal | undefined;
  save(draft: MorpheusGoalDraft): Promise<MorpheusGoalResult>;
  remove(goalId: string): Promise<MorpheusGoalResult>;
  continue(goalId: string): Promise<SubmitMorpheusObjectiveResult>;
}

export function createMorpheusGoalService(options: {
  store: MorpheusGoalStore;
  objectives: MorpheusObjectiveOrchestrator;
  projects: MorpheusProjectStore;
  workspaces: MorpheusWorkspaceStore;
  agents: MorpheusAgentProfileStore;
  audit: MorpheusAuditSink;
  appVersion: string;
  createId?: () => string;
}): MorpheusGoalService {
  const createId = options.createId ?? (() => `goal-${randomUUID()}`);
  const validateContext = (draft: MorpheusGoalDraft): void => {
    const project = options.projects.get(draft.projectId);
    if (!project?.enabled) throw new Error('The selected Goal Project is unavailable.');
    if (project.workspaceId !== draft.workspaceId) throw new Error('The Goal Project belongs to a different workspace.');
    const workspace = options.workspaces.get(draft.workspaceId);
    if (!workspace?.enabled || !workspace.available) throw new Error('The selected Goal workspace is unavailable.');
    if (!options.agents.get(draft.agentProfileId)?.enabled) throw new Error('The selected Goal Agent Profile is unavailable.');
  };

  return {
    list: () => options.store.list(),
    get: (goalId) => options.store.get(goalId),
    async save(draft) {
      validateContext(draft);
      const goalId = draft.goalId ?? createId();
      await options.audit.recordControl({
        category: 'goal', event: draft.goalId ? 'updated' : 'created', subjectId: goalId,
        details: { status: draft.status, projectId: draft.projectId, workspaceId: draft.workspaceId },
        appVersion: options.appVersion,
      });
      return { goal: options.store.save({ ...draft, goalId }) };
    },
    async remove(goalId) {
      await options.audit.recordControl({
        category: 'goal', event: 'removed', subjectId: goalId, details: {}, appVersion: options.appVersion,
      });
      return { goal: options.store.remove(goalId) };
    },
    async continue(goalId) {
      const goal = options.store.get(goalId);
      if (!goal) return { objectiveRunId: '', accepted: false, message: 'Unknown Goal.' };
      if (goal.status !== 'active') return { objectiveRunId: '', accepted: false, message: 'Only an active Goal can continue.' };
      if (!goal.nextAction.trim()) return { objectiveRunId: '', accepted: false, message: 'Set the Goal next action before continuing.' };
      await options.audit.recordControl({
        category: 'goal', event: 'continuation-requested', subjectId: goalId,
        details: { projectId: goal.projectId, workspaceId: goal.workspaceId }, appVersion: options.appVersion,
      });
      const result = await options.objectives.submitInternal({
        objective: goal.nextAction,
        origin: { type: 'goal', goalId, agentProfileId: goal.agentProfileId },
        workspaceId: goal.workspaceId,
        projectId: goal.projectId,
        agentProfileId: goal.agentProfileId,
        goalId,
      });
      if (result.accepted) options.store.markContinued(goalId, result.objectiveRunId, result.missionId);
      return result;
    },
  };
}
