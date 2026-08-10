import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';

import { EmptyState, StatusDot } from '@/components/morpheus/ui';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';

export function RecentActivity() {
  const { t } = useTranslation('dashboard');
  const entries = useMorpheusFoundationStore((state) => state.activity).slice(0, 4);

  if (entries.length === 0) {
    return <EmptyState message={t('morpheus.activity.empty')} testId="command-center-activity-empty" />;
  }

  return (
    <div className="flex min-h-0 flex-col" data-testid="command-center-recent-activity">
      <ol className="min-h-0 flex-1 divide-y divide-border/50 overflow-hidden">
        {entries.map((entry, index) => {
          const execution = 'actionId' in entry;
          const failed = execution && ['failed', 'denied', 'timed-out'].includes(entry.phase);
          const running = execution && entry.phase === 'running';
          return (
            <li key={`${entry.ts}-${entry.seq}-${index}`} className="flex items-center gap-2 py-1.5">
              <StatusDot tone={failed ? 'error' : running ? 'running' : 'ok'} />
              <span className="min-w-0 flex-1 truncate text-2xs text-foreground/80">
                {execution ? entry.actionId : `${entry.category}.${entry.event}`}
              </span>
              <time dateTime={entry.ts} className="shrink-0 font-mono text-[9px] text-muted-foreground">
                {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
            </li>
          );
        })}
      </ol>
      <Link to="/activity" className="mt-1 inline-flex items-center gap-1 self-start text-2xs text-muted-foreground hover:text-foreground">
        {t('morpheus.activity.open')} <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
