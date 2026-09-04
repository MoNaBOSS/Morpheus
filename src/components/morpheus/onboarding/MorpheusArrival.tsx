import { useCallback, useEffect, useRef, useState } from 'react';

import { MorpheusBoot } from '@/components/morpheus/boot/MorpheusBoot';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { MorpheusActivation } from './MorpheusActivation';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusArrivalStore } from '@/stores/morpheus-arrival';
import { MorpheusWelcome } from './MorpheusWelcome';

type MorpheusArrivalProps = {
  bootEnabled: boolean;
  onboardingEnabled: boolean;
};

/**
 * Owns the complete arrival sequence so boot, activation and the living
 * Command Center cannot race or flash as independent overlays.
 */
export function MorpheusArrival({ bootEnabled, onboardingEnabled }: MorpheusArrivalProps) {
  const onboarding = useMorpheusCompanionStore((state) => state.onboarding);
  const loadOnboarding = useMorpheusCompanionStore((state) => state.loadOnboarding);
  const [bootDone, setBootDone] = useState(!bootEnabled);
  const loadVoiceStatus = useMorpheusVoiceStore((state) => state.loadStatus);
  const [returning, setReturning] = useState(false);
  const welcomeShown = useRef(false);
  const openWelcome = useMorpheusArrivalStore((s) => s.openWelcome);

  useEffect(() => {
    let cancelled = false;
    void loadVoiceStatus();
    void loadOnboarding().then(() => {
      if (!cancelled) setReturning(Boolean(useMorpheusCompanionStore.getState().onboarding?.completed));
    });
    return () => { cancelled = true; };
  }, [loadOnboarding, loadVoiceStatus]);

  useEffect(() => {
    if (!bootEnabled || !onboardingEnabled || !bootDone || !returning || welcomeShown.current) return;
    welcomeShown.current = true;
    openWelcome();
  }, [bootEnabled, onboardingEnabled, bootDone, returning, openWelcome]);

  const finishBoot = useCallback(() => setBootDone(true), []);

  const completed = Boolean(onboarding?.completed);
  const preferredName = onboarding?.preferences.preferredName.trim() ?? '';

  return (
    <>
      <MorpheusBoot
        enabled={bootEnabled && !bootDone}
        mode={completed ? 'returning' : 'first-run'}
        preferredName={preferredName}
        onDismissed={finishBoot}
      />
      <MorpheusActivation
        enabled={onboardingEnabled && bootDone}
      />
      <MorpheusWelcome />
    </>
  );
}
