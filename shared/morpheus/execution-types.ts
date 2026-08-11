/**
 * Morpheus execution-plan model.
 *
 * Every command resolves to a typed ExecutionPlan, even when that plan holds a
 * single step. The plan is the durable contract between *deciding what to do*
 * and *doing it*.
 *
 * This exists before an AI planner does, on purpose. Today a deterministic
 * interpreter produces these plans; tomorrow an OpenClaw- or provider-backed
 * planner must be able to emit the identical structure without the UI, policy
 * engine, capability registry, audit sink or event contract changing. Building
 * the contract later would mean rebuilding the Command Center around it.
 *
 * Imported by BOTH processes: no `electron`, no `node:*` imports.
 */

import type { MorpheusActionId, MorpheusRiskTier } from './actions/registry';
import type { MorpheusActionParams } from './action-types';

export const MORPHEUS_PLAN_VERSION = 1 as const;

/**
 * How an execution was initiated. Part of a grant's scope: trust extended to a
 * command typed by the user is not automatically extended to a scheduled job.
 */
export type ExecutionOrigin =
  | { type: 'command-bar'; commandText: string }
  | { type: 'quick-command'; commandText: string }
  | { type: 'voice'; commandText: string }
  | { type: 'action-launcher' }
  | { type: 'chat'; sessionKey?: string }
  | { type: 'workflow'; workflowId: string; agentProfileId?: string }
  | { type: 'schedule'; scheduleId: string; workflowId: string; agentProfileId?: string };

export type ExecutionOriginType = ExecutionOrigin['type'];

export const EXECUTION_ORIGIN_TYPES: readonly ExecutionOriginType[] = Object.freeze([
  'command-bar',
  'quick-command',
  'voice',
  'action-launcher',
  'chat',
  'workflow',
  'schedule',
]);

/**
 * What a step will need permission for, computed before anything runs so the
 * whole plan can be evaluated up front.
 */
export type PermissionRequirement = {
  capabilityId: MorpheusActionId;
  platform: string;
  riskTier: MorpheusRiskTier;
  /**
   * Exact resource this step touches — an application key or a canonical
   * directory. Grants match on this string exactly; there are no wildcards.
   */
  resourceScope: string;
  /** True for tiers that must confirm regardless of profile or grant. */
  mandatoryConfirmation: boolean;
};

export type ExecutionStep = {
  stepId: string;
  capabilityId: MorpheusActionId;
  params: MorpheusActionParams;
  /** Human-readable summary, already localised by the caller. */
  summaryKey: string;
  summaryValues?: Record<string, string | number>;
  permission: PermissionRequirement;
  /** Step ids that must succeed first. Empty today; multi-step plans use it. */
  dependsOn: readonly string[];
};

/**
 * Outcome of one step.
 *
 * `skipped` is deliberately distinct from `failed`: a skipped step never ran,
 * because something it depended on failed first. Collapsing the two would
 * misrepresent what the machine actually did, and history is the main thing a
 * user has to reason about after the fact.
 */
export type ExecutionStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'denied'
  | 'cancelled';

export type ExecutionStepResult = {
  stepId: string;
  status: ExecutionStepStatus;
  startedAt?: string;
  durationMs?: number;
  /** Present when `failed` or `denied`. */
  error?: { code: string; message: string };
  /** Step id whose failure caused this one to be skipped. */
  skippedBecauseOf?: string;
  artifact?: ExecutionArtifact;
};

export type ExecutionPlanStatus =
  | 'draft'
  | 'awaiting-permission'
  | 'executing'
  | 'completed'
  | 'partially-completed'
  | 'failed'
  | 'rejected'
  | 'cancelled';

export const EXECUTION_PLAN_TERMINAL_STATUSES: readonly ExecutionPlanStatus[] = Object.freeze([
  'completed',
  'partially-completed',
  'failed',
  'rejected',
  'cancelled',
]);

export function isExecutionPlanTerminal(status: ExecutionPlanStatus): boolean {
  return EXECUTION_PLAN_TERMINAL_STATUSES.includes(status);
}

/**
 * A durable output of an execution — a file created, a report produced. Kept
 * separate from the run event so the Command Center can list artifacts across
 * runs without replaying the timeline.
 */
export type ExecutionArtifact =
  | {
    kind: 'file';
    artifactId: string;
    path: string;
    bytes: number;
    createdAt: string;
    /** Truncated digest. The content itself is never retained. */
    contentSha256: string;
  }
  | {
    kind: 'report';
    artifactId: string;
    createdAt: string;
    /** Report payloads are privacy-safe by construction. */
    data: Record<string, string | number>;
  }
  | {
    kind: 'process';
    artifactId: string;
    createdAt: string;
    executablePath: string;
    pid: number | null;
  };

export type ExecutionPlan = {
  v: typeof MORPHEUS_PLAN_VERSION;
  planId: string;
  createdAt: string;
  origin: ExecutionOrigin;
  /** What the user asked for, in their words. */
  objective: string;
  status: ExecutionPlanStatus;
  steps: readonly ExecutionStep[];
  /**
   * Which component produced this plan. `deterministic` today; a future planner
   * identifies itself here without changing the shape.
   */
  plannedBy: 'deterministic' | 'openclaw' | 'provider';
};

/** A command Morpheus could not turn into a plan — answered truthfully. */
export type UnsupportedCommand = {
  objective: string;
  reason: 'not-understood' | 'unsupported-platform' | 'ambiguous';
  /** Capability ids Morpheus genuinely supports right now. */
  supportedCapabilities: readonly MorpheusActionId[];
};

export type InterpretationResult =
  | { ok: true; plan: ExecutionPlan }
  | { ok: false; unsupported: UnsupportedCommand };

export type ExecutionPlanSnapshot = {
  planOrder: string[];
  plansById: Record<string, ExecutionPlan>;
  artifactsByPlan: Record<string, ExecutionArtifact[]>;
};
