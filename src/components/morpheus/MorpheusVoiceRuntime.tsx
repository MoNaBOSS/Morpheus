import { useEffect, useRef } from 'react';
import { Radio, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { hostEvents } from '@/lib/host-events';
import { morpheusVoiceSpeechFor } from '@/lib/morpheus-voice-runtime';
import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusArrivalStore } from '@/stores/morpheus-arrival';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { MorpheusSignal } from './signal/MorpheusSignal';
import { resolveMorpheusSignalState } from './signal/signal-state';

export function MorpheusVoiceRuntime() {
  const { t } = useTranslation('dashboard');
  const welcomeOpen = useMorpheusArrivalStore((state) => state.welcomeOpen);
  const onboardingComplete = useMorpheusCompanionStore((state) => state.onboarding?.completed);
  const activationPresentationEnabled = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('morpheusOnboarding') === 'on';
  const showQuickCommand = useMorpheusQuickCommandStore((state) => state.show);
  const quickCommandOpen = useMorpheusQuickCommandStore((state) => state.open);
  const phase = useMorpheusVoiceStore((state) => state.phase);
  const followUpUntil = useMorpheusVoiceStore((state) => state.followUpUntil);
  const endFollowUp = useMorpheusVoiceStore((state) => state.endFollowUp);
  const continueAfterResponse = useMorpheusVoiceStore((state) => state.continueAfterResponse);
  const transcript = useMorpheusVoiceStore((state) => state.transcript);
  const error = useMorpheusVoiceStore((state) => state.error);
  const errorKind = useMorpheusVoiceStore((state) => state.errorKind);
  const source = useMorpheusVoiceStore((state) => state.source);
  const status = useMorpheusVoiceStore((state) => state.status);
  const presence = useMorpheusVoiceStore((state) => state.presence);
  const loadStatus = useMorpheusVoiceStore((state) => state.loadStatus);
  const startListening = useMorpheusVoiceStore((state) => state.startListening);
  const stopListening = useMorpheusVoiceStore((state) => state.stopListening);
  const cancel = useMorpheusVoiceStore((state) => state.cancel);
  const dismiss = useMorpheusVoiceStore((state) => state.dismiss);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const spokenStateKey = useRef<string | null>(null);
  const speaking = presence?.state === 'speaking';
  const preparingSpeech = presence?.state === 'preparing-speech';
  const message = morpheusVoiceSpeechFor(objectiveRun);
  // Metadata updates are not new utterances. Stable semantic dependencies also
  // keep the playback callback alive until audio actually ends.
  const stateKey = objectiveRun && message
    ? JSON.stringify([objectiveRun.objectiveRunId, objectiveRun.state, message]) : null;
  const voiceOrigin = objectiveRun?.origin.type === 'voice';

  useEffect(() => {
    void loadStatus();
    return hostEvents.onMorpheusVoiceCommand((payload) => {
      showQuickCommand(payload.trigger);
      void startListening('global-shortcut');
    });
  }, [loadStatus, showQuickCommand, startListening]);

  useEffect(() => {
    if (!voiceOrigin || !message || spokenStateKey.current === stateKey) return;

    spokenStateKey.current = stateKey;
    if (!status?.settings.speakResponses) {
      void continueAfterResponse();
      return;
    }
    void playMorpheusSpeech(message, {
      neuralAvailable: status.neuralSpeechAvailable,
    }).then((result) => {
      if (result !== 'cancelled') void continueAfterResponse();
    }).catch(() => {
      void continueAfterResponse();
    });
    return () => {
      stopMorpheusSpeech();
    };
  }, [continueAfterResponse, voiceOrigin, message, stateKey, status?.neuralSpeechAvailable, status?.settings.speakResponses]);

  const ambientActive = Boolean(presence?.ambientEnabled && presence.state !== 'asleep');
  // Arrival has its own live speech label, fallback disclosure and Stop control.
  // Never conceal microphone activity, a follow-up session or an input error.
  const greetingPresentation = !presence || presence.state === 'asleep'
    || presence.state === 'speaking' || presence.state === 'preparing-speech';
  // First-run activation owns its full-screen Signal and microphone controls.
  // A second floating HUD makes the introduction look like two competing apps.
  if (activationPresentationEnabled && onboardingComplete !== true) return null;
  if (welcomeOpen && greetingPresentation && phase === 'idle' && !ambientActive && !error && !followUpUntil) return null;
  // Presence owns the same state inside Quick Command. Avoid stacking a second
  // floating voice surface over the compact Windows companion.
  if (quickCommandOpen) return null;
  if (phase === 'idle' && !speaking && !preparingSpeech && !ambientActive) return null;

  const listening = phase === 'listening' || presence?.state === 'listening';
  const processing = preparingSpeech || phase === 'requesting' || phase === 'transcribing'
    || presence?.state === 'transcribing' || presence?.state === 'understanding'
    || presence?.state === 'working';
  const ambientEngaged = ambientActive && presence?.state !== 'armed';
  const label = followUpUntil ? t('morpheus.voice.dialogue.listening') : speaking
    ? t('morpheus.voice.speaking')
    : preparingSpeech ? t('morpheus.voice.preparingSpeech') : ambientActive
      ? t(`morpheus.voice.presence.${presence?.state ?? 'armed'}`)
      : t(`morpheus.voice.states.${phase}`);

  if (ambientActive && !ambientEngaged && phase === 'idle' && !speaking && !error && !followUpUntil) {
    return (
      <aside
        data-morpheus
        data-testid="morpheus-ambient-voice-indicator"
        data-phase="armed"
        role="status"
        aria-live="polite"
        className="pointer-events-auto fixed right-5 top-11 z-[100100] flex items-center gap-2 rounded-full border border-[hsl(var(--morpheus-accent-dim))]/40 bg-[hsl(var(--morpheus-surface-2))]/92 px-3 py-1.5 shadow-xl shadow-black/30 backdrop-blur-xl"
      >
        <span className="relative flex h-5 w-5 items-center justify-center text-[hsl(var(--morpheus-accent))]">
          <Radio className="h-3.5 w-3.5" aria-hidden />
          <span className="absolute inset-0 rounded-full border border-[hsl(var(--morpheus-accent))]/25 motion-safe:animate-pulse" aria-hidden />
        </span>
        <span className="text-2xs font-medium text-foreground">{label}</span>
        <span className="h-1 w-1 rounded-full bg-[hsl(var(--morpheus-accent))]" aria-hidden />
        <span className="text-2xs text-muted-foreground">
          {t('morpheus.voice.wakeHint', { phrase: status?.settings.wakePhrase ?? 'Morpheus' })}
        </span>
      </aside>
    );
  }

  return (
    <aside
      data-morpheus
      data-testid="morpheus-voice-indicator"
      data-phase={followUpUntil ? 'awaiting-command' : speaking ? 'speaking' : preparingSpeech ? 'preparing-speech' : ambientEngaged ? presence?.state : phase}
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed left-1/2 top-11 z-[100100] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-[hsl(var(--morpheus-accent-dim))]/35 bg-[linear-gradient(135deg,hsl(var(--morpheus-surface-2))_0%,hsl(var(--morpheus-surface-1))_100%)]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <MorpheusSignal className="h-16 w-16 shrink-0" compact
          state={resolveMorpheusSignalState({ voicePhase: phase, voicePresence: presence?.state })} />

        <div className="min-w-0 flex-1">
          <p className="text-tiny font-medium text-foreground">{label}</p>
          {followUpUntil ? <p data-testid="morpheus-voice-follow-up" className="mt-1 text-xs text-muted-foreground">
            {t('morpheus.voice.dialogue.hint')}
          </p> : null}
          {speaking && presence?.speechFailure ? (
            <Link to="/settings?section=voice" data-testid="morpheus-speech-fallback-notice"
              className="mt-1 block text-2xs text-[hsl(var(--morpheus-warn))] underline">
              {t(`morpheus.voice.speechFailure.${presence.speechFailure}`)}
            </Link>
          ) : null}
          {transcript && phase === 'ready' ? (
            <p data-testid="morpheus-voice-transcript" className="mt-0.5 truncate text-2xs text-muted-foreground">
              {transcript}
            </p>
          ) : null}
          {ambientActive && status?.providerLabel ? (
            <p className="mt-0.5 truncate text-2xs text-muted-foreground">
              {t('morpheus.voice.providerDisclosure', { provider: status.providerLabel })}
            </p>
          ) : null}
          {error ? (
            <p data-testid="morpheus-voice-error" className="mt-0.5 truncate text-2xs text-[hsl(var(--morpheus-danger))]">
              {errorKind === 'repeat'
                ? t('morpheus.voice.repeatBody')
                : errorKind === 'network'
                  ? t('morpheus.voice.networkBody')
                : errorKind === 'configuration'
                  ? t('morpheus.voice.configurationBody')
                  : t('morpheus.voice.errorBody')}
            </p>
          ) : null}
        </div>

        {(errorKind === 'repeat' || errorKind === 'network') && source !== 'ambient' ? (
          <button
            type="button"
            data-testid="morpheus-voice-retry"
            onClick={() => void startListening(source ?? 'command-center')}
            className="shrink-0 border-b border-[hsl(var(--morpheus-accent-dim))] pb-1 text-2xs text-[hsl(var(--morpheus-accent))]"
          >
            {t('morpheus.voice.retry')}
          </button>
        ) : null}
        {errorKind === 'configuration' ? (
          <Link
            to="/models?addProvider=1"
            data-testid="morpheus-voice-connect-provider"
            onClick={dismiss}
            className="shrink-0 border-b border-[hsl(var(--morpheus-accent-dim))] pb-1 text-2xs text-[hsl(var(--morpheus-accent))]"
          >
            {t('morpheus.voice.connectProvider')}
          </Link>
        ) : null}
        {listening ? (
          <button
            type="button"
            data-testid="morpheus-voice-stop"
            onClick={stopListening}
            className="rounded border border-[hsl(var(--morpheus-accent-dim))] px-2.5 py-1 text-2xs text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10"
          >
            {t('morpheus.voice.stop')}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="morpheus-voice-dismiss"
          aria-label={processing || listening ? t('morpheus.voice.cancel') : t('morpheus.voice.dismiss')}
          onClick={() => {
            endFollowUp();
            if (speaking || preparingSpeech) {
              stopMorpheusSpeech();
            }
            if (processing || listening) cancel();
            else dismiss();
          }}
          className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {listening ? (
        <div className="h-px w-full overflow-hidden bg-border/40" aria-hidden>
          <div className="h-full w-1/3 bg-[hsl(var(--morpheus-accent))] motion-safe:animate-[morpheus-voice-scan_1.2s_ease-in-out_infinite]" />
        </div>
      ) : null}
    </aside>
  );
}
