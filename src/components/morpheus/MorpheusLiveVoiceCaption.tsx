import { useEffect, useState } from 'react';
import { Mic, Pencil, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { morpheusSettingsPath } from '@/lib/morpheus-settings-route';
import { useSettingsStore } from '@/stores/settings';

/** A temporary projection of real voice input, never a second transcript owner. */
export function MorpheusLiveVoiceCaption({ surface, onEdit, onRepair }: {
  surface: 'full' | 'compact';
  onEdit(text: string): void;
  onRepair?(): void;
}) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const phase = useMorpheusVoiceStore((s) => s.phase);
  const errorKind = useMorpheusVoiceStore((s) => s.errorKind);
  const cancel = useMorpheusVoiceStore((s) => s.cancel);
  const transcript = useMorpheusVoiceStore((s) => s.source !== 'onboarding' ? s.transcript : null);
  const mode = useSettingsStore((s) => s.voiceCaptionMode);
  const [recent, setRecent] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = useMorpheusVoiceStore.subscribe((next, previous) => {
      if (!next.transcript || next.source === 'onboarding' || next.transcript === previous.transcript) return;
      window.clearTimeout(timer);
      setRecent(next.transcript);
      timer = window.setTimeout(() => setRecent(null), 6_500);
    });
    return () => { unsubscribe(); window.clearTimeout(timer); };
  }, []);
  const active = phase === 'listening' || phase === 'requesting' || phase === 'transcribing';
  const failed = phase === 'error';
  const caption = mode === 'always' ? transcript : recent;
  const errorKey = errorKind === 'muted' ? 'morpheus.experience.voice.panel.microphoneMuted'
    : errorKind === 'permission' ? 'morpheus.experience.voice.permission'
    : errorKind === 'speech' ? 'morpheus.voice.dialogue.speechFailed'
      : `morpheus.voice.${errorKind === 'device' ? 'deviceBody' : errorKind === 'repeat' ? 'repeatBody'
        : errorKind === 'network' ? 'networkBody' : errorKind === 'configuration' ? 'configurationBody' : 'errorBody'}`;
  // The full shell owns active status and recovery. Compact has no shell row,
  // so it keeps local controls. Confirmed captions remain editable in both.
  if (surface === 'full' && (active || failed)) return null;
  if (!failed && (mode === 'hidden' || !active && !caption)) return null;
  return <div className="morpheus-live-caption" data-testid={`morpheus-live-caption-${surface}`}>
    <Mic size={17} aria-hidden className="shrink-0 text-[#85f5b9]" />
    <div className="morpheus-live-caption-copy" role="status" aria-live="polite">
      <span className="morpheus-live-caption-label">{t(failed ? errorKey : active ? `morpheus.voice.states.${phase}` : 'morpheus.experience.voice.heard')}</span>
      {caption && !active && !failed ? <span>{caption}</span> : null}
    </div>
    {failed ? <button type="button" aria-label={t('morpheus.experience.settings.voice')} onClick={() => onRepair ? onRepair() : navigate(morpheusSettingsPath('voice', '/', surface))}><Settings2 size={16} /></button>
      : caption && !active ? <button type="button" aria-label={t('morpheus.experience.voice.edit')} onClick={() => { cancel(); onEdit(caption); setRecent(null); }}><Pencil size={16} /></button> : null}
  </div>;
}
