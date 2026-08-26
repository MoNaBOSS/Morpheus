import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OBJECTIVE_LIMITS,
  isObjectiveTerminalState,
} from '@shared/morpheus/core/objective-types';

describe('Morpheus objective contracts', () => {
  it('keeps active and terminal runtime states distinct', () => {
    expect(isObjectiveTerminalState('planning')).toBe(false);
    expect(isObjectiveTerminalState('replanning')).toBe(false);
    expect(isObjectiveTerminalState('complete')).toBe(true);
    expect(isObjectiveTerminalState('needs-clarification')).toBe(true);
    expect(isObjectiveTerminalState('cancelled')).toBe(true);
  });

  it('ships conservative finite autonomy limits', () => {
    expect(DEFAULT_OBJECTIVE_LIMITS).toEqual({
      maxIterations: 3,
      maxStepsPerPlan: 12,
      maxTotalSteps: 24,
      maxDurationMs: 900_000,
      providerTimeoutMs: 60_000,
      providerMaxAttempts: 2,
    });
    expect(Object.isFrozen(DEFAULT_OBJECTIVE_LIMITS)).toBe(true);
  });
});
