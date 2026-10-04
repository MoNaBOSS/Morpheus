import { useEffect, useRef } from 'react';
import { Radio, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { hostEvents } from '@/lib/host-events';
import { morpheusVoiceSpeechFor } from '@/lib/morpheus-voice-runtime';
import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusArrivalStore } from '@/stores/morpheus-arrival';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { MorpheusFluidOrb } from './MorpheusFluidOrb';
import { hostApi } from '@/lib/host-api';
import { resolveMorpheusSignalState } from './signal/signal-state';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
import { useAcpChatSessionStore } from '@/stores/acp-chat-session';
import { createMorpheusConversationSpeechOwner } from '@/lib/morpheus-conversation-speech';
import { morpheusSettingsPath, readMorpheusSettingsContext } from '@/lib/morpheus-settings-route';
import { observeMorpheusPresentationVisibility } from '@/lib/morpheus-presentation-visibility';
import './morpheus-experience.css';

export function MorpheusVoiceRuntime() {
  const showQuickCommand = useMorpheusQuickCommandStore((state) => state.show);
  const continueAfterResponse = useMorpheusVoiceStore((state) => state.continueAfterResponse);
  const source = useMorpheusVoiceStore((state) => state.source);
  const status = useMorpheusVoiceStore((state) => state.status);
  const loadStatus = useMorpheusVoiceStore((state) => state.loadStatus);
  const startListening = useMorpheusVoiceStore((state) => state.startListening);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const spokenStateKey = useRef<string | null>(null);
  const message = morpheusVoiceSpeechFor(objectiveRun);
  const setAmbientScope = useMorpheusVoiceStore((state) => state.setAmbientScope);
  // Metadata updates are not new utterances. Stable semantic dependencies also
  // keep the playback callback alive until audio actually ends.
  const stateKey = objectiveRun && message
    ? JSON.stringify([objectiveRun.objectiveRunId, objectiveRun.state, message]) : null;
  const voiceOrigin = objectiveRun?.origin.type === 'voice';

  useEffect(() => {
    const syncScope = () => {
      // Electron's native main-window visibility drives this projection. Route
      // and modal changes never grant microphone authority in a visible chat.
      // document.hidden can mean occlusion; only Main's native projection grants
      // companion audio scope. Missing startup projection defaults to typed chat.
      void setAmbientScope(document.documentElement.dataset.morpheusWindowVisible === 'false'
        ? 'companion' : 'conversation').catch(() => undefined);
    };
    syncScope();
    return observeMorpheusPresentationVisibility(syncScope);
  }, [setAmbientScope]);

  useEffect(() => {
    void loadStatus();
    return hostEvents.onMorpheusVoiceCommand((payload) => {
      showQuickCommand(payload.trigger);
      void startListening('global-shortcut');
    });
  }, [loadStatus, showQuickCommand, startListening]);

  useEffect(() => useMorpheusConversationStore.subscribe((state, previous) => {
    if (state.submitting && state.submissionSource !== 'voice'
      && (!previous.submitting || state.submissionSource !== previous.submissionSource)
      && useMorpheusVoiceStore.getState().source) useMorpheusVoiceStore.getState().cancel();
  }), []);

  useEffect(() => {
    const owner = createMorpheusConversationSpeechOwner({
      read: () => {
        const voice = useMorpheusVoiceStore.getState();
        const acp = useAcpChatSessionStore.getState();
        return { reply: voice.replyTurn, snapshot: useMorpheusConversationStore.getState().snapshot,
          activeSessionKey: acp.activeSessionKey, generation: acp.generation,
          loading: acp.loading, sending: acp.sending, cancelling: acp.cancelling, error: acp.error,
          timeline: acp.timeline, timings: acp.turnTimingsByUserMessageId,
          enabled: voice.status?.settings.enabled === true, speakResponses: voice.status?.settings.speakResponses === true };
      },
      play: (text, signal) => {
        const voice = useMorpheusVoiceStore.getState();
        return playMorpheusSpeech(text, { signal, format: voice.status?.speechFormat,
          neuralAvailable: voice.status?.neuralSpeechAvailable === true, allowWindowsFallback: false });
      },
      clear: (turnId) => useMorpheusVoiceStore.getState().clearReplyTurn(turnId),
      claim: (turnId) => useMorpheusVoiceStore.getState().claimReplyTurn(turnId),
      continueAfterResponse: () => useMorpheusVoiceStore.getState().continueAfterResponse(),
      onFailure: () => useMorpheusVoiceStore.getState().reportSpeechFailure(),
    });
    const unsubscribers = [useMorpheusVoiceStore.subscribe(owner.sync),
      useMorpheusConversationStore.subscribe(owner.sync), useAcpChatSessionStore.subscribe(owner.sync)];
    owner.sync();
    return () => { unsubscribers.forEach((unsubscribe) => unsubscribe()); owner.dispose(); };
  }, []);

  useEffect(() => {
    if (!voiceOrigin || !message || spokenStateKey.current === stateKey) return;

    spokenStateKey.current = stateKey;
    if (!source || source === 'onboarding' || status?.settings.enabled === false) return;
    if (!status?.settings.speakResponses) {
      void continueAfterResponse();
      return;
    }
    void playMorpheusSpeech(message, {
      format: status?.speechFormat,
      neuralAvailable: status.neuralSpeechAvailable,
    }).then((result) => {
      if (result !== 'cancelled') void continueAfterResponse();
    }).catch(() => {
      useMorpheusVoiceStore.getState().reportSpeechFailure();
    });
    return () => {
      stopMorpheusSpeech();
    };
  }, [continueAfterResponse, voiceOrigin, message, stateKey, source, status?.neuralSpeechAvailable, status?.speechFormat, status?.settings.speakResponses, status?.settings.enabled]);

  return null;
}

