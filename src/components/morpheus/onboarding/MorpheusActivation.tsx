import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Bot,
  Check,
  Cpu,
  Mic,
  Orbit,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';

import morpheusLogo from '@/assets/morpheus-logo.svg';
import { cn } from '@/lib/utils';
import { hostApi } from '@/lib/host-api';
import { useGatewayStore } from '@/stores/gateway';
import { useProviderStore } from '@/stores/providers';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import type { MorpheusCompanionPersonality } from '@shared/morpheus/onboarding-types';

type ActivationStage = 'loading' | 'intro' | 'calibrating' | 'preferences' | 'ready';
type Signal = { id: 'core' | 'runtime' | 'provider' | 'voice'; available: boolean; detail: string };

const PERSONALITIES: readonly MorpheusCompanionPersonality[] = ['adaptive', 'concise', 'warm'];

export function MorpheusActivation({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('dashboard');
  const onboarding = useMorpheusCompanionStore((state) => state.onboarding);
  const loadOnboarding = useMorpheusCompanionStore((state) => state.loadOnboarding);
  const completeOnboarding = useMorpheusCompanionStore((state) => state.completeOnboarding);
  const gatewayStatus = useGatewayStore((state) => state.status);
  const accounts = useProviderStore((state) => state.accounts);
  const defaultAccountId = useProviderStore((state) => state.defaultAccountId);
  const [stage, setStage] = useState<ActivationStage>('loading');
  const [dismissed, setDismissed] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [speakResponses, setSpeakResponses] = useState(true);
  const [personality, setPersonality] = useState<MorpheusCompanionPersonality>('adaptive');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadOnboarding().then(() => {
      if (cancelled) return;
      const status = useMorpheusCompanionStore.getState().onboarding;
      if (!status || status.completed) return;
      setSpeakResponses(status.preferences.speakResponses);
      setPersonality(status.preferences.personality);
      setStage('intro');
    });
    return () => { cancelled = true; };
  }, [enabled, loadOnboarding]);

  const provider = useMemo(() => (
    accounts.find((account) => account.id === defaultAccountId && account.enabled)
  ), [accounts, defaultAccountId]);

  // Completion is persisted before the final READY scene is shown. Keep that
  // scene alive for this activation session; a fresh mount still starts in
  // `loading` and therefore suppresses an already-completed activation.
  if (!enabled || dismissed || (onboarding?.completed && stage !== 'ready') || stage === 'loading') return null;

  const speakIntroduction = (): void => {
    if (typeof window.speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(t('morpheus.activation.spokenIntroduction')));
  };

  const calibrate = async (): Promise<void> => {
    setStage('calibrating');
    speakIntroduction();
    const [capabilities, voice] = await Promise.all([
      hostApi.morpheus.describeActions().catch(() => null),
      hostApi.morpheus.voiceStatus().catch(() => null),
    ]);
    const runtimeReady = gatewayStatus.state === 'running' && gatewayStatus.gatewayReady !== false;
    setSignals([
      {
        id: 'core', available: Boolean(capabilities?.actions.length),
        detail: capabilities ? t('morpheus.activation.signal.capabilities', { count: capabilities.actions.length }) : t('morpheus.activation.signal.unavailable'),
      },
      {
        id: 'runtime', available: runtimeReady,
        detail: runtimeReady ? t('morpheus.activation.signal.connected') : t('morpheus.activation.signal.starting'),
      },
      {
        id: 'provider', available: Boolean(provider),
        detail: provider ? `${provider.label}${provider.model ? ` · ${provider.model}` : ''}` : t('morpheus.activation.signal.optionalProvider'),
      },
      {
        id: 'voice', available: Boolean(voice?.transcriptionAvailable),
        detail: voice?.transcriptionAvailable ? (voice.providerLabel ?? t('morpheus.activation.signal.available')) : t('morpheus.activation.signal.voiceSetup'),
      },
    ]);
  };

  const finish = async (): Promise<void> => {
    const completed = await completeOnboarding({ speakResponses, personality });
    if (completed) setStage('ready');
  };

  const skip = async (): Promise<void> => {
    const completed = await completeOnboarding({ speakResponses, personality });
    if (completed) setDismissed(true);
  };

  return (
    <div
      data-morpheus
      data-testid="morpheus-activation"
      data-stage={stage}
      className="morpheus-activation fixed inset-0 z-[9997] overflow-hidden bg-[hsl(var(--morpheus-surface-1))] text-foreground"
      role="dialog"
      aria-modal="true"
      aria-label={t('morpheus.activation.title')}
    >
      <div aria-hidden className="morpheus-activation-grid absolute inset-0" />
      <div aria-hidden className="morpheus-activation-orbit absolute left-1/2 top-[42%] h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full" />

      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <img src={morpheusLogo} alt="" className="h-8 w-8" aria-hidden />
          <span className="font-serif text-sm tracking-[0.2em]">{t('morpheus.title')}</span>
        </div>
        <button
          type="button"
          data-testid="morpheus-activation-skip"
          onClick={() => void skip()}
          className="rounded border border-border/60 px-3 py-1.5 text-2xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
        >
          {t('morpheus.activation.skip')}
        </button>
      </header>

      <main className="relative z-10 mx-auto flex h-[calc(100%-6rem)] w-full max-w-5xl items-center justify-center px-8 pb-16">
        {stage === 'intro' ? (
          <section className="max-w-3xl text-center" data-testid="morpheus-activation-intro">
            <div className="morpheus-activation-core mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-full border border-[hsl(var(--morpheus-accent-dim))]">
              <img src={morpheusLogo} alt="" className="h-16 w-16" aria-hidden />
            </div>
            <p className="mb-4 text-[10px] uppercase tracking-[0.38em] text-[hsl(var(--morpheus-accent))]">
              {t('morpheus.activation.eyebrow')}
            </p>
            <h1 className="font-serif text-5xl font-normal tracking-tight sm:text-7xl">{t('morpheus.activation.title')}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {t('morpheus.activation.introduction')}
            </p>
            <button
              type="button"
              data-testid="morpheus-activation-begin"
              autoFocus
              onClick={() => void calibrate()}
              className="mt-9 inline-flex h-12 items-center gap-3 rounded-full border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 px-7 text-xs uppercase tracking-[0.18em] text-[hsl(var(--morpheus-accent))] shadow-[0_0_40px_hsl(var(--morpheus-glow))] hover:bg-[hsl(var(--morpheus-accent))]/15"
            >
              <Orbit className="h-4 w-4" /> {t('morpheus.activation.begin')} <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        ) : null}

        {stage === 'calibrating' ? (
          <section className="w-full max-w-3xl" data-testid="morpheus-activation-calibration">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.calibrating')}</p>
            <h2 className="mt-3 font-serif text-4xl font-normal">{t('morpheus.activation.systemsTitle')}</h2>
            {signals.length === 0 ? (
              <div className="mt-10 flex items-center gap-3 text-sm text-muted-foreground">
                <Orbit className="h-5 w-5 motion-safe:animate-spin text-[hsl(var(--morpheus-accent))]" />
                {t('morpheus.activation.checking')}
              </div>
            ) : (
              <>
                <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60">
                  {signals.map((signal) => {
                    const Icon = signal.id === 'core' ? Bot : signal.id === 'runtime' ? ShieldCheck : signal.id === 'provider' ? Cpu : Mic;
                    return (
                      <div key={signal.id} data-testid={`activation-signal-${signal.id}`} data-available={signal.available} className="bg-[hsl(var(--morpheus-surface-2))] p-5">
                        <div className="flex items-center justify-between">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                          <span className={cn('h-2 w-2 rounded-full', signal.available ? 'bg-[hsl(var(--morpheus-accent))]' : 'bg-[hsl(var(--morpheus-warn))]')} />
                        </div>
                        <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t(`morpheus.activation.signal.${signal.id}`)}</p>
                        <p className="mt-1 truncate text-sm text-foreground">{signal.detail}</p>
                      </div>
                    );
                  })}
                </div>
                <button type="button" data-testid="morpheus-activation-continue" onClick={() => setStage('preferences')} className="mt-7 inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-[hsl(var(--morpheus-accent))]">
                  {t('morpheus.activation.continue')} <ArrowRight className="h-4 w-4" />
                </button>
              </>
            )}
          </section>
        ) : null}

        {stage === 'preferences' ? (
          <section className="w-full max-w-3xl" data-testid="morpheus-activation-preferences">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.personalize')}</p>
            <h2 className="mt-3 font-serif text-4xl font-normal">{t('morpheus.activation.preferenceTitle')}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{t('morpheus.activation.preferenceBody')}</p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {PERSONALITIES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  data-testid={`activation-personality-${choice}`}
                  data-selected={personality === choice}
                  onClick={() => setPersonality(choice)}
                  className={cn('rounded-xl border p-4 text-left transition-colors', personality === choice ? 'border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/8' : 'border-border/60 bg-[hsl(var(--morpheus-surface-2))]')}
                >
                  <Sparkles className="h-4 w-4 text-[hsl(var(--morpheus-accent))]" />
                  <p className="mt-5 text-sm font-medium">{t(`morpheus.activation.personalities.${choice}.name`)}</p>
                  <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{t(`morpheus.activation.personalities.${choice}.description`)}</p>
                </button>
              ))}
            </div>
            <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-border/60 bg-[hsl(var(--morpheus-surface-2))] p-4">
              <span className="flex items-center gap-3"><Volume2 className="h-4 w-4 text-muted-foreground" /><span><span className="block text-sm">{t('morpheus.activation.speak')}</span><span className="mt-0.5 block text-2xs text-muted-foreground">{t('morpheus.activation.speakDescription')}</span></span></span>
              <input data-testid="activation-speak-responses" type="checkbox" checked={speakResponses} onChange={(event) => setSpeakResponses(event.target.checked)} className="h-4 w-4 accent-emerald-500" />
            </label>
            <button type="button" data-testid="morpheus-activation-finish" onClick={() => void finish()} className="mt-7 inline-flex h-11 items-center gap-2 rounded-full border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 px-6 text-xs uppercase tracking-[0.15em] text-[hsl(var(--morpheus-accent))]">
              {t('morpheus.activation.finish')} <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        ) : null}

        {stage === 'ready' ? (
          <section className="max-w-2xl text-center" data-testid="morpheus-activation-ready">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 shadow-[0_0_60px_hsl(var(--morpheus-glow))]"><Check className="h-8 w-8 text-[hsl(var(--morpheus-accent))]" /></div>
            <p className="mt-7 text-[10px] uppercase tracking-[0.35em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.readyLabel')}</p>
            <h2 className="mt-3 font-serif text-5xl font-normal">{t('morpheus.activation.readyTitle')}</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t('morpheus.activation.readyBody')}</p>
            <button type="button" autoFocus data-testid="morpheus-activation-enter" onClick={() => setDismissed(true)} className="mt-8 inline-flex h-12 items-center gap-3 rounded-full border border-[hsl(var(--morpheus-accent-dim))] px-7 text-xs uppercase tracking-[0.18em] text-[hsl(var(--morpheus-accent))]">
              {t('morpheus.activation.enter')} <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        ) : null}
      </main>
    </div>
  );
}
