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
  InterpretationResult,
} from './execution-types';

export type MorpheusPlanningRequest = {
  objective: string;
  origin: ExecutionOrigin;
  platform: string;
  /** Canonical approved root supplied by Main, never by the Renderer. */
  filesRoot: string;
};

export interface MorpheusPlanner {
  /** Stable adapter identity for diagnostics and future planner selection. */
  readonly plannerId: string;
  readonly plannedBy: ExecutionPlan['plannedBy'];
  plan(request: MorpheusPlanningRequest): InterpretationResult | Promise<InterpretationResult>;
}
