import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, Square } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { MorpheusVoiceButton } from '@/components/morpheus/MorpheusVoiceButton';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';

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
    <section data-testid="morpheus-command-bar" className="morpheus-intelligence-band grid grid-cols-[220px_minmax(0,1fr)] items-center gap-5">
      <div className="hidden xl:block">
        <p className="text-[9px] uppercase tracking-[0.22em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.signalOs.presence')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('morpheus.signalOs.presencePromise')}</p>
      </div>

      <div className="min-w-0">
        <form className="morpheus-signal-command flex items-center gap-2 border-b border-white/15 pb-2 focus-within:border-[hsl(var(--morpheus-accent-dim))]" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <span aria-hidden className="morpheus-command-cursor h-5 w-px shrink-0 bg-[hsl(var(--morpheus-accent))]" />
          <input data-testid="morpheus-command-input" value={input} disabled={busy} placeholder={t('morpheus.signalOs.commandPlaceholder')} aria-label={t('morpheus.command.label')} onChange={(event) => setInput(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent font-serif text-xl text-foreground outline-none placeholder:text-muted-foreground/50 disabled:opacity-60" />
          <MorpheusVoiceButton source="command-center" disabled={objectiveActive} className="h-10 w-10 rounded-full border-white/10" />
          {objectiveActive ? (
            <button type="button" data-testid="morpheus-command-stop" onClick={() => void cancelObjective()} className="inline-flex h-10 items-center gap-2 rounded-md border border-[hsl(var(--morpheus-danger))]/35 px-3 text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--morpheus-danger))]"><Square className="h-3 w-3 fill-current" />{t('morpheus.signalOs.stop')}</button>
          ) : (
            <button type="submit" data-testid="morpheus-command-submit" disabled={interpreting || !input.trim()} aria-label={t('morpheus.command.run')} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-[hsl(var(--morpheus-accent-dim))] hover:text-[hsl(var(--morpheus-accent))] disabled:opacity-30">
              {interpreting ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          )}
        </form>

        <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden text-[9px] text-muted-foreground">
          <span className="shrink-0 uppercase tracking-[0.14em]">{t('morpheus.signalOs.try')}</span>
          {STARTER_OBJECTIVES.map((starter) => (
            <button key={starter.key} type="button" data-testid={`morpheus-command-example-${starter.key}`} onClick={() => setInput(starter.objective)} className="shrink-0 border-l border-white/10 pl-2 text-foreground/60 hover:text-foreground">{t(`morpheus.command.examples.${starter.key}`)}</button>
          ))}
          <kbd className="ml-auto hidden shrink-0 font-mono text-[8px] text-muted-foreground/60 2xl:block">Ctrl ⇧ Space</kbd>
        </div>

        {unsupported ? (
          <div data-testid="morpheus-command-unsupported" className="mt-3 flex items-start justify-between gap-4 border-l border-[hsl(var(--morpheus-warn))] pl-3 text-[10px]">
            <div><p className="text-foreground/85">{objectiveRun?.clarification ?? t('morpheus.command.unsupportedTitle')}</p><p className="mt-1 text-muted-foreground">{objectiveRun?.plannerNotice ?? t('morpheus.command.unsupportedBody')}</p></div>
            <Link to="/models" className="shrink-0 text-[hsl(var(--morpheus-accent))] hover:underline">{t('morpheus.command.configureProvider')}</Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
