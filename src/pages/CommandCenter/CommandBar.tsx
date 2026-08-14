/** The primary interaction surface: an objective in, a typed plan out. */
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, Orbit, Square } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { morpheusActionLabelKey } from '@/components/morpheus/morpheus-phase';
import { MorpheusVoiceButton } from '@/components/morpheus/MorpheusVoiceButton';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';
import { ObjectiveCorePresence } from './ObjectiveCorePresence';

const STARTER_OBJECTIVES = [
  { key: 'system', objective: 'Show system information' },
  { key: 'file', objective: 'Create a text file named notes.txt' },
  { key: 'notepad', objective: 'Open Notepad' },
  { key: 'web', objective: 'Open browser and search for passive income ideas' },
] as const;

export function CommandBar() {
  const { t } = useTranslation('dashboard');
  const input = useMorpheusCommandStore((state) => state.input);
  const setInput = useMorpheusCommandStore((state) => state.setInput);
  const submit = useMorpheusCommandStore((state) => state.submit);
  const interpreting = useMorpheusCommandStore((state) => state.interpreting);
  const unsupported = useMorpheusCommandStore((state) => state.unsupported);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const cancelObjective = useMorpheusCommandStore((state) => state.cancelObjective);
  const objectiveActive = Boolean(objectiveRun && !isObjectiveTerminalState(objectiveRun.state));
  const busy = interpreting || objectiveActive;

  return (
    <section
      data-testid="morpheus-command-bar"
      className="morpheus-command-surface morpheus-signal-field relative overflow-hidden rounded-xl border border-border/60 bg-[hsl(var(--morpheus-surface-2))]/80 px-5 py-4"
    >
      <div className="relative z-10 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.2em] text-[hsl(var(--morpheus-accent))]">
            <Orbit className="h-3.5 w-3.5" aria-hidden />
            {t('morpheus.command.operator')}
          </p>
          <h2 className="font-serif text-xl font-normal tracking-tight text-foreground">
            {t('morpheus.command.question')}
          </h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">{t('morpheus.command.promise')}</p>
        </div>
        <div className="hidden min-w-0 items-center gap-4 md:flex">
          <ObjectiveCorePresence />
          <kbd className="hidden shrink-0 rounded border border-border/70 bg-black/10 px-2 py-1 font-mono text-[9px] text-muted-foreground xl:block dark:bg-white/[0.03]">
            Ctrl ⇧ Space · {t('morpheus.quickCommand.title')}
          </kbd>
        </div>
      </div>

      <form
        className="morpheus-command-input-frame relative z-10 mt-3 flex items-center gap-2 rounded-lg border border-border/70 bg-[hsl(var(--morpheus-surface-1))]/90 p-1.5 focus-within:border-[hsl(var(--morpheus-accent-dim))]"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span aria-hidden className="ml-2 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--morpheus-accent))] shadow-[0_0_12px_hsl(var(--morpheus-glow))]" />
        <input
          data-testid="morpheus-command-input"
          value={input}
          disabled={busy}
          placeholder={t('morpheus.command.placeholder')}
          aria-label={t('morpheus.command.label')}
          onChange={(event) => setInput(event.target.value)}
          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
        />
        <MorpheusVoiceButton source="command-center" disabled={objectiveActive} className="h-10 w-10 rounded-full" />
        {objectiveActive ? (
          <button
            type="button"
            data-testid="morpheus-command-stop"
            onClick={() => void cancelObjective()}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[hsl(var(--morpheus-danger))]/40 bg-[hsl(var(--morpheus-danger))]/8 px-5 text-2xs font-medium uppercase tracking-[0.14em] text-[hsl(var(--morpheus-danger))] transition-colors hover:bg-[hsl(var(--morpheus-danger))]/14"
          >
            <Square className="h-3 w-3 fill-current" />
            {t('morpheus.quickCommand.stop')}
          </button>
        ) : (
          <button
            type="submit"
            data-testid="morpheus-command-submit"
            disabled={interpreting || !input.trim()}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/12 px-5 text-2xs font-medium uppercase tracking-[0.14em] text-[hsl(var(--morpheus-accent))] transition-colors hover:bg-[hsl(var(--morpheus-accent))]/18 disabled:border-border disabled:bg-transparent disabled:text-muted-foreground/40"
          >
            {interpreting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            {interpreting ? t('morpheus.quickCommand.planning') : t('morpheus.command.run')}
          </button>
        )}
      </form>

      <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
        <span>{t('morpheus.command.try')}</span>
        {STARTER_OBJECTIVES.map((starter) => (
          <button
            key={starter.key}
            type="button"
            data-testid={`morpheus-command-example-${starter.key}`}
            onClick={() => setInput(starter.objective)}
            className="rounded border border-border/50 bg-[hsl(var(--morpheus-surface-3))]/65 px-2 py-0.5 text-foreground/70 transition-colors hover:border-[hsl(var(--morpheus-accent-dim))] hover:text-foreground"
          >
            {t(`morpheus.command.examples.${starter.key}`)}
          </button>
        ))}
      </div>

      {unsupported ? (
        <div data-testid="morpheus-command-unsupported" className="mt-3 border-l-2 border-[hsl(var(--morpheus-warn))] bg-[hsl(var(--morpheus-warn))]/5 px-3 py-2">
          <p className="text-tiny font-medium">{t('morpheus.command.unsupportedTitle')}</p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {objectiveRun?.clarification ?? objectiveRun?.plannerNotice ?? t('morpheus.command.unsupportedBody')}
          </p>
          <ul className="mt-1.5 flex max-h-14 flex-wrap gap-x-3 gap-y-1 overflow-hidden">
            {unsupported.supportedCapabilities.map((capabilityId) => (
              <li key={capabilityId} className="text-2xs text-foreground/70">
                {t(morpheusActionLabelKey(capabilityId))}
              </li>
            ))}
          </ul>
          <Link to="/models" className="mt-2 inline-flex items-center gap-1 text-2xs text-[hsl(var(--morpheus-accent))] hover:underline">
            {t('morpheus.command.configureProvider')}<ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
