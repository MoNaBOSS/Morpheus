import { RotateCcw, Pencil, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';

/** A repair gesture starts fresh input; failed audio/text is never resubmitted. */
export function MorpheusVoiceRecoveryCue({ source, onType, onRepair }: {
  source: 'quick-command' | 'command-center'; onType(): void; onRepair(): void;
}) {
  const { t } = useTranslation('dashboard');
  const recovery = useMorpheusVoiceStore((state) => state.recovery);
  const repeat = useMorpheusVoiceStore((state) => state.phase === 'error' && state.errorKind === 'repeat');
  const onboarding = useMorpheusVoiceStore((state) => state.source === 'onboarding');
  const enabled = useMorpheusVoiceStore((state) => state.status?.settings.enabled === true && state.presence?.inputEnabled !== false);
  const start = useMorpheusVoiceStore((state) => state.startListening);
  const clear = useMorpheusVoiceStore((state) => state.clearRecovery);
  const dismiss = useMorpheusVoiceStore((state) => state.dismiss);
  if (onboarding || !recovery && !repeat) return null;
  return <div className="morpheus-voice-recovery" data-testid={`morpheus-voice-recovery-${source}`} role="status">
    <div><strong>{t('morpheus.voice.recovery.title')}</strong><p>{t('morpheus.voice.recovery.body')}</p></div>
    <div className="morpheus-voice-recovery-actions">
      {enabled ? <button type="button" data-testid="morpheus-recovery-retry" onClick={() => { clear(); void start(source); }}><RotateCcw size={14} aria-hidden />{t('morpheus.voice.retry')}</button>
        : <button type="button" onClick={onRepair}><Settings2 size={14} aria-hidden />{t('morpheus.experience.settings.voice')}</button>}
      <button type="button" data-testid="morpheus-recovery-type" onClick={() => { clear(); if (repeat) dismiss(); onType(); }}><Pencil size={14} aria-hidden />{t('morpheus.voice.recovery.type')}</button>
    </div>
  </div>;
}
