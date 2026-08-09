/**
 * The typed execution plan and its per-step outcome.
 *
 * This panel is the visible half of the 0.5 plan executor. 0.1.1 interpreted a
 * command into a plan and then quietly ran only its first step, so the
 * interface could not have shown the plan honestly even if it had tried. Now
 * Main orders, evaluates and executes the whole plan, and this reports exactly
 * what it did — including steps that were skipped because a prerequisite
 * failed, which are distinct from steps that failed.
 */
import { useTranslation } from 'react-i18next';

import { Panel, PlanTimeline, RiskBadge, type PlanTimelineStep } from '@/components/morpheus/ui';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import type { ExecutionStep, ExecutionStepResult } from '@shared/morpheus/execution-types';

/**
 * Merges the plan's declared steps with whatever outcome Main reported.
 *
 * The plan is the source of order and summary; the result is the source of
 * truth about what happened. A step with no result yet is `pending` — never
 * optimistically shown as done.
 */
export function mergePlanSteps(
  steps: readonly ExecutionStep[],
  results: readonly ExecutionStepResult[],
  describe: (step: ExecutionStep) => string,
  describeSkip: (stepId: string) => string,
): PlanTimelineStep[] {
  const byId = new Map(results.map((result) => [result.stepId, result]));
  return steps.map((step) => {
    const result = byId.get(step.stepId);
    return {
      stepId: step.stepId,
      status: result?.status ?? 'pending',
      summary: describe(step),
      dependsOn: step.dependsOn,
      durationMs: result?.durationMs,
      detail: result?.skippedBecauseOf
        ? describeSkip(result.skippedBecauseOf)
        : result?.error?.message,
    };
  });
}

export function PlanPanel() {
  const { t } = useTranslation('dashboard');
  const plan = useMorpheusCommandStore((state) => state.plan);
  const planResult = useMorpheusCommandStore((state) => state.planResult);
  const executing = useMorpheusCommandStore((state) => state.executing);

  if (!plan) {
    return (
      <Panel
        title={t('morpheus.plan.title')}
        description={t('morpheus.plan.description')}
        testId="command-center-plan"
      >
        <PlanTimeline steps={[]} emptyMessage={t('morpheus.plan.empty')} testId="plan-timeline" />
      </Panel>
    );
  }

  const steps = mergePlanSteps(
    plan.steps,
    planResult?.steps ?? [],
    (step) => t(step.summaryKey, { ...step.summaryValues, defaultValue: step.capabilityId }),
    (stepId) => t('morpheus.plan.skippedBecause', { stepId }),
  );

  // While executing, the plan's own status is not yet meaningful; say what is
  // actually happening instead of showing a stale "draft".
  const status = executing
    ? t('morpheus.plan.executing')
    : t(`morpheus.plan.status.${planResult?.status ?? plan.status}`, {
      defaultValue: planResult?.status ?? plan.status,
    });

  const highestTier = plan.steps.reduce<ExecutionStep['permission']['riskTier']>(
    (worst, step) => (RANK[step.permission.riskTier] > RANK[worst] ? step.permission.riskTier : worst),
    'low',
  );

  return (
    <Panel
      title={t('morpheus.plan.title')}
      description={plan.objective}
      testId="command-center-plan"
      actions={(
        <>
          <RiskBadge tier={highestTier} testId="plan-risk" />
          <span data-testid="plan-status" className="text-2xs text-muted-foreground">{status}</span>
        </>
      )}
    >
      <PlanTimeline steps={steps} emptyMessage={t('morpheus.plan.empty')} testId="plan-timeline" />
      {planResult?.rejection && (
        <p data-testid="plan-rejection" className="mt-2 px-2.5 text-2xs text-[hsl(var(--morpheus-danger))]">
          {planResult.rejection.message}
        </p>
      )}
    </Panel>
  );
}

const RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;
