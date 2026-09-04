import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMorpheusArrivalStore } from '@/stores/morpheus-arrival';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { MorpheusSignal } from '../signal/MorpheusSignal';
import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { MorpheusTrayChoice } from './MorpheusTrayChoice';

/** A returning arrival, not a repeated setup wizard or an execution readiness claim. */
export function MorpheusWelcome() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const open = useMorpheusArrivalStore((s) => s.welcomeOpen);
  const close = useMorpheusArrivalStore((s) => s.closeWelcome);
  const onboarding = useMorpheusCompanionStore((s) => s.onboarding);
  const voice = useMorpheusVoiceStore((s) => s.status);
  const loadVoice = useMorpheusVoiceStore((s) => s.loadStatus);
  const [speaking, setSpeaking] = useState(false);
  const greeted = useRef(false);
  const name = onboarding?.preferences.preferredName.trim();
  const greeting = name ? t('morpheus.boot.welcomeBack', { name }) : t('morpheus.boot.welcomeBackGeneric');

  useEffect(() => {
    if (!open) return;
    void loadVoice();
    return () => { greeted.current = false; stopMorpheusSpeech(); };
  }, [open, loadVoice]);

  useEffect(() => {
    if (!open || !voice || !onboarding || greeted.current) return;
    greeted.current = true;
    if (!onboarding.preferences.speakResponses || !voice.settings.speakResponses) return;
    void playMorpheusSpeech(greeting, {
      neuralAvailable: voice.neuralSpeechAvailable,
      onSpeakingChange: setSpeaking,
    }).catch(() => undefined);
  }, [open, voice, onboarding, greeting]);

  const finish = (route?: string) => {
    stopMorpheusSpeech();
    close();
    if (route) navigate(route);
  };

  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) finish(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="morpheus-welcome-backdrop" />
      <Dialog.Content data-morpheus data-testid="morpheus-welcome" className="morpheus-welcome morpheus-signal-activation">
        <div aria-hidden className="morpheus-activation-depth absolute inset-0" />
        <header className="relative flex h-16 items-center justify-between border-b border-white/[0.06] px-8">
          <span className="font-serif tracking-[0.22em]">{t('morpheus.title')}</span>
          <Dialog.Close data-testid="morpheus-welcome-close" aria-label={t('morpheus.arrival.close')} className="morpheus-fluid-icon"><X size={19} /></Dialog.Close>
        </header>
        <div className="morpheus-welcome-body">
          <div className="morpheus-welcome-presence">
            <MorpheusSignal state={speaking ? 'speaking' : 'ready'} className="morpheus-hero-signal" label={t('morpheus.title')} />
          </div>
          <div className="morpheus-welcome-copy">
            <Dialog.Title className="font-serif text-5xl font-normal leading-[1.07] tracking-tight">{greeting}</Dialog.Title>
            <Dialog.Description className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">{t('morpheus.arrival.subtitle')}</Dialog.Description>
            {onboarding?.preferences.personality === 'witty' ? <p className="mt-4 text-sm text-foreground/65">{t('morpheus.arrival.witty')}</p> : null}
            <div className="mt-9 flex flex-wrap gap-3">
              <button type="button" data-testid="morpheus-welcome-enter" onClick={() => finish('/')} className="morpheus-fluid-button">{t('morpheus.arrival.open')}<ArrowRight size={17} /></button>
              <MorpheusTrayChoice onTransferred={() => finish('/')} />
            </div>
            <p className="mt-5 max-w-lg text-xs leading-relaxed text-muted-foreground">{t('morpheus.arrival.trayHint')}</p>
            <div className="mt-8 border-t border-white/[0.08] pt-5">
              <p data-testid="morpheus-welcome-microphone" className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><MicOff size={15} className="mt-0.5 shrink-0" />{t('morpheus.arrival.voiceHonesty')}</p>
              <div className="mt-4 flex flex-wrap items-center gap-5">
                <button type="button" data-testid="morpheus-welcome-voice-settings" onClick={() => finish('/settings?section=voice')} className="morpheus-fluid-link">{t('morpheus.arrival.voiceSettings')}</button>
                <button type="button" data-testid="morpheus-welcome-speech" onClick={() => {
                  if (speaking) stopMorpheusSpeech();
                  else void playMorpheusSpeech(greeting, { neuralAvailable: Boolean(voice?.neuralSpeechAvailable), onSpeakingChange: setSpeaking }).catch(() => undefined);
                }} className="morpheus-fluid-link inline-flex items-center gap-2" disabled={!voice?.settings.speakResponses}>
                  {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}{t(speaking ? 'morpheus.arrival.mute' : 'morpheus.arrival.hear')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
