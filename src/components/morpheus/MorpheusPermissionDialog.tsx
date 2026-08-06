/**
 * Confirmation for a Morpheus native action.
 *
 * SECURITY: this dialog shows the target Main RESOLVED, carried on the
 * `awaiting-permission` event — the absolute executable path or the absolute
 * file path. It never shows the requested parameters. A compromised renderer
 * can ask for a registered action, but it cannot make the confirmation describe
 * something other than what Main will actually do.
 *
 * Keyboard focus defaults to Deny, the safest non-execution option.
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
import type { PermissionDecisionKind } from '@shared/morpheus/permission-types';

import { morpheusActionLabelKey } from './morpheus-phase';

/**
 * Ordered safest-first. Remembering a decision is offered, but never as the
 * default and never as the visually dominant control.
 */
const DECISIONS: Array<{ kind: PermissionDecisionKind; variant: 'outline' | 'default' | 'destructive' }> = [
  { kind: 'deny', variant: 'outline' },
  { kind: 'deny-always', variant: 'outline' },
  { kind: 'allow-once', variant: 'default' },
  { kind: 'allow-session', variant: 'default' },
  { kind: 'allow-always', variant: 'default' },
];

export function MorpheusPermissionDialog() {
  const { t } = useTranslation('dashboard');
  const denyRef = useRef<HTMLButtonElement>(null);
  const run = useMorpheusActionsStore(selectPendingPermissionRun);
  const respondPermission = useMorpheusActionsStore((state) => state.respondPermission);

  const open = Boolean(run);
  const target = run?.target;
  const resolvedPath = target && target.kind !== 'none' ? target.path : null;

  const decide = (decision: PermissionDecisionKind) => {
    if (run) void respondPermission(run.runId, decision);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Escape or an outside click is a denial, never an implicit grant.
        if (!nextOpen) decide('deny');
      }}
    >
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

        <div className="mt-4 rounded-md border bg-surface-input p-3">
          {resolvedPath ? (
            <>
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
            </>
          ) : (
            <p data-testid="morpheus-permission-target" className="text-tiny text-muted-foreground">
              {t('morpheus.permission.noTarget')}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {DECISIONS.map(({ kind, variant }) => (
            <Button
              key={kind}
              ref={kind === 'deny' ? denyRef : undefined}
              data-testid={`morpheus-permission-${kind}`}
              variant={variant}
              onClick={() => decide(kind)}
              className="justify-start"
            >
              {t(`morpheus.permission.decisions.${kind}`)}
            </Button>
          ))}
        </div>

        <p className="mt-3 text-2xs text-muted-foreground">
          {t('morpheus.permission.scopeNote')}
        </p>
      </DialogContent>
    </Dialog>
  );
}
