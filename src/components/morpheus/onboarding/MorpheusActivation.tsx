import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BellRing, Check, Cpu, Mic, Power, ShieldCheck, UserRound, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { hostApi } from '@/lib/host-api';
import { Switch } from '@/components/ui/switch';
import { useGatewayStore } from '@/stores/gateway';
import { useProviderStore } from '@/stores/providers';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import {
  DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
  type MorpheusCompanionPersonality,
  type MorpheusOnboardingPreferences,
} from '@shared/morpheus/onboarding-types';
import type { MorpheusInteractionMode } from '@shared/morpheus/operator-types';
import type { PermissionProfile } from '@shared/morpheus/permission-types';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';
import { MorpheusSignal } from '@/components/morpheus/signal/MorpheusSignal';
import { resolveMorpheusSignalState } from '@/components/morpheus/signal/signal-state';
import { MorpheusInteractionModeControl } from '@/components/morpheus/operator/MorpheusInteractionModeControl';
import { useMorpheusOperatorStore } from '@/stores/morpheus-operator';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { hasConfiguredCredentials } from '@/lib/provider-accounts';
import { isMorpheusPlannerAccountCompatible } from '@shared/morpheus/provider-readiness';
import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';

type ActivationStage = 'loading' | 'intro' | 'calibrating' | 'preferences' | 'proof' | 'ready';
type SignalLock = { id: 'core' | 'runtime' | 'provider' | 'voice'; available: boolean; detail: string };
const PERSONALITIES: readonly MorpheusCompanionPersonality[] = ['adaptive', 'witty', 'warm', 'concise'];
const PERMISSION_PROFILES: readonly PermissionProfile[] = ['strict', 'balanced', 'autonomous'];
const PROOF_OBJECTIVE = 'Show system information';

