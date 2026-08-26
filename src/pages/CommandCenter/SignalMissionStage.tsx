import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Check, Circle, FileText, Pause, RotateCcw, Square } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { isObjectiveTerminalState, type MorpheusSystemState } from '@shared/morpheus/core/objective-types';
import type { ExecutionArtifact, ExecutionStepStatus } from '@shared/morpheus/execution-types';
import { MorpheusSignal } from '@/components/morpheus/signal/MorpheusSignal';
import { resolveMorpheusSignalState } from '@/components/morpheus/signal/signal-state';

const PHASES = ['understand', 'plan', 'act', 'verify', 'deliver'] as const;
type MissionPhase = typeof PHASES[number];

function activePhaseFor(state?: MorpheusSystemState): MissionPhase {
  if (!state || state === 'ready' || state === 'listening' || state === 'understanding') return 'understand';
  if (state === 'planning' || state === 'replanning') return 'plan';
  if (state === 'waiting-for-approval' || state === 'executing') return 'act';
  if (state === 'observing') return 'verify';
  return 'deliver';
}

function phasePosition(phase: MissionPhase): number {
  return PHASES.indexOf(phase);
}

function stepTone(status: ExecutionStepStatus | undefined): string {
  if (status === 'succeeded') return 'text-[hsl(var(--morpheus-accent))]';
  if (status === 'failed' || status === 'denied') return 'text-[hsl(var(--morpheus-danger))]';
  return 'text-muted-foreground';
}

function artifactLabel(artifact: ExecutionArtifact): string {
  if (artifact.kind === 'file') return artifact.path;
  if (artifact.kind === 'process') return artifact.executablePath;
  if (artifact.kind === 'website') return artifact.entryPath;
  if (artifact.kind === 'schedule') return artifact.nextRunAt ?? artifact.scheduleId;
  if (typeof artifact.data.platform === 'string') {
    return `${artifact.data.platform} ${artifact.data.release ?? ''}`.trim();
  }
  const first = Object.entries(artifact.data)[0];
  return first ? `${first[0]}: ${first[1]}` : artifact.artifactId;
}

