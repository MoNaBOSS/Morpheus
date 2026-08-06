/**
 * Morpheus boot sequence.
 *
 * Mounted as a sibling of <Routes>, NOT as a route and NOT as a second
 * BrowserWindow:
 *  - a `/boot` route would fight the first-launch `/setup` redirect;
 *  - a second window would make Playwright's "last open window" selection a
 *    race for every existing spec.
 *
 * Because the overlay is the first paint, the existing `show:false` +
 * `ready-to-show` window flow needs no change at all.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { MatrixRain } from './MatrixRain';
import { MORPHEUS_BOOT_PHASES, useBootPhases } from './use-boot-phases';

/** Duration of the fade, kept in sync with `.morpheus-boot-leaving` in globals.css. */
const LEAVE_MS = 320;
const READY_HOLD_MS = 420;

type MorpheusBootProps = {
  enabled: boolean;
};

export function MorpheusBoot({ enabled }: MorpheusBootProps) {
  const { t } = useTranslation('dashboard');
  const [leaving, setLeaving] = useState(false);
  const [unmounted, setUnmounted] = useState(!enabled);

  // Reaching READY naturally dwells briefly so the final real state is legible.
  // An explicit skip must feel instant, so it bypasses the dwell entirely.
  const skippedRef = useRef(false);
  const handleComplete = useCallback(() => {
    if (skippedRef.current) {
      setLeaving(true);
      return;
    }
    setTimeout(() => setLeaving(true), READY_HOLD_MS);
  }, []);

  const { phase, progress, skip } = useBootPhases({ enabled, onComplete: handleComplete });

  const skipNow = useCallback(() => {
    skippedRef.current = true;
    skip();
  }, [skip]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => setUnmounted(true), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  useEffect(() => {
    if (!enabled || unmounted) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skipNow();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, unmounted, skipNow]);

  if (!enabled || unmounted) return null;

  return (
    <div
      data-morpheus
      data-testid="morpheus-boot"
      data-phase={phase}
      role="status"
      aria-live="polite"
      onClick={skipNow}
      className={cn(
        'morpheus-boot fixed inset-0 z-[9998] flex flex-col items-center justify-center overflow-hidden',
        leaving && 'morpheus-boot-leaving pointer-events-none',
      )}
    >
      <MatrixRain />

      <div className="relative flex flex-col items-center gap-6 px-6 text-center">
        <h1 className="morpheus-boot-title font-mono text-3xl font-semibold sm:text-5xl">
          {t('morpheus.boot.title')}
        </h1>

        <div className="w-64 max-w-full">
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              data-testid="morpheus-boot-progress"
              className="h-full bg-current transition-[width] duration-300 morpheus-boot-phase"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p
            data-testid="morpheus-boot-phase"
            data-ready={phase === 'ready' ? 'true' : 'false'}
            className="morpheus-boot-phase mt-3 font-mono text-tiny uppercase tracking-[0.25em]"
          >
            {t(`morpheus.boot.phases.${phase}`)}
          </p>
        </div>

        <p className="font-mono text-2xs uppercase tracking-[0.2em] text-white/40">
          {t('morpheus.boot.skip')}
        </p>
      </div>

      {/* Ordered phase list for assistive technology and for E2E introspection. */}
      <ol className="sr-only">
        {MORPHEUS_BOOT_PHASES.map((bootPhase) => (
          <li key={bootPhase} data-boot-phase={bootPhase}>
            {t(`morpheus.boot.phases.${bootPhase}`)}
          </li>
        ))}
      </ol>
    </div>
  );
}
