/**
 * The primary interaction surface: an objective in, a typed plan out.
 */
import { useTranslation } from 'react-i18next';
import { CornerDownLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { morpheusActionLabelKey } from '@/components/morpheus/morpheus-phase';

export function CommandBar() {
  const { t } = useTranslation('dashboard');
  const input = useMorpheusCommandStore((state) => state.input);
  const setInput = useMorpheusCommandStore((state) => state.setInput);
  const submit = useMorpheusCommandStore((state) => state.submit);
  const interpreting = useMorpheusCommandStore((state) => state.interpreting);
  const unsupported = useMorpheusCommandStore((state) => state.unsupported);

  return (
    <div data-testid="morpheus-command-bar" className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          data-testid="morpheus-command-input"
          value={input}
          disabled={interpreting}
          placeholder={t('morpheus.command.placeholder')}
          aria-label={t('morpheus.command.label')}
          onChange={(event) => setInput(event.target.value)}
          className="h-11 flex-1 font-mono text-sm"
        />
        <Button
          type="submit"
          data-testid="morpheus-command-submit"
          disabled={interpreting || !input.trim()}
          className="h-11 shrink-0 gap-1.5"
        >
          {interpreting
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            : <CornerDownLeft className="h-4 w-4" aria-hidden />}
          {t('morpheus.command.run')}
        </Button>
      </form>

      {unsupported ? (
        // Truthful refusal: never a fabricated success, and never silence.
        <div
          data-testid="morpheus-command-unsupported"
          className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
        >
          <p className="text-tiny font-medium">{t('morpheus.command.unsupportedTitle')}</p>
          <p className="mt-1 text-tiny text-muted-foreground">
            {t('morpheus.command.unsupportedBody')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {unsupported.supportedCapabilities.map((capabilityId) => (
              <li
                key={capabilityId}
                className="rounded-md border bg-surface-modal px-2 py-0.5 text-2xs"
              >
                {t(morpheusActionLabelKey(capabilityId))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
