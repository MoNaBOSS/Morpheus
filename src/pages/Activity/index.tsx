import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity as ActivityIcon, ChevronDown, Shield, Timer } from 'lucide-react';

import { EmptyState, Panel, StatusDot } from '@/components/morpheus/ui';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';

const CATEGORY_OPTIONS = ['', 'execution', 'permission', 'agent-profile', 'workflow', 'schedule'] as const;

export function Activity() {
  const { t } = useTranslation('dashboard');
  const entries = useMorpheusFoundationStore((state) => state.activity);
  const truncated = useMorpheusFoundationStore((state) => state.activityTruncated);
  const loadActivity = useMorpheusFoundationStore((state) => state.loadActivity);
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>('');

  useEffect(() => {
    void loadActivity({ limit: 80, ...(category ? { category } : {}) });
  }, [loadActivity, category]);

  return (
    <main data-morpheus data-testid="activity-page" className="h-full overflow-y-auto bg-[hsl(var(--morpheus-surface-1))] p-5">
      <header className="mb-4 flex items-end justify-between gap-4 border-b border-border/70 pb-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.activity.history')}</p>
          <h1 className="mt-1 font-serif text-2xl font-normal tracking-tight">{t('morpheus.activity.title')}</h1>
          <p className="mt-1 text-tiny text-muted-foreground">{t('morpheus.activity.description')}</p>
        </div>
        <label className="flex items-center gap-2 text-2xs text-muted-foreground">
          {t('morpheus.activity.filter')}
          <select
            data-testid="activity-category-filter"
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
            className="rounded border border-border bg-[hsl(var(--morpheus-surface-3))] px-2 py-1 text-tiny text-foreground"
          >
            {CATEGORY_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option || t('morpheus.activity.all')}</option>)}
          </select>
        </label>
      </header>

      <Panel testId="activity-ledger" title={t('morpheus.activity.ledger')} description={t('morpheus.activity.ledgerDescription')}>
        {entries.length === 0 ? <EmptyState message={t('morpheus.activity.empty')} /> : (
          <ol className="divide-y divide-border/60">
            {entries.map((entry, index) => {
              const execution = 'actionId' in entry;
              const failed = execution && ['failed', 'denied', 'timed-out'].includes(entry.phase);
              const running = execution && entry.phase === 'running';
              return (
                <li key={`${entry.ts}-${entry.seq}-${index}`} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 px-2 py-2" data-testid="activity-entry">
                  <span className="mt-1">{execution ? <ActivityIcon className="h-3.5 w-3.5 text-muted-foreground" /> : entry.category === 'permission' ? <Shield className="h-3.5 w-3.5 text-muted-foreground" /> : <Timer className="h-3.5 w-3.5 text-muted-foreground" />}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot tone={failed ? 'error' : running ? 'running' : 'ok'} />
                      <span className="truncate text-tiny font-medium">{execution ? entry.actionId : `${entry.category}.${entry.event}`}</span>
                      {execution && <code className="text-2xs text-muted-foreground">{entry.phase}</code>}
                    </div>
                    {!execution && entry.subjectId && <p className="mt-0.5 truncate font-mono text-2xs text-muted-foreground">{entry.subjectId}</p>}
                  </div>
                  <time className="font-mono text-2xs text-muted-foreground" dateTime={entry.ts}>{new Date(entry.ts).toLocaleString()}</time>
                </li>
              );
            })}
          </ol>
        )}
        {truncated && (
          <button
            type="button"
            data-testid="activity-load-more"
            onClick={() => void loadActivity({ limit: 80, ...(category ? { category } : {}) }, true)}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-border py-1.5 text-2xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />{t('morpheus.activity.loadMore')}
          </button>
        )}
      </Panel>
    </main>
  );
}
