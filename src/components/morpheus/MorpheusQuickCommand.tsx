import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Command, Expand, Mic, Orbit, Square, X } from 'lucide-react';

import morpheusLogo from '@/assets/morpheus-logo.svg';
import { hostEvents } from '@/lib/host-events';
import { hostApi } from '@/lib/host-api';
import { Button } from '@/components/ui/button';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { cn } from '@/lib/utils';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { MorpheusVoiceButton } from './MorpheusVoiceButton';
import { MorpheusObjectiveContextPicker } from './MorpheusObjectiveContextPicker';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';

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
  const cancelObjective = useMorpheusCommandStore((state) => state.cancelObjective);
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);
  const transcript = useMorpheusVoiceStore((state) => state.transcript);
  const cancelVoice = useMorpheusVoiceStore((state) => state.cancel);

  const voiceBusy = voicePhase === 'requesting' || voicePhase === 'listening' || voicePhase === 'transcribing';
  const objectiveActive = Boolean(objectiveRun && !isObjectiveTerminalState(objectiveRun.state));
  const busy = interpreting || executing || voiceBusy || objectiveActive;
  const compact = trigger !== null;

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
      if (voiceBusy) {
        cancelVoice();
        return;
      }
      if (!objectiveActive) void close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [cancelVoice, close, objectiveActive, open, voiceBusy]);

  if (!open) return null;

  const phaseLabel = voiceBusy
    ? t(`morpheus.voice.states.${voicePhase}`)
    : objectiveRun
      ? t(`morpheus.objective.states.${objectiveRun.state}`)
      : t('morpheus.quickCommand.awaiting');

  return (
    <div
      data-morpheus
      data-testid="morpheus-quick-command"
      data-presentation={compact ? 'compact-window' : 'overlay'}
      className={cn(
        'fixed inset-0 z-[90000] flex justify-center',
        compact
          ? 'items-stretch bg-[hsl(var(--morpheus-surface-1))] p-0'
          : 'items-start bg-black/55 px-4 pt-[10vh] backdrop-blur-md',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={t('morpheus.quickCommand.title')}
      onMouseDown={(event) => {
        if (!compact && event.currentTarget === event.target && !busy) void close();
      }}
    >
      <section className={cn(
        'morpheus-companion-console relative w-full overflow-hidden border border-white/10 bg-[hsl(var(--morpheus-surface-2))] shadow-2xl shadow-black/70',
        compact ? 'h-full border-0' : 'max-w-3xl rounded-2xl',
      )}>
        <div aria-hidden className="morpheus-companion-console-grid absolute inset-0" />
        <header className="relative z-10 flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="morpheus-mark-frame flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/8">
              <img src={morpheusLogo} alt="" className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="font-serif text-xs tracking-[0.16em]">{t('morpheus.title')}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full', busy ? 'bg-[hsl(var(--morpheus-accent))] motion-safe:animate-pulse' : 'bg-muted-foreground/50')} />
                <span data-testid="quick-command-live-state">{phaseLabel}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!compact ? <kbd className="rounded border border-border bg-[hsl(var(--morpheus-surface-3))] px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">Ctrl Shift Space</kbd> : null}
            <button type="button" data-testid="quick-command-expand" aria-label={t('morpheus.quickCommand.openCommandCenter')} onClick={() => void expand()} className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"><Expand className="h-4 w-4" /></button>
            <button type="button" data-testid="quick-command-close" aria-label={t('morpheus.quickCommand.close')} disabled={busy} onClick={() => void close()} className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="relative z-10 grid min-h-0 grid-cols-[1fr_auto] border-b border-border/50 px-5 py-2.5">
          <MorpheusObjectiveContextPicker className="min-w-0" />
          <span className="hidden items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground sm:flex"><Command className="h-3 w-3" />{t('morpheus.quickCommand.sameCore')}</span>
        </div>

        <form
          className="relative z-10 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!objective.trim() || busy) return;
            void runObjective(objective, 'quick-command');
          }}
        >
          <div className={cn(
            'morpheus-companion-input flex items-center gap-3 rounded-xl border bg-[hsl(var(--morpheus-surface-1))]/90 px-4 focus-within:border-[hsl(var(--morpheus-accent-dim))]',
            voicePhase === 'listening' ? 'border-[hsl(var(--morpheus-accent-dim))]' : 'border-border/70',
          )}>
            {voicePhase === 'listening' ? (
              <div className="flex h-12 w-8 items-center justify-center gap-0.5" aria-hidden>
                {[0, 1, 2, 3, 4].map((bar) => <span key={bar} className="morpheus-voice-bar w-0.5 rounded-full bg-[hsl(var(--morpheus-accent))]" style={{ animationDelay: `${bar * 85}ms` }} />)}
              </div>
            ) : <Orbit className="h-4 w-4 shrink-0 text-[hsl(var(--morpheus-accent))]" aria-hidden />}
            <input
              ref={inputRef}
              data-testid="quick-command-input"
              value={objective}
              disabled={busy}
              onChange={(event) => setObjective(event.target.value)}
              placeholder={t('morpheus.quickCommand.placeholder')}
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <MorpheusVoiceButton source="quick-command" className="h-10 w-10 rounded-full" />
            <button type="submit" data-testid="quick-command-submit" disabled={!objective.trim() || busy} className={cn('flex h-10 w-10 items-center justify-center rounded-full border transition-colors', objective.trim() && !busy ? 'border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 text-[hsl(var(--morpheus-accent))]' : 'border-border text-muted-foreground/30')}><ArrowRight className="h-4 w-4" /></button>
          </div>

          <div className="mt-3 flex min-h-8 items-center justify-between gap-4 px-1 text-2xs text-muted-foreground" data-testid="quick-command-status">
            <div className="min-w-0">
              {transcript && voicePhase === 'ready' ? <span className="truncate" data-testid="quick-command-transcript">“{transcript}”</span> : null}
              {objectiveRun ? <span data-testid="quick-command-objective-state">{t('morpheus.quickCommand.objectiveState', { objective: objectiveRun.objective, state: t(`morpheus.objective.states.${objectiveRun.state}`) })}</span> : null}
              {!objectiveRun && interpreting ? t('morpheus.quickCommand.planning') : null}
              {!objectiveRun && executing ? t('morpheus.quickCommand.executing', { objective: plan?.objective ?? '' }) : null}
              {!objectiveRun && !busy && planResult ? t('morpheus.quickCommand.finished', { status: planResult.status }) : null}
              {!busy && unsupported ? t('morpheus.quickCommand.unsupported') : null}
              {!busy && !objectiveRun && !planResult && !unsupported && !transcript ? t('morpheus.quickCommand.hint') : null}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {objectiveRun?.route ? <span data-testid="quick-command-route" className="hidden uppercase tracking-[0.12em] sm:inline">{t(`morpheus.missions.routes.${objectiveRun.route.kind}`)}</span> : null}
              {objectiveActive ? (
                <Button type="button" variant="ghost" size="sm" data-testid="quick-command-cancel-objective" onClick={() => void cancelObjective()} className="h-7 shrink-0 gap-1.5 text-2xs text-[hsl(var(--morpheus-danger))] hover:bg-[hsl(var(--morpheus-danger))]/10"><Square className="h-3 w-3 fill-current" />{t('morpheus.quickCommand.stop')}</Button>
              ) : null}
            </div>
          </div>

          {compact ? (
            <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-3 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="flex items-center gap-2"><Mic className="h-3 w-3" />{t('morpheus.quickCommand.voiceHint')}</span>
              <button type="button" onClick={() => void expand()} className="text-[hsl(var(--morpheus-accent))] hover:underline">{t('morpheus.quickCommand.openCommandCenter')}</button>
            </div>
          ) : null}
        </form>
      </section>
    </div>
  );
}
