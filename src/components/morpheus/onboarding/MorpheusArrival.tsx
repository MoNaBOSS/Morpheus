import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MorpheusBoot } from '@/components/morpheus/boot/MorpheusBoot';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { MorpheusActivation } from './MorpheusActivation';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { playMorpheusSpeech } from '@/lib/morpheus-speech-player';

type MorpheusArrivalProps = {
  bootEnabled: boolean;
  onboardingEnabled: boolean;
};

/**
 * Owns the complete arrival sequence so boot, activation and the living
 * Command Center cannot race or flash as independent overlays.
 */
export function MorpheusArrival({ bootEnabled, onboardingEnabled }: MorpheusArrivalProps) {
  const { t } = useTranslation('dashboard');
  const onboarding = useMorpheusCompanionStore((state) => state.onboarding);
  const loadOnboarding = useMorpheusCompanionStore((state) => state.loadOnboarding);
  const [bootDone, setBootDone] = useState(!bootEnabled);
  const voiceStatus = useMorpheusVoiceStore((state) => state.status);
  const loadVoiceStatus = useMorpheusVoiceStore((state) => state.loadStatus);
  const returningGreetingSpoken = useRef(false);

  useEffect(() => {
    void Promise.all([loadOnboarding(), loadVoiceStatus()]);
  }, [loadOnboarding, loadVoiceStatus]);

  useEffect(() => {
    if (bootDone || !onboarding?.completed || !onboarding.preferences.speakResponses
      || returningGreetingSpoken.current) return;
    returningGreetingSpoken.current = true;
    const name = onboarding.preferences.preferredName.trim();
    const message = name
      ? t('morpheus.boot.welcomeBack', { name })
      : t('morpheus.boot.welcomeBackGeneric');
    void playMorpheusSpeech(message, {
      neuralAvailable: Boolean(voiceStatus?.neuralSpeechAvailable),
    }).catch(() => undefined);
  }, [bootDone, onboarding, t, voiceStatus?.neuralSpeechAvailable]);

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
    </>
  );
}