export function SignalMissionStage() {
  const { t } = useTranslation('dashboard');
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const plan = useMorpheusCommandStore((state) => state.plan);
  const planResult = useMorpheusCommandStore((state) => state.planResult);
  const cancelObjective = useMorpheusCommandStore((state) => state.cancelObjective);
  const missions = useMorpheusCompanionStore((state) => state.missions);
  const rerunMission = useMorpheusCompanionStore((state) => state.rerunMission);
  const activeMission = missions.activeMissionId ? missions.missionsById[missions.activeMissionId] : null;
  const objective = objectiveRun?.objective ?? activeMission?.objective ?? null;
  const activePhase = activePhaseFor(objectiveRun?.state);
  const activePosition = phasePosition(activePhase);
  const terminal = objectiveRun ? isObjectiveTerminalState(objectiveRun.state) : true;
  const artifacts = objectiveRun?.artifacts ?? activeMission?.artifacts ?? [];
  const resultByStep = new Map(planResult?.steps.map((step) => [step.stepId, step]) ?? []);
  const latestTimingByStage = new Map(objectiveRun?.timings?.map((timing) => [timing.stage, timing]) ?? []);
  const signalState = resolveMorpheusSignalState({ objectiveState: objectiveRun?.state });

  if (!objective) {
    return (
      <section data-testid="command-center-plan" className="signal-mission-stage signal-mission-stage-idle flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
        <MorpheusSignal state="ready" className="h-40 w-40 text-foreground/70" label={t('morpheus.signalOs.signal.ready')} />
        <p className="mt-5 text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.signalOs.ready')}</p>
        <h2 className="mt-3 max-w-2xl font-serif text-3xl font-normal tracking-tight text-foreground">{t('morpheus.signalOs.idleTitle')}</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{t('morpheus.signalOs.idleBody')}</p>
        <div className="mt-8 grid w-full max-w-2xl grid-cols-5 gap-2" data-testid="signal-mission-phases">
          {PHASES.map((phase, index) => (
            <div key={phase} className="border-t border-white/10 pt-2 text-left">
              <span className="font-mono text-[9px] text-muted-foreground/60">0{index + 1}</span>
              <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{t(`morpheus.signalOs.phases.${phase}`)}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section data-testid="command-center-plan" className="signal-mission-stage flex min-h-0 flex-1 flex-col px-5 pb-4 pt-3">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.signalOs.activeMission')}</p>
          <h2 data-testid="signal-mission-objective" className="mt-2 line-clamp-2 font-serif text-2xl font-normal leading-tight tracking-tight text-foreground"><span data-testid="command-center-mission">{objective}</span></h2>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="command-center-objective-state">
            {objectiveRun ? t(`morpheus.objective.states.${objectiveRun.state}`) : t(`morpheus.missions.status.${activeMission?.status ?? 'completed'}`)}
            {objectiveRun?.plannerNotice ? ` · ${objectiveRun.plannerNotice}` : ''}
          </p>
        </div>
        <MorpheusSignal state={signalState} compact className="h-20 w-20 shrink-0 text-[hsl(var(--morpheus-accent))]" label={t(`morpheus.signalOs.signal.${signalState}`)} />
      </div>

      <ol className="mt-5 grid grid-cols-5" data-testid="signal-mission-phases">
        {PHASES.map((phase, index) => {
          const complete = objectiveRun?.state === 'complete' || index < activePosition;
          const active = index === activePosition && objectiveRun?.state !== 'complete';
          return (
            <li key={phase} data-phase={phase} data-active={active ? 'true' : 'false'} className="relative border-t border-white/10 pt-3">
              <span className={cn('absolute -top-1 left-0 h-2 w-2 rounded-full border bg-[hsl(var(--morpheus-surface-1))]', complete || active ? 'border-[hsl(var(--morpheus-accent))]' : 'border-white/20', active && 'shadow-[0_0_14px_hsl(var(--morpheus-glow))]')} />
              <span className={cn('text-[9px] uppercase tracking-[0.13em]', active ? 'text-[hsl(var(--morpheus-accent))]' : complete ? 'text-foreground/75' : 'text-muted-foreground/50')}>{t(`morpheus.signalOs.phases.${phase}`)}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_220px] gap-5 border-t border-white/[0.07] pt-4">
        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.signalOs.currentWork')}</p>
            <span data-testid="plan-status" className="font-mono text-[9px] text-muted-foreground">{planResult?.status ?? plan?.status ?? objectiveRun?.state}</span>
          </div>

          {plan?.steps.length ? (
            <ol data-testid="plan-timeline" className="mt-2 divide-y divide-white/[0.06]">
              {plan.steps.map((step, index) => {
                const result = resultByStep.get(step.stepId);
                return (
                  <li
                    key={step.stepId}
                    data-testid="morpheus-run-card"
                    data-step-testid={`plan-step-${step.stepId}`}
                    data-status={result?.status ?? 'pending'}
                    data-phase={result?.status ?? 'pending'}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 font-mono text-[9px]', stepTone(result?.status))}>
                      {result?.status === 'succeeded' ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground/90">{t(step.summaryKey, { ...step.summaryValues, defaultValue: step.capabilityId })}</p>
                      <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">{step.capabilityId}{result?.durationMs ? ` · ${result.durationMs}ms` : ''}</p>
                      {result?.error?.message ? <p className="mt-1 text-[10px] text-[hsl(var(--morpheus-danger))]">{result.error.message}</p> : null}
                    </div>
                    <Circle className={cn('mt-1 h-3 w-3 shrink-0', stepTone(result?.status))} />
                  </li>
                );
              })}
            </ol>
          ) : (
            <div data-testid="plan-timeline" className="mt-4 border-l border-[hsl(var(--morpheus-accent-dim))] pl-4">
              <p className="text-sm text-foreground/85">{objectiveRun?.clarification ?? objectiveRun?.error?.message ?? objectiveRun?.summary ?? t('morpheus.signalOs.interpreting')}</p>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            {objectiveRun && !terminal ? (
              <button type="button" data-testid="plan-cancel-objective" onClick={() => void cancelObjective()} className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--morpheus-danger))]/35 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--morpheus-danger))] hover:bg-[hsl(var(--morpheus-danger))]/8"><Square className="h-3 w-3 fill-current" />{t('morpheus.signalOs.stop')}</button>
            ) : activeMission ? (
              <button type="button" data-testid="signal-mission-rerun" onClick={() => void rerunMission(activeMission.missionId)} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"><RotateCcw className="h-3 w-3" />{t('morpheus.signalOs.runAgain')}</button>
            ) : null}
            <Link to="/missions" className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">{t('morpheus.signalOs.inspect')}<ArrowUpRight className="h-3 w-3" /></Link>
          </div>
        </div>

        <aside className="border-l border-white/[0.07] pl-4" data-testid="signal-mission-results">
          <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.signalOs.result')}</p>
          <p data-testid="command-center-objective-summary" className="mt-2 text-xs leading-relaxed text-foreground/80">{objectiveRun?.summary ?? activeMission?.summary ?? t('morpheus.signalOs.resultPending')}</p>
          {latestTimingByStage.size > 0 ? (
            <div className="mt-5" data-testid="signal-mission-timing">
              <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{t('morpheus.signalOs.performance')}</p>
              <dl className="mt-2 space-y-1 font-mono text-[9px] text-foreground/65">
                {(['planning', 'execution', 'review'] as const).map((stage) => {
                  const timing = latestTimingByStage.get(stage);
                  return timing ? (
                    <div key={stage} className="flex items-center justify-between gap-3">
                      <dt>{t(`morpheus.signalOs.timing.${stage}`)}</dt>
                      <dd>{formatDuration(timing.durationMs)}</dd>
                    </div>
                  ) : null;
                })}
              </dl>
            </div>
          ) : null}
          <div className="mt-5">
            <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{t('morpheus.signalOs.artifacts')}</p>
            {artifacts.length ? (
              <ul className="mt-2 space-y-2">
                {artifacts.slice(0, 3).map((artifact) => (
                  <li
                    key={artifact.artifactId}
                    data-testid="morpheus-artifact"
                    data-kind={artifact.kind}
                    className="flex items-start gap-2 border-t border-white/[0.06] pt-2 text-[10px] text-foreground/75"
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--morpheus-accent))]" />
                    <span className="min-w-0 truncate font-mono">{artifactLabel(artifact)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-[10px] text-muted-foreground">{t('morpheus.signalOs.noArtifacts')}</p>}
          </div>
          {!terminal ? <div className="mt-5 flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--morpheus-accent))]"><Pause className="h-3 w-3" />{t('morpheus.signalOs.observable')}</div> : null}
        </aside>
      </div>
    </section>
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}