/** Layout-owned status; runtime subscriptions above remain mounted across routes. */
export function MorpheusVoiceIndicator({ inWelcome = false }: { inWelcome?: boolean }) {
  const { t } = useTranslation('dashboard');
  const location = useLocation();
  const settingsContext = location.pathname.startsWith('/settings')
    ? readMorpheusSettingsContext(location.search)
    : { returnTo: `${location.pathname}${location.search}`, surface: 'full' as const };
  const voiceSettingsPath = morpheusSettingsPath('voice', settingsContext.returnTo, settingsContext.surface);
  const welcomeOpen = useMorpheusArrivalStore((state) => state.welcomeOpen);
  const onboardingComplete = useMorpheusCompanionStore((state) => state.onboarding?.completed);
  const activationPresentationEnabled = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('morpheusOnboarding') === 'on';
  const quickCommandOpen = useMorpheusQuickCommandStore((state) => state.open);
  const phase = useMorpheusVoiceStore((state) => state.phase);
  const followUpUntil = useMorpheusVoiceStore((state) => state.followUpUntil);
  const endFollowUp = useMorpheusVoiceStore((state) => state.endFollowUp);
  const transcript = useMorpheusVoiceStore((state) => state.transcript);
  const error = useMorpheusVoiceStore((state) => state.error);
  const errorKind = useMorpheusVoiceStore((state) => state.errorKind);
  const source = useMorpheusVoiceStore((state) => state.source);
  const status = useMorpheusVoiceStore((state) => state.status);
  const presence = useMorpheusVoiceStore((state) => state.presence);
  const startListening = useMorpheusVoiceStore((state) => state.startListening);
  const stopListening = useMorpheusVoiceStore((state) => state.stopListening);
  const cancel = useMorpheusVoiceStore((state) => state.cancel);
  const dismiss = useMorpheusVoiceStore((state) => state.dismiss);
  const speaking = presence?.state === 'speaking';
  const preparingSpeech = presence?.state === 'preparing-speech';
  const ambientReady = useMorpheusVoiceStore((state) => state.ambientReady);
  const ambientScope = useMorpheusVoiceStore((state) => state.ambientScope);

  const ambientActive = Boolean(ambientScope === 'companion' && ambientReady && !error
    && presence?.ambientEnabled && presence.state !== 'asleep' && presence.state !== 'error');
  // The welcome dialog owns its status row so active controls remain accessible
  // inside its modal focus boundary. There is still one global runtime owner.
  if (welcomeOpen !== inWelcome) return null;
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
  const quietPhase = phase === 'idle' || phase === 'ready';
  if (quietPhase && !error && !followUpUntil && !speaking && !preparingSpeech && !ambientActive) return null;

  const listening = phase === 'listening' || presence?.state === 'listening';
  const processing = preparingSpeech || phase === 'requesting' || phase === 'transcribing'
    || presence?.state === 'transcribing' || presence?.state === 'understanding'
    || presence?.state === 'working';
  const ambientEngaged = ambientActive && presence?.state !== 'armed';
  const label = error || phase === 'error' ? t(errorKind === 'repeat' ? 'morpheus.voice.repeatTitle' : 'morpheus.voice.states.error') : followUpUntil ? t('morpheus.voice.dialogue.listening') : speaking
    ? t('morpheus.voice.speaking')
    : preparingSpeech ? t('morpheus.voice.preparingSpeech') : ambientActive
      ? t(`morpheus.voice.presence.${presence?.state ?? 'armed'}`)
      : t(`morpheus.voice.states.${phase}`);

  if (ambientActive && !ambientEngaged && quietPhase && !speaking && !error && !followUpUntil) {
    return (
      <aside
        data-morpheus
        data-testid="morpheus-ambient-voice-indicator"
        data-phase="armed"
        role="status"
        aria-live="polite"
        className="morpheus-voice-strip morpheus-voice-strip-ambient"
      >
        <span className="relative flex h-5 w-5 items-center justify-center text-[hsl(var(--morpheus-accent))]">
          <Radio className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="text-2xs font-medium text-foreground">{label}</span>
        <span className="h-1 w-1 rounded-full bg-[hsl(var(--morpheus-accent))]" aria-hidden />
        <span className="morpheus-voice-wake-hint text-2xs text-muted-foreground">
          {t('morpheus.voice.wakeHint', { phrase: status?.settings.wakePhrase ?? 'Morpheus' })}
        </span>
        <Link className="morpheus-voice-settings-link" to={voiceSettingsPath}>
          {t('morpheus.experience.settings.voice')}
        </Link>
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
      className="morpheus-voice-strip morpheus-voice-strip-active"
    >
      <div className="morpheus-voice-strip-content flex items-center gap-3">
        <MorpheusFluidOrb className="h-9 w-9 shrink-0"
          state={resolveMorpheusSignalState({ voicePhase: phase, voicePresence: presence?.state })} />

        <div className="min-w-0 flex-1">
          <p className="text-tiny font-medium text-foreground">{label}</p>
          {followUpUntil ? <p data-testid="morpheus-voice-follow-up" className="mt-1 text-xs text-muted-foreground">
            {t('morpheus.voice.dialogue.hint')}
          </p> : null}
          {speaking && presence?.speechFailure ? (
            <Link to={voiceSettingsPath} data-testid="morpheus-speech-fallback-notice"
              className="mt-1 block text-2xs text-[hsl(var(--morpheus-warn))] underline">
              {t(`morpheus.voice.speechFailure.${presence.speechFailure}`)}
            </Link>
          ) : null}
          {transcript && phase === 'ready' ? (
            <p data-testid="morpheus-voice-transcript" className="mt-0.5 truncate text-2xs text-muted-foreground">
              {transcript}
            </p>
          ) : null}
          {error ? (
            <p data-testid="morpheus-voice-error" className="mt-1 text-xs leading-relaxed text-[hsl(var(--morpheus-danger))]">
              {errorKind === 'muted'
                ? t('morpheus.experience.voice.panel.microphoneMuted')
                : errorKind === 'device'
                ? t('morpheus.voice.deviceBody')
                : errorKind === 'repeat'
                ? t('morpheus.voice.repeatBody')
                : errorKind === 'network'
                  ? t('morpheus.voice.networkBody')
                : errorKind === 'configuration'
                  ? t('morpheus.voice.configurationBody')
                  : error}
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
        {error ? (
          <Link
            to={voiceSettingsPath}
            data-testid="morpheus-voice-connect-provider"
            onClick={() => { dismiss(); useMorpheusQuickCommandStore.getState().hide(); void hostApi.morpheus.expandCompanionSurface().catch(() => undefined); }}
            className="shrink-0 border-b border-[hsl(var(--morpheus-accent-dim))] pb-1 text-2xs text-[hsl(var(--morpheus-accent))]"
          >
            {t(errorKind === 'repeat' ? 'morpheus.experience.settings.voice' : 'morpheus.experience.voice.repair')}
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
    </aside>
  );
}
