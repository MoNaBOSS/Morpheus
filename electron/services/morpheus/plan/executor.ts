/**
 * Plan executor — the layer 0.1.1 was missing.
 *
 * 0.1.1 shipped an `ExecutionPlan` type, an interpreter that produced one, and
 * no executor. The renderer received the plan and dispatched `steps[0]`; Main
 * never saw the plan again and `dependsOn` was typed but never read. The
 * renderer was the de-facto orchestrator, which put ordering — and therefore
 * the decision of what actually runs — outside the trust boundary.
 *
 * Execution now belongs to Main, and follows one sequence:
 *
 *   1. Order the graph, rejecting anything unorderable.
 *   2. PREPARE every step — resolve real targets, so scopes are what Main
 *      verified rather than what the caller asked for.
 *   3. Evaluate the whole plan's trust at once.
 *   4. Reject / execute directly / ask once, then execute.
 *
 * Preparation happens before any execution so the user is shown the complete,
 * concrete set of boundaries up front. Asking mid-plan would mean the first
 * steps had already run by the time the user learned what the rest would do.
 */
import {
  buildPlanGraph,
  transitiveDependents,
  type PlanGraphError,
} from '@shared/morpheus/plan/graph';
import type {
  ExecutionPlan,
  ExecutionPlanStatus,
  ExecutionStep,
  ExecutionStepResult,
} from '@shared/morpheus/execution-types';
import type {
  PermissionDecisionKind,
  PermissionScope,
} from '@shared/morpheus/permission-types';

import type { AuditHealth, MorpheusPolicyEngine } from '../policy/policy-engine';
import { evaluatePlanTrust, type TrustBoundary } from './trust';

/** A step resolved but not yet run. */
export type PreparedStep = {
  stepId: string;
  scope: PermissionScope;
  /**
   * The concrete thing this step will act on, as Main resolved it — shown in
   * the consent prompt so the user approves what will happen, not what was
   * requested.
   */
  target?: string;
  /** Opaque to the executor; handed back to `run` unchanged. */
  handle: unknown;
};

export type PrepareResult =
  | { ok: true; prepared: PreparedStep }
  | { ok: false; error: { code: string; message: string } };

export type RunResult =
  | { status: 'succeeded'; artifact?: ExecutionStepResult['artifact']; durationMs: number }
  | { status: 'failed'; error: { code: string; message: string }; durationMs: number };

/**
 * The per-step mechanics, injected rather than imported.
 *
 * The runtime owns audit-before-emit, idempotent consumption and rate limiting;
 * this executor owns ordering, trust and plan status. Keeping the seam here
 * means the plan layer is testable without Electron, and the heavily-tested
 * runtime does not have to be rewritten to gain plan execution.
 */
export interface PlanStepRunner {
  /** Resolve the concrete target. Must have no side effects. */
  prepare(step: ExecutionStep): Promise<PrepareResult>;
  /** Execute a prepared step. Only ever called once trust is satisfied. */
  run(step: ExecutionStep, prepared: PreparedStep, reason: string): Promise<RunResult>;
  /** Record that a step will not run, so history is complete. */
  skip?(step: ExecutionStep, because: string): Promise<void>;
  /**
   * Record that a step was refused.
   *
   * A refusal is exactly the kind of event an audit trail exists for, and it
   * never reaches `run` — so without this hook a denied plan would leave no
   * record at all, which the permission model forbids.
   */
  deny?(step: ExecutionStep, prepared: PreparedStep | undefined, reason: string): Promise<void>;
}

/** Consent for the batched boundaries. One call, however many steps. */
export type RequestConsent = (
  boundaries: readonly TrustBoundary[],
) => Promise<ReadonlyMap<string, PermissionDecisionKind>>;

export type ExecutePlanInput = {
  plan: ExecutionPlan;
  runner: PlanStepRunner;
  policy: MorpheusPolicyEngine;
  auditHealth: AuditHealth;
  requestConsent: RequestConsent;
  /** Records a decision the user chose to remember. */
  persistDecision?: (scope: PermissionScope, decision: PermissionDecisionKind) => void;
  signal?: { aborted: boolean };
  now?: () => Date;
};

