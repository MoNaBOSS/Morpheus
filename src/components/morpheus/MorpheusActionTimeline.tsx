/**
 * Execution timeline.
 *
 * Renders only what Main has actually emitted. There is no placeholder run, no
 * optimistic entry and no replayed sample data.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { FeedbackState } from '@/components/common/FeedbackState';
import { useMorpheusActionsStore, selectRunsNewestFirst } from '@/stores/morpheus-actions';

import { MorpheusRunCard } from './MorpheusRunCard';

export function MorpheusActionTimeline() {
  const { t } = useTranslation('dashboard');
  // Select the stable slices and derive the ordered list here. Passing a
  // selector that builds a new array would fail zustand's Object.is check on
  // every render and loop forever.
  const runOrder = useMorpheusActionsStore((state) => state.runOrder);
  const runsById = useMorpheusActionsStore((state) => state.runsById);
  const runs = useMemo(
    () => selectRunsNewestFirst({ runOrder, runsById }),
    [runOrder, runsById],
  );

  if (runs.length === 0) {
    return (
      <div data-testid="morpheus-timeline-empty">
        <FeedbackState
          state="empty"
          title={t('morpheus.timeline.emptyTitle')}
          description={t('morpheus.timeline.emptyDescription')}
        />
      </div>
    );
  }

  return (
    <ul data-testid="morpheus-timeline" className="flex flex-col gap-2">
      {runs.map((run) => (
        <MorpheusRunCard key={run.runId} run={run} />
      ))}
    </ul>
  );
}
