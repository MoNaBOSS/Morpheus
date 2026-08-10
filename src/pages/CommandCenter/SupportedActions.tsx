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

/**
 * A representative objective per capability, so one click demonstrates it.
 *
 * Every entry must round-trip through the deterministic interpreter and come
 * back as that capability — a phrase the interpreter does not recognise would
 * make a listed capability look broken. `morpheus-supported-actions.test.ts`
 * asserts exactly that.
 */
export const EXAMPLE_COMMAND: Record<string, string> = {
  'system.report': 'Show system information',
  'app.launch': 'Open Notepad',
  'file.createText': 'Create a text file named notes.txt',
  'file.readText': 'Read the file notes.txt',
  'file.list': 'List the files in my workspace',
  'file.search': 'Find files named notes',
  'file.appendText': 'Create a text file named appended.txt',
  'file.move': 'Create a text file named moved.txt',
  'file.copy': 'Create a text file named copied.txt',
  'folder.create': 'Create a folder named reports',
  'file.delete': 'Delete the file notes.txt',
  'clipboard.readText': 'Show the clipboard contents',
  'clipboard.writeText': 'Copy "Morpheus" to the clipboard',
  'system.notify': 'Notify me "Morpheus is ready"',
  'screen.capture': 'Take a screenshot',
  'system.storage': 'Show disk space',
  'system.processes': 'Show running processes',
  'web.openUrl': 'Open https://example.com',
  'dev.launchProject': 'Open project named project',
};

const FEATURED_ACTIONS = [
  'system.report', 'file.createText', 'app.launch',
  'file.list', 'clipboard.writeText', 'screen.capture',
] as const;

export function SupportedActions({ limit }: { limit?: number }) {
  const { t } = useTranslation('dashboard');
  const supported = useMorpheusActionsStore((state) => state.supportedActions);
  const setInput = useMorpheusCommandStore((state) => state.setInput);
  const submit = useMorpheusCommandStore((state) => state.submit);
  const actionIds = listMorpheusActionIds();
  const orderedActionIds = typeof limit === 'number'
    ? [...FEATURED_ACTIONS.filter((id) => actionIds.includes(id)), ...actionIds.filter((id) => !FEATURED_ACTIONS.includes(id as never))]
    : actionIds;
  const visibleActionIds = typeof limit === 'number' ? orderedActionIds.slice(0, limit) : orderedActionIds;

  const run = (actionId: string) => {
    // Routed through the same command path as typing it, so there is exactly
    // one execution pipeline rather than a shortcut that bypasses planning.
    setInput(EXAMPLE_COMMAND[actionId] ?? '');
    void submit();
  };

  return (
    // Scrolls inside its own panel: the capability set grows every milestone,
    // and the page itself must stay within 1280x800 without scrolling.
    <ul
      data-testid="morpheus-supported-actions"
      className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1"
    >
      {visibleActionIds.map((actionId) => {
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
      {visibleActionIds.length < actionIds.length ? (
        <li className="px-2.5 py-1 text-2xs text-muted-foreground">
          {t('morpheus.launcher.more', { count: actionIds.length - visibleActionIds.length })}
        </li>
      ) : null}
    </ul>
  );
}
