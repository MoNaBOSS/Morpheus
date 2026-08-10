/** The primary interaction surface: an objective in, a typed plan out. */
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';

import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { morpheusActionLabelKey } from '@/components/morpheus/morpheus-phase';

const STARTER_OBJECTIVES = [
  { key: 'system', objective: 'Show system information' },
  { key: 'file', objective: 'Create a text file named notes.txt' },
  { key: 'notepad', objective: 'Open Notepad' },
] as const;

export function CommandBar() {
  const { t } = useTranslation('dashboard');
  const input = useMorpheusCommandStore((state) => state.input);
  const setInput = useMorpheusCommandStore((state) => state.setInput);
  const submit = useMorpheusCommandStore((state) => state.submit);
  const interpreting = useMorpheusCommandStore((state) => state.interpreting);
  const unsupported = useMorpheusCommandStore((state) => state.unsupported);

  return (
    <section data-testid="morpheus-command-bar" className="morpheus-command-surface">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg font-normal tracking-tight text-foreground">
            {t('morpheus.command.question')}
          </h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">{t('morpheus.command.promise')}</p>
        </div>
        <kbd className="hidden shrink-0 rounded border border-border/70 bg-black/10 px-2 py-1 font-mono text-[9px] text-muted-foreground sm:block dark:bg-white/[0.03]">
          Ctrl ⇧ Space · {t('morpheus.quickCommand.title')}
        </kbd>
      </div>

      <form
        className="mt-3 flex items-center gap-2 rounded-md border border-border/80 bg-[hsl(var(--morpheus-surface-3))] p-1.5 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.03)] focus-within:border-[hsl(var(--morpheus-accent-dim))]"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Sparkles className="ml-2 h-4 w-4 shrink-0 text-[hsl(var(--morpheus-accent))]" aria-hidden />
        <input
          data-testid="morpheus-command-input"
          value={input}
          disabled={interpreting}
          placeholder={t('morpheus.command.placeholder')}
          aria-label={t('morpheus.command.label')}
          onChange={(event) => setInput(event.target.value)}
          className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
        />
        <button
          type="submit"
          data-testid="morpheus-command-submit"
          disabled={interpreting || !input.trim()}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 px-4 text-2xs font-medium uppercase tracking-[0.12em] text-[hsl(var(--morpheus-accent))] transition-colors hover:bg-[hsl(var(--morpheus-accent))]/15 disabled:border-border disabled:bg-transparent disabled:text-muted-foreground/40"
        >
          {interpreting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          {interpreting ? t('morpheus.quickCommand.planning') : t('morpheus.command.run')}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        <span>{t('morpheus.command.try')}</span>
        {STARTER_OBJECTIVES.map((starter) => (
          <button
            key={starter.key}
            type="button"
            data-testid={`morpheus-command-example-${starter.key}`}
            onClick={() => setInput(starter.objective)}
            className="border-b border-transparent text-foreground/70 transition-colors hover:border-[hsl(var(--morpheus-accent-dim))] hover:text-foreground"
          >
            {t(`morpheus.command.examples.${starter.key}`)}
          </button>
        ))}
      </div>

      {unsupported ? (
        <div data-testid="morpheus-command-unsupported" className="mt-3 border-l-2 border-[hsl(var(--morpheus-warn))] bg-[hsl(var(--morpheus-warn))]/5 px-3 py-2">
          <p className="text-tiny font-medium">{t('morpheus.command.unsupportedTitle')}</p>
          <p className="mt-0.5 text-2xs text-muted-foreground">{t('morpheus.command.unsupportedBody')}</p>
          <ul className="mt-1.5 flex max-h-14 flex-wrap gap-x-3 gap-y-1 overflow-hidden">
            {unsupported.supportedCapabilities.map((capabilityId) => (
              <li key={capabilityId} className="text-2xs text-foreground/70">
                {t(morpheusActionLabelKey(capabilityId))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
