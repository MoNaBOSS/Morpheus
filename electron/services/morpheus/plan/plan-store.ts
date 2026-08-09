/**
 * Main-held execution plans.
 *
 * The renderer names a plan by id; it never submits one. That distinction is
 * the whole point: if `executePlan` accepted a plan object from the renderer,
 * a compromised or buggy renderer could author steps Main never planned — the
 * capability allowlist would still hold, but ordering, parameters and scope
 * would all be attacker-chosen. Main plans, Main stores, Main executes.
 *
 * Bounded and time-limited so a long session cannot accumulate plans
 * indefinitely, and so a stale planId cannot be replayed much later against
 * state that has since changed.
 */
import type { ExecutionPlan } from '@shared/morpheus/execution-types';

/** Plans a session may hold at once. Oldest is evicted first. */
export const MORPHEUS_MAX_STORED_PLANS = 50;

/** How long a planId stays executable after it was created. */
export const MORPHEUS_PLAN_TTL_MS = 15 * 60_000;

export interface MorpheusPlanStore {
  put(plan: ExecutionPlan): void;
  /** Returns the plan only while it is still valid; expired ids read as absent. */
  get(planId: string): ExecutionPlan | undefined;
  /** Removes a plan so a completed execution cannot be replayed. */
  take(planId: string): ExecutionPlan | undefined;
  size(): number;
}

export function createMorpheusPlanStore(options: {
  now?: () => Date;
  maxPlans?: number;
  ttlMs?: number;
} = {}): MorpheusPlanStore {
  const now = options.now ?? (() => new Date());
  const maxPlans = options.maxPlans ?? MORPHEUS_MAX_STORED_PLANS;
  const ttlMs = options.ttlMs ?? MORPHEUS_PLAN_TTL_MS;

  // Insertion-ordered, which Map guarantees, so eviction is just the first key.
  const plans = new Map<string, { plan: ExecutionPlan; storedAt: number }>();

  const prune = (): void => {
    const cutoff = now().getTime() - ttlMs;
    for (const [planId, entry] of plans) {
      if (entry.storedAt <= cutoff) plans.delete(planId);
    }
  };

  return {
    put(plan: ExecutionPlan): void {
      prune();
      plans.delete(plan.planId);
      plans.set(plan.planId, { plan, storedAt: now().getTime() });
      while (plans.size > maxPlans) {
        const oldest = plans.keys().next();
        if (oldest.done) break;
        plans.delete(oldest.value);
      }
    },

    get(planId: string): ExecutionPlan | undefined {
      prune();
      return plans.get(planId)?.plan;
    },

    take(planId: string): ExecutionPlan | undefined {
      prune();
      const entry = plans.get(planId);
      if (!entry) return undefined;
      plans.delete(planId);
      return entry.plan;
    },

    size(): number {
      prune();
      return plans.size;
    },
  };
}
