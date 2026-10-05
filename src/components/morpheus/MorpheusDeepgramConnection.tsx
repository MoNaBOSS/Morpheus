import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Cloud, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { hostApi } from '@/lib/host-api';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import type {
  MorpheusDeepgramVoiceStatus,
  MorpheusDeepgramVoiceTestResult,
} from '@shared/morpheus/voice-types';

/** Optional personal cloud connection. Credentials enter Main once and never return. */
export function MorpheusDeepgramConnection() {
  const { t } = useTranslation('dashboard');
  const voice = useMorpheusVoiceStore((state) => state.status);
  const updateSettings = useMorpheusVoiceStore((state) => state.updateSettings);
  const loadVoice = useMorpheusVoiceStore((state) => state.loadStatus);
  const [connection, setConnection] = useState<MorpheusDeepgramVoiceStatus | null>(null);
  const [result, setResult] = useState<MorpheusDeepgramVoiceTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<MorpheusDeepgramVoiceStatus['recognitionModel']>('nova-3');
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const operation = useRef(false);
  const active = voice?.settings.engine === 'deepgram';
  const buttonClass = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50';
  const primaryClass = `${buttonClass} border-[hsl(var(--morpheus-accent-dim))]/60 bg-[hsl(var(--morpheus-accent))]/10`;

  useEffect(() => {
    const id = ++generation.current;
    void hostApi.morpheus.deepgramVoiceStatus().then((status) => {
      if (id !== generation.current) return;
      setConnection(status);
      setModel(status.recognitionModel);
    }).catch(() => {
      if (id === generation.current) setResult({ ok: false, recognition: false, speech: false, reason: 'unavailable' });
    });
    const field = input.current;
    return () => {
      generation.current += 1;
      if (field) field.value = '';
    };
  }, []);

  async function run(action: () => Promise<void>): Promise<void> {
    if (operation.current) return;
    operation.current = true;
    const id = ++generation.current;
    if (input.current) input.current.value = '';
    setBusy(true);
    setResult(null);
    try { await action(); }
    catch {
      if (id === generation.current) setResult({ ok: false, recognition: false, speech: false, reason: 'unavailable' });
    } finally {
      operation.current = false;
      if (id === generation.current) setBusy(false);
    }
  }

  async function testSavedConnection(): Promise<void> {
    const id = generation.current;
    const tested = await hostApi.morpheus.testDeepgramVoiceConnection();
    if (id !== generation.current) return;
    setResult(tested);
    await loadVoice();
  }

  const statusKey = connection?.reason === 'storage' ? 'storageStatus'
    : active ? 'active' : connection?.configured ? 'saved' : connection ? 'notConnected' : result?.ok === false ? 'unavailableStatus' : 'loading';

  return <details data-testid="morpheus-deepgram-connection" className="group rounded-xl border border-border bg-surface-input px-4 py-3"
    onToggle={(event) => { if (!event.currentTarget.open && input.current) input.current.value = ''; }}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-3">
        <Cloud size={18} className="shrink-0 text-[hsl(var(--morpheus-accent))]" aria-hidden />
        <span className="min-w-0"><span className="block text-sm font-medium">{t('morpheus.voice.cloud.title')}</span>
          <span data-testid="morpheus-deepgram-status" className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{t(`morpheus.voice.cloud.${statusKey}`)}</span>
        </span>
      </span>
      <ChevronDown size={16} className="shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none group-open:rotate-180" aria-hidden />
    </summary>
    <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{t('morpheus.voice.cloud.description')}</p>
      <form data-testid="morpheus-deepgram-form" className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        if (operation.current) return;
        let apiKey = input.current?.value.trim() ?? '';
        if (input.current) input.current.value = '';
        if (!apiKey && !connection?.configured) return;
        if (!apiKey && model === connection?.recognitionModel) { void run(testSavedConnection); return; }
        void run(async () => {
          const id = generation.current;
          try {
            const saved = await hostApi.morpheus.saveDeepgramVoiceConnection({ ...(apiKey ? { apiKey } : {}), recognitionModel: model });
            apiKey = '';
            if (id !== generation.current) return;
            setConnection(saved);
            if (saved.configured) await testSavedConnection();
            else setResult({ ok: false, recognition: false, speech: false, reason: saved.reason ?? 'storage' });
          } finally { apiKey = ''; }
        });
      }}>
        <div className="space-y-2">
          <label htmlFor="morpheus-deepgram-key" className="block text-xs text-muted-foreground">{t(connection?.configured ? 'morpheus.voice.cloud.replaceKey' : 'morpheus.voice.cloud.key')}</label>
          <Input ref={input} id="morpheus-deepgram-key" data-testid="morpheus-deepgram-key" type="password" autoComplete="new-password"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} required={!connection?.configured} maxLength={512} disabled={busy}
            placeholder={t('morpheus.voice.cloud.keyPlaceholder')} className="min-h-10 rounded-lg bg-surface-input" />
        </div>
        <div className="space-y-2">
          <label htmlFor="morpheus-deepgram-model" className="block text-xs text-muted-foreground">{t('morpheus.voice.cloud.recognition')}</label>
          <select id="morpheus-deepgram-model" data-testid="morpheus-deepgram-model" value={model} disabled={busy}
            onChange={(event) => setModel(event.target.value as MorpheusDeepgramVoiceStatus['recognitionModel'])}
            className="min-h-10 w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm">
            <option value="nova-3">{t('morpheus.voice.cloud.nova')}</option>
            <option value="flux-general-en">{t('morpheus.voice.cloud.flux')}</option>
          </select>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('morpheus.voice.cloud.modelBody')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" data-testid="morpheus-deepgram-save" disabled={busy} className={primaryClass}>{t(busy ? 'morpheus.voice.cloud.checking' : 'morpheus.voice.cloud.saveTest')}</button>
          {connection?.configured ? <button type="button" data-testid="morpheus-deepgram-test" disabled={busy} className={buttonClass}
            onClick={() => void run(testSavedConnection)}>{t('morpheus.voice.cloud.testSaved')}</button> : null}
        </div>
      </form>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('morpheus.voice.cloud.testBody')}</p>
      {result ? <p data-testid="morpheus-deepgram-test-result" role="status" className={`rounded-lg border p-3 text-xs leading-relaxed ${result.ok ? 'border-[hsl(var(--morpheus-accent-dim))]/35 text-[hsl(var(--morpheus-accent))]' : 'border-[hsl(var(--morpheus-warn))]/30 text-[hsl(var(--morpheus-warn))]'}`}>
        {t(result.ok ? active ? 'morpheus.voice.cloud.passedActive' : 'morpheus.voice.cloud.passed' : `morpheus.voice.cloud.errors.${result.reason ?? 'unavailable'}`)}
      </p> : null}
      <div className="flex flex-wrap gap-2">
        {!active ? <button type="button" data-testid="morpheus-deepgram-use" disabled={busy || !connection?.configured || result?.ok === false} className={primaryClass}
          onClick={() => void run(async () => { await updateSettings({ engine: 'deepgram' }); })}>{t('morpheus.voice.cloud.useCloud')}</button>
          : <button type="button" data-testid="morpheus-deepgram-use-local" disabled={busy} className={buttonClass}
            onClick={() => void run(async () => { await updateSettings({ engine: 'local' }); })}>{t('morpheus.voice.cloud.useIncluded')}</button>}
        {connection?.configured ? <button type="button" data-testid="morpheus-deepgram-remove" disabled={busy} className={buttonClass}
          onClick={() => void run(async () => {
            const id = generation.current;
            const removed = await hostApi.morpheus.removeDeepgramVoiceConnection();
            if (id !== generation.current) return;
            setConnection(removed);
            if (input.current) input.current.value = '';
            await loadVoice();
          })}>{t('morpheus.voice.cloud.remove')}</button> : null}
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[hsl(var(--morpheus-accent))]" aria-hidden />
        <p>{t('morpheus.voice.cloud.privacy')}</p>
      </div>
    </div>
  </details>;
}
