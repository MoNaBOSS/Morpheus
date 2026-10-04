import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import type { MorpheusVoiceStatus } from '@shared/morpheus/voice-types';
import { MorpheusFluidOrb } from './MorpheusFluidOrb';

/** Real setup checks. Configuration is not proof of playback or recognition. */
export function MorpheusVoiceCheck({ status, mode = 'both' }: {
  status: MorpheusVoiceStatus;
  mode?: 'input' | 'output' | 'both';
}) {
  const { t } = useTranslation('dashboard');
  const [preview, setPreview] = useState<'idle' | 'playing' | 'neural' | 'windows' | 'failed'>('idle');
  const [inputAttempted, setInputAttempted] = useState(false);
  const generation = useRef(0);
  const phase = useMorpheusVoiceStore((s) => s.phase);
  const presence = useMorpheusVoiceStore((s) => s.presence?.state);
  const source = useMorpheusVoiceStore((s) => s.source);
  const transcript = useMorpheusVoiceStore((s) => s.transcript);
  const error = useMorpheusVoiceStore((s) => s.error);
  const startListening = useMorpheusVoiceStore((s) => s.startListening);
  const stopListening = useMorpheusVoiceStore((s) => s.stopListening);
  const ownedRecording = useRef(false);
  const ownsPreview = useRef(false);
  useEffect(() => () => {
    generation.current += 1;
    if (ownsPreview.current) stopMorpheusSpeech();
    if (ownedRecording.current && useMorpheusVoiceStore.getState().source === 'onboarding') {
      useMorpheusVoiceStore.getState().cancel();
    }
  }, []);

  const testVoice = async () => {
    const id = ++generation.current;
    setPreview('playing');
    ownsPreview.current = true;
    try {
      const result = await playMorpheusSpeech(t('morpheus.voice.check.sample'), {
        neuralAvailable: status.neuralSpeechAvailable,
        format: status.speechFormat,
        allowWindowsFallback: false,
      });
      if (id === generation.current) setPreview(result === 'cancelled' ? 'idle' : result);
    } catch { if (id === generation.current) setPreview('failed'); }
    finally { if (id === generation.current) ownsPreview.current = false; }
  };
  const recording = source === 'onboarding' && phase === 'listening';
  const inputBusy = source === 'onboarding' && (phase === 'requesting' || phase === 'transcribing');
  const inputPassed = inputAttempted && source === 'onboarding' && phase === 'ready' && Boolean(transcript);
  const local = status.settings.engine === 'local' || status.speechFormat === 'wav';
  const hasInput = mode !== 'output';
  const hasOutput = mode !== 'input';
  return <div data-testid={mode === 'input' ? 'morpheus-microphone-check-panel' : 'morpheus-voice-check'} className={mode === 'both' ? 'space-y-3 rounded-lg border border-border/60 bg-surface-input p-3' : 'space-y-3'}>
    {mode === 'both' ? <><p className="text-sm font-medium">{t('morpheus.voice.check.title')}</p>
    <p className="text-xs leading-relaxed text-muted-foreground">{t(local ? 'morpheus.experience.voice.checkLocal' : 'morpheus.voice.check.description')}</p></> : null}
    {(hasInput && (recording || inputBusy)) || (hasOutput && preview === 'playing') ? <div className="flex min-h-10 items-center gap-3" data-testid="morpheus-voice-check-feedback"><MorpheusFluidOrb className="h-10 w-10 shrink-0" state={recording ? 'listening' : presence === 'speaking' ? 'speaking' : 'understanding'}/><p className="text-xs leading-relaxed text-muted-foreground">{t(recording ? 'morpheus.experience.voice.panel.inputPrompt' : inputBusy ? `morpheus.voice.states.${phase}` : presence === 'speaking' ? 'morpheus.voice.presence.speaking' : 'morpheus.voice.preparingSpeech')}</p></div> : null}
    <div className="flex flex-wrap gap-2">
      {hasOutput ? <button type="button" data-testid="morpheus-voice-preview"
        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-white/[0.035] px-3 py-2 text-sm hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={phase === 'requesting' || recording || phase === 'transcribing'}
        onClick={() => {
          if (preview === 'playing') { generation.current += 1; ownsPreview.current = false; stopMorpheusSpeech(); setPreview('idle'); }
          else void testVoice();
        }}>
        {t(preview === 'playing' ? 'morpheus.voice.check.stop' : 'morpheus.voice.check.preview')}
      </button> : null}
      {hasInput ? <button type="button" data-testid="morpheus-microphone-check"
        disabled={!status.transcriptionAvailable || phase === 'requesting' || phase === 'transcribing'}
        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-white/[0.035] px-3 py-2 text-sm hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          if (recording) stopListening();
          else { setInputAttempted(true); ownedRecording.current = true; void startListening('onboarding'); }
        }}>
        {t(recording ? 'morpheus.voice.check.finish' : 'morpheus.voice.check.microphone')}
      </button> : null}
    </div>
    {hasOutput ? <p role="status" data-testid="morpheus-voice-preview-result" className="text-xs leading-relaxed text-muted-foreground">
      {t(mode === 'output' && preview === 'idle' ? 'morpheus.experience.voice.panel.outputNotTested' : local && (preview === 'idle' || preview === 'failed') ? `morpheus.experience.voice.${preview === 'idle' ? 'notTested' : 'sampleFailed'}` : `morpheus.voice.check.${preview}`)}
    </p> : null}
    {hasInput && !recording && !inputBusy ? <p role="status" data-testid="morpheus-microphone-test-status" className="text-xs leading-relaxed text-muted-foreground">
      {t(inputPassed ? 'morpheus.experience.voice.panel.inputPassed' : inputAttempted && source === 'onboarding' && error ? 'morpheus.experience.voice.panel.inputFailed' : 'morpheus.experience.voice.panel.inputNotTested')}
    </p> : null}
    {hasInput && inputPassed ?
      <p data-testid="morpheus-microphone-check-result" className="break-words text-sm">
        {t('morpheus.voice.check.heard', { text: transcript })}
      </p> : null}
  </div>;
}
