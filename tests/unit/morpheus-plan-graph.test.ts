import { describe, expect, it } from 'vitest';

import { buildPlanGraph, transitiveDependents } from '@shared/morpheus/plan/graph';
import type { ExecutionStep } from '@shared/morpheus/execution-types';

function step(stepId: string, dependsOn: string[] = []): ExecutionStep {
  return {
    stepId,
    capabilityId: 'system.report',
    params: {},
    summaryKey: 'test',
    dependsOn,
    permission: {
      capabilityId: 'system.report',
      platform: 'win32',
      riskTier: 'low',
      resourceScope: 'runtime',
      mandatoryConfirmation: false,
    },
  };
}

function orderOf(steps: ExecutionStep[]): readonly string[] {
  const result = buildPlanGraph(steps);
  if (!result.ok) throw new Error(`expected a valid graph, got ${JSON.stringify(result.errors)}`);
  return result.order;
}

describe('buildPlanGraph', () => {
  it('orders a linear chain', () => {
    expect(orderOf([step('c', ['b']), step('b', ['a']), step('a')])).toEqual(['a', 'b', 'c']);
  });

  it('places every dependency before its dependent', () => {
    const steps = [
      step('deploy', ['build', 'test']),
      step('test', ['build']),
      step('build', ['checkout']),
      step('checkout'),
      step('notify', ['deploy']),
    ];
    const order = orderOf(steps);
    for (const current of steps) {
      for (const dependency of current.dependsOn) {
        expect(order.indexOf(dependency)).toBeLessThan(order.indexOf(current.stepId));
      }
    }
  });

  it('breaks ties by declaration order so the same plan always runs the same way', () => {
    // Reproducibility is what lets an audit trail be replayed in order.
    expect(orderOf([step('b'), step('a'), step('c')])).toEqual(['b', 'a', 'c']);
    expect(orderOf([step('c'), step('a'), step('b')])).toEqual(['c', 'a', 'b']);
  });

  it('groups genuinely independent steps into one wave', () => {
    const result = buildPlanGraph([step('a'), step('b'), step('c', ['a', 'b'])]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.waves).toEqual([['a', 'b'], ['c']]);
  });

  it('handles an empty plan', () => {
    expect(buildPlanGraph([])).toEqual({ ok: true, order: [], waves: [] });
  });

  it('handles a plan with no dependencies at all', () => {
    const result = buildPlanGraph([step('a'), step('b')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.waves).toEqual([['a', 'b']]);
  });
});

describe('buildPlanGraph rejects plans it cannot order', () => {
  it('rejects a cycle rather than running part of it', () => {
    const result = buildPlanGraph([step('a', ['c']), step('b', ['a']), step('c', ['b'])]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([{ code: 'cycle', stepIds: ['a', 'b', 'c'] }]);
    }
  });

  it('rejects a cycle even when other steps are orderable', () => {
    const result = buildPlanGraph([step('ok'), step('a', ['b']), step('b', ['a'])]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('cycle');
  });

  it('rejects a self-dependency', () => {
    const result = buildPlanGraph([step('a', ['a'])]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([{ code: 'self-dependency', stepId: 'a' }]);
  });

  it('rejects a dependency on a step that does not exist', () => {
    const result = buildPlanGraph([step('a', ['ghost'])]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([{ code: 'unknown-dependency', stepId: 'a', dependsOn: 'ghost' }]);
    }
  });

  it('rejects duplicate step ids', () => {
    const result = buildPlanGraph([step('a'), step('a')]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([{ code: 'duplicate-step', stepId: 'a' }]);
  });

  it('reports every structural problem at once', () => {
    const result = buildPlanGraph([step('a', ['ghost']), step('b', ['b'])]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(2);
  });
});

describe('transitiveDependents', () => {
  it('finds direct and indirect dependents', () => {
    const steps = [step('a'), step('b', ['a']), step('c', ['b']), step('d', ['c']), step('unrelated')];
    expect([...transitiveDependents(steps, 'a')].sort()).toEqual(['b', 'c', 'd']);
    expect([...transitiveDependents(steps, 'c')].sort()).toEqual(['d']);
  });

  it('returns nothing for a leaf', () => {
    const steps = [step('a'), step('b', ['a'])];
    expect([...transitiveDependents(steps, 'b')]).toEqual([]);
  });

  it('follows a diamond without double counting', () => {
    const steps = [step('a'), step('left', ['a']), step('right', ['a']), step('join', ['left', 'right'])];
    expect([...transitiveDependents(steps, 'a')].sort()).toEqual(['join', 'left', 'right']);
  });

  it('terminates on a cyclic graph', () => {
    // buildPlanGraph rejects cycles, but this must not hang if called anyway.
    const steps = [step('a', ['b']), step('b', ['a'])];
    expect([...transitiveDependents(steps, 'a')].sort()).toEqual(['a', 'b']);
  });
});
