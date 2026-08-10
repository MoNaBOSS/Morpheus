import { describe, expect, it, vi } from 'vitest';

import { createDeterministicMorpheusPlanner } from '@shared/morpheus/interpreter/deterministic-planner';
import type { MorpheusPlanningRequest } from '@shared/morpheus/planner';

const REQUEST: MorpheusPlanningRequest = {
  objective: 'Show system information',
  origin: { type: 'command-bar', commandText: 'Show system information' },
  platform: 'win32',
  filesRoot: 'C:\\Morpheus\\files',
};

describe('MorpheusPlanner boundary', () => {
  it('adapts the deterministic interpreter to the provider-neutral contract', async () => {
    const planner = createDeterministicMorpheusPlanner({
      now: () => new Date('2026-08-10T00:00:00.000Z'),
      createId: () => 'plan-deterministic',
    });

    const result = await planner.plan(REQUEST);

    expect(planner).toMatchObject({
      plannerId: 'deterministic-v1',
      plannedBy: 'deterministic',
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        planId: 'plan-deterministic',
        plannedBy: 'deterministic',
        steps: [{ capabilityId: 'system.report' }],
      },
    });
  });

  it('is frozen so runtime code cannot replace the selected adapter methods', () => {
    const planner = createDeterministicMorpheusPlanner();
    expect(Object.isFrozen(planner)).toBe(true);
    expect(() => Object.assign(planner, { plan: vi.fn() })).toThrow();
  });
});
