import { useEffect, useRef } from 'react';

import morpheusLogo from '@/assets/morpheus-logo.svg';
import { isMorpheusPresentationVisible, observeMorpheusPresentationVisibility } from '@/lib/morpheus-presentation-visibility';
import { cn } from '@/lib/utils';
import './morpheus-brand-mark.css';

/** Decorative identity only: movement never represents microphone authority. */
export function MorpheusBrandMark({ className, active = true }: { className?: string; active?: boolean }) {
  const element = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const syncVisibility = () => {
      if (element.current) element.current.dataset.motionPaused = String(!active || !isMorpheusPresentationVisible());
    };
    syncVisibility();
    return observeMorpheusPresentationVisibility(syncVisibility);
  }, [active]);

  return (
    <span ref={element} className={cn('morpheus-brand-mark', className)} data-testid="morpheus-brand-mark" aria-hidden>
      <span className="morpheus-brand-mark__arrival">
        <img className="morpheus-brand-mark__identity" src={morpheusLogo} alt="" draggable={false} />
      </span>
    </span>
  );
}
