import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic2, Radio, ShieldCheck } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusDot } from '@/components/morpheus/ui';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';

export function MorpheusVoiceSettings() {
  const { t } = useTranslation('dashboard');
  const status = useMorpheusVoiceStore((state) => state.status);
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