export type ExecutePlanResult = {
  status: ExecutionPlanStatus;
  steps: readonly ExecutionStepResult[];
  /** Why a plan never started. Absent when execution was attempted. */
  rejection?: { code: string; message: string };
};

const ALLOW_DECISIONS: readonly PermissionDecisionKind[] = ['allow-once', 'allow-session', 'allow-always'];
const REMEMBERED_DECISIONS: readonly PermissionDecisionKind[] = ['allow-session', 'allow-always', 'deny-always'];

export async function executePlan(input: ExecutePlanInput): Promise<ExecutePlanResult> {
  const { plan, runner, policy, auditHealth, requestConsent, persistDecision, signal, now = () => new Date() } = input;
  const steps = plan.steps;
  const byId = new Map(steps.map((step) => [step.stepId, step]));

  const graph = buildPlanGraph(steps);
  if (!graph.ok) {
    return {
      status: 'rejected',
      steps: steps.map((step) => ({ stepId: step.stepId, status: 'skipped' as const })),
      rejection: {
        code: 'invalid-plan',
        message: `Plan cannot be ordered: ${graph.errors.map(describeGraphError).join('; ')}`,
      },
    };
  }

  const results = new Map<string, ExecutionStepResult>(
    graph.order.map((stepId) => [stepId, { stepId, status: 'pending' as const }]),
  );

  // 2. Prepare everything first. A preparation failure is a plan-level problem:
  //    the user would otherwise approve a plan whose later steps cannot run.
  const preparedByStep = new Map<string, PreparedStep>();
  const scopesByStep = new Map<string, PermissionScope>();
  const targetsByStep = new Map<string, string>();
  for (const stepId of graph.order) {
    const step = byId.get(stepId) as ExecutionStep;
    const outcome = await runner.prepare(step);
    if (!outcome.ok) {
      results.set(stepId, { stepId, status: 'failed', error: outcome.error });
      return {
        status: 'rejected',
        steps: finalise(graph.order, results),
        rejection: outcome.error,
      };
    }
    preparedByStep.set(stepId, outcome.prepared);
    scopesByStep.set(stepId, outcome.prepared.scope);
    if (outcome.prepared.target) targetsByStep.set(stepId, outcome.prepared.target);
  }

  // 3. One assessment for the whole plan.
  const trust = evaluatePlanTrust({
    scopesByStep, targetsByStep, order: graph.order, policy, auditHealth, now: now(),
  });

  if (trust.outcome === 'rejected') {
    for (const denial of trust.denied) {
      results.set(denial.stepId, {
        stepId: denial.stepId,
        status: 'denied',
        error: { code: 'permission-denied', message: denial.reason },
      });
      await runner.deny?.(
        byId.get(denial.stepId) as ExecutionStep,
        preparedByStep.get(denial.stepId),
        denial.reason,
      );
    }
    for (const stepId of graph.order) {
      if (results.get(stepId)?.status === 'pending') results.set(stepId, { stepId, status: 'skipped' });
    }
    return {
      status: 'rejected',
      steps: finalise(graph.order, results),
      rejection: { code: 'permission-denied', message: trust.denied.map((entry) => entry.reason).join('; ') },
    };
  }

  // 4. Ask once, for the deduplicated boundaries only.
  const reasonByStep = new Map<string, string>();
  for (const stepId of trust.autoAllowed) reasonByStep.set(stepId, 'pre-authorized');

  if (trust.outcome === 'needs-consent') {
    const decisions = await requestConsent(trust.consentRequired);

    for (const boundary of trust.consentRequired) {
      const decision = decisions.get(boundary.boundaryId);

      // An unanswered boundary is a refusal. Defaulting to allow would turn a
      // dropped message or a timeout into silent authority.
      if (!decision || !ALLOW_DECISIONS.includes(decision)) {
        for (const stepId of boundary.stepIds) {
          results.set(stepId, {
            stepId,
            status: 'denied',
            error: { code: 'permission-denied', message: decision ?? 'no-response' },
          });
          await runner.deny?.(
            byId.get(stepId) as ExecutionStep,
            preparedByStep.get(stepId),
            decision ?? 'no-response',
          );
        }
        if (decision && REMEMBERED_DECISIONS.includes(decision)) persistDecision?.(boundary.scope, decision);
        continue;
      }

      // `critical` accepts a one-time allow but is never remembered.
      if (!boundary.mandatoryConfirmation && REMEMBERED_DECISIONS.includes(decision)) {
        persistDecision?.(boundary.scope, decision);
      }
      for (const stepId of boundary.stepIds) reasonByStep.set(stepId, decision);
    }

    // Any refusal cancels the plan: the user approved it as a unit.
    const refused = graph.order.filter((stepId) => results.get(stepId)?.status === 'denied');
    if (refused.length > 0) {
      for (const stepId of graph.order) {
        if (results.get(stepId)?.status === 'pending') results.set(stepId, { stepId, status: 'skipped' });
      }
      return {
        status: 'rejected',
        steps: finalise(graph.order, results),
        rejection: { code: 'permission-denied', message: 'Consent was not granted for every required boundary' },
      };
    }
  }

  // 5. Execute in dependency order.
  for (const stepId of graph.order) {
    if (results.get(stepId)?.status !== 'pending') continue;

    if (signal?.aborted) {
      results.set(stepId, { stepId, status: 'cancelled' });
      continue;
    }

    const step = byId.get(stepId) as ExecutionStep;
    const prepared = preparedByStep.get(stepId) as PreparedStep;
    const startedAt = now().toISOString();
    const outcome = await runner.run(step, prepared, reasonByStep.get(stepId) ?? 'pre-authorized');

    if (outcome.status === 'succeeded') {
      results.set(stepId, {
        stepId, status: 'succeeded', startedAt, durationMs: outcome.durationMs, artifact: outcome.artifact,
      });
      continue;
    }

    results.set(stepId, {
      stepId, status: 'failed', startedAt, durationMs: outcome.durationMs, error: outcome.error,
    });

    // A failure stops only its own branch. Independent work still runs, because
    // refusing to continue would be a different kind of dishonesty about what
    // the machine can still do.
    for (const dependent of transitiveDependents(steps, stepId)) {
      if (results.get(dependent)?.status !== 'pending') continue;
      results.set(dependent, { stepId: dependent, status: 'skipped', skippedBecauseOf: stepId });
      await runner.skip?.(byId.get(dependent) as ExecutionStep, stepId);
    }
  }

  return { status: planStatus(graph.order, results), steps: finalise(graph.order, results) };
}

function finalise(
  order: readonly string[],
  results: ReadonlyMap<string, ExecutionStepResult>,
): readonly ExecutionStepResult[] {
  return order.map((stepId) => results.get(stepId) ?? { stepId, status: 'skipped' as const });
}

function planStatus(
  order: readonly string[],
  results: ReadonlyMap<string, ExecutionStepResult>,
): ExecutionPlanStatus {
  const statuses = order.map((stepId) => results.get(stepId)?.status ?? 'skipped');
  if (statuses.length === 0) return 'completed';
  if (statuses.some((status) => status === 'cancelled')) return 'cancelled';

  const succeeded = statuses.filter((status) => status === 'succeeded').length;
  if (succeeded === statuses.length) return 'completed';
  if (succeeded === 0) return 'failed';
  return 'partially-completed';
}

function describeGraphError(error: PlanGraphError): string {
  switch (error.code) {
    case 'duplicate-step': return `duplicate step "${error.stepId}"`;
    case 'self-dependency': return `step "${error.stepId}" depends on itself`;
    case 'unknown-dependency': return `step "${error.stepId}" depends on unknown "${error.dependsOn}"`;
    case 'cycle': return `cycle between ${error.stepIds.join(', ')}`;
  }
}
