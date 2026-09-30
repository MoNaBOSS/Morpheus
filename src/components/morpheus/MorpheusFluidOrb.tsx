import { useEffect, useRef } from 'react';

import '../../../resources/morpheus-orb/motion.css';
import orbArtwork from '../../../resources/morpheus-orb/orb.png';
import { subscribeMorpheusAudioLevel } from '@/lib/morpheus-audio-level';
import { isMorpheusPresentationVisible, observeMorpheusPresentationVisibility } from '@/lib/morpheus-presentation-visibility';
import { cn } from '@/lib/utils';
import type { MorpheusSignalState } from './signal/signal-state';

type MorpheusFluidOrbProps = {
  state: MorpheusSignalState;
  className?: string;
  label?: string;
};

/** The approved orb stays intact; only the light around it changes with real state. */
export function MorpheusFluidOrb({ state, className, label }: MorpheusFluidOrbProps) {
  const element = useRef<HTMLDivElement>(null);
  const motionState = state === 'asleep' ? 'quiet'
    : state === 'listening' || state === 'speaking' ? state
      : state === 'planning' || state === 'executing' || state === 'understanding' ? 'working'
        : state === 'trust' || state === 'failed' || state === 'degraded' ? 'attention' : 'idle';

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let unsubscribe: (() => void) | undefined;
    const syncVisibility = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      const visible = isMorpheusPresentationVisible();
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
  }, [state]);

  return (
    <div
      ref={element}
      data-testid="morpheus-fluid-orb"
      data-signal-state={state}
      data-motion-state={motionState}
      data-motion-tone={state === 'failed' || state === 'degraded' ? 'error' : 'normal'}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('morpheus-fluid-orb morpheus-motion', className)}
    >
      <span className="morpheus-motion__aurora" aria-hidden />
      <span className="morpheus-motion__halo" aria-hidden />
      <img className="morpheus-motion__artwork" src={orbArtwork} alt="" draggable={false} />
      <span className="morpheus-motion__cue" aria-hidden>{state === 'trust' ? '?' : state === 'failed' || state === 'degraded' ? '!' : ''}</span>
    </div>
  );
}
