/**
 * The batched, plan-level consent dialog.
 *
 * This is where the interruption principle becomes visible. 0.1.1 showed one
 * dialog per capability run, so a plan writing three files asked three times.
 * Main now evaluates the whole plan and sends only the boundaries that are
 * genuinely NEW — five steps sharing an approved folder arrive here as one row,
 * and a plan already inside existing grants never opens this dialog at all.
 *
 * The copy states the boundary, not the mechanism: what Morpheus would be
 * allowed to touch, not which capability id is involved.
 */
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { MonoPath, RiskBadge } from '@/components/morpheus/ui';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import type { MorpheusConsentBoundary } from '@shared/host-events/contract';

/**
 * Decisions offered for a set of boundaries.
 *
 * If ANY boundary is mandatory-confirmation, the remembering options disappear
 * for the whole batch: a single "always allow" button covering a `critical`
 * boundary would launder exactly the trust that tier exists to protect.
 */
export function decisionsForBatch(
  boundaries: readonly MorpheusConsentBoundary[],
): ReadonlyArray<{ kind: string; variant: 'destructive' | 'outline' | 'default' }> {
  const anyMandatory = boundaries.some((boundary) => boundary.mandatoryConfirmation);
  const base = [
    { kind: 'deny', variant: 'destructive' as const },
    { kind: 'allow-once', variant: 'default' as const },
  ];
  return anyMandatory
    ? base
    : [
      ...base,
      { kind: 'allow-session', variant: 'outline' as const },
      { kind: 'allow-always', variant: 'outline' as const },
    ];
}

export function MorpheusPlanConsentDialog() {
  const { t } = useTranslation('dashboard');
  const denyRef = useRef<HTMLButtonElement>(null);
  const consent = useMorpheusCommandStore((state) => state.consent);
  const answerConsent = useMorpheusCommandStore((state) => state.answerConsent);

  const boundaries = consent?.boundaries ?? [];
  const decisions = decisionsForBatch(boundaries);
  const anyMandatory = boundaries.some((boundary) => boundary.mandatoryConfirmation);

  return (
    <Dialog
      open={Boolean(consent)}
      onOpenChange={(nextOpen) => {
        // Escape or an outside click is a denial, never an implicit grant.
        if (!nextOpen) void answerConsent('deny');
      }}
    >
      <DialogContent
        data-morpheus
        data-testid="morpheus-plan-consent-dialog"
        className="w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-surface-modal p-6 shadow-lg"
        onOpenAutoFocus={(event) => {
          // Focus the safest non-execution option.
          event.preventDefault();
          denyRef.current?.focus();
        }}
      >
        <DialogTitle className="text-lg font-semibold">
          {t('morpheus.permission.plan.title')}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">
          {consent
            ? t('morpheus.permission.plan.description', {
              count: boundaries.length,
              objective: consent.objective,
            })
            : ''}
        </DialogDescription>

        <ul className="mt-4 space-y-2" data-testid="morpheus-plan-consent-boundaries">
          {boundaries.map((boundary) => (
            <li
              key={boundary.boundaryId}
              data-testid={`morpheus-plan-consent-boundary-${boundary.capabilityId}`}
              className="rounded-md border bg-surface-input p-3"
            >
              <div className="flex items-start justify-between gap-2">
                {/* Name the whole decision. A grouped boundary grants every
                    verb in its group over this workspace, so showing only the
                    verb that triggered it would understate the grant. */}
                <p className="text-tiny text-foreground">
                  {boundary.capabilityGroup
                    ? t(`morpheus.permission.groups.${boundary.capabilityGroup}`, {
                      defaultValue: boundary.capabilityGroup,
                    })
                    : t(`morpheus.actions.${toLabelKey(boundary.capabilityId)}.label`, {
                      defaultValue: boundary.capabilityId,
                    })}
                </p>
                <RiskBadge tier={boundary.riskTier} />
              </div>
              {/* What will happen NOW: the specific file or executable Main
                  resolved. Showing only the grant scope would hide the filename. */}
              <div className="mt-1.5 space-y-1" data-testid="morpheus-plan-consent-target">
                {boundary.targets.length > 0
                  ? boundary.targets.map((target) => <MonoPath key={target} path={target} />)
                  : <MonoPath path={boundary.resourceScope} />}
              </div>
              <p className="mt-1 text-2xs text-muted-foreground">
                {t('morpheus.permission.plan.coversSteps', { count: boundary.stepIds.length })}
              </p>
              {/* What a remembered decision would cover, when it differs. */}
              {boundary.targets.length > 0 && boundary.resourceScope !== boundary.targets[0] && (
                <p
                  data-testid="morpheus-plan-consent-scope"
                  className="mt-1 truncate font-mono text-2xs text-muted-foreground/70"
                  title={boundary.resourceScope}
                >
                  {boundary.resourceScope}
                </p>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          {decisions.map(({ kind, variant }) => (
            <Button
              key={kind}
              ref={kind === 'deny' ? denyRef : undefined}
              data-testid={`morpheus-plan-consent-${kind}`}
              variant={variant}
              onClick={() => void answerConsent(kind)}
              className="justify-start"
            >
              {t(`morpheus.permission.decisions.${kind}`, { defaultValue: kind })}
            </Button>
          ))}
        </div>

        <p className="mt-3 text-2xs text-muted-foreground">
          {anyMandatory
            ? t('morpheus.permission.plan.mandatoryNote')
            : t('morpheus.permission.plan.note')}
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** `file.createText` -> `fileCreateText`, matching the i18n key convention. */
function toLabelKey(capabilityId: string): string {
  const [group, action] = capabilityId.split('.');
  if (!action) return capabilityId;
  return `${group}${action.charAt(0).toUpperCase()}${action.slice(1)}`;
}
