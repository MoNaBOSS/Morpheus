import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import '../../../resources/morpheus-orb/motion.css';
import orbArtwork from '../../../resources/morpheus-orb/orb.png';
import morpheusLogo from '@/assets/morpheus-logo.svg';
import './morpheus-experience.css';
import { subscribeMorpheusAudioLevel } from '@/lib/morpheus-audio-level';
import { isMorpheusPresentationVisible, observeMorpheusPresentationVisibility } from '@/lib/morpheus-presentation-visibility';
import { cn } from '@/lib/utils';
import type { MorpheusSignalState } from './signal/signal-state';
import { useSettingsStore } from '@/stores/settings';

type MorpheusFluidOrbProps = {
  state: MorpheusSignalState;
  className?: string;
  label?: string;
  identity?: 'orb' | 'arrival';
  active?: boolean;
};

/** The identity stays intact. Audio contours consume only the real shared meter. */
export function MorpheusFluidOrb({ state, className, label, identity = 'orb', active = true }: MorpheusFluidOrbProps) {
  const appearance = useSettingsStore((settings) => settings.morpheusAppearance);
  const { t } = useTranslation('dashboard');
  const previewLabel = t('morpheus.experience.unrestrictedPreview.badge');
  const element = useRef<HTMLDivElement>(null);
  const motionState = state === 'asleep' ? 'quiet'
    : state === 'listening' || state === 'speaking' ? state
      : state === 'understanding' ? 'understanding'
        : state === 'complete' ? 'complete'
          : state === 'planning' || state === 'executing' ? 'working'
        : state === 'trust' || state === 'failed' || state === 'degraded' ? 'attention' : 'idle';

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let unsubscribe: (() => void) | undefined;
    const syncVisibility = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      const visible = active && isMorpheusPresentationVisible();
      node.dataset.motionPaused = String(!visible);
      node.style.setProperty('--morpheus-audio-level', '0');
      if (visible && (state === 'listening' || state === 'speaking')) {
        unsubscribe = subscribeMorpheusAudioLevel((level) => {
          if (isMorpheusPresentationVisible()) node.style.setProperty('--morpheus-audio-level', level.toFixed(3));
        });
      }
    };
    syncVisibility();
    const stopObserving = observeMorpheusPresentationVisibility(syncVisibility);
    return () => {
      stopObserving();
      unsubscribe?.();
      node.style.setProperty('--morpheus-audio-level', '0');
    };
  }, [state, active]);

  return (
    <div
      ref={element}
      data-testid="morpheus-fluid-orb"
      data-appearance={appearance}
      data-signal-state={state}
      data-motion-state={motionState}
      data-motion-tone={state === 'failed' || state === 'degraded' ? 'error' : 'normal'}
      role={label ? 'img' : undefined}
      aria-label={label && appearance === 'unrestricted-preview' ? `${label} · ${previewLabel}` : label}
      aria-hidden={label ? undefined : true}
      className={cn('morpheus-fluid-orb morpheus-motion', identity === 'arrival' && 'morpheus-motion--arrival', className)}
    >
      <span className="morpheus-motion__aurora" aria-hidden />
      <span className="morpheus-motion__halo" aria-hidden />
      <img className={identity === 'arrival' ? 'morpheus-motion__mark' : 'morpheus-motion__artwork'} src={identity === 'arrival' ? morpheusLogo : orbArtwork} alt="" draggable={false} />
      <span className="morpheus-motion__cue" aria-hidden>{state === 'trust' ? '?' : state === 'failed' || state === 'degraded' ? '!' : ''}</span>
      {appearance === 'unrestricted-preview' ? <span className="morpheus-motion__preview" aria-hidden>{previewLabel}</span> : null}
    </div>
  );
}
