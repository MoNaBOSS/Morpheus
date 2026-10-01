import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hostApi } from '@/lib/host-api';
import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { useMorpheusIntelligenceStore } from '@/stores/morpheus-intelligence';

import { MorpheusBoot } from '@/components/morpheus/boot/MorpheusBoot';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { MorpheusActivation } from './MorpheusActivation';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
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
  const { t } = useTranslation('dashboard');
  const onboarding = useMorpheusCompanionStore((state) => state.onboarding);
  const loadOnboarding = useMorpheusCompanionStore((state) => state.loadOnboarding);
  const [bootDone, setBootDone] = useState(!bootEnabled);
  const loadVoiceStatus = useMorpheusVoiceStore((state) => state.loadStatus);
  const [returning, setReturning] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const voice = useMorpheusVoiceStore((s) => s.status);
  const dnd = useMorpheusIntelligenceStore((s) => s.proactive.settings.doNotDisturb);

  useEffect(() => {
    let cancelled = false;
    void loadVoiceStatus();
    void loadOnboarding().then(() => {
      if (!cancelled) setReturning(Boolean(useMorpheusCompanionStore.getState().onboarding?.completed));
    });
    return () => { cancelled = true; };
  }, [loadOnboarding, loadVoiceStatus]);

  useEffect(() => {
    if (!bootEnabled || !onboardingEnabled || !returning) return;
    let active = true;
    const request = () => {
      if (document.hidden) return;
      void hostApi.morpheus.admitArrivalGreeting().then((admission) => {
        if (!active || !admission.admitted) return;
        setGreeting(admission.preferredName
          ? t('morpheus.boot.welcomeBack', { name: admission.preferredName })
          : t('morpheus.boot.welcomeBackGeneric'));
      }).catch(() => undefined);
    };
    request();
    window.addEventListener('focus', request);
    return () => { active = false; window.removeEventListener('focus', request); };
  }, [bootEnabled, onboardingEnabled, returning, t]);

  useEffect(() => {
    if (!greeting) return;
    const timer = window.setTimeout(() => setGreeting(null), dnd ? 0 : 8_000);
    if (!dnd && voice?.neuralSpeechAvailable && voice.settings.speakResponses && onboarding?.preferences.speakResponses) {
      void playMorpheusSpeech(greeting, { neuralAvailable: true, format: voice?.speechFormat, allowWindowsFallback: false }).catch(() => undefined);
    }
    return () => { window.clearTimeout(timer); stopMorpheusSpeech(); };
  }, [greeting, dnd, voice?.neuralSpeechAvailable, voice?.speechFormat, voice?.settings.speakResponses, onboarding?.preferences.speakResponses]);

  const finishBoot = useCallback(() => setBootDone(true), []);

  const completed = Boolean(onboarding?.completed);
  const preferredName = onboarding?.preferences.preferredName.trim() ?? '';

  return (
    <>
      {onboarding?.completed === false ? <MorpheusBoot
        enabled={bootEnabled && !bootDone}
        mode={completed ? 'returning' : 'first-run'}
        preferredName={preferredName}
        onDismissed={finishBoot}
      /> : null}
      <MorpheusActivation
        enabled={onboardingEnabled && (bootDone || returning)}
      />
      <MorpheusWelcome />
      {greeting && !dnd ? <aside data-testid="morpheus-arrival-greeting" role="status" aria-live="polite" className="pointer-events-none fixed bottom-32 right-5 z-[9997] max-w-xs rounded-xl bg-surface-modal px-4 py-3 text-sm text-foreground shadow-lg">{greeting}</aside> : null}
    </>
  );
}
