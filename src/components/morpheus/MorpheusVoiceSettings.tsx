import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic2, Radio, ShieldCheck } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusDot } from '@/components/morpheus/ui';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { MORPHEUS_SPEECH_VOICES } from '@shared/morpheus/voice-types';

export function MorpheusVoiceSettings() {
  const { t } = useTranslation('dashboard');
  const status = useMorpheusVoiceStore((state) => state.status);
  const speechFailure = useMorpheusVoiceStore((state) => state.presence?.speechFailure);
  const error = useMorpheusVoiceStore((state) => state.error);
  const loadStatus = useMorpheusVoiceStore((state) => state.loadStatus);
  const updateSettings = useMorpheusVoiceStore((state) => state.updateSettings);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  if (!status) {
    return (
      <div className="rounded-xl border border-border/60 bg-[hsl(var(--morpheus-surface-2))]/80 p-4 text-xs text-muted-foreground">
        {error ?? t('morpheus.voice.settings.loading')}
      </div>
    );
  }

  const settings = status.settings;
  const selectedProvider = settings.providerAccountId ?? '';
  const commitModel = (value: string): void => {
    const next = value.trim();
    if (next && next !== settings.modelId) void updateSettings({ modelId: next });
  };

  return (
    <section
      data-testid="morpheus-voice-settings"
      className="rounded-xl border border-border/60 bg-[hsl(var(--morpheus-surface-2))]/80 p-4"
    >
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-border/70 bg-[hsl(var(--morpheus-surface-3))] p-2 text-[hsl(var(--morpheus-accent))]">
          <Mic2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{t('morpheus.voice.settings.title')}</p>
            <StatusDot tone={status.transcriptionAvailable ? 'ok' : settings.enabled ? 'warn' : 'idle'} />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {status.transcriptionAvailable
              ? t('morpheus.voice.settings.ready', { provider: status.providerLabel })
              : status.reason ?? t('morpheus.voice.settings.unavailable')}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <SettingToggle
          label={t('morpheus.voice.settings.enabled')}
          description={t('morpheus.voice.settings.enabledDescription')}
          checked={settings.enabled}
          testId="morpheus-voice-enabled"
          onChange={(enabled) => void updateSettings({ enabled })}
        />

        <div className="rounded-lg border border-[hsl(var(--morpheus-accent-dim))]/30 bg-[hsl(var(--morpheus-accent))]/[0.035] p-3.5">
          <div className="flex items-start gap-3">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--morpheus-accent))]" aria-hidden />
            <div className="min-w-0 flex-1">
              <SettingToggle
                label={t('morpheus.voice.settings.ambient')}
                description={t('morpheus.voice.settings.ambientDescription')}
                checked={settings.ambientEnabled}
                testId="morpheus-voice-ambient"
                onChange={(ambientEnabled) => void updateSettings({ ambientEnabled })}
              />
              <div className="mt-3 flex items-start gap-2 rounded border border-border/50 bg-black/10 px-2.5 py-2 text-2xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--morpheus-accent))]" aria-hidden />
                <span>{t('morpheus.voice.settings.ambientDisclosure', { provider: status.providerLabel ?? t('morpheus.voice.settings.selectedProvider') })}</span>
              </div>
              {settings.ambientEnabled ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="morpheus-voice-wake-phrase" className="text-xs text-foreground/80">
                      {t('morpheus.voice.settings.wakePhrase')}
                    </Label>
                    <Input
                      id="morpheus-voice-wake-phrase"
                      data-testid="morpheus-voice-wake-phrase"
                      key={settings.wakePhrase}
                      defaultValue={settings.wakePhrase}
                      maxLength={48}
                      onBlur={(event) => {
                        const wakePhrase = event.currentTarget.value.trim();
                        if (wakePhrase && wakePhrase !== settings.wakePhrase) void updateSettings({ wakePhrase });
                      }}
                      className="h-9 rounded-lg bg-surface-input text-sm"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <SettingToggle
                      label={t('morpheus.voice.settings.bargeIn')}
                      description={t('morpheus.voice.settings.bargeInDescription')}
                      checked={settings.bargeIn}
                      testId="morpheus-voice-barge-in"
                      onChange={(bargeIn) => void updateSettings({ bargeIn })}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="morpheus-voice-provider" className="text-xs text-foreground/80">
              {t('morpheus.voice.settings.provider')}
            </Label>
            <select
              id="morpheus-voice-provider"
              data-testid="morpheus-voice-provider"
              value={selectedProvider}
              disabled={!settings.enabled}
              onChange={(event) => void updateSettings({ providerAccountId: event.target.value || null })}
              className="h-10 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))] disabled:opacity-50"
            >
              <option value="">{t('morpheus.voice.settings.providerAutomatic')}</option>
              {status.providers.map((provider) => (
                <option key={provider.accountId} value={provider.accountId} disabled={!provider.configured}>
                  {provider.label}{provider.configured ? '' : ` · ${t('morpheus.voice.settings.notConfigured')}`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="morpheus-voice-model" className="text-xs text-foreground/80">
              {t('morpheus.voice.settings.model')}
            </Label>
            <Input
              id="morpheus-voice-model"
              data-testid="morpheus-voice-model"
              key={settings.modelId}
              defaultValue={settings.modelId}
              disabled={!settings.enabled}
              maxLength={200}
              onBlur={(event) => commitModel(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              className="h-10 rounded-lg bg-surface-input font-mono text-sm"
            />
          </div>
        </div>

        <SettingToggle
          label={t('morpheus.voice.settings.autoSubmit')}
          description={t('morpheus.voice.settings.autoSubmitDescription')}
          checked={settings.autoSubmitTranscript}
          testId="morpheus-voice-auto-submit"
          onChange={(autoSubmitTranscript) => void updateSettings({ autoSubmitTranscript })}
        />
        <SettingToggle
          label={t('morpheus.voice.settings.speakResponses')}
          description={t('morpheus.voice.settings.speakResponsesDescription')}
          checked={settings.speakResponses}
          testId="morpheus-voice-speak-responses"
          onChange={(speakResponses) => void updateSettings({ speakResponses })}
        />
        {settings.speakResponses ? (
          <div data-testid="morpheus-neural-speech-settings" className="rounded-lg border border-border/60 bg-[hsl(var(--morpheus-surface-3))]/55 p-3.5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{t('morpheus.voice.settings.neuralSpeech')}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {status.neuralSpeechAvailable
                    ? t('morpheus.voice.settings.neuralSpeechReady', { provider: status.speechProviderLabel })
                    : t('morpheus.voice.settings.neuralSpeechFallback')}
                </p>
              </div>
              <StatusDot tone={speechFailure || !status.neuralSpeechAvailable ? 'warn' : 'idle'} />
            </div>
            {speechFailure ? (
              <p role="status" data-testid="morpheus-speech-failure"
                className="mb-3 text-xs text-[hsl(var(--morpheus-warn))]">
                {t(`morpheus.voice.speechFailure.${speechFailure}`)}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="morpheus-speech-provider" className="text-xs text-foreground/80">
                  {t('morpheus.voice.settings.speechProvider')}
                </Label>
                <select
                  id="morpheus-speech-provider"
                  data-testid="morpheus-speech-provider"
                  value={settings.speechProviderAccountId ?? ''}
                  onChange={(event) => void updateSettings({ speechProviderAccountId: event.target.value || null })}
                  className="h-10 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))]"
                >
                  <option value="">{t('morpheus.voice.settings.speechProviderAutomatic')}</option>
                  {status.providers.map((provider) => (
                    <option key={provider.accountId} value={provider.accountId} disabled={!provider.configured}>
                      {provider.label}{provider.configured ? '' : ` · ${t('morpheus.voice.settings.notConfigured')}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="morpheus-speech-model" className="text-xs text-foreground/80">
                  {t('morpheus.voice.settings.speechModel')}
                </Label>
                <Input
                  id="morpheus-speech-model"
                  data-testid="morpheus-speech-model"
                  key={settings.speechModelId}
                  defaultValue={settings.speechModelId}
                  maxLength={200}
                  onBlur={(event) => {
                    const value = event.currentTarget.value.trim();
                    if (value && value !== settings.speechModelId) void updateSettings({ speechModelId: value });
                  }}
                  className="h-10 rounded-lg bg-surface-input font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="morpheus-speech-voice" className="text-xs text-foreground/80">
                  {t('morpheus.voice.settings.speechVoice')}
                </Label>
                <select
                  id="morpheus-speech-voice"
                  data-testid="morpheus-speech-voice"
                  value={settings.speechVoice}
                  onChange={(event) => void updateSettings({ speechVoice: event.target.value as typeof settings.speechVoice })}
                  className="h-10 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))]"
                >
                  {MORPHEUS_SPEECH_VOICES.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
                </select>
              </div>
            </div>
          </div>
        ) : null}
        {error ? <p data-testid="morpheus-voice-settings-error" className="text-xs text-[hsl(var(--morpheus-danger))]">{error}</p> : null}
      </div>
    </section>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  testId,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  testId: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}
