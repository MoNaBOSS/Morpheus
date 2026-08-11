/** Platform-neutral contracts for the Morpheus objective lifecycle. */
import type { MorpheusActionId } from '../actions/registry';
import type {
  ExecutionArtifact,
  ExecutionOrigin,
  ExecutionPlan,
  ExecutionPlanStatus,
  ExecutionStepStatus,
} from '../execution-types';

export const MORPHEUS_OBJECTIVE_VERSION = 1 as const;

export type MorpheusSystemState =
  | 'ready'
  | 'listening'
  | 'understanding'
  | 'planning'
  | 'waiting-for-approval'
  | 'executing'
  | 'observing'
  | 'replanning'
  | 'speaking'
  | 'complete'
  | 'needs-clarification'
  | 'cancelled'
  | 'degraded'
  | 'error';

export const MORPHEUS_OBJECTIVE_TERMINAL_STATES: readonly MorpheusSystemState[] = Object.freeze([
  'complete',
  'needs-clarification',
  'cancelled',
  'degraded',
  'error',
]);

export function isObjectiveTerminalState(state: MorpheusSystemState): boolean {
  return MORPHEUS_OBJECTIVE_TERMINAL_STATES.includes(state);
}

export type MorpheusContextSource =
  | 'session'
  | 'workspace'
  | 'preference'
  | 'memory'
  | 'agent-profile';

export type MorpheusContextItem = {
  contextId: string;
  source: MorpheusContextSource;
  text: string;
  createdAt: string;
  /** Sensitive context remains local and is never sent to a planner. */
  sensitivity: 'normal' | 'sensitive';
  workspaceId?: string;
  agentProfileId?: string;
};

export type MorpheusObjectiveLimits = {
  maxIterations: number;
  maxStepsPerPlan: number;
  maxTotalSteps: number;
  maxDurationMs: number;
  providerTimeoutMs: number;
};

export const DEFAULT_OBJECTIVE_LIMITS: Readonly<MorpheusObjectiveLimits> = Object.freeze({
  maxIterations: 3,
  maxStepsPerPlan: 12,
  maxTotalSteps: 24,
  maxDurationMs: 15 * 60_000,
  providerTimeoutMs: 60_000,
});

export type MorpheusStepObservation = {
  stepId: string;
  capabilityId: MorpheusActionId;
  status: ExecutionStepStatus;
  durationMs?: number;
  errorCode?: string;
  artifactIds: readonly string[];
};

export type MorpheusPlanObservation = {
  iteration: number;
  planId: string;
  status: ExecutionPlanStatus;
  observedAt: string;
  steps: readonly MorpheusStepObservation[];
};

export type MorpheusObjectiveRun = {
  v: typeof MORPHEUS_OBJECTIVE_VERSION;
  objectiveRunId: string;
  objective: string;
  origin: ExecutionOrigin;
  state: MorpheusSystemState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  workspaceId?: string;
  agentProfileId?: string;
  plannerId?: string;
  providerAccountId?: string;
  modelId?: string;
  /** Truthful explanation when the preferred planner could not be used. */
  plannerNotice?: string;
  iteration: number;
  corrections: readonly { text: string; createdAt: string }[];
  planIds: readonly string[];
  observations: readonly MorpheusPlanObservation[];
  artifacts: readonly ExecutionArtifact[];
  summary?: string;
  clarification?: string;
  error?: { code: string; message: string };
};

export type MorpheusObjectiveSnapshot = {
  activeObjectiveRunId: string | null;
  runOrder: readonly string[];
  runsById: Readonly<Record<string, MorpheusObjectiveRun>>;
  /** Ephemeral Main-authored plans for active runs; never restored from disk. */
  plansByObjectiveRunId: Readonly<Record<string, ExecutionPlan>>;
};

export type SubmitMorpheusObjectivePayload = {
  objective: string;
  originType: 'command-bar' | 'quick-command' | 'chat';
  workspaceId?: string;
  agentProfileId?: string;
};

export type SubmitMorpheusObjectiveResult = {
  objectiveRunId: string;
  accepted: boolean;
  message?: string;
};

export type CorrectMorpheusObjectivePayload = {
  objectiveRunId: string;
  correction: string;
};

export type CancelMorpheusObjectivePayload = { objectiveRunId: string };

export type MorpheusObjectiveEvent = {
  v: typeof MORPHEUS_OBJECTIVE_VERSION;
  seq: number;
  ts: string;
  objectiveRunId: string;
  state: MorpheusSystemState;
  run: MorpheusObjectiveRun;
  /** Present while a real Main-held plan is current for this objective. */
  plan?: ExecutionPlan;
};
