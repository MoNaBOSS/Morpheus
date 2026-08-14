/** Platform-neutral, durable purpose spanning multiple real Missions. */
export const MORPHEUS_GOAL_VERSION = 1 as const;

export type MorpheusGoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type MorpheusGoalMilestoneStatus = 'pending' | 'in-progress' | 'completed' | 'skipped';

export type MorpheusGoalMilestone = {
  milestoneId: string;
  title: string;
  status: MorpheusGoalMilestoneStatus;
  targetDate?: string;
  completedAt?: string;
};

export type MorpheusGoalHistoryEntry = {
  historyId: string;
  ts: string;
  type: 'created' | 'updated' | 'continued' | 'mission-completed' | 'mission-failed' | 'status-changed';
  summary: string;
  missionId?: string;
  objectiveRunId?: string;
};

export type MorpheusGoal = {
  v: typeof MORPHEUS_GOAL_VERSION;
  goalId: string;
  name: string;
  objective: string;
  successCriteria: string;
  status: MorpheusGoalStatus;
  targetDate?: string;
  projectId: string;
  workspaceId: string;
  agentProfileId: string;
  nextAction: string;
  milestones: readonly MorpheusGoalMilestone[];
  missionIds: readonly string[];
  history: readonly MorpheusGoalHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type MorpheusGoalMilestoneDraft = Pick<MorpheusGoalMilestone, 'title' | 'status'> & {
  milestoneId?: string;
  targetDate?: string;
};

export type MorpheusGoalDraft = Pick<
  MorpheusGoal,
  | 'name'
  | 'objective'
  | 'successCriteria'
  | 'status'
  | 'projectId'
  | 'workspaceId'
  | 'agentProfileId'
  | 'nextAction'
> & {
  goalId?: string;
  targetDate?: string;
  milestones: readonly MorpheusGoalMilestoneDraft[];
};

export type MorpheusGoalsSnapshot = { goals: readonly MorpheusGoal[] };
export type MorpheusGoalIdPayload = { goalId: string };
export type MorpheusGoalResult = { goal: MorpheusGoal | null };

export function isMorpheusGoalId(value: unknown): value is string {
  return typeof value === 'string' && /^goal-[a-z0-9][a-z0-9-]{0,95}$/i.test(value);
}

export function morpheusGoalProgress(goal: Pick<MorpheusGoal, 'milestones' | 'status'>): number {
  if (goal.status === 'completed') return 100;
  const counted = goal.milestones.filter((milestone) => milestone.status !== 'skipped');
  if (counted.length === 0) return 0;
  return Math.round(counted.filter((milestone) => milestone.status === 'completed').length / counted.length * 100);
}
