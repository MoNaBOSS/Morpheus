import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Cpu, Mic, ShieldCheck, Volume2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { hostApi } from '@/lib/host-api';
import { useGatewayStore } from '@/stores/gateway';
import { useProviderStore } from '@/stores/providers';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import type { MorpheusCompanionPersonality } from '@shared/morpheus/onboarding-types';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';
import { MorpheusSignal } from '@/components/morpheus/signal/MorpheusSignal';
import { resolveMorpheusSignalState } from '@/components/morpheus/signal/signal-state';

type ActivationStage = 'loading' | 'intro' | 'calibrating' | 'preferences' | 'proof' | 'ready';
type SignalLock = { id: 'core' | 'runtime' | 'provider' | 'voice'; available: boolean; detail: string };
const PERSONALITIES: readonly MorpheusCompanionPersonality[] = ['adaptive', 'concise', 'warm'];
const PROOF_OBJECTIVE = 'Show system information';

export function MorpheusActivation({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('dashboard');
  const onboarding = useMorpheusCompanionStore((state) => state.onboarding);
  const loadOnboarding = useMorpheusCompanionStore((state) => state.loadOnboarding);
  const completeOnboarding = useMorpheusCompanionStore((state) => state.completeOnboarding);
  const gatewayStatus = useGatewayStore((state) => state.status);
  const accounts = useProviderStore((state) => state.accounts);
  const defaultAccountId = useProviderStore((state) => state.defaultAccountId);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const runObjective = useMorpheusCommandStore((state) => state.runObjective);
  const [stage, setStage] = useState<ActivationStage>('loading');
  const [dismissed, setDismissed] = useState(false);
  const [signals, setSignals] = useState<SignalLock[]>([]);
  const [speakResponses, setSpeakResponses] = useState(true);
  const [personality, setPersonality] = useState<MorpheusCompanionPersonality>('adaptive');
  const [proofStarted, setProofStarted] = useState(false);

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

  const provider = useMemo(() => accounts.find((account) => account.id === defaultAccountId && account.enabled), [accounts, defaultAccountId]);
  const visibleStage: ActivationStage = stage === 'proof' && proofStarted && objectiveRun && isObjectiveTerminalState(objectiveRun.state) ? 'ready' : stage;
  const signalState = resolveMorpheusSignalState({ objectiveState: visibleStage === 'proof' ? objectiveRun?.state : visibleStage === 'ready' ? 'complete' : visibleStage === 'calibrating' ? 'understanding' : undefined });

  if (!enabled || dismissed || (onboarding?.completed && visibleStage !== 'proof' && visibleStage !== 'ready') || visibleStage === 'loading') return null;

  const speakIntroduction = (): void => {
    if (typeof window.speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(t('morpheus.signalOs.activation.spokenIntroduction')));
  };

  const calibrate = async (): Promise<void> => {
    setStage('calibrating');
    speakIntroduction();
    const [capabilities, voice] = await Promise.all([hostApi.morpheus.describeActions().catch(() => null), hostApi.morpheus.voiceStatus().catch(() => null)]);
    const runtimeReady = gatewayStatus.state === 'running' && gatewayStatus.gatewayReady !== false;
    setSignals([
      { id: 'core', available: Boolean(capabilities?.actions.length), detail: capabilities ? t('morpheus.activation.signal.capabilities', { count: capabilities.actions.length }) : t('morpheus.activation.signal.unavailable') },
      { id: 'runtime', available: runtimeReady, detail: runtimeReady ? t('morpheus.activation.signal.connected') : t('morpheus.activation.signal.starting') },
      { id: 'provider', available: Boolean(provider), detail: provider ? `${provider.label}${provider.model ? ` · ${provider.model}` : ''}` : t('morpheus.activation.signal.optionalProvider') },
      { id: 'voice', available: Boolean(voice?.transcriptionAvailable), detail: voice?.transcriptionAvailable ? (voice.providerLabel ?? t('morpheus.activation.signal.available')) : t('morpheus.activation.signal.voiceSetup') },
    ]);
  };

  const savePreferences = async (): Promise<void> => {
    if (await completeOnboarding({ speakResponses, personality })) setStage('proof');
  };

  const skip = async (): Promise<void> => {
    if (await completeOnboarding({ speakResponses, personality })) setDismissed(true);
  };

  const startProof = async (): Promise<void> => {
    setProofStarted(true);
    const accepted = await runObjective(PROOF_OBJECTIVE, 'command-bar');
    if (!accepted) setProofStarted(false);
  };

  return (
    <div data-morpheus data-testid="morpheus-activation" data-stage={visibleStage} className="morpheus-signal-activation fixed inset-0 z-[9997] overflow-hidden bg-[hsl(var(--morpheus-surface-1))] text-foreground" role="dialog" aria-modal="true" aria-label={t('morpheus.activation.title')}>
      <div aria-hidden className="morpheus-activation-depth absolute inset-0" />
      <div aria-hidden className="morpheus-activation-streams absolute inset-0" />

      <header className="relative z-10 flex h-16 items-center justify-between border-b border-white/[0.05] px-7">
        <span className="font-serif text-sm tracking-[0.24em]">{t('morpheus.title')}</span>
        <button type="button" data-testid="morpheus-activation-skip" onClick={() => void skip()} className="px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">{t('morpheus.activation.skip')}</button>
      </header>

      <main className="relative z-10 grid h-[calc(100%-4rem)] grid-cols-[minmax(300px,0.8fr)_minmax(520px,1.2fr)]">
        <section className="flex items-center justify-center border-r border-white/[0.06] p-8">
          <div className="text-center">
            <MorpheusSignal state={signalState} className="mx-auto h-64 w-64 text-[hsl(var(--morpheus-accent))]" label={t(`morpheus.signalOs.signal.${signalState}`)} />
            <p className="mt-5 text-[9px] uppercase tracking-[0.3em] text-[hsl(var(--morpheus-accent))]">{t(`morpheus.signalOs.signal.${signalState}`)}</p>
          </div>
        </section>

        <section className="flex min-w-0 items-center px-[8vw] py-8">
          {visibleStage === 'intro' ? (
            <div data-testid="morpheus-activation-intro" className="max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.eyebrow')}</p>
              <h1 className="mt-5 font-serif text-6xl font-normal leading-[0.96] tracking-tight">{t('morpheus.signalOs.activation.title')}</h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">{t('morpheus.signalOs.activation.introduction')}</p>
              <button type="button" data-testid="morpheus-activation-begin" autoFocus onClick={() => void calibrate()} className="mt-9 inline-flex items-center gap-3 border-b border-[hsl(var(--morpheus-accent))] pb-2 text-xs uppercase tracking-[0.18em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.signalOs.activation.begin')}<ArrowRight className="h-4 w-4" /></button>
            </div>
          ) : null}

          {visibleStage === 'calibrating' ? (
            <div data-testid="morpheus-activation-calibration" className="w-full max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.calibrating')}</p>
              <h2 className="mt-4 font-serif text-4xl font-normal">{t('morpheus.signalOs.activation.readiness')}</h2>
              {signals.length === 0 ? <p className="mt-8 text-sm text-muted-foreground">{t('morpheus.activation.checking')}</p> : (
                <>
                  <ol className="mt-8 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                    {signals.map((signal) => {
                      const Icon = signal.id === 'runtime' ? ShieldCheck : signal.id === 'provider' ? Cpu : signal.id === 'voice' ? Mic : Check;
                      return <li key={signal.id} data-testid={`activation-signal-${signal.id}`} data-available={signal.available} className="flex items-center gap-4 py-4"><Icon className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{t(`morpheus.activation.signal.${signal.id}`)}</p><p className="mt-1 truncate text-sm text-foreground/85">{signal.detail}</p></div><span className={cn('h-2 w-2 rounded-full', signal.available ? 'bg-[hsl(var(--morpheus-accent))]' : 'bg-[hsl(var(--morpheus-warn))]')} /></li>;
                    })}
                  </ol>
                  <button type="button" data-testid="morpheus-activation-continue" onClick={() => setStage('preferences')} className="mt-7 inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.continue')}<ArrowRight className="h-4 w-4" /></button>
                </>
              )}
            </div>
          ) : null}

          {visibleStage === 'preferences' ? (
            <div data-testid="morpheus-activation-preferences" className="w-full max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.personalize')}</p>
              <h2 className="mt-4 font-serif text-4xl font-normal">{t('morpheus.signalOs.activation.relationship')}</h2>
              <div className="mt-7 grid grid-cols-3 border-y border-white/[0.07]">
                {PERSONALITIES.map((choice) => <button key={choice} type="button" data-testid={`activation-personality-${choice}`} data-selected={personality === choice} onClick={() => setPersonality(choice)} className="border-r border-white/[0.07] px-4 py-5 text-left last:border-r-0 data-[selected=true]:bg-white/[0.04]"><span className={cn('block h-1 w-7', personality === choice ? 'bg-[hsl(var(--morpheus-accent))]' : 'bg-white/10')} /><p className="mt-4 text-sm">{t(`morpheus.activation.personalities.${choice}.name`)}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{t(`morpheus.activation.personalities.${choice}.description`)}</p></button>)}
              </div>
              <label className="mt-4 flex cursor-pointer items-center justify-between border-b border-white/[0.07] py-4"><span className="flex items-center gap-3"><Volume2 className="h-4 w-4 text-muted-foreground" /><span><span className="block text-sm">{t('morpheus.activation.speak')}</span><span className="mt-1 block text-[10px] text-muted-foreground">{t('morpheus.activation.speakDescription')}</span></span></span><input data-testid="activation-speak-responses" type="checkbox" checked={speakResponses} onChange={(event) => setSpeakResponses(event.target.checked)} className="h-4 w-4 accent-emerald-500" /></label>
              <button type="button" data-testid="morpheus-activation-finish" onClick={() => void savePreferences()} className="mt-7 inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.signalOs.activation.prove')}<ArrowRight className="h-4 w-4" /></button>
            </div>
          ) : null}

          {visibleStage === 'proof' ? (
            <div data-testid="morpheus-activation-proof" className="w-full max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.signalOs.activation.firstMission')}</p>
              <h2 className="mt-4 font-serif text-4xl font-normal">{t('morpheus.signalOs.activation.proofTitle')}</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t('morpheus.signalOs.activation.proofBody')}</p>
              <div className="mt-7 border-y border-white/[0.07] py-5"><p className="font-serif text-xl">{t('morpheus.signalOs.activation.proofObjective')}</p>{objectiveRun ? <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--morpheus-accent))]">{t(`morpheus.objective.states.${objectiveRun.state}`)}</p> : null}</div>
              <div className="mt-7 flex items-center gap-5">
                <button type="button" data-testid="morpheus-activation-run-proof" disabled={proofStarted} onClick={() => void startProof()} className="inline-flex items-center gap-2 border-b border-[hsl(var(--morpheus-accent))] pb-2 text-xs uppercase tracking-[0.15em] text-[hsl(var(--morpheus-accent))] disabled:opacity-50">{t('morpheus.signalOs.activation.runMission')}<ArrowRight className="h-4 w-4" /></button>
                <button type="button" data-testid="morpheus-activation-skip-proof" onClick={() => setStage('ready')} className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">{t('morpheus.signalOs.activation.continueWithout')}</button>
              </div>
            </div>
          ) : null}

          {visibleStage === 'ready' ? (
            <div data-testid="morpheus-activation-ready" className="max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.readyLabel')}</p>
              <h2 className="mt-4 font-serif text-5xl font-normal">{t('morpheus.signalOs.activation.readyTitle')}</h2>
              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{objectiveRun?.summary ?? t('morpheus.signalOs.activation.readyBody')}</p>
              <button type="button" autoFocus data-testid="morpheus-activation-enter" onClick={() => setDismissed(true)} className="mt-8 inline-flex items-center gap-3 border-b border-[hsl(var(--morpheus-accent))] pb-2 text-xs uppercase tracking-[0.18em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.enter')}<ArrowRight className="h-4 w-4" /></button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
