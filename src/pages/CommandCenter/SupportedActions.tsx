/**
 * What Morpheus can genuinely do right now, taken from the frozen registry and
 * the platform's real capability support. Nothing aspirational is listed.
 */
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { listMorpheusActionIds } from '@shared/morpheus/actions/registry';

import { morpheusActionLabelKey } from '@/components/morpheus/morpheus-phase';

/** A representative objective per capability, so one click demonstrates it. */
const EXAMPLE_COMMAND: Record<string, string> = {
  'system.report': 'Show system information',
  'file.createText': 'Create a text file named notes.txt',
  'app.launch': 'Open Notepad',
};

export function SupportedActions() {
  const { t } = useTranslation('dashboard');
  const supported = useMorpheusActionsStore((state) => state.supportedActions);
  const setInput = useMorpheusCommandStore((state) => state.setInput);
  const submit = useMorpheusCommandStore((state) => state.submit);

  const run = (actionId: string) => {
    // Routed through the same command path as typing it, so there is exactly
    // one execution pipeline rather than a shortcut that bypasses planning.
    setInput(EXAMPLE_COMMAND[actionId] ?? '');
    void submit();
  };

  return (
    <ul data-testid="morpheus-supported-actions" className="flex flex-col gap-1.5">
      {listMorpheusActionIds().map((actionId) => {
        const available = supported[actionId] !== false;
        return (
          <li
            key={actionId}
            data-testid={`morpheus-supported-${actionId}`}
            className="flex items-center justify-between gap-2 rounded-md border bg-surface-modal px-2.5 py-1.5"
          >
            <span className="min-w-0 truncate text-2xs">
              {t(morpheusActionLabelKey(actionId))}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!available}
              data-testid={`morpheus-run-action-${actionId}`}
              onClick={() => run(actionId)}
              aria-label={t(morpheusActionLabelKey(actionId))}
              className="h-6 shrink-0 gap-1 px-2"
            >
              <Play className="h-3 w-3" aria-hidden />
              {t('morpheus.launcher.run')}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
