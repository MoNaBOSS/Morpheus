import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Expand, ShieldCheck, Square, X } from 'lucide-react';

import { hostEvents } from '@/lib/host-events';
import { hostApi } from '@/lib/host-api';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { cn } from '@/lib/utils';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { MorpheusVoiceButton } from './MorpheusVoiceButton';
import { MorpheusObjectiveContextPicker } from './MorpheusObjectiveContextPicker';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';
import { MorpheusSignal } from './signal/MorpheusSignal';
import { resolveMorpheusSignalState } from './signal/signal-state';

const PRESENCE_PHASES = ['plan', 'trust', 'execute', 'result'] as const;

export function MorpheusQuickCommand() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const open = useMorpheusQuickCommandStore((state) => state.open);
  const trigger = useMorpheusQuickCommandStore((state) => state.trigger);
  const show = useMorpheusQuickCommandStore((state) => state.show);
  const hide = useMorpheusQuickCommandStore((state) => state.hide);
  const inputRef = useRef<HTMLInputElement>(null);
  const objective = useMorpheusCommandStore((state) => state.input);
  const setObjective = useMorpheusCommandStore((state) => state.setInput);
  const runObjective = useMorpheusCommandStore((state) => state.runObjective);
  const interpreting = useMorpheusCommandStore((state) => state.interpreting);
  const executing = useMorpheusCommandStore((state) => state.executing);
  const plan = useMorpheusCommandStore((state) => state.plan);
  const planResult = useMorpheusCommandStore((state) => state.planResult);
  const unsupported = useMorpheusCommandStore((state) => state.unsupported);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const permission = useMorpheusCommandStore((state) => state.permission);
  const cancelObjective = useMorpheusCommandStore((state) => state.cancelObjective);
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);
  const voicePresence = useMorpheusVoiceStore((state) => state.presence?.state);
  const transcript = useMorpheusVoiceStore((state) => state.transcript);
  const cancelVoice = useMorpheusVoiceStore((state) => state.cancel);

  const voiceBusy = voicePhase === 'requesting' || voicePhase === 'listening' || voicePhase === 'transcribing';
  const objectiveActive = Boolean(objectiveRun && !isObjectiveTerminalState(objectiveRun.state));
  const busy = interpreting || executing || voiceBusy || objectiveActive;
  const compact = trigger !== null;
  const signalState = resolveMorpheusSignalState({
    voicePhase,
    // Opening Presence is itself an active invocation. Project the dormant
    // ambient service as ready without mutating its Main-owned state.
    voicePresence: voicePresence === 'asleep' ? 'armed' : voicePresence,
    objectiveState: objectiveRun?.state,
  });

  useEffect(() => hostEvents.onMorpheusQuickCommand((payload) => show(payload.trigger)), [show]);

  useEffect(() => {
    let active = true;
    void hostApi.morpheus.companionSurfaceStatus().then((status) => {
      if (active && status.mode === 'compact' && status.trigger) show(status.trigger);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [show]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const close = useCallback(async (): Promise<void> => {
    hide();
    if (compact) await hostApi.morpheus.dismissCompanionSurface().catch(() => undefined);
  }, [compact, hide]);

  const expand = async (): Promise<void> => {
    if (compact) await hostApi.morpheus.expandCompanionSurface().catch(() => undefined);
    hide();
    navigate('/');
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (voiceBusy) { cancelVoice(); return; }
      if (!objectiveActive) void close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [cancelVoice, close, objectiveActive, open, voiceBusy]);

  if (!open) return null;

  const stateLabel = voiceBusy
    ? t(`morpheus.voice.states.${voicePhase}`)
    : objectiveRun
      ? t(`morpheus.objective.states.${objectiveRun.state}`)
      : t(`morpheus.signalOs.signal.${signalState}`);
  const interpretation = objectiveRun?.objective
    ?? transcript
    ?? (objective.trim() ? objective : t('morpheus.signalOs.presenceReady'));

  return (
    <div
      data-morpheus
      data-testid="morpheus-quick-command"
      data-presentation={compact ? 'compact-window' : 'overlay'}
      className={cn('fixed inset-0 z-[90000] flex justify-center', compact ? 'items-stretch bg-[hsl(var(--morpheus-surface-1))]' : 'items-start bg-black/65 px-4 pt-[12vh] backdrop-blur-lg')}
      role="dialog"
      aria-modal="true"
      aria-label={t('morpheus.quickCommand.title')}
      onMouseDown={(event) => { if (!compact && event.currentTarget === event.target && !busy) void close(); }}
    >
      <section className={cn('morpheus-presence-surface relative w-full overflow-hidden border border-white/10 bg-[hsl(var(--morpheus-surface-1))] shadow-2xl shadow-black/80', compact ? 'h-full border-0' : 'max-w-[720px] rounded-2xl')}>
        <div aria-hidden className="morpheus-presence-field absolute inset-0" />
        <header className="relative z-10 flex h-12 items-center justify-between border-b border-white/[0.07] px-4">
          <div className="flex items-center gap-2.5"><span className="font-serif text-xs tracking-[0.2em]">{t('morpheus.title')}</span><span className="h-1 w-1 rounded-full bg-[hsl(var(--morpheus-accent))]" /><span data-testid="quick-command-live-state" className="text-[9px] uppercase tracking-[0.17em] text-muted-foreground">{stateLabel}</span></div>
          <div className="flex items-center gap-1">
            <button type="button" data-testid="quick-command-expand" aria-label={t('morpheus.quickCommand.openCommandCenter')} onClick={() => void expand()} className="rounded p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"><Expand className="h-3.5 w-3.5" /></button>
            <button type="button" data-testid="quick-command-close" aria-label={t('morpheus.quickCommand.close')} disabled={busy} onClick={() => void close()} className="rounded p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
          </div>
        </header>

        <div className="relative z-10 grid grid-cols-[150px_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center border-r border-white/[0.07] px-4 py-5">
            <MorpheusSignal state={signalState} className="h-24 w-24 text-[hsl(var(--morpheus-accent))]" label={t(`morpheus.signalOs.signal.${signalState}`)} />
            <span className="mt-2 text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--morpheus-accent))]">{stateLabel}</span>
            {voicePhase === 'listening' || voicePresence === 'listening' ? <span className="mt-3 flex items-center gap-1.5 text-[8px] uppercase tracking-[0.12em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--morpheus-danger))]" />{t('morpheus.signalOs.microphoneVisible')}</span> : null}
          </div>

          <div className="min-w-0 px-5 py-4">
            <div className="flex items-center justify-between gap-4"><p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.signalOs.interpretation')}</p><MorpheusObjectiveContextPicker className="max-w-[260px]" /></div>
            <p data-testid="quick-command-objective-state" className="mt-3 line-clamp-2 font-serif text-xl leading-snug text-foreground">
              {objectiveRun ? <span className="sr-only">{t('morpheus.quickCommand.objectiveState', { objective: objectiveRun.objective, state: t(`morpheus.objective.states.${objectiveRun.state}`) })}</span> : null}
              <span data-testid="quick-command-transcript">{interpretation}</span>
            </p>
            <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
              {objectiveRun?.summary ?? objectiveRun?.plannerNotice ?? (objectiveRun ? t('morpheus.signalOs.handlingObjective') : t('morpheus.signalOs.presenceHint'))}
            </p>

            <div className="mt-4 grid grid-cols-4 border-t border-white/[0.07] pt-3" data-testid="quick-command-status">
              <span className="sr-only">{stateLabel}</span>
              {PRESENCE_PHASES.map((phase, index) => (
                <div key={phase} className="flex items-center gap-2 text-[8px] uppercase tracking-[0.12em] text-muted-foreground"><span className={cn('h-1.5 w-1.5 rounded-full border', index === 0 && busy ? 'border-[hsl(var(--morpheus-accent))] bg-[hsl(var(--morpheus-accent))]' : 'border-white/20')} />{t(`morpheus.signalOs.presencePhases.${phase}`)}</div>
              ))}
            </div>
          </div>
        </div>

        <form className="relative z-10 flex items-center gap-2 border-t border-white/[0.07] px-4 py-3" onSubmit={(event) => { event.preventDefault(); if (!objective.trim() || busy) return; void runObjective(objective, 'quick-command'); }}>
          <input ref={inputRef} data-testid="quick-command-input" value={objective} disabled={busy} onChange={(event) => setObjective(event.target.value)} placeholder={t('morpheus.signalOs.commandPlaceholder')} className="h-11 min-w-0 flex-1 border-b border-white/15 bg-transparent px-1 font-serif text-base text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-[hsl(var(--morpheus-accent-dim))]" />
          <MorpheusVoiceButton source="quick-command" className="h-10 w-10 rounded-full" />
          {objectiveActive ? <button type="button" data-testid="quick-command-cancel-objective" aria-label={t('morpheus.signalOs.stop')} onClick={() => void cancelObjective()} className="flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--morpheus-danger))]/35 text-[hsl(var(--morpheus-danger))]"><Square className="h-3.5 w-3.5 fill-current" /></button> : <button type="submit" data-testid="quick-command-submit" aria-label={t('morpheus.command.run')} disabled={!objective.trim() || busy} className="flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--morpheus-accent-dim))] text-[hsl(var(--morpheus-accent))] disabled:border-white/10 disabled:text-muted-foreground/30"><ArrowRight className="h-4 w-4" /></button>}
        </form>

        <footer className="relative z-10 flex h-8 items-center justify-between border-t border-white/[0.05] px-4 text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" />{permission ? t('morpheus.signalOs.trustProfile', { profile: t(`morpheus.permission.profiles.${permission.profile}.name`) }) : t('morpheus.permission.loading')}</span>
          <span>{objectiveRun?.route ? <span data-testid="quick-command-route" className="mr-3">{t(`morpheus.missions.routes.${objectiveRun.route.kind}`)}</span> : null}{unsupported ? t('morpheus.quickCommand.unsupported') : planResult ? t('morpheus.quickCommand.finished', { status: planResult.status }) : plan ? t('morpheus.quickCommand.executing', { objective: plan.objective }) : t('morpheus.quickCommand.sameCore')}</span>
        </footer>
      </section>
    </div>
  );
}
