import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Command, X } from 'lucide-react';

import { hostEvents } from '@/lib/host-events';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { cn } from '@/lib/utils';

export function MorpheusQuickCommand() {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  const [objective, setObjective] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const runObjective = useMorpheusCommandStore((state) => state.runObjective);
  const interpreting = useMorpheusCommandStore((state) => state.interpreting);
  const executing = useMorpheusCommandStore((state) => state.executing);
  const plan = useMorpheusCommandStore((state) => state.plan);
  const planResult = useMorpheusCommandStore((state) => state.planResult);
  const unsupported = useMorpheusCommandStore((state) => state.unsupported);

  useEffect(() => hostEvents.onMorpheusQuickCommand(() => {
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }), []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  if (!open) return null;
  const busy = interpreting || executing;

  return (
    <div
      data-morpheus
      data-testid="morpheus-quick-command"
      className="fixed inset-0 z-[90000] flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('morpheus.quickCommand.title')}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) setOpen(false);
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
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <form
          className="p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!objective.trim() || busy) return;
            void runObjective(objective, 'quick-command');
            setObjective('');
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
