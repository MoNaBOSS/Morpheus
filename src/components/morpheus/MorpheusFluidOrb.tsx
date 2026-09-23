import { useEffect, useRef } from 'react';

import orbArtwork from '../../../resources/morpheus-orb/orb.png';
import { subscribeMorpheusAudioLevel } from '@/lib/morpheus-audio-level';
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

  useEffect(() => {
    if (state !== 'listening') {
      element.current?.style.setProperty('--morpheus-audio-level', '0');
      return;
    }
    return subscribeMorpheusAudioLevel((level) => {
      if (!document.hidden) element.current?.style.setProperty('--morpheus-audio-level', level.toFixed(3));
    });
  }, [state]);

  return (
    <div
      ref={element}
      data-testid="morpheus-fluid-orb"
      data-signal-state={state}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('morpheus-fluid-orb', className)}
    >
      <span className="morpheus-fluid-orb-light" aria-hidden />
      <img src={orbArtwork} alt="" draggable={false} />
    </div>
  );
}
