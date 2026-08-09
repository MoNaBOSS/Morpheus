/**
 * Execution-plan dependency graph.
 *
 * 0.1.1 typed `ExecutionStep.dependsOn` and never read it — the renderer
 * dispatched `steps[0]` and Main never saw the plan again. This module supplies
 * the missing semantics, and does so as pure platform-neutral code so the same
 * ordering the executor uses can also drive the plan preview in the interface.
 * A preview that disagreed with execution order would be a lie.
 *
 * Imported by BOTH processes: no `electron`, no `node:*` imports.
 */

import type { ExecutionStep } from '../execution-types';

/** A step that cannot be ordered, with enough detail to explain the rejection. */
export type PlanGraphError =
  | { code: 'duplicate-step'; stepId: string }
  | { code: 'unknown-dependency'; stepId: string; dependsOn: string }
  | { code: 'self-dependency'; stepId: string }
  | { code: 'cycle'; stepIds: readonly string[] };

export type PlanGraphResult =
  | {
    ok: true;
    /** Every step id in a valid execution order. */
    order: readonly string[];
    /**
     * Parallelisable waves. Execution is sequential today
     * (`MORPHEUS_MAX_CONCURRENT_RUNS` is 1), but the interface uses this to show
     * which steps are genuinely independent rather than implying a false chain.
     */
    waves: readonly (readonly string[])[];
  }
  | { ok: false; errors: readonly PlanGraphError[] };

/**
 * Validates and topologically orders a plan's steps.
 *
 * Ties are broken by declaration order, so the same plan always executes in the
 * same sequence. Reproducibility matters here: an audit trail that could not be
 * replayed in order would be much weaker evidence of what happened.
 *
 * Cycles are rejected rather than broken. A plan that cannot be ordered is a
 * planning bug, and running "most of it" would be worse than refusing.
 */
export function buildPlanGraph(steps: readonly ExecutionStep[]): PlanGraphResult {
  const errors: PlanGraphError[] = [];

  const byId = new Map<string, ExecutionStep>();
  for (const step of steps) {
    if (byId.has(step.stepId)) errors.push({ code: 'duplicate-step', stepId: step.stepId });
    else byId.set(step.stepId, step);
  }

  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (dependency === step.stepId) errors.push({ code: 'self-dependency', stepId: step.stepId });
      else if (!byId.has(dependency)) {
        errors.push({ code: 'unknown-dependency', stepId: step.stepId, dependsOn: dependency });
      }
    }
  }

  // Ordering an inconsistent graph would produce a plausible-looking but wrong
  // sequence, so stop while the errors are still explainable.
  if (errors.length > 0) return { ok: false, errors };

  const declarationIndex = new Map<string, number>();
  steps.forEach((step, index) => declarationIndex.set(step.stepId, index));

  const remaining = new Map<string, Set<string>>();
  for (const step of steps) remaining.set(step.stepId, new Set(step.dependsOn));

  const order: string[] = [];
  const waves: string[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([stepId]) => stepId)
      .sort((a, b) => (declarationIndex.get(a) ?? 0) - (declarationIndex.get(b) ?? 0));

    if (ready.length === 0) {
      // Everything left depends on something else left: a cycle. Report the
      // participants so the planner can be fixed, not just "invalid plan".
      return { ok: false, errors: [{ code: 'cycle', stepIds: [...remaining.keys()].sort() }] };
    }

    waves.push(ready);
    for (const stepId of ready) {
      order.push(stepId);
      remaining.delete(stepId);
    }
    for (const dependencies of remaining.values()) {
      for (const stepId of ready) dependencies.delete(stepId);
    }
  }

  return { ok: true, order, waves };
}

/**
 * Every step that transitively depends on `stepId`.
 *
 * Used when a step fails: its dependents never ran, so they are `skipped`
 * rather than `failed`. The distinction matters when reading history — "did not
 * run because a prerequisite failed" is a different fact from "ran and broke",
 * and collapsing them would misrepresent what the machine actually did.
 */
export function transitiveDependents(
  steps: readonly ExecutionStep[],
  stepId: string,
): ReadonlySet<string> {
  const dependents = new Map<string, string[]>();
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      const list = dependents.get(dependency);
      if (list) list.push(step.stepId);
      else dependents.set(dependency, [step.stepId]);
    }
  }

  const out = new Set<string>();
  const queue = [...(dependents.get(stepId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    // The guard also makes this terminate on a cyclic graph, which
    // `buildPlanGraph` rejects but this function must not hang on.
    if (out.has(current)) continue;
    out.add(current);
    queue.push(...(dependents.get(current) ?? []));
  }
  return out;
}
