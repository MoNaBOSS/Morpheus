import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { MorpheusVoiceCheck } from './MorpheusVoiceCheck';

export function MorpheusVoiceSetup() {
  const { t } = useTranslation('dashboard');
  const status = useMorpheusVoiceStore((s) => s.status);
  const load = useMorpheusVoiceStore((s) => s.loadStatus);
  const update = useMorpheusVoiceStore((s) => s.updateSettings);
  const error = useMorpheusVoiceStore((s) => s.error);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const refresh = useCallback(async () => { try { setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput')); } catch { setDevices([]); } }, []);
  useEffect(() => { void load(); void Promise.resolve().then(refresh); navigator.mediaDevices?.addEventListener('devicechange', refresh); return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh); }, [load, refresh]);
  if (!status) return <p role="status">{t('morpheus.voice.settings.loading')}</p>;
  const local = status.settings.engine === 'local' || status.speechFormat === 'wav';
  return <section data-testid="morpheus-voice-setup" className="space-y-5">
    <div className="rounded-xl border border-border bg-surface-input p-4"><p className="text-sm font-medium">{t(local ? 'morpheus.experience.voice.included' : 'morpheus.experience.voice.engine')}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(local ? 'morpheus.experience.voice.localBody' : 'morpheus.experience.voice.providerBody', { provider: status.providerLabel ?? '' })}</p>{!local ? <button type="button" onClick={() => void update({ engine: 'local' })} className="mt-3 text-sm underline">{t('morpheus.experience.voice.local')}</button> : null}</div>
    {status.reason ? <p role="status" className="text-sm text-muted-foreground">{status.reason}</p> : null}
    <MorpheusVoiceCheck status={status} key={JSON.stringify([status.settings.speechVoice, status.settings.inputDeviceId, status.settings.enabled])}/>
    <div className="flex items-center justify-between gap-4"><label htmlFor="morpheus-mic-enabled" className="text-sm">{t('morpheus.experience.voice.microphone')}</label><Switch className="data-[state=checked]:bg-[#53edb4]" id="morpheus-mic-enabled" data-testid="morpheus-microphone-enabled" checked={status.settings.enabled} onCheckedChange={(enabled) => void update({ enabled })}/></div>
    <div className="space-y-2"><label htmlFor="morpheus-mic-device" className="block text-sm">{t('morpheus.experience.voice.device')}</label><div className="flex gap-2"><select id="morpheus-mic-device" data-testid="morpheus-microphone-device" className="min-w-0 flex-1 rounded-lg border border-border bg-surface-input px-3 py-2 text-sm" value={status.settings.inputDeviceId ?? ''} onChange={(e) => void update({ inputDeviceId: e.target.value })}><option value="">{t('morpheus.experience.voice.defaultDevice')}</option>{devices.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications' && d.deviceId).map((d, index) => <option key={d.deviceId} value={d.deviceId}>{d.label || t('morpheus.experience.voice.unnamedDevice', { number: index + 1 })}</option>)}</select><button type="button" onClick={() => void refresh()} className="rounded-lg border border-border px-3 text-sm">{t('morpheus.experience.voice.refresh')}</button></div><p className="text-xs leading-relaxed text-muted-foreground">{t('morpheus.experience.voice.permission')}</p></div>
    <div className="flex items-center justify-between gap-4"><label htmlFor="morpheus-spoken-replies" className="text-sm">{t('morpheus.voice.settings.speakResponses')}</label><Switch className="data-[state=checked]:bg-[#53edb4]" id="morpheus-spoken-replies" checked={status.settings.speakResponses} onCheckedChange={(speakResponses) => void update({ speakResponses })}/></div>
    {local ? <label className="block space-y-2 text-sm"><span>{t('morpheus.experience.voice.sound')}</span><select data-testid="morpheus-local-voice-choice" className="block w-full rounded-lg border border-border bg-surface-input px-3 py-2" value={status.settings.speechVoice === 'coral' ? 'coral' : 'cedar'} onChange={(e) => void update({ speechVoice: e.target.value as 'cedar' | 'coral' })}><option value="cedar">{t('morpheus.experience.voice.warm')}</option><option value="coral">{t('morpheus.experience.voice.bright')}</option></select></label> : null}
    <div className="flex items-center justify-between gap-4"><div><label htmlFor="morpheus-wake-enabled" className="text-sm">{t('morpheus.experience.voice.wake')}</label><p className="mt-1 text-xs text-muted-foreground">{t('morpheus.experience.voice.wakeBody')}</p></div><Switch className="data-[state=checked]:bg-[#53edb4]" id="morpheus-wake-enabled" data-testid="morpheus-wake-enabled" checked={status.settings.ambientEnabled} disabled={!status.settings.enabled} onCheckedChange={(ambientEnabled) => void update({ ambientEnabled, localWakeEnabled: true })}/></div>
    {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
    <Link to="/settings/advanced?section=voice" className="inline-block text-sm text-muted-foreground underline">{t('morpheus.experience.voice.advanced')}</Link>
  </section>;
}
