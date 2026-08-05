/**
 * Recent audit records.
 *
 * A read-only projection of the durable append-only log. The Renderer never
 * learns the audit file location and cannot write to it; it can only request a
 * bounded recent page through the typed host API.
 */
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { FeedbackState } from '@/components/common/FeedbackState';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';

import { getMorpheusPhaseAppearance, morpheusPhaseLabelKey } from './morpheus-phase';

export function MorpheusAuditPanel() {
  const { t } = useTranslation('dashboard');
  const entries = useMorpheusActionsStore((state) => state.auditEntries);
  const loading = useMorpheusActionsStore((state) => state.auditLoading);

  if (entries.length === 0) {
    return (
      <div data-testid="morpheus-audit-empty">
        <FeedbackState
          state={loading ? 'loading' : 'empty'}
          title={loading ? t('morpheus.audit.loading') : t('morpheus.audit.emptyTitle')}
          description={loading ? undefined : t('morpheus.audit.emptyDescription')}
        />
      </div>
    );
  }

  return (
    <ul data-testid="morpheus-audit-list" className="flex flex-col gap-1">
      {entries.map((entry) => {
        const appearance = getMorpheusPhaseAppearance(entry.phase);
        return (
          <li
            key={`${entry.runId}-${entry.seq}`}
            data-testid="morpheus-audit-entry"
            data-phase={entry.phase}
            className="flex items-center justify-between gap-3 rounded-md border bg-surface-modal px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-tiny font-medium">{entry.actionId}</p>
              <p className="text-2xs text-muted-foreground">
                {new Date(entry.ts).toLocaleTimeString()}
                {entry.params?.fileName ? ` · ${entry.params.fileName}` : ''}
                {typeof entry.params?.contentBytes === 'number'
                  ? ` · ${entry.params.contentBytes} B`
                  : ''}
              </p>
            </div>
            <Badge variant={appearance.variant} className="shrink-0">
              {t(morpheusPhaseLabelKey(entry.phase))}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
