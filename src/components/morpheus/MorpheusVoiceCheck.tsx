import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import type { MorpheusVoiceStatus } from '@shared/morpheus/voice-types';

/** Real setup checks. Configuration is not proof of playback or recognition. */
export function MorpheusVoiceCheck({ status }: { status: MorpheusVoiceStatus }) {
  const { t } = useTranslation('dashboard');
  const [preview, setPreview] = useState<'idle' | 'playing' | 'neural' | 'windows' | 'failed'>('idle');
  const generation = useRef(0);
  const phase = useMorpheusVoiceStore((s) => s.phase);
  const source = useMorpheusVoiceStore((s) => s.source);
  const transcript = useMorpheusVoiceStore((s) => s.transcript);
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
  const local = status.settings.engine === 'local' || status.speechFormat === 'wav';
  return <div data-testid="morpheus-voice-check" className="space-y-3 rounded-lg border border-border/60 bg-surface-input p-3">
    <p className="text-sm font-medium">{t('morpheus.voice.check.title')}</p>
    <p className="text-xs leading-relaxed text-muted-foreground">{t(local ? 'morpheus.experience.voice.checkLocal' : 'morpheus.voice.check.description')}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" data-testid="morpheus-voice-preview"
        className="rounded-md border border-border px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50"
        disabled={phase === 'requesting' || recording || phase === 'transcribing'}
        onClick={() => {
          if (preview === 'playing') { generation.current += 1; ownsPreview.current = false; stopMorpheusSpeech(); setPreview('idle'); }
          else void testVoice();
        }}>
        {t(preview === 'playing' ? 'morpheus.voice.check.stop' : 'morpheus.voice.check.preview')}
      </button>
      <button type="button" data-testid="morpheus-microphone-check"
        disabled={!status.transcriptionAvailable || phase === 'requesting' || phase === 'transcribing'}
        className="rounded-md border border-border px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50"
        onClick={() => {
          if (recording) stopListening();
          else { ownedRecording.current = true; void startListening('onboarding'); }
        }}>
        {t(recording ? 'morpheus.voice.check.finish' : 'morpheus.voice.check.microphone')}
      </button>
    </div>
    <p role="status" data-testid="morpheus-voice-preview-result" className="text-xs text-muted-foreground">
      {t(local && (preview === 'idle' || preview === 'failed') ? `morpheus.experience.voice.${preview === 'idle' ? 'notTested' : 'sampleFailed'}` : `morpheus.voice.check.${preview}`)}
    </p>
    {source === 'onboarding' && phase === 'ready' && transcript ?
      <p data-testid="morpheus-microphone-check-result" className="break-words text-sm">
        {t('morpheus.voice.check.heard', { text: transcript })}
      </p> : null}
  </div>;
}
