/**
 * Action launcher.
 *
 * Renders one control per registry descriptor, so a new action appears here
 * automatically once it is added to `shared/morpheus/actions/registry.ts` and a
 * capability is registered in Main. Nothing about a specific action is hardcoded
 * except the shape of its parameter inputs.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';
import {
  MORPHEUS_ACTIONS,
  listMorpheusActionIds,
  listMorpheusApplicationKeys,
} from '@shared/morpheus/actions/registry';
import type { MorpheusActionId } from '@shared/morpheus/actions/registry';

import { morpheusActionLabelKey } from '@/components/morpheus/morpheus-phase';

function actionDescriptionKey(actionId: string): string {
  return morpheusActionLabelKey(actionId).replace(/\.label$/, '.description');
}

export function ActionLauncherPanel() {
  const { t } = useTranslation('dashboard');
  const supportedActions = useMorpheusActionsStore((state) => state.supportedActions);
  const requestAction = useMorpheusActionsStore((state) => state.requestAction);
  const requestError = useMorpheusActionsStore((state) => state.requestError);

  const [fileName, setFileName] = useState('notes.txt');
  const [content, setContent] = useState('Hello from Morpheus.');
  const [applicationKey] = useState(() => listMorpheusApplicationKeys()[0] ?? '');

  const paramsFor = (actionId: MorpheusActionId): Record<string, string> | undefined => {
    if (actionId === 'file.createText') return { fileName, content };
    if (actionId === 'app.launch') return { applicationKey };
    return undefined;
  };

  return (
    <div data-testid="morpheus-action-launcher" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-surface-input p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="morpheus-file-name" className="text-tiny">
            {t('morpheus.launcher.fileNameLabel')}
          </Label>
          <Input
            id="morpheus-file-name"
            data-testid="morpheus-file-name-input"
            value={fileName}
            placeholder={t('morpheus.launcher.fileNamePlaceholder')}
            onChange={(event) => setFileName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="morpheus-file-content" className="text-tiny">
            {t('morpheus.launcher.contentLabel')}
          </Label>
          <Textarea
            id="morpheus-file-content"
            data-testid="morpheus-file-content-input"
            rows={2}
            value={content}
            placeholder={t('morpheus.launcher.contentPlaceholder')}
            onChange={(event) => setContent(event.target.value)}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {listMorpheusActionIds().map((actionId) => {
          const supported = supportedActions[actionId] !== false;
          return (
            <li
              key={actionId}
              className="flex items-center justify-between gap-3 rounded-lg border bg-surface-modal p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t(morpheusActionLabelKey(actionId))}</p>
                <p className="mt-0.5 text-tiny text-muted-foreground">
                  {supported
                    ? t(actionDescriptionKey(actionId))
                    : t('morpheus.launcher.unsupported')}
                </p>
              </div>
              <Button
                data-testid={`morpheus-run-action-${actionId}`}
                data-action-kind={MORPHEUS_ACTIONS[actionId].kind}
                size="sm"
                disabled={!supported}
                onClick={() => void requestAction(actionId, paramsFor(actionId))}
                className="shrink-0 gap-1.5"
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                {t('morpheus.launcher.run')}
              </Button>
            </li>
          );
        })}
      </ul>

      {requestError ? (
        <p data-testid="morpheus-request-error" className="text-tiny text-red-700 dark:text-red-400">
          {requestError}
        </p>
      ) : null}
    </div>
  );
}
