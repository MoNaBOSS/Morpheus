/** Platform-neutral reusable AI System contracts. */
import type { MorpheusActionId } from './actions/registry';

export const MORPHEUS_SYSTEM_VERSION = 1 as const;

export type MorpheusSystemStatus = 'draft' | 'tested' | 'active' | 'paused' | 'invalid';
export type MorpheusSystemRunKind = 'test' | 'manual';
export type MorpheusSystemRunStatus =
  | 'completed'
  | 'partially-completed'
  | 'failed'
  | 'rejected'
  | 'cancelled';

export type MorpheusSystemOutputPolicy = {
  collectArtifacts: boolean;
  retainHistory: boolean;
};

export type MorpheusSystemRun = {
  runId: string;
  kind: MorpheusSystemRunKind;
  status: MorpheusSystemRunStatus;
  startedAt: string;
  completedAt: string;
  objectiveRunId?: string;
  missionId?: string;
  artifactIds: readonly string[];
  error?: string;
};

export type MorpheusSystem = {
  v: typeof MORPHEUS_SYSTEM_VERSION;
  systemId: string;
  name: string;
  description: string;
  workflowId: string;
  /** Derived from the workflow in Main and never renderer-authored. */
  agentProfileId: string;
  workspaceId: string;
  projectId?: string;
  scheduleIds: readonly string[];
  /** Exact, Main-derived boundary. It grants nothing by itself. */
  capabilityIds: readonly MorpheusActionId[];
  outputs: MorpheusSystemOutputPolicy;
  status: MorpheusSystemStatus;
  testFingerprint: string;
  lastTestStatus?: MorpheusSystemRunStatus;
  lastTestedAt?: string;
  lastTestObjectiveRunId?: string;
  lastTestMissionId?: string;
  runHistory: readonly MorpheusSystemRun[];
  createdAt: string;
  updatedAt: string;
  /** Read-time dependency projection; not execution authority. */
  invalidReason?: string;
};

export type MorpheusSystemDraft = Pick<
  MorpheusSystem,
  'name' | 'description' | 'workflowId' | 'workspaceId' | 'scheduleIds' | 'outputs'
> & { systemId?: string; projectId?: string };

export type MorpheusSystemsSnapshot = { systems: readonly MorpheusSystem[] };
export type MorpheusSystemIdPayload = { systemId: string };
export type MorpheusSystemResult = { system: MorpheusSystem | null };
export type CreateMorpheusSystemFromMissionPayload = { missionId: string; name?: string };
export type CreateMorpheusSystemFromMissionResult = MorpheusSystemResult & {
  eligible: boolean;
  reason?: string;
};
export type MorpheusSystemExecutionResult = MorpheusSystemResult & {
  accepted: boolean;
  objectiveRunId?: string;
  missionId?: string;
  message?: string;
};

export function isMorpheusSystemId(value: unknown): value is string {
  return typeof value === 'string' && /^system-[a-z0-9][a-z0-9-]{0,95}$/i.test(value);
}
