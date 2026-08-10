/**
 * Live screen-capture indicator.
 *
 * Screen capture is the one capability where the user may not be looking at
 * Morpheus when it runs, so it has to announce itself. This indicator is driven
 * by the SAME audited event stream that records the capture — it derives its
 * state from real `screen.capture` runs and nothing else, so it cannot claim a
 * capture that did not happen or miss one that did.
 *
 * A capture takes a few hundred milliseconds, which would be an unreadable
 * flash. The indicator therefore stays visible for a short dwell after the run
 * completes, and says plainly which of the two states it is in — "capturing"
 * and "captured just now" are different facts and are never conflated.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { StatusDot } from '@/components/morpheus/ui';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';

/** How long a completed capture stays announced. */
export const CAPTURE_DWELL_MS = 6000;

export type CaptureIndicatorState =
  | { visible: false }
  | { visible: true; phase: 'capturing' }
  | { visible: true; phase: 'captured'; path: string | null; at: number };

/**
 * Derives indicator state from the most recent capture run.
 *
 * Exported for testing: the rule that a *failed* capture never announces a
 * successful one is worth pinning down.
 */
export function captureIndicatorState(
  run: { phase: string; target?: { kind: string; path?: string }; updatedAt: string } | undefined,
  now: number,
): CaptureIndicatorState {
  if (!run) return { visible: false };
  if (run.phase === 'running' || run.phase === 'requested') {
    return { visible: true, phase: 'capturing' };
  }
  if (run.phase !== 'succeeded') return { visible: false };

  const finishedAt = Date.parse(run.updatedAt);
  if (!Number.isFinite(finishedAt) || now - finishedAt > CAPTURE_DWELL_MS) return { visible: false };

  const path = run.target && run.target.kind === 'file' ? (run.target.path ?? null) : null;
  return { visible: true, phase: 'captured', path, at: finishedAt };
}

export function MorpheusCaptureIndicator() {
  const { t } = useTranslation('dashboard');
  const runOrder = useMorpheusActionsStore((state) => state.runOrder);
  const runsById = useMorpheusActionsStore((state) => state.runsById);
  const [now, setNow] = useState(() => Date.now());

  const latestCapture = useMemo(() => {
    for (let index = runOrder.length - 1; index >= 0; index -= 1) {
      const run = runsById[runOrder[index]];
      if (run?.actionId === 'screen.capture') return run;
    }
    return undefined;
  }, [runOrder, runsById]);

  const state = captureIndicatorState(latestCapture, now);

  // Ticks only while a completed capture exists to expire, so an idle Command
  // Center is not re-rendering on a timer forever. The clock is advanced only
  // by this interval — never synchronously from an effect, which would cascade
  // renders — and a stale `now` can only make the indicator linger to the next
  // tick, never hide a capture that just happened.
  const pendingExpiry = latestCapture?.phase === 'succeeded';
  useEffect(() => {
    if (!pendingExpiry) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [pendingExpiry, latestCapture?.runId]);

  if (!state.visible) return null;

  return (
    <div
      data-testid="morpheus-capture-indicator"
      data-capture-phase={state.phase}
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-[hsl(var(--morpheus-danger))]/40 bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-1.5"
    >
      <StatusDot tone={state.phase === 'capturing' ? 'running' : 'warn'} />
      <div className="min-w-0">
        <p className="text-2xs font-medium text-foreground">
          {state.phase === 'capturing'
            ? t('morpheus.capture.active')
            : t('morpheus.capture.recent')}
        </p>
        {state.phase === 'captured' && state.path && (
          <p
            data-testid="morpheus-capture-path"
            className="truncate font-mono text-2xs text-muted-foreground"
            title={state.path}
          >
            {t('morpheus.capture.savedTo')} {state.path}
          </p>
        )}
      </div>
    </div>
  );
}
