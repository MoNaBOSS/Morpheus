import { describe, expect, it } from 'vitest';

import { createMorpheusPlanStore } from '@electron/services/morpheus/plan/plan-store';
import type { ExecutionPlan } from '@shared/morpheus/execution-types';

function plan(planId: string): ExecutionPlan {
  return {
    v: 1,
    planId,
    createdAt: '2026-08-09T00:00:00.000Z',
    origin: { type: 'command-bar', commandText: 'x' },
    objective: 'x',
    status: 'draft',
    steps: [],
    plannedBy: 'deterministic',
  };
}

describe('plan store', () => {
  it('returns a stored plan by id', () => {
    const store = createMorpheusPlanStore();
    store.put(plan('p1'));
    expect(store.get('p1')?.planId).toBe('p1');
  });

  it('returns undefined for an id it never issued', () => {
    // The renderer names a plan; it cannot author one.
    expect(createMorpheusPlanStore().get('forged')).toBeUndefined();
  });

  it('take removes the plan so a completed execution cannot be replayed', () => {
    const store = createMorpheusPlanStore();
    store.put(plan('p1'));
    expect(store.take('p1')?.planId).toBe('p1');
    expect(store.take('p1')).toBeUndefined();
    expect(store.get('p1')).toBeUndefined();
  });

  it('expires a plan after its TTL', () => {
    let ms = 1_000_000;
    const store = createMorpheusPlanStore({ now: () => new Date(ms), ttlMs: 60_000 });
    store.put(plan('p1'));
    ms += 59_000;
    expect(store.get('p1')).toBeDefined();
    ms += 2_000;
    expect(store.get('p1')).toBeUndefined();
  });

  it('evicts the oldest plan past the cap', () => {
    const store = createMorpheusPlanStore({ maxPlans: 3 });
    for (const id of ['a', 'b', 'c', 'd']) store.put(plan(id));
    expect(store.get('a')).toBeUndefined();
    expect(store.size()).toBe(3);
    expect(store.get('d')).toBeDefined();
  });

  it('re-storing a plan refreshes its position rather than duplicating it', () => {
    const store = createMorpheusPlanStore({ maxPlans: 2 });
    store.put(plan('a'));
    store.put(plan('b'));
    store.put(plan('a'));
    store.put(plan('c'));
    expect(store.size()).toBe(2);
    expect(store.get('b')).toBeUndefined();
    expect(store.get('a')).toBeDefined();
  });
});
