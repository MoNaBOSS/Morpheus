import { useTranslation } from 'react-i18next';
import type { MorpheusReplySpeechMode, MorpheusVoiceSettings } from '@shared/morpheus/voice-types';

export function MorpheusReplySpeechControl({ settings, onChange }: {
  settings: MorpheusVoiceSettings;
  onChange: (replySpeechMode: MorpheusReplySpeechMode) => void;
}) {
  const { t } = useTranslation('dashboard');
  const mode = settings.replySpeechMode ?? 'orb';
  return <div className="space-y-2">
    <label htmlFor="morpheus-reply-speech-mode" className="block text-xs text-muted-foreground">
      {t('morpheus.voice.settings.replySpeechMode')}
    </label>
    <select id="morpheus-reply-speech-mode" data-testid="morpheus-reply-speech-mode"
      value={mode} onChange={(event) => onChange(event.target.value as MorpheusReplySpeechMode)}
      aria-describedby="morpheus-reply-speech-description"
      className="min-h-10 w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-foreground">
      {(['orb', 'voice', 'all'] as const).map((option) => <option key={option} value={option}>
        {t(`morpheus.voice.settings.replySpeechModes.${option}`)}
      </option>)}
    </select>
    <p id="morpheus-reply-speech-description" data-testid="morpheus-reply-speech-description"
      className="text-xs leading-relaxed text-muted-foreground">
      {t(`morpheus.voice.settings.replySpeechDescriptions.${mode}`)}
    </p>
  </div>;
}
