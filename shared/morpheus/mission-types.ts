/** Platform-neutral durable projection of work running through Objective Core. */
import type { ExecutionArtifact, ExecutionOrigin } from './execution-types';

export const MORPHEUS_MISSION_VERSION = 1 as const;

export type MorpheusMissionStatus =
  | 'planning'
  | 'waiting-for-permission'
  | 'running'
  | 'observing'
  | 'needs-input'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MorpheusObjectiveRouteKind =
  | 'direct-capability'
  | 'provider-plan'
  | 'deterministic-fallback'
  | 'prepared-workflow';

export type MorpheusObjectiveRoute = {
  kind: MorpheusObjectiveRouteKind;
  plannerId: string;
  selectedAt: string;
  /** Human-readable and safe to display. Never contains provider prompts. */
  reason: string;
};

export type MorpheusMission = {
  v: typeof MORPHEUS_MISSION_VERSION;
  missionId: string;
  objective: string;
  origin: ExecutionOrigin;
  status: MorpheusMissionStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  projectId?: string;
  workspaceId?: string;
  agentProfileId?: string;
  objectiveRunIds: readonly string[];
  activeObjectiveRunId?: string;
  latestPlanId?: string;
  route?: MorpheusObjectiveRoute;
  artifacts: readonly ExecutionArtifact[];
  summary?: string;
  error?: { code: string; message: string };
};

export type MorpheusMissionsSnapshot = {
  activeMissionId: string | null;
  missionOrder: readonly string[];
  missionsById: Readonly<Record<string, MorpheusMission>>;
};

export type MorpheusMissionIdPayload = { missionId: string };
export type MorpheusMissionResult = { mission: MorpheusMission | null };

export function isMorpheusMissionId(value: unknown): value is string {
  return typeof value === 'string' && /^mission-[a-z0-9][a-z0-9-]{0,95}$/i.test(value);
}
