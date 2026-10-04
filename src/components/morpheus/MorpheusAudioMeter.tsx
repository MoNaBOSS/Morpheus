import { useEffect, useRef } from 'react';
import { subscribeMorpheusAudioLevel } from '@/lib/morpheus-audio-level';
import { isMorpheusPresentationVisible, observeMorpheusPresentationVisibility } from '@/lib/morpheus-presentation-visibility';

/** A compact amplitude meter, fed only by the existing microphone/playback owner. */
export function MorpheusAudioMeter({ state }: { state: 'listening' | 'speaking' }) {
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let unsubscribe: (() => void) | undefined;
    const sync = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      node.style.setProperty('--morpheus-meter-level', '0');
      if (isMorpheusPresentationVisible()) {
        unsubscribe = subscribeMorpheusAudioLevel((level) => {
          node.style.setProperty('--morpheus-meter-level', isMorpheusPresentationVisible() ? level.toFixed(3) : '0');
        });
      }
    };
    sync();
    const stopObserving = observeMorpheusPresentationVisibility(sync);
    return () => { stopObserving(); unsubscribe?.(); };
  }, [state]);

  return <span ref={element} data-testid="morpheus-audio-meter" data-audio-state={state}
    className="morpheus-audio-meter" aria-hidden="true">
    <i /><i /><i /><i /><i />
  </span>;
}
