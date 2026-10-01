import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hostApi } from '@/lib/host-api';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusIntelligenceStore } from '@/stores/morpheus-intelligence';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { playMorpheusSpeech } from '@/lib/morpheus-speech-player';

import { MORPHEUS_SOCIAL_INVITATION_LIFETIME_MS } from '@shared/morpheus/social-check-in-types';

/** A local, non-modal check-in. Silence costs no provider call and backs off. */
export function MorpheusSocialCheckIn({ activeCount }: { activeCount: number }) {
  const level = useMorpheusCompanionStore((s) => s.onboarding?.preferences.proactivityLevel ?? 'balanced');
  const settings = useMorpheusIntelligenceStore((s) => s.proactive.settings);
  if (level === 'quiet' || settings.doNotDisturb || !settings.enabled || activeCount > 0) return null;
  return <SocialCheckIn level={level} />;
}

function SocialCheckIn({ level }: { level: 'balanced' | 'talkative' }) {
  const { t } = useTranslation('dashboard');
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const invitation = useRef<string | null>(null);
  const speakingInvitation = useRef<AbortController | null>(null);
  const dismiss = (): void => {
    const id = invitation.current;
    invitation.current = null;
    setInvitationId(null);
    speakingInvitation.current?.abort();
    speakingInvitation.current = null;
    if (id) void hostApi.morpheus.dismissSocialCheckIn(id).catch(() => { /* Main expiry recovers missed dismissal. */ });
  };
  useEffect(() => {
    let lastInput = Date.now();
    let disposed = false;
    let pending = false;
    const activity = () => { lastInput = Date.now(); dismiss(); };
    window.addEventListener('pointerdown', activity, { passive: true });
    window.addEventListener('keydown', activity);
    const timer = window.setInterval(() => {
      const idleMs = level === 'talkative' ? 10 * 60_000 : 30 * 60_000;
      if (invitation.current || pending || Date.now() - lastInput < idleMs) return;
      pending = true;
      void hostApi.morpheus.admitSocialCheckIn(true).then((result) => {
        if (!result.admitted || !result.invitationId) return;
        if (disposed || Date.now() - lastInput < idleMs) {
          void hostApi.morpheus.dismissSocialCheckIn(result.invitationId).catch(() => {});
          return;
        }
        invitation.current = result.invitationId;
        setInvitationId(result.invitationId);
        setCaption(result.text ?? '');
        const voice = useMorpheusVoiceStore.getState().status;
        const preferences = useMorpheusCompanionStore.getState().onboarding?.preferences;
        if (result.text && preferences?.speakResponses && voice?.settings.speakResponses && voice.neuralSpeechAvailable) {
          const controller = new AbortController();
          speakingInvitation.current = controller;
          void playMorpheusSpeech(result.text, { neuralAvailable: true, allowWindowsFallback: false, signal: controller.signal })
            .catch(() => undefined).finally(() => {
              if (speakingInvitation.current === controller) speakingInvitation.current = null;
            });
        }
      }).catch(() => { /* No provider calls; next availability tick may retry. */ }).finally(() => { pending = false; });
    }, 60_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      speakingInvitation.current?.abort();
      speakingInvitation.current = null;
      const id = invitation.current;
      invitation.current = null;
      if (id) void hostApi.morpheus.dismissSocialCheckIn(id).catch(() => {});
    };
  // Main rechecks quiet policy and native availability on each admission.
  }, [level]);
  useEffect(() => {
    if (!invitationId) return;
    const dismissTimer = window.setTimeout(dismiss, MORPHEUS_SOCIAL_INVITATION_LIFETIME_MS);
    return () => { window.clearTimeout(dismissTimer); };
  }, [invitationId]);
  if (!invitationId) return null;
  return <div data-testid="morpheus-social-check-in" className="fixed bottom-32 right-5 z-[9997] flex max-w-xs items-center gap-3 rounded-xl bg-surface-modal px-4 py-3 text-sm text-foreground shadow-lg" aria-live="polite">
    <span>{caption || t('morpheus.socialCheckIn.question')}</span>
    <button type="button" onClick={dismiss} aria-label={t('morpheus.socialCheckIn.dismiss')} className="text-muted-foreground hover:text-foreground">×</button>
  </div>;
}
