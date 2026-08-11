import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Command, X } from 'lucide-react';

import { hostEvents } from '@/lib/host-events';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { cn } from '@/lib/utils';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { MorpheusVoiceButton } from './MorpheusVoiceButton';
import { MorpheusObjectiveContextPicker } from './MorpheusObjectiveContextPicker';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';

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
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);

  useEffect(() => hostEvents.onMorpheusQuickCommand(show), [show]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, hide]);

  if (!open) return null;
  const voiceBusy = voicePhase === 'requesting' || voicePhase === 'listening' || voicePhase === 'transcribing';
  const busy = interpreting || executing || voiceBusy;

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
            {interpreting && t('morpheus.quickCommand.planning')}
            {executing && t('morpheus.quickCommand.executing', { objective: plan?.objective ?? '' })}
            {!busy && planResult && t('morpheus.quickCommand.finished', { status: planResult.status })}
            {!busy && unsupported && t('morpheus.quickCommand.unsupported')}
            {!busy && !planResult && !unsupported && t('morpheus.quickCommand.hint')}
          </div>
        </form>
      </section>
    </div>
  );
}
