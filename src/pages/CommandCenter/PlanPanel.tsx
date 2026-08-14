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

import { Panel, PlanTimeline, RiskBadge, StatusDot, type PlanTimelineStep, type StatusTone } from '@/components/morpheus/ui';
import { cn } from '@/lib/utils';
import { objectivePassNumber } from '@/pages/CommandCenter/objective-presentation';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import type { ExecutionStep, ExecutionStepResult } from '@shared/morpheus/execution-types';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';

import { ExecutionReadiness } from './ExecutionReadiness';

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

export function PlanPanel({ className }: { className?: string }) {
  const { t } = useTranslation('dashboard');
  const plan = useMorpheusCommandStore((state) => state.plan);
  const planResult = useMorpheusCommandStore((state) => state.planResult);
  const executing = useMorpheusCommandStore((state) => state.executing);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const cancelObjective = useMorpheusCommandStore((state) => state.cancelObjective);

  if (!plan) {
    if (objectiveRun) {
      const terminal = isObjectiveTerminalState(objectiveRun.state);
      const tone: StatusTone = objectiveRun.state === 'complete'
        ? 'ok'
        : objectiveRun.state === 'error' || objectiveRun.state === 'degraded'
          ? 'error'
          : objectiveRun.state === 'needs-clarification' || objectiveRun.state === 'waiting-for-approval'
            ? 'warn'
            : 'running';
      const detail = objectiveRun.clarification
        ?? objectiveRun.error?.message
        ?? objectiveRun.plannerNotice
        ?? (terminal ? t('morpheus.plan.noExecutablePlan') : t('morpheus.plan.liveBody'));
      return (
        <Panel
          title={t('morpheus.plan.title')}
          description={objectiveRun.objective}
          testId="command-center-plan"
          className={cn('flex min-h-0 flex-col', className)}
          actions={<StatusDot tone={tone} label={t(`morpheus.objective.states.${objectiveRun.state}`)} />}
        >
          <div data-testid="plan-timeline" className="flex min-h-0 flex-1 flex-col justify-center px-2">
            <div className="rounded-xl border border-border/60 bg-[hsl(var(--morpheus-surface-3))]/55 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.plan.objectiveCore')}</p>
                  <p className="mt-2 text-sm text-foreground/90">{detail}</p>
                </div>
                {!terminal ? (
                  <button type="button" data-testid="plan-cancel-objective" onClick={() => void cancelObjective()} className="shrink-0 rounded border border-[hsl(var(--morpheus-danger))]/35 px-2.5 py-1.5 text-2xs text-[hsl(var(--morpheus-danger))] hover:bg-[hsl(var(--morpheus-danger))]/8">
                    {t('morpheus.quickCommand.stop')}
                  </button>
                ) : null}
              </div>
              {!terminal ? <div className="mt-4 h-px overflow-hidden bg-border"><div className="h-full w-1/3 bg-[hsl(var(--morpheus-accent))] motion-safe:animate-pulse" /></div> : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] text-muted-foreground">
                <span>{objectiveRun.route ? t(`morpheus.missions.routes.${objectiveRun.route.kind}`) : t('morpheus.objective.plannerAutomatic')}</span>
                {objectiveRun.modelId ? <span>{objectiveRun.modelId}</span> : null}
                <span>{t('morpheus.objective.iteration', { current: objectivePassNumber(objectiveRun.iteration) })}</span>
              </div>
            </div>
            <div className="mt-4"><ExecutionReadiness /></div>
          </div>
        </Panel>
      );
    }
    return (
      <Panel
        title={t('morpheus.plan.title')}
        description={t('morpheus.plan.description')}
        testId="command-center-plan"
        className={cn('flex min-h-0 flex-col', className)}
      >
        <div className="flex min-h-0 flex-1 flex-col justify-center px-2" data-testid="plan-timeline">
          <StatusDot tone="ok" label={t('morpheus.plan.readyTitle')} />
          <p className="mt-2 max-w-md text-tiny leading-relaxed text-foreground/80">
            {t('morpheus.plan.readyBody')}
          </p>
          <ol className="mt-4 grid grid-cols-4 gap-1.5">
            {(['objective', 'plan', 'trust', 'execute'] as const).map((stage, index) => (
              <li key={stage} className="rounded-lg border border-border/55 bg-[hsl(var(--morpheus-surface-3))]/50 px-2 py-2">
                <span className="font-mono text-[9px] text-[hsl(var(--morpheus-accent))]">0{index + 1}</span>
                <p className="mt-1 text-2xs text-foreground/75">{t(`morpheus.plan.flow.${stage}`)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 max-w-xl">
            <ExecutionReadiness />
          </div>
        </div>
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
  const settled = steps.filter((step) => step.status !== 'pending' && step.status !== 'running').length;
  const progress = steps.length > 0 ? Math.round((settled / steps.length) * 100) : 0;
  const objectiveTone: StatusTone = objectiveRun?.state === 'complete'
    ? 'ok'
    : objectiveRun?.state === 'error' || objectiveRun?.state === 'degraded'
      ? 'error'
      : objectiveRun?.state === 'needs-clarification' || objectiveRun?.state === 'waiting-for-approval'
        ? 'warn'
        : executing ? 'running' : 'idle';

  return (
    <Panel
      title={t('morpheus.plan.title')}
      description={plan.objective}
      testId="command-center-plan"
      className={cn('flex min-h-0 flex-col', className)}
      actions={(
        <>
          <RiskBadge tier={highestTier} testId="plan-risk" />
          <span data-testid="plan-status" className="text-2xs text-muted-foreground">{status}</span>
        </>
      )}
    >
      {objectiveRun ? (
        <div data-testid="command-center-objective" className="mb-2.5 rounded-lg border border-border/55 bg-[hsl(var(--morpheus-surface-3))]/55 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <StatusDot
              tone={objectiveTone}
              label={t(`morpheus.objective.states.${objectiveRun.state}`)}
              testId="command-center-objective-state"
            />
            <span data-testid="command-center-objective-iteration" className="font-mono text-[9px] text-muted-foreground">
              {t('morpheus.objective.iteration', { current: objectivePassNumber(objectiveRun.iteration) })}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/60" aria-label={t('morpheus.objective.progress')}>
            <div
              data-testid="command-center-objective-progress"
              className="h-full rounded-full bg-[hsl(var(--morpheus-accent))] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-3 text-[9px] text-muted-foreground">
            <span className="truncate">{objectiveRun.plannerId ?? t('morpheus.objective.plannerAutomatic')}</span>
            {objectiveRun.modelId ? <span className="truncate font-mono">{objectiveRun.modelId}</span> : null}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <PlanTimeline steps={steps} emptyMessage={t('morpheus.plan.empty')} testId="plan-timeline" />
      </div>
      {planResult?.rejection && (
        <p data-testid="plan-rejection" className="mt-2 px-2.5 text-2xs text-[hsl(var(--morpheus-danger))]">
          {planResult.rejection.message}
        </p>
      )}
      {objectiveRun?.summary ? (
        <p data-testid="command-center-objective-summary" className="mt-2 border-l border-[hsl(var(--morpheus-accent-dim))] pl-2 text-2xs text-foreground/75">
          {objectiveRun.summary}
        </p>
      ) : null}
    </Panel>
  );
}

const RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;
