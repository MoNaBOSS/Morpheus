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
import { MorpheusFluidOrb } from '@/components/morpheus/MorpheusFluidOrb';
import { MORPHEUS_BOOT_PHASES, useBootPhases } from './use-boot-phases';

/** Duration of the fade, kept in sync with `.morpheus-boot-leaving` in globals.css. */
const LEAVE_MS = 320;
const READY_HOLD_MS = 420;

type MorpheusBootProps = {
  enabled: boolean;
  mode?: 'first-run' | 'returning';
  preferredName?: string;
  onDismissed?: () => void;
};

export function MorpheusBoot({
  enabled,
  mode = 'first-run',
  preferredName = '',
  onDismissed,
}: MorpheusBootProps) {
  const { t } = useTranslation('dashboard');
  const [leaving, setLeaving] = useState(false);
  const [unmounted, setUnmounted] = useState(!enabled);

  // Reaching READY naturally dwells briefly so the final real state is legible.
  // An explicit skip must feel instant, so it bypasses the dwell entirely.
  const skippedRef = useRef(false);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleComplete = useCallback(() => {
    if (skippedRef.current) {
      setLeaving(true);
      return;
    }
    readyTimer.current = setTimeout(() => setLeaving(true), mode === 'returning' ? 100 : READY_HOLD_MS);
  }, [mode]);
  useEffect(() => () => { if (readyTimer.current) clearTimeout(readyTimer.current); }, []);

  const { phase, progress, skip } = useBootPhases({ enabled, minMs: mode === 'returning' ? 500 : 1_700, maxMs: mode === 'returning' ? 1_100 : 3_500, onComplete: handleComplete });

  const skipNow = useCallback(() => {
    skippedRef.current = true;
    skip();
  }, [skip]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => {
      setUnmounted(true);
      onDismissed?.();
    }, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDismissed]);

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
      data-arrival-mode={mode}
      role="status"
      aria-live="polite"
      className={cn(
        'morpheus-boot morpheus-opening fixed inset-0 z-[9998] flex flex-col items-center justify-center overflow-hidden',
        leaving && 'morpheus-boot-leaving morpheus-opening-leaving pointer-events-none',
      )}
    >
      <button type="button" onClick={skipNow} data-testid="morpheus-boot-skip" className="morpheus-opening-skip">{t('morpheus.experience.opening.skip')}</button>
      <div className="morpheus-opening-copy">
        <MorpheusFluidOrb
          state="ready"
          identity="arrival"
          className="morpheus-opening-identity"
          label={t('morpheus.boot.title')}
        />
        <h1>
          {mode === 'returning'
            ? preferredName
              ? t('morpheus.boot.welcomeBack', { name: preferredName })
              : t('morpheus.boot.welcomeBackGeneric')
            : t('morpheus.experience.opening.title')}
        </h1>
        <p className="morpheus-opening-subtitle">{t('morpheus.experience.opening.subtitle')}</p>

        <div className="sr-only">
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

      </div>
      <p className="morpheus-opening-footer">{t('morpheus.experience.opening.footer')}</p>

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
