/**
 * Confirmation for a Morpheus native action.
 *
 * SECURITY: this dialog shows the target Main RESOLVED, carried on the
 * `awaiting-permission` event — the absolute executable path or the absolute
 * file path. It never shows the requested parameters. A compromised Renderer
 * can therefore ask for a registered action, but it cannot make the
 * confirmation describe something other than what Main will actually do.
 *
 * Deny is the default focused control.
 */
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMorpheusActionsStore, selectPendingPermissionRun } from '@/stores/morpheus-actions';

import { morpheusActionLabelKey } from './morpheus-phase';

export function MorpheusPermissionDialog() {
  const { t } = useTranslation('dashboard');
  const denyRef = useRef<HTMLButtonElement>(null);
  const run = useMorpheusActionsStore(selectPendingPermissionRun);
  const respondPermission = useMorpheusActionsStore((state) => state.respondPermission);

  const open = Boolean(run);
  const target = run?.target;
  const resolvedPath = target && target.kind !== 'none' ? target.path : null;

  const handleOpenChange = (nextOpen: boolean) => {
    // Dismissing by Escape or an outside click is a denial, never an implicit
    // grant. The Main-side timeout would deny it anyway; this is just faster.
    if (!nextOpen && run) void respondPermission(run.runId, 'denied');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="morpheus-permission-dialog"
        className="w-[calc(100%-2rem)] max-w-md rounded-lg border bg-surface-modal p-6 shadow-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          denyRef.current?.focus();
        }}
      >
        <DialogTitle className="text-lg font-semibold">
          {t('morpheus.permission.title')}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">
          {run ? t('morpheus.permission.description', { action: t(morpheusActionLabelKey(run.actionId)) }) : ''}
        </DialogDescription>

        {resolvedPath ? (
          <div className="mt-4 rounded-md border bg-surface-input p-3">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
              {target?.kind === 'executable'
                ? t('morpheus.permission.executableLabel')
                : t('morpheus.permission.fileLabel')}
            </p>
            <p
              data-testid="morpheus-permission-target"
              className="mt-1 break-all font-mono text-tiny"
            >
              {resolvedPath}
            </p>
            {target?.kind === 'file' ? (
              <p className="mt-1 text-2xs text-muted-foreground">
                {t('morpheus.permission.fileBytes', { bytes: target.bytes })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-md border bg-surface-input p-3">
            <p data-testid="morpheus-permission-target" className="text-tiny text-muted-foreground">
              {t('morpheus.permission.noTarget')}
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            data-testid="morpheus-permission-deny"
            ref={denyRef}
            variant="outline"
            onClick={() => run && void respondPermission(run.runId, 'denied')}
          >
            {t('morpheus.permission.deny')}
          </Button>
          <Button
            data-testid="morpheus-permission-allow"
            onClick={() => run && void respondPermission(run.runId, 'granted')}
          >
            {t('morpheus.permission.allow')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
