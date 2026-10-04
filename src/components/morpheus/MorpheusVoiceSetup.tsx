import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AudioLines, ChevronDown, Mic, MicOff, RefreshCw, Radio, Volume2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { MorpheusVoiceCheck } from './MorpheusVoiceCheck';
import { morpheusAdvancedSettingsPath } from '@/lib/morpheus-settings-route';
import { useSettingsStore, type VoiceCaptionMode } from '@/stores/settings';

/** Ordinary setup groups each device, its control and its real check together. */
export function MorpheusVoiceSetup() {
  const { t } = useTranslation('dashboard');
  const location = useLocation();
  const captions = useSettingsStore((s) => s.voiceCaptionMode);
  const setCaptions = useSettingsStore((s) => s.setVoiceCaptionMode);
  const status = useMorpheusVoiceStore((s) => s.status);
  const load = useMorpheusVoiceStore((s) => s.loadStatus);
  const update = useMorpheusVoiceStore((s) => s.updateSettings);
  const error = useMorpheusVoiceStore((s) => s.error);
  const errorKind = useMorpheusVoiceStore((s) => s.errorKind);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const refresh = useCallback(async () => {
    try {
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput'));
    } catch { setDevices([]); }
  }, []);

  useEffect(() => {
    void load();
    void Promise.resolve().then(refresh);
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh);
  }, [load, refresh]);

  if (!status) return <div role="status" className="space-y-3 rounded-xl border border-border bg-surface-input p-4">
    <p className="text-sm">{error ?? t('morpheus.voice.settings.loading')}</p>
    {error ? <button type="button" onClick={() => void load()} className="rounded-lg border border-border px-3 py-2 text-sm">{t('morpheus.voice.retry')}</button> : null}
  </div>;

  const settings = status.settings;
  const local = settings.engine === 'local' || status.speechFormat === 'wav';
  const displayError = errorKind === 'device' ? t('morpheus.voice.deviceBody')
    : errorKind === 'repeat' ? t('morpheus.voice.repeatBody') : error;
  const cardClass = 'min-w-0 space-y-3 rounded-2xl border border-border bg-surface-input p-4';

  return <section data-testid="morpheus-voice-setup" className="space-y-4">
    <div data-testid="morpheus-companion-voice-control" className="rounded-2xl border border-border bg-surface-input px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Radio className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--morpheus-accent))]" aria-hidden />
          <div className="min-w-0">
            <label htmlFor="morpheus-wake-enabled" className="text-sm font-medium">{t('morpheus.experience.voice.panel.commands')}</label>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('morpheus.experience.voice.panel.commandsBody', { phrase: settings.wakePhrase })}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span data-testid="morpheus-companion-voice-consent" className="text-xs text-muted-foreground">{t(settings.ambientEnabled ? settings.enabled ? 'morpheus.experience.voice.panel.on' : 'morpheus.experience.voice.panel.paused' : 'morpheus.experience.voice.panel.off')}</span>
          <Switch className="data-[state=checked]:bg-[hsl(var(--morpheus-accent))]" id="morpheus-wake-enabled" data-testid="morpheus-wake-enabled"
            checked={settings.ambientEnabled}
            onCheckedChange={(ambientEnabled) => void update({ ambientEnabled, localWakeEnabled: true })} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-4 border-t border-border/70 pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {settings.enabled ? <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <MicOff className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          <label htmlFor="morpheus-mic-enabled">{t(settings.enabled ? 'morpheus.experience.voice.panel.microphoneOn' : 'morpheus.experience.voice.panel.microphoneMuted')}</label>
        </div>
        <Switch className="data-[state=checked]:bg-[hsl(var(--morpheus-accent))]" id="morpheus-mic-enabled" data-testid="morpheus-microphone-enabled"
          checked={settings.enabled} onCheckedChange={(enabled) => void update({ enabled })} />
      </div>
    </div>

    <div className="grid items-start gap-4 md:grid-cols-2">
      <div data-testid="morpheus-voice-input-card" className={cardClass}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--morpheus-accent))]/10 text-[hsl(var(--morpheus-accent))]"><Mic className="h-[18px] w-[18px]" aria-hidden /></span>
          <div><h2 className="!text-base !font-medium">{t('morpheus.experience.voice.panel.inputTitle')}</h2><p className="text-xs text-muted-foreground">{t('morpheus.experience.voice.panel.inputBody')}</p></div>
        </div>
        <div className="space-y-2">
          <label htmlFor="morpheus-mic-device" className="block text-xs text-muted-foreground">{t('morpheus.experience.voice.device')}</label>
          <div className="flex gap-2">
            <select id="morpheus-mic-device" data-testid="morpheus-microphone-device" className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-input px-3 py-2 text-sm"
              value={settings.inputDeviceId ?? ''} onChange={(event) => void update({ inputDeviceId: event.target.value })}>
              <option value="">{t('morpheus.experience.voice.defaultDevice')}</option>
              {devices.filter((device) => device.deviceId !== 'default' && device.deviceId !== 'communications' && device.deviceId).map((device, index) =>
                <option key={device.deviceId} value={device.deviceId}>{device.label || t('morpheus.experience.voice.unnamedDevice', { number: index + 1 })}</option>)}
            </select>
            <button type="button" onClick={() => void refresh()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-white/5"
              aria-label={t('morpheus.experience.voice.refresh')} title={t('morpheus.experience.voice.refresh')}><RefreshCw size={15} aria-hidden /></button>
          </div>
        </div>
        {displayError ? <div data-testid="morpheus-voice-setup-error" role="alert" className="space-y-1 rounded-lg border border-[hsl(var(--morpheus-warn))]/30 bg-[hsl(var(--morpheus-warn))]/5 p-3 text-xs leading-relaxed text-[hsl(var(--morpheus-warn))]">
          <p>{displayError}</p>
          {errorKind === 'device' ? <p>{t('morpheus.experience.voice.panel.deviceRepair')}</p> : null}
        </div> : !status.transcriptionAvailable ? <p role="status" className="text-xs leading-relaxed text-muted-foreground">
          {settings.enabled ? status.reason ?? t('morpheus.voice.settings.unavailable') : t('morpheus.experience.voice.panel.enableForTest')}
        </p> : null}
        <MorpheusVoiceCheck mode="input" status={status} key={JSON.stringify([settings.engine, settings.inputDeviceId, settings.enabled, settings.providerAccountId, settings.modelId])} />
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer leading-relaxed hover:text-foreground">{t('morpheus.experience.voice.panel.permissionHelp')}</summary>
          <p className="mt-2 leading-relaxed">{t('morpheus.experience.voice.permission')}</p>
        </details>
      </div>

      <div data-testid="morpheus-voice-output-card" className={cardClass}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--morpheus-accent))]/10 text-[hsl(var(--morpheus-accent))]"><AudioLines className="h-[18px] w-[18px]" aria-hidden /></span>
          <div><h2 className="!text-base !font-medium">{t('morpheus.experience.voice.panel.outputTitle')}</h2><p className="text-xs text-muted-foreground">{t('morpheus.experience.voice.panel.outputBody')}</p></div>
        </div>
        {local ? <div className="space-y-2">
          <label htmlFor="morpheus-local-voice-choice" className="block text-xs text-muted-foreground">{t('morpheus.experience.voice.sound')}</label>
          <select id="morpheus-local-voice-choice" data-testid="morpheus-local-voice-choice" className="min-h-10 w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm"
            value={settings.speechVoice === 'coral' ? 'coral' : 'cedar'} onChange={(event) => void update({ speechVoice: event.target.value as 'cedar' | 'coral' })}>
            <option value="cedar">{t('morpheus.experience.voice.warm')}</option><option value="coral">{t('morpheus.experience.voice.bright')}</option>
          </select>
        </div> : <p className="text-xs leading-relaxed text-muted-foreground">{t('morpheus.experience.voice.providerBody', { provider: status.speechProviderLabel ?? status.providerLabel ?? '' })}</p>}
        <MorpheusVoiceCheck mode="output" status={status} key={JSON.stringify([settings.engine, settings.speechVoice, settings.speechProviderAccountId, settings.speechModelId])} />
        <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-3">
          <label htmlFor="morpheus-spoken-replies" className="flex items-center gap-2 text-sm"><Volume2 size={15} className="text-muted-foreground" aria-hidden />{t('morpheus.voice.settings.speakResponses')}</label>
          <Switch className="data-[state=checked]:bg-[hsl(var(--morpheus-accent))]" id="morpheus-spoken-replies" data-testid="morpheus-spoken-replies"
            checked={settings.speakResponses} onCheckedChange={(speakResponses) => void update({ speakResponses })} />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t(local ? 'morpheus.experience.voice.panel.localDisclosure' : 'morpheus.voice.check.description')}</p>
      </div>
    </div>

    <details data-testid="morpheus-voice-more-options" className="group rounded-xl border border-border bg-surface-input px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
        <span>{t('morpheus.experience.voice.panel.moreOptions')}</span><ChevronDown size={16} className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
        <label className="block space-y-2 text-sm"><span>{t('morpheus.experience.voice.captions.title')}</span>
          <select data-testid="morpheus-voice-caption-mode" className="min-h-10 w-full rounded-lg border border-border bg-surface-input px-3 py-2"
            value={captions} onChange={(event) => setCaptions(event.target.value as VoiceCaptionMode)}>
            {(['automatic', 'always', 'hidden'] as const).map((mode) => <option key={mode} value={mode}>{t('morpheus.experience.voice.captions.' + mode)}</option>)}
          </select><span className="block text-xs leading-relaxed text-muted-foreground">{t('morpheus.experience.voice.captions.body')}</span>
        </label>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('morpheus.experience.voice.panel.wakeBody')}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('morpheus.experience.voice.panel.interruptionBody')}</p>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer hover:text-foreground">{t(local ? 'morpheus.experience.voice.included' : 'morpheus.experience.voice.engine')}</summary>
          <p className="mt-2 leading-relaxed">{t(local ? 'morpheus.experience.voice.localBody' : 'morpheus.experience.voice.providerBody', { provider: status.providerLabel ?? '' })}</p>
          {!local ? <button type="button" onClick={() => void update({ engine: 'local' })} className="mt-3 text-sm underline">{t('morpheus.experience.voice.local')}</button> : null}
        </details>
      </div>
    </details>
    <Link data-testid="morpheus-voice-advanced-settings" to={morpheusAdvancedSettingsPath(location.search, 'voice')} className="inline-block text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">{t('morpheus.experience.voice.advanced')}</Link>
  </section>;
}
