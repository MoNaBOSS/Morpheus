import { describe, expect, it } from 'vitest';

import { objectivePassNumber } from '@/pages/CommandCenter/objective-presentation';
import { mergePlanSteps } from '@/pages/CommandCenter/PlanPanel';
import type { ExecutionStep, ExecutionStepResult } from '@shared/morpheus/execution-types';

function step(stepId: string, dependsOn: string[] = []): ExecutionStep {
  return {
    stepId,
    capabilityId: 'file.createText',
    params: { fileName: `${stepId}.txt`, content: 'x' },
    summaryKey: `summary.${stepId}`,
    dependsOn,
    permission: {
      capabilityId: 'file.createText',
      platform: 'win32',
      riskTier: 'medium',
      resourceScope: 'C:\\files',
      mandatoryConfirmation: false,
    },
  };
}

const describeStep = (current: ExecutionStep) => `do ${current.stepId}`;
const describeSkip = (stepId: string) => `blocked by ${stepId}`;

describe('mergePlanSteps', () => {
  it('shows a step with no result as pending, never optimistically done', () => {
    // The plan says what Morpheus intends; only a result says what happened.
    const merged = mergePlanSteps([step('a'), step('b')], [], describeStep, describeSkip);
    expect(merged.map((entry) => entry.status)).toEqual(['pending', 'pending']);
  });

  it('takes status and duration from the result', () => {
    const results: ExecutionStepResult[] = [
      { stepId: 'a', status: 'succeeded', durationMs: 12 },
    ];
    const merged = mergePlanSteps([step('a')], results, describeStep, describeSkip);
    expect(merged[0]).toMatchObject({ status: 'succeeded', durationMs: 12 });
  });

  it('explains a skip by naming the step that failed', () => {
    const results: ExecutionStepResult[] = [
      { stepId: 'a', status: 'failed', error: { code: 'io', message: 'disk full' } },
      { stepId: 'b', status: 'skipped', skippedBecauseOf: 'a' },
    ];
    const merged = mergePlanSteps([step('a'), step('b', ['a'])], results, describeStep, describeSkip);
    expect(merged[0].detail).toBe('disk full');
    expect(merged[1].detail).toBe('blocked by a');
  });

  it('preserves plan order regardless of result order', () => {
    const results: ExecutionStepResult[] = [
      { stepId: 'c', status: 'succeeded' },
      { stepId: 'a', status: 'succeeded' },
      { stepId: 'b', status: 'succeeded' },
    ];
    const merged = mergePlanSteps(
      [step('a'), step('b', ['a']), step('c', ['b'])], results, describeStep, describeSkip,
    );
    expect(merged.map((entry) => entry.stepId)).toEqual(['a', 'b', 'c']);
  });

  it('ignores a result for a step the plan does not contain', () => {
    const results: ExecutionStepResult[] = [{ stepId: 'ghost', status: 'succeeded' }];
    const merged = mergePlanSteps([step('a')], results, describeStep, describeSkip);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('pending');
  });

  it('carries the dependency list through for display', () => {
    const merged = mergePlanSteps([step('b', ['a'])], [], describeStep, describeSkip);
    expect(merged[0].dependsOn).toEqual(['a']);
  });
});

describe('objectivePassNumber', () => {
  it('shows the initial understanding state as pass one', () => {
    expect(objectivePassNumber(0)).toBe(1);
  });

  it('does not offset the one-based execution iteration reported by Main', () => {
    expect(objectivePassNumber(1)).toBe(1);
    expect(objectivePassNumber(2)).toBe(2);
  });
});
