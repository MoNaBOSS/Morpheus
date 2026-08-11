import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Command, Square, X } from 'lucide-react';

import { hostEvents } from '@/lib/host-events';
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
  const open = useMorpheusQuickCommandStore((state) => state.open);
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
  const cancelVoice = useMorpheusVoiceStore((state) => state.cancel);

  const voiceBusy = voicePhase === 'requesting' || voicePhase === 'listening' || voicePhase === 'transcribing';
  const objectiveActive = Boolean(objectiveRun && !isObjectiveTerminalState(objectiveRun.state));
  const busy = interpreting || executing || voiceBusy || objectiveActive;

  useEffect(() => hostEvents.onMorpheusQuickCommand(show), [show]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (voiceBusy) {
        cancelVoice();
        return;
      }
      if (!objectiveActive) hide();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [cancelVoice, hide, objectiveActive, open, voiceBusy]);

  if (!open) return null;

  return (
    <div
      data-morpheus
      data-testid="morpheus-quick-command"
      className="fixed inset-0 z-[90000] flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('morpheus.quickCommand.title')}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) hide();
      }}
    >
      <section className="w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-[hsl(var(--morpheus-surface-2))] shadow-2xl shadow-black/60">
        <header className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Command className="h-4 w-4 text-[hsl(var(--morpheus-accent))]" />
            <span className="text-xs font-medium uppercase tracking-[0.16em]">{t('morpheus.quickCommand.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-[hsl(var(--morpheus-surface-3))] px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
              Ctrl Shift Space
            </kbd>
            <button
              type="button"
              data-testid="quick-command-close"
              aria-label={t('morpheus.quickCommand.close')}
              disabled={busy}
              onClick={hide}
              className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="border-b border-border/60 px-4 py-2">
          <MorpheusObjectiveContextPicker className="justify-between" />
        </div>

        <form
          className="p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!objective.trim() || busy) return;
            void runObjective(objective, 'quick-command');
          }}
        >
          <div className="flex items-center gap-2 rounded-lg border border-border bg-[hsl(var(--morpheus-surface-3))] px-3 py-2 focus-within:border-[hsl(var(--morpheus-accent-dim))]">
            <input
              ref={inputRef}
              data-testid="quick-command-input"
              value={objective}
              disabled={busy}
              onChange={(event) => setObjective(event.target.value)}
              placeholder={t('morpheus.quickCommand.placeholder')}
              className="min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <MorpheusVoiceButton source="quick-command" className="h-8 w-8" />
            <button
              type="submit"
              data-testid="quick-command-submit"
              disabled={!objective.trim() || busy}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded border transition-colors',
                objective.trim() && !busy
                  ? 'border-[hsl(var(--morpheus-accent-dim))] text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10'
                  : 'border-border text-muted-foreground/40',
              )}
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 min-h-5 px-1 text-2xs text-muted-foreground" data-testid="quick-command-status">
            {objectiveRun && (
              <span data-testid="quick-command-objective-state">
                {t('morpheus.quickCommand.objectiveState', {
                  objective: objectiveRun.objective,
                  state: t(`morpheus.objective.states.${objectiveRun.state}`),
                })}
              </span>
            )}
            {!objectiveRun && interpreting && t('morpheus.quickCommand.planning')}
            {!objectiveRun && executing && t('morpheus.quickCommand.executing', { objective: plan?.objective ?? '' })}
            {!objectiveRun && !busy && planResult && t('morpheus.quickCommand.finished', { status: planResult.status })}
            {!busy && unsupported && t('morpheus.quickCommand.unsupported')}
            {!busy && !objectiveRun && !planResult && !unsupported && t('morpheus.quickCommand.hint')}
          </div>

          {objectiveActive ? (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-border/60 bg-[hsl(var(--morpheus-surface-1))]/70 px-3 py-2">
              <span className="truncate text-2xs text-muted-foreground">
                {t('morpheus.quickCommand.running', { objective: objectiveRun?.objective ?? '' })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="quick-command-cancel-objective"
                onClick={() => void cancelObjective()}
                className="h-7 shrink-0 gap-1.5 text-2xs text-[hsl(var(--morpheus-danger))] hover:bg-[hsl(var(--morpheus-danger))]/10"
              >
                <Square className="h-3 w-3 fill-current" />
                {t('morpheus.quickCommand.stop')}
              </Button>
            </div>
          ) : null}
        </form>
      </section>
    </div>
  );
}