export function MorpheusActivation({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const onboarding = useMorpheusCompanionStore((state) => state.onboarding);
  const loadOnboarding = useMorpheusCompanionStore((state) => state.loadOnboarding);
  const completeOnboarding = useMorpheusCompanionStore((state) => state.completeOnboarding);
  const setOperatorMode = useMorpheusOperatorStore((state) => state.setMode);
  const gatewayStatus = useGatewayStore((state) => state.status);
  const accounts = useProviderStore((state) => state.accounts);
  const providerStatuses = useProviderStore((state) => state.statuses);
  const defaultAccountId = useProviderStore((state) => state.defaultAccountId);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const runObjective = useMorpheusCommandStore((state) => state.runObjective);
  const [stage, setStage] = useState<ActivationStage>('loading');
  const [dismissed, setDismissed] = useState(false);
  const [signals, setSignals] = useState<SignalLock[]>([]);
  const [speakResponses, setSpeakResponses] = useState(true);
  const [preferredName, setPreferredName] = useState('');
  const [personality, setPersonality] = useState<MorpheusCompanionPersonality>('witty');
  const [interactionMode, setInteractionMode] = useState<MorpheusInteractionMode>('auto');
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [ambientVoiceEnabled, setAmbientVoiceEnabled] = useState(false);
  const [wakePhrase, setWakePhrase] = useState('Morpheus');
  const [permissionProfile, setPermissionProfile] = useState<PermissionProfile>('autonomous');
  const [proactiveCheckIns, setProactiveCheckIns] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [neuralSpeechAvailable, setNeuralSpeechAvailable] = useState(false);
  const [proofStarted, setProofStarted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);
  const voiceSource = useMorpheusVoiceStore((state) => state.source);
  const voiceTranscript = useMorpheusVoiceStore((state) => state.transcript);
  const voiceError = useMorpheusVoiceStore((state) => state.error);
  const startVoiceCalibration = useMorpheusVoiceStore((state) => state.startListening);
  const stopVoiceCalibration = useMorpheusVoiceStore((state) => state.stopListening);
  const dismissVoiceCalibration = useMorpheusVoiceStore((state) => state.dismiss);
  const introductionSpoken = useRef(false);
  const exitStarted = useRef(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadOnboarding().then(() => {
      if (cancelled) return;
      const status = useMorpheusCompanionStore.getState().onboarding;
      if (!status || status.completed) return;
      setSpeakResponses(status.preferences.speakResponses);
      setPreferredName(status.preferences.preferredName);
      setPersonality(status.preferences.personality);
      setInteractionMode(status.preferences.interactionMode);
      setLaunchAtStartup(status.preferences.launchAtStartup);
      setAmbientVoiceEnabled(status.preferences.ambientVoiceEnabled);
      setWakePhrase(status.preferences.wakePhrase);
      setPermissionProfile(status.preferences.permissionProfile);
      setProactiveCheckIns(status.preferences.proactiveCheckIns);
      setStage('intro');
    });
    return () => { cancelled = true; };
  }, [enabled, loadOnboarding]);

  const provider = useMemo(
    () => accounts.find((account) => account.id === defaultAccountId && account.enabled),
    [accounts, defaultAccountId],
  );
  const providerStatus = useMemo(
    () => providerStatuses.find((status) => status.id === provider?.id),
    [provider?.id, providerStatuses],
  );
  const providerReady = Boolean(
    provider
      && isMorpheusPlannerAccountCompatible(provider)
      && hasConfiguredCredentials(provider, providerStatus),
  );
  const visibleStage: ActivationStage = stage === 'proof' && proofStarted && objectiveRun && isObjectiveTerminalState(objectiveRun.state) ? 'ready' : stage;
  const signalState = resolveMorpheusSignalState({ objectiveState: visibleStage === 'proof' ? objectiveRun?.state : visibleStage === 'ready' ? 'complete' : visibleStage === 'calibrating' ? 'understanding' : undefined });

  const speak = useCallback((text: string): void => {
    void playMorpheusSpeech(text, { neuralAvailable: neuralSpeechAvailable }).catch(() => undefined);
  }, [neuralSpeechAvailable]);

  useEffect(() => {
    if (visibleStage !== 'intro' || introductionSpoken.current) return;
    introductionSpoken.current = true;
    speak(t('morpheus.activation.firstGreeting'));
  }, [speak, t, visibleStage]);

  const finishArrival = useCallback((destination?: string): void => {
    if (exitStarted.current) return;
    exitStarted.current = true;
    setExiting(true);
    stopMorpheusSpeech();
    exitTimer.current = window.setTimeout(() => {
      setDismissed(true);
      if (destination) navigate(destination);
    }, 680);
  }, [navigate]);

  useEffect(() => {
    if (visibleStage !== 'ready') return undefined;
    const timer = window.setTimeout(() => finishArrival(), providerReady ? 2600 : 8000);
    return () => window.clearTimeout(timer);
  }, [finishArrival, providerReady, visibleStage]);

  useEffect(() => () => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    stopMorpheusSpeech();
    if (useMorpheusVoiceStore.getState().source === 'onboarding') {
      useMorpheusVoiceStore.getState().cancel();
    }
  }, []);

  if (!enabled || dismissed || (onboarding?.completed && visibleStage !== 'proof' && visibleStage !== 'ready') || visibleStage === 'loading') return null;

  const calibrate = async (): Promise<void> => {
    setStage('calibrating');
    const name = preferredName.trim();
    speak(name
      ? t('morpheus.activation.personalGreeting', { name })
      : t('morpheus.signalOs.activation.spokenIntroduction'));
    const [capabilities, voice] = await Promise.all([hostApi.morpheus.describeActions().catch(() => null), hostApi.morpheus.voiceStatus().catch(() => null)]);
    const runtimeReady = gatewayStatus.state === 'running' && gatewayStatus.gatewayReady !== false;
    setVoiceAvailable(Boolean(voice?.transcriptionAvailable));
    setNeuralSpeechAvailable(Boolean(voice?.neuralSpeechAvailable));
    setSignals([
      { id: 'core', available: Boolean(capabilities?.actions.length), detail: capabilities ? t('morpheus.activation.signal.capabilities', { count: capabilities.actions.length }) : t('morpheus.activation.signal.unavailable') },
      { id: 'runtime', available: runtimeReady, detail: runtimeReady ? t('morpheus.activation.signal.connected') : t('morpheus.activation.signal.starting') },
      { id: 'provider', available: providerReady, detail: providerReady && provider ? `${provider.label}${provider.model ? ` · ${provider.model}` : ''}` : t('morpheus.activation.signal.optionalProvider') },
      { id: 'voice', available: Boolean(voice?.transcriptionAvailable), detail: voice?.transcriptionAvailable ? (voice.providerLabel ?? t('morpheus.activation.signal.available')) : t('morpheus.activation.signal.voiceSetup') },
    ]);
  };

  const preferences = (): MorpheusOnboardingPreferences => ({
    ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
    preferredName: preferredName.trim(),
    speakResponses,
    personality,
    interactionMode,
    launchAtStartup,
    ambientVoiceEnabled: ambientVoiceEnabled && voiceAvailable,
    wakePhrase: wakePhrase.trim() || 'Morpheus',
    permissionProfile,
    proactiveCheckIns,
  });

  const savePreferences = async (): Promise<void> => {
    if (await completeOnboarding(preferences())) {
      setOperatorMode(interactionMode);
      setStage('proof');
    }
  };

  const skip = async (): Promise<void> => {
    if (await completeOnboarding(preferences())) {
      setOperatorMode(interactionMode);
      finishArrival();
    }
  };

  const useVoiceName = (): void => {
    if (!voiceTranscript?.trim()) return;
    const name = voiceTranscript
      .trim()
      .replace(/^(?:my name is|call me|i am|i'm)\s+/i, '')
      .replace(/[.!?]+$/u, '')
      .slice(0, 80);
    setPreferredName(name);
    dismissVoiceCalibration();
  };

  const startProof = async (): Promise<void> => {
    setProofStarted(true);
    const accepted = await runObjective(PROOF_OBJECTIVE, 'command-bar');
    if (!accepted) setProofStarted(false);
  };

  return (
    <div data-morpheus data-testid="morpheus-activation" data-stage={visibleStage} data-exiting={exiting ? 'true' : 'false'} className={cn('morpheus-signal-activation fixed inset-0 z-[9997] overflow-hidden bg-[hsl(var(--morpheus-surface-1))] text-foreground', exiting && 'morpheus-activation-leaving pointer-events-none')} role="dialog" aria-modal="true" aria-label={t('morpheus.activation.title')}>
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
              <h1 className="mt-5 font-serif text-6xl font-normal leading-[0.96] tracking-tight">{t('morpheus.activation.firstGreeting')}</h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">{t('morpheus.signalOs.activation.introduction')}</p>
              <label className="mt-8 block max-w-xl">
                <span className="sr-only">{t('morpheus.activation.preferredName')}</span>
                <input data-testid="activation-intro-name" value={preferredName} maxLength={80} autoComplete="name" autoFocus onChange={(event) => setPreferredName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void calibrate(); }} placeholder={t('morpheus.activation.preferredNamePlaceholder')} className="h-14 w-full border-x-0 border-b border-t-0 border-white/[0.14] bg-transparent px-0 font-serif text-2xl outline-none transition-colors placeholder:text-muted-foreground/35 focus:border-[hsl(var(--morpheus-accent)/0.7)]" />
              </label>
              <button type="button" data-testid="morpheus-activation-begin" onClick={() => void calibrate()} className="mt-9 inline-flex items-center gap-3 border-b border-[hsl(var(--morpheus-accent))] pb-2 text-xs uppercase tracking-[0.18em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.signalOs.activation.begin')}<ArrowRight className="h-4 w-4" /></button>
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
                  <div data-testid="morpheus-voice-calibration" className="mt-5 border border-white/[0.08] bg-black/15 p-4">
                    <div className="flex items-start justify-between gap-5">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{t('morpheus.activation.voiceCalibration.title')}</p>
                        <p className="mt-1 text-xs leading-relaxed text-foreground/80">{voiceAvailable ? t('morpheus.activation.voiceCalibration.ready') : t('morpheus.activation.voiceCalibration.unavailable')}</p>
                        {voiceSource === 'onboarding' && voiceTranscript ? <p data-testid="activation-voice-transcript" className="mt-3 font-serif text-lg text-[hsl(var(--morpheus-accent))]">“{voiceTranscript}”</p> : null}
                        {voiceSource === 'onboarding' && voiceError ? <p className="mt-2 text-xs text-[hsl(var(--morpheus-danger))]">{t('morpheus.activation.voiceCalibration.failed')}</p> : null}
                      </div>
                      {voiceSource === 'onboarding' && voicePhase === 'listening' ? <button type="button" data-testid="activation-voice-stop" onClick={stopVoiceCalibration} className="shrink-0 border-b border-[hsl(var(--morpheus-accent))] pb-1 text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.voice.stop')}</button> : <button type="button" data-testid="activation-voice-start" disabled={!voiceAvailable || ['requesting', 'transcribing'].includes(voicePhase)} onClick={() => void startVoiceCalibration('onboarding')} className="shrink-0 border-b border-[hsl(var(--morpheus-accent))] pb-1 text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--morpheus-accent))] disabled:opacity-35">{t('morpheus.activation.voiceCalibration.try')}</button>}
                    </div>
                    {voiceSource === 'onboarding' && voicePhase === 'ready' && voiceTranscript ? <button type="button" data-testid="activation-use-voice-name" onClick={useVoiceName} className="mt-3 text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.voiceCalibration.useName')}</button> : null}
                  </div>
                  <button type="button" data-testid="morpheus-activation-continue" onClick={() => setStage('preferences')} className="mt-7 inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.continue')}<ArrowRight className="h-4 w-4" /></button>
                </>
              )}
            </div>
          ) : null}

          {visibleStage === 'preferences' ? (
            <div data-testid="morpheus-activation-preferences" className="max-h-full w-full max-w-3xl overflow-y-auto py-2 pr-2 scrollbar-thin">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.personalize')}</p>
              <h2 className="mt-3 font-serif text-4xl font-normal">{t('morpheus.activation.preferenceTitle')}</h2>

              <label className="mt-6 block">
                <span className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground"><UserRound className="h-3.5 w-3.5" />{t('morpheus.activation.preferredName')}</span>
                <input
                  data-testid="activation-preferred-name"
                  value={preferredName}
                  maxLength={80}
                  autoComplete="name"
                  onChange={(event) => setPreferredName(event.target.value)}
                  placeholder={t('morpheus.activation.preferredNamePlaceholder')}
                  className="mt-2 h-11 w-full border border-white/[0.1] bg-black/15 px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[hsl(var(--morpheus-accent)/0.55)]"
                />
              </label>

              <div className="mt-5 grid grid-cols-4 border-y border-white/[0.07]">
                {PERSONALITIES.map((choice) => <button key={choice} type="button" data-testid={`activation-personality-${choice}`} data-selected={personality === choice} onClick={() => setPersonality(choice)} className="border-r border-white/[0.07] px-3 py-3 text-left last:border-r-0 data-[selected=true]:bg-white/[0.04]"><span className={cn('block h-0.5 w-6', personality === choice ? 'bg-[hsl(var(--morpheus-accent))]' : 'bg-white/10')} /><p className="mt-2.5 text-xs">{t(`morpheus.activation.personalities.${choice}.name`)}</p><p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{t(`morpheus.activation.personalities.${choice}.description`)}</p></button>)}
              </div>

              <p className="mt-5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{t('morpheus.operator.modeLabel')}</p>
              <MorpheusInteractionModeControl className="mt-2" value={interactionMode} onChange={setInteractionMode} showDescription />

              <p className="mt-5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{t('morpheus.activation.autonomy')}</p>
              <div className="mt-2 grid grid-cols-3 border border-white/[0.09] bg-black/15">
                {PERMISSION_PROFILES.map((profile) => <button key={profile} type="button" data-testid={`activation-permission-${profile}`} data-selected={permissionProfile === profile} onClick={() => setPermissionProfile(profile)} className="border-r border-white/[0.08] px-4 py-3 text-left last:border-r-0 data-[selected=true]:bg-[hsl(var(--morpheus-accent)/0.08)]"><span className={cn('text-[10px] uppercase tracking-[0.14em]', permissionProfile === profile ? 'text-[hsl(var(--morpheus-accent))]' : 'text-foreground/65')}>{t(`morpheus.activation.permissionProfiles.${profile}.name`)}</span><span className="mt-1 block text-[9px] leading-relaxed text-muted-foreground">{t(`morpheus.activation.permissionProfiles.${profile}.description`)}</span></button>)}
              </div>

              <div className="mt-4 grid grid-cols-2 border-y border-white/[0.07]">
                <ActivationToggle icon={Power} testId="activation-launch-at-startup" title={t('morpheus.activation.launchAtStartup')} description={t('morpheus.activation.launchAtStartupDescription')} checked={launchAtStartup} onChange={setLaunchAtStartup} />
                <ActivationToggle icon={Mic} testId="activation-ambient-voice" title={t('morpheus.activation.ambientVoice')} description={voiceAvailable ? t('morpheus.activation.ambientVoiceDescription', { wakePhrase }) : t('morpheus.activation.ambientVoiceUnavailable')} checked={ambientVoiceEnabled && voiceAvailable} disabled={!voiceAvailable} onChange={setAmbientVoiceEnabled} />
                <ActivationToggle icon={Volume2} testId="activation-speak-responses" title={t('morpheus.activation.speak')} description={t('morpheus.activation.speakDescription')} checked={speakResponses} onChange={setSpeakResponses} />
                <ActivationToggle icon={BellRing} testId="activation-proactive-check-ins" title={t('morpheus.activation.proactiveCheckIns')} description={t('morpheus.activation.proactiveCheckInsDescription')} checked={proactiveCheckIns} onChange={setProactiveCheckIns} />
              </div>
              {ambientVoiceEnabled && voiceAvailable ? <label className="mt-3 flex items-center gap-3"><span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{t('morpheus.activation.wakePhrase')}</span><input data-testid="activation-wake-phrase" value={wakePhrase} maxLength={48} onChange={(event) => setWakePhrase(event.target.value)} className="h-9 min-w-0 flex-1 border border-white/[0.1] bg-black/15 px-3 text-xs outline-none focus:border-[hsl(var(--morpheus-accent)/0.55)]" /></label> : null}
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
              {!providerReady ? <p className="mt-3 max-w-xl text-xs leading-relaxed text-[hsl(var(--morpheus-warn))]">{t('morpheus.activation.providerNeeded')}</p> : null}
              <div className="mt-8 flex flex-wrap items-center gap-6">
                <button type="button" autoFocus data-testid="morpheus-activation-enter" onClick={() => finishArrival()} className="inline-flex items-center gap-3 border-b border-[hsl(var(--morpheus-accent))] pb-2 text-xs uppercase tracking-[0.18em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.activation.enter')}<ArrowRight className="h-4 w-4" /></button>
                {!providerReady ? (
                  <button type="button" data-testid="morpheus-activation-connect-provider" onClick={() => finishArrival('/models?addProvider=1')} className="inline-flex items-center gap-2 border-b border-white/15 pb-2 text-[10px] uppercase tracking-[0.14em] text-foreground/70 hover:border-[hsl(var(--morpheus-accent)/0.55)] hover:text-foreground">
                    {t('morpheus.activation.connectProvider')}<ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function ActivationToggle({
  icon: Icon,
  testId,
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  icon: typeof Mic;
  testId: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn('flex min-h-20 items-center gap-3 border-r border-b border-white/[0.07] p-3 last:border-r-0', disabled && 'opacity-50')}>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1"><span className="block text-xs">{title}</span><span className="mt-1 block text-[9px] leading-relaxed text-muted-foreground">{description}</span></span>
      <Switch data-testid={testId} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}
