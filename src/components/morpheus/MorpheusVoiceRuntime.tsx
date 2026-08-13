import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Volume2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { hostEvents } from '@/lib/host-events';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';

export function MorpheusVoiceRuntime() {
  const { t } = useTranslation('dashboard');
  const showQuickCommand = useMorpheusQuickCommandStore((state) => state.show);
  const phase = useMorpheusVoiceStore((state) => state.phase);
  const transcript = useMorpheusVoiceStore((state) => state.transcript);
  const error = useMorpheusVoiceStore((state) => state.error);
  const status = useMorpheusVoiceStore((state) => state.status);
  const loadStatus = useMorpheusVoiceStore((state) => state.loadStatus);
  const startListening = useMorpheusVoiceStore((state) => state.startListening);
  const stopListening = useMorpheusVoiceStore((state) => state.stopListening);
  const cancel = useMorpheusVoiceStore((state) => state.cancel);
  const dismiss = useMorpheusVoiceStore((state) => state.dismiss);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const spokenRunId = useRef<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    void loadStatus();
    return hostEvents.onMorpheusVoiceCommand((payload) => {
      showQuickCommand(payload.trigger);
      void startListening('global-shortcut');
    });
  }, [loadStatus, showQuickCommand, startListening]);

  useEffect(() => {
    if (!objectiveRun || objectiveRun.state !== 'complete' || objectiveRun.origin.type !== 'voice'
      || !objectiveRun.summary || !status?.settings.speakResponses
      || spokenRunId.current === objectiveRun.objectiveRunId
      || typeof window.speechSynthesis === 'undefined'
      || typeof SpeechSynthesisUtterance === 'undefined') return;

    spokenRunId.current = objectiveRun.objectiveRunId;
    const utterance = new SpeechSynthesisUtterance(objectiveRun.summary);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return () => {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
    };
  }, [objectiveRun, status?.settings.speakResponses]);

  if (phase === 'idle' && !speaking) return null;

  const listening = phase === 'listening';
  const processing = phase === 'requesting' || phase === 'transcribing';
  const label = speaking
    ? t('morpheus.voice.speaking')
    : t(`morpheus.voice.states.${phase}`);

  return (
    <aside
      data-morpheus
      data-testid="morpheus-voice-indicator"
      data-phase={speaking ? 'speaking' : phase}
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed left-1/2 top-11 z-[100100] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-border/80 bg-[hsl(var(--morpheus-surface-2))]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--morpheus-accent-dim))]/60 bg-[hsl(var(--morpheus-accent))]/10 text-[hsl(var(--morpheus-accent))]">
          {speaking ? <Volume2 className="h-4 w-4" aria-hidden /> : processing ? (
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
          ) : <Mic className="h-4 w-4" aria-hidden />}
          {listening ? (
            <span className="absolute inset-[-4px] rounded-full border border-[hsl(var(--morpheus-accent))]/40 motion-safe:animate-ping" aria-hidden />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-tiny font-medium text-foreground">{label}</p>
          {transcript && phase === 'ready' ? (
            <p data-testid="morpheus-voice-transcript" className="mt-0.5 truncate text-2xs text-muted-foreground">
              {transcript}
            </p>
          ) : null}
          {error ? (
            <p data-testid="morpheus-voice-error" className="mt-0.5 truncate text-2xs text-[hsl(var(--morpheus-danger))]">
              {t('morpheus.voice.errorBody')}
            </p>
          ) : null}
        </div>

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
            if (speaking) {
              window.speechSynthesis.cancel();
              setSpeaking(false);
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
