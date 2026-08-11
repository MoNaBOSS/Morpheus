/** Platform-neutral Morpheus-owned scheduling contracts. */
export const MORPHEUS_SCHEDULE_VERSION = 1 as const;

export type MorpheusScheduleTrigger =
  | { type: 'once'; runAt: string }
  | { type: 'interval'; everyMinutes: number }
  | { type: 'daily'; localTime: string }
  | { type: 'app-startup' };

export type MorpheusScheduleRunStatus =
  | 'never'
  | 'running'
  | 'completed'
  | 'partially-completed'
  | 'failed'
  | 'rejected';

export type MorpheusSchedule = {
  v: typeof MORPHEUS_SCHEDULE_VERSION;
  scheduleId: string;
  name: string;
  workflowId: string;
  workspaceId: string;
  enabled: boolean;
  trigger: MorpheusScheduleTrigger;
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus: MorpheusScheduleRunStatus;
  lastError?: string;
  /** Durable link into Objective history for the most recent real run. */
  lastObjectiveRunId?: string;
  lastPlanId?: string;
};

export type MorpheusScheduleDraft = Pick<MorpheusSchedule, 'name' | 'workflowId' | 'enabled' | 'trigger'> & {
  scheduleId?: string;
  workspaceId?: string;
};

export type SchedulesSnapshot = { schedules: readonly MorpheusSchedule[] };

export type MorpheusScheduleRunResult = {
  scheduleId: string;
  status: MorpheusScheduleRunStatus;
  objectiveRunId?: string;
  planId?: string;
  error?: string;
};
