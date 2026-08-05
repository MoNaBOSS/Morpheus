/**
 * One run in the execution timeline.
 *
 * Structure follows `src/pages/Chat/AcpToolCallCard.tsx`: a status chip, a
 * compact summary line, and detail beneath. It shares no data model with the
 * ACP timeline — see `harness/reference/morpheus-execution-architecture.md`.
 */
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MorpheusRun } from '@shared/morpheus/action-types';

import {
  getMorpheusPhaseAppearance,
  morpheusActionLabelKey,
  morpheusPhaseLabelKey,
} from './morpheus-phase';

type MorpheusRunCardProps = {
  run: MorpheusRun;
};

function formatDuration(durationMs: number | undefined): string | null {
  if (typeof durationMs !== 'number') return null;
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

export function MorpheusRunCard({ run }: MorpheusRunCardProps) {
  const { t } = useTranslation('dashboard');
  const appearance = getMorpheusPhaseAppearance(run.phase);
  const Icon = appearance.icon;
  const duration = formatDuration(run.durationMs);

  const targetLine = run.target && run.target.kind !== 'none'
    ? run.target.path
    : null;

  return (
    <li
      data-testid="morpheus-run-card"
      data-run-id={run.runId}
      data-phase={run.phase}
      className="rounded-lg border bg-surface-modal p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {t(morpheusActionLabelKey(run.actionId))}
          </p>
          {targetLine ? (
            <p
              data-testid="morpheus-run-target"
              className="mt-1 break-all font-mono text-tiny text-muted-foreground"
            >
              {targetLine}
            </p>
          ) : null}
        </div>
        <Badge variant={appearance.variant} className="shrink-0 gap-1" data-testid="morpheus-run-phase">
          <Icon className={cn('h-3 w-3', appearance.spin && 'animate-spin')} aria-hidden />
          {t(morpheusPhaseLabelKey(run.phase))}
        </Badge>
      </div>

      {run.error ? (
        <p data-testid="morpheus-run-error" className="mt-2 text-tiny text-red-700 dark:text-red-400">
          {run.error.message}
        </p>
      ) : null}

      {run.result?.kind === 'system' ? (
        <p className="mt-2 text-tiny text-muted-foreground">
          {t('morpheus.timeline.systemSummary', {
            platform: run.result.info.platform,
            release: run.result.info.release,
            arch: run.result.info.arch,
          })}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-2 text-2xs text-muted-foreground">
        <span>{new Date(run.updatedAt).toLocaleTimeString()}</span>
        {duration ? <span>· {duration}</span> : null}
      </div>
    </li>
  );
}
