/**
 * Provider-neutral planning boundary.
 *
 * A planner turns an objective and Main-owned context into the permanent typed
 * plan contract. It cannot execute capabilities, create grants, or bypass the
 * resolver/policy/executor pipeline. Provider adapters are responsible for
 * validating model output before it crosses this interface; Electron Main
 * still resolves every target and recomputes every effective permission scope.
 */
import type {
  ExecutionOrigin,
  ExecutionPlan,
  ExecutionPlanStatus,
  ExecutionStepResult,
  InterpretationResult,
} from './execution-types';
import type { MorpheusActionId, MorpheusRiskTier } from './actions/registry';
import type { MorpheusParamDescriptor } from './capabilities/params';
import type { MorpheusContextItem, MorpheusObjectiveLimits } from './core/objective-types';

export type MorpheusPlanningCapability = {
  capabilityId: MorpheusActionId;
  riskTier: MorpheusRiskTier;
  description: string;
  params: readonly MorpheusParamDescriptor[];
};

export type MorpheusPlanningAgent = {
  profileId: string;
  name: string;
  instructions: string;
  capabilityIds: readonly MorpheusActionId[];
};

export type MorpheusPlanningRequest = {
  objective: string;
  origin: ExecutionOrigin;
  platform: string;
  /** Canonical approved root supplied by Main, never by the Renderer. */
  filesRoot: string;
  objectiveRunId?: string;
  iteration?: number;
  capabilities?: readonly MorpheusPlanningCapability[];
  context?: readonly MorpheusContextItem[];
  agent?: MorpheusPlanningAgent;
  limits?: MorpheusObjectiveLimits;
  signal?: AbortSignal;
};

export type MorpheusPlannerReviewRequest = {
  objectiveRunId: string;
  objective: string;
  origin: ExecutionOrigin;
  iteration: number;
  plan: ExecutionPlan;
  planStatus: ExecutionPlanStatus;
  stepResults: readonly ExecutionStepResult[];
  context: readonly MorpheusContextItem[];
  capabilities: readonly MorpheusPlanningCapability[];
  limits: MorpheusObjectiveLimits;
  signal?: AbortSignal;
};

export type MorpheusPlannerReviewResult =
  | { outcome: 'complete'; summary: string }
  | { outcome: 'clarify'; question: string }
  | { outcome: 'continue'; reason: string; plan: ExecutionPlan };

export interface MorpheusPlanner {
  /** Stable adapter identity for diagnostics and future planner selection. */
  readonly plannerId: string;
  readonly plannedBy: ExecutionPlan['plannedBy'];
  plan(request: MorpheusPlanningRequest): InterpretationResult | Promise<InterpretationResult>;
  /** Optional for deterministic/offline planners that cannot honestly replan. */
  review?(request: MorpheusPlannerReviewRequest): MorpheusPlannerReviewResult | Promise<MorpheusPlannerReviewResult>;
}
