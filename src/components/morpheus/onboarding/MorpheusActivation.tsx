import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Mic, Volume2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import morpheusLogo from '@/assets/morpheus-logo.svg';
import { MorpheusFluidOrb } from '@/components/morpheus/MorpheusFluidOrb';
import { MorpheusTrayChoice } from './MorpheusTrayChoice';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusOperatorStore } from '@/stores/morpheus-operator';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useSettingsStore } from '@/stores/settings';
import { speechVoicesForModel } from '@shared/morpheus/provider-policy';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, type MorpheusHumorStyle, type MorpheusProactivityLevel, type MorpheusOnboardingPreferences } from '@shared/morpheus/onboarding-types';
import type { MorpheusSpeechVoice } from '@shared/morpheus/voice-types';
import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { ProvidersSettings } from '@/components/settings/ProvidersSettings';
import { MorpheusVoiceSetup } from '@/components/morpheus/MorpheusVoiceSetup';
import { useProviderStore } from '@/stores/providers';

type Stage = 'loading' | 'name' | 'connections' | 'voice' | 'welcome' | 'personalize' | 'ready';
const SILENCE_MS = 8_000;

/** The approved single-scene prototype, connected to the real local profile. */
export function MorpheusActivation({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const onboarding = useMorpheusCompanionStore((s) => s.onboarding);
  const loadOnboarding = useMorpheusCompanionStore((s) => s.loadOnboarding);
  const completeOnboarding = useMorpheusCompanionStore((s) => s.completeOnboarding);
  const setObjective = useMorpheusCommandStore((s) => s.setInput);
  const runObjective = useMorpheusCommandStore((s) => s.runObjective);
  const route = useMorpheusOperatorStore((s) => s.route);
  const setConversationDraft = useMorpheusConversationStore((s) => s.setDraft);
  const submitConversation = useMorpheusConversationStore((s) => s.submit);
  const voice = useMorpheusVoiceStore((s) => s.status);
  const providersConfigured = useProviderStore((s) => s.statuses.some((p) => p.hasKey));
  const voicePhase = useMorpheusVoiceStore((s) => s.phase);
  const voiceSource = useMorpheusVoiceStore((s) => s.source);
  const startListening = useMorpheusVoiceStore((s) => s.startListening);
  const stopListening = useMorpheusVoiceStore((s) => s.stopListening);
  const updateVoice = useMorpheusVoiceStore((s) => s.updateSettings);
  const telemetryEnabled = useSettingsStore((s) => s.telemetryEnabled);
  const setTelemetryEnabled = useSettingsStore((s) => s.setTelemetryEnabled);
  const [stage, setStage] = useState<Stage>('loading');
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [interests, setInterests] = useState('');
  const [humorStyle, setHumorStyle] = useState<MorpheusHumorStyle>('cheeky');
  const [proactivityLevel, setProactivityLevel] = useState<MorpheusProactivityLevel>('balanced');
  const [ambientVoiceEnabled, setAmbientVoiceEnabled] = useState(false);
  const [speakResponses, setSpeakResponses] = useState(true);
  const [suggestions, setSuggestions] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const silenceTimer = useRef<number | null>(null);
  const speechGeneration = useRef(0);
  const wasListening = useRef(false);
  const introInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadOnboarding().then(() => {
      if (!active) return;
      const status = useMorpheusCompanionStore.getState().onboarding;
      if (!status || status.completed) return;
      setName(status.preferences.preferredName);
      setInterests(status.preferences.interests ?? '');
      setHumorStyle(status.preferences.humorStyle ?? 'cheeky');
      setProactivityLevel(status.preferences.proactivityLevel ?? 'balanced');
      setAmbientVoiceEnabled(status.preferences.ambientVoiceEnabled);
      setSpeakResponses(status.preferences.speakResponses);
      setStage('name');
    });
    return () => { active = false; };
  }, [enabled, loadOnboarding]);

  useEffect(() => useMorpheusVoiceStore.subscribe((next, previous) => {
    if (next.source !== 'onboarding' || next.phase !== 'ready' || !next.transcript?.trim()) return;
    if (next.transcript === previous.transcript && previous.phase === 'ready') return;
    // Consume a new voice result once. A stage change must not copy the spoken
    // name into the first-request field or overwrite a later typed correction.
    if (stage === 'name') setName(next.transcript.trim().replace(/^(?:my name is|call me|i am|i'm)\s+/i, '').replace(/[.!?]+$/, '').slice(0, 80));
    if (stage === 'welcome') setRequest(next.transcript.trim());
  }), [stage]);

  const cancelSilence = useCallback(() => {
    if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
  }, []);
  useEffect(() => {
    if (stage !== 'welcome') return;
    const generation = ++speechGeneration.current;
    const armSuggestions = () => {
      if (generation !== speechGeneration.current) return;
      cancelSilence();
      silenceTimer.current = window.setTimeout(() => setSuggestions(true), SILENCE_MS);
    };
    // Never mislabel the Windows fallback as a natural voice. The text-only
    // first run remains usable until a real speech provider is configured.
    if (voice?.neuralSpeechAvailable && speakResponses) {
      const question = `${t('morpheus.activationV2.welcome', { name: name.trim() || t('morpheus.activationV2.friend') })} ${t('morpheus.activationV2.firstQuestion')}`;
      void playMorpheusSpeech(question, { neuralAvailable: true, format: voice.speechFormat, allowWindowsFallback: false, onSpeakingChange: setSpeaking })
        .then(armSuggestions).catch(armSuggestions);
    } else armSuggestions();
    return () => { speechGeneration.current += 1; cancelSilence(); stopMorpheusSpeech(); };
  }, [stage, voice?.neuralSpeechAvailable, voice?.speechFormat, speakResponses, name, t, cancelSilence]);
  useEffect(() => { if (request.trim() || voicePhase === 'listening') cancelSilence(); }, [request, voicePhase, cancelSilence]);
  useEffect(() => {
    if (stage === 'welcome' && wasListening.current && voicePhase !== 'listening' && !request.trim()) {
      cancelSilence();
      silenceTimer.current = window.setTimeout(() => setSuggestions(true), SILENCE_MS);
    }
    wasListening.current = voicePhase === 'listening';
  }, [stage, voicePhase, request, cancelSilence]);
  useEffect(() => () => { cancelSilence(); stopMorpheusSpeech(); }, [cancelSilence]);

  const preferences = (): MorpheusOnboardingPreferences => ({
    ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
    preferredName: name.trim().slice(0, 80), interests: interests.trim().slice(0, 240),
    humorStyle, proactivityLevel, personality: humorStyle === 'gentle' ? 'warm' : 'witty',
    proactiveCheckIns: proactivityLevel !== 'quiet', speakResponses,
    ambientVoiceEnabled: ambientVoiceEnabled && Boolean(voice?.transcriptionAvailable), wakePhrase: 'Morpheus',
  });
  const finish = async (firstRequest = ''): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    let completed: boolean;
    try { completed = await completeOnboarding(preferences()); }
    catch { completed = false; }
    setSaving(false);
    if (!completed) { setError(true); return false; }
    cancelSilence(); stopMorpheusSpeech();
    setDismissed(true); navigate('/');
    if (!firstRequest.trim()) return true;
    const text = firstRequest.trim();
    setObjective(text);
    setConversationDraft(text);
    try {
      const decision = await route(text, 'command-center');
      if (decision.route === 'objective') {
        if (await runObjective(decision.text, 'command-bar')) setConversationDraft('');
      }
      else if (decision.route === 'conversation') await submitConversation(decision.text, 'onboarding');
    } catch { /* The saved draft remains in Command Center for retry. */ }
    return true;
  };
  const availableVoices = voice?.availableSpeechVoices ?? speechVoicesForModel(voice?.settings.speechModelId ?? '');
  const previewVoices = availableVoices.length > 2 ? [availableVoices[0], availableVoices[Math.floor(availableVoices.length / 2)], availableVoices[availableVoices.length - 1]] : availableVoices;
  const previewVoice = async (selected: string) => {
    if (!voice?.neuralSpeechAvailable) return;
    stopMorpheusSpeech();
    try {
      await updateVoice({ speechVoice: selected as MorpheusSpeechVoice });
      // One bounded prepared audition covers greeting, humor and an explicitly
      // labeled example task update. No personality-model rewrite or OS voice.
      await playMorpheusSpeech(t('morpheus.activationV2.voiceSample'), { neuralAvailable: true, format: voice.speechFormat, allowWindowsFallback: false, onSpeakingChange: setSpeaking });
    } catch { setError(true); }
  };
  if (!enabled || dismissed || onboarding?.completed || stage === 'loading') return null;
  const listening = voiceSource === 'onboarding' && voicePhase === 'listening';
  const signalState = listening ? 'listening' : speaking ? 'speaking' : 'ready';

  return <Dialog.Root open onOpenChange={(open) => { if (!open) void finish(); }}><Dialog.Portal><Dialog.Content data-morpheus data-testid="morpheus-activation" data-stage={stage} className="morpheus-first-launch fixed inset-0 z-[9997] flex flex-col overflow-hidden bg-[#040907] text-[#edf5ef]" aria-describedby={undefined} onOpenAutoFocus={(event) => { event.preventDefault(); introInput.current?.focus(); }}>
    <Dialog.Title className="sr-only">{t('morpheus.title')}</Dialog.Title>
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-6"><span className="morpheus-setup-brand"><img src={morpheusLogo} alt="" />{t('morpheus.title')}</span><button type="button" aria-label={t('morpheus.activationV2.close')} onClick={() => void finish()} className="rounded p-2 text-[#a0b6aa] hover:text-white"><X size={16} /></button></header>
    <main className="morpheus-setup-main relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto text-center">
      <MorpheusFluidOrb state={signalState} identity="arrival" className={stage === 'connections' || stage === 'voice' || stage === 'personalize' ? 'h-14 w-14 shrink-0' : 'h-24 w-24 shrink-0'} label={t('morpheus.title')} />
      {stage === 'name' ? <div data-testid="morpheus-activation-intro" className="mt-4 w-full max-w-[580px]">
        <p className="text-sm text-[#a0b6aa]">{t('morpheus.activationV2.hello')}</p><h1 className="mt-3 text-[clamp(28px,4vw,38px)] font-semibold tracking-tight">{t('morpheus.activationV2.nameQuestion')}</h1>
        <form className="morpheus-setup-composer mt-6 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); setStage('connections'); }}>
          <button type="button" data-testid="activation-voice-start" disabled={!voice?.transcriptionAvailable} onClick={() => listening ? stopListening() : void startListening('onboarding')} aria-label={t('morpheus.activationV2.speak')} className="p-2 text-[#a0b6aa] disabled:opacity-40"><Mic size={17} /></button>
          <input ref={introInput} data-testid="activation-intro-name" autoFocus autoComplete="name" aria-label={t('morpheus.activationV2.nameQuestion')} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('morpheus.activationV2.inputPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#809b8b]" />
          <button data-testid="morpheus-activation-begin" type="submit" aria-label={t('morpheus.activationV2.continue')} className="p-2 text-[#53edb4]"><ArrowRight size={18} /></button>
        </form>
        <button type="button" data-testid="morpheus-activation-skip" onClick={() => setStage('connections')} className="mt-8 text-xs text-[#a0b6aa] hover:text-white">{t('morpheus.activationV2.skipName')}</button>
      </div> : null}
      {stage === 'connections' || stage === 'voice' ? <div data-testid={`activation-setup-${stage}`} className="mt-4 w-full max-w-2xl text-left">
        <h1 className="font-serif text-2xl font-normal tracking-tight">{t(`morpheus.experience.settings.${stage}`)}</h1><p className="mb-5 mt-2 text-sm leading-relaxed text-muted-foreground">{t(`morpheus.experience.settings.${stage}Body`)}</p>
        {stage === 'connections' ? <ProvidersSettings/> : <MorpheusVoiceSetup/>}
        <div className="mt-6 flex items-center justify-between gap-4"><button type="button" data-testid="activation-setup-skip" onClick={() => { setSpeakResponses(voice?.settings.speakResponses ?? true); setAmbientVoiceEnabled(voice?.settings.ambientEnabled ?? false); setStage(stage === 'connections' ? 'voice' : 'personalize'); }} className="text-sm text-muted-foreground underline">{t('morpheus.experience.setup.skip')}</button><button type="button" data-testid="activation-setup-continue" onClick={() => { setSpeakResponses(voice?.settings.speakResponses ?? true); setAmbientVoiceEnabled(voice?.settings.ambientEnabled ?? false); setStage(stage === 'connections' ? 'voice' : 'personalize'); }} className="rounded-full bg-[#53edb4] px-5 py-2.5 text-sm font-semibold text-[#04110a]">{t('morpheus.activationV2.continue')}</button></div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t(providersConfigured ? 'morpheus.experience.setup.configured' : 'morpheus.experience.setup.unconfigured')}</p>
      </div> : null}
      {stage === 'welcome' ? <div data-testid="morpheus-activation-welcome" className="mt-5 w-full max-w-[640px]">
        <p className="text-sm text-[#a0b6aa]">{t('morpheus.activationV2.welcome', { name: name.trim() || t('morpheus.activationV2.friend') })}</p><h1 className="mt-3 text-[clamp(27px,4vw,38px)] font-semibold tracking-tight">{t('morpheus.activationV2.firstQuestion')}</h1>
        <form className="morpheus-setup-composer mt-6 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (request.trim()) void finish(request); }}>
          <button type="button" disabled={!voice?.transcriptionAvailable} onClick={() => listening ? stopListening() : void startListening('onboarding')} aria-label={t('morpheus.activationV2.speak')} className="p-2 text-[#a0b6aa] disabled:opacity-40"><Mic size={17} /></button>
          <input data-testid="activation-first-request" autoFocus aria-label={t('morpheus.activationV2.firstQuestion')} value={request} onChange={(event) => setRequest(event.target.value)} placeholder={t('morpheus.activationV2.inputPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#809b8b]" />
          <button type="submit" disabled={saving || !request.trim()} className="p-2 text-[#53edb4] disabled:opacity-40" aria-label={t('morpheus.activationV2.send')}><ArrowRight size={18} /></button>
        </form>
        {suggestions && !request.trim() ? <div data-testid="activation-suggestions" className="mt-4 flex flex-wrap justify-center gap-2">{(['openYouTube', 'research', 'helpMe'] as const).map((key) => <button key={key} type="button" onClick={() => { setRequest(t(`morpheus.activationV2.suggestions.${key}`)); setSuggestions(false); }} className="rounded-full border border-[#34684d] bg-[#102018] px-3 py-1.5 text-xs text-[#c8e7d2] hover:border-[#53edb4]">{t(`morpheus.activationV2.suggestions.${key}`)}</button>)}</div> : null}
        <button type="button" data-testid="morpheus-activation-personalize" onClick={() => { cancelSilence(); setStage('personalize'); }} className="mt-7 text-xs text-[#a0b6aa] underline-offset-4 hover:text-white hover:underline">{t('morpheus.activationV2.personalize')}</button>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t(providersConfigured ? 'morpheus.experience.setup.configured' : 'morpheus.experience.setup.unconfigured')}</p>
        <button type="button" data-testid="morpheus-activation-enter" disabled={saving} onClick={() => void finish()} className="mt-4 rounded-full border border-border px-5 py-2 text-sm">{t('morpheus.activationV2.enter')}</button>
      </div> : null}
      {stage === 'personalize' ? <div data-testid="morpheus-activation-preferences" className="mt-4 w-full max-w-[590px] text-left">
        <h1 className="text-center text-[clamp(26px,4vw,34px)] font-semibold tracking-tight">{t('morpheus.activationV2.makeItYours')}</h1><p className="mt-2 text-center text-xs text-[#a0b6aa]">{t('morpheus.activationV2.optional')}</p>
        <label className="mt-6 block text-xs text-[#a0b6aa]">{t('morpheus.activationV2.interests')}<input data-testid="activation-interests" maxLength={240} value={interests} onChange={(event) => setInterests(event.target.value)} placeholder={t('morpheus.activationV2.interestsPlaceholder')} className="mt-2 h-11 w-full rounded-lg border border-[#34684d] bg-[#0e1b15] px-3 text-sm text-white outline-none focus:border-[#53edb4]" /></label>
        <p className="mt-5 text-xs text-[#a0b6aa]">{t('morpheus.activationV2.humor')}</p><div className="mt-2 flex gap-2">{(['gentle', 'cheeky', 'unfiltered'] as const).map((style) => <button key={style} type="button" data-testid={`activation-humor-${style}`} data-selected={humorStyle === style} onClick={() => setHumorStyle(style)} className="morpheus-setup-choice">{t(`morpheus.activationV2.humorStyles.${style}`)}</button>)}</div>
        <p className="mt-3 text-sm italic text-muted-foreground">{t(`morpheus.experience.personality.${humorStyle}`)}</p>
        <p className="mt-5 text-xs text-[#a0b6aa]">{t('morpheus.activationV2.checkIns')}</p><div className="mt-2 flex gap-2">{(['quiet', 'balanced', 'talkative'] as const).map((level) => <button key={level} type="button" data-testid={`activation-proactivity-${level}`} data-selected={proactivityLevel === level} onClick={() => setProactivityLevel(level)} className="morpheus-setup-choice">{t(`morpheus.activationV2.proactivity.${level}`)}</button>)}</div>
        <p className="mt-5 text-xs text-[#a0b6aa]">{t('morpheus.activationV2.voice')}</p><div className="mt-2 flex gap-2">{previewVoices.map((candidate, index) => <button key={candidate} type="button" data-testid={`activation-voice-preview-${index + 1}`} data-selected={voice?.settings.speechVoice === candidate} disabled={!voice?.neuralSpeechAvailable} onClick={() => void previewVoice(candidate)} className="morpheus-setup-choice inline-flex items-center gap-2"><Volume2 size={13} />{candidate}</button>)}</div>
        {!voice?.neuralSpeechAvailable ? <p data-testid="activation-voice-honesty" className="mt-2 text-xs text-[#a0b6aa]">{t('morpheus.activationV2.voiceUnavailable')}</p> : null}
        <label className="mt-5 flex items-start gap-2 text-xs text-[#c8e7d2]"><input data-testid="activation-spoken-replies" type="checkbox" checked={speakResponses} onChange={(event) => setSpeakResponses(event.target.checked)} />{t('morpheus.activationV2.speakResponses')}</label>
        <label className="mt-3 flex items-start gap-2 text-xs text-[#c8e7d2]"><input type="checkbox" checked={ambientVoiceEnabled && Boolean(voice?.transcriptionAvailable)} disabled={!voice?.transcriptionAvailable} onChange={(event) => setAmbientVoiceEnabled(event.target.checked)} />{t('morpheus.activationV2.wakeConsent')}</label>
        <label className="mt-3 flex items-start gap-2 text-xs text-[#c8e7d2]"><input data-testid="activation-telemetry-choice" type="checkbox" checked={telemetryEnabled} onChange={(event) => setTelemetryEnabled(event.target.checked)} />{t('morpheus.activationV2.telemetry')}</label>
        <button type="button" data-testid="morpheus-activation-finish" onClick={() => setStage('welcome')} className="mt-6 flex items-center gap-2 rounded-full bg-[#53edb4] px-5 py-2.5 text-sm font-semibold text-[#04110a]">{t('morpheus.activationV2.continue')}<ArrowRight size={16} /></button>
      </div> : null}
      {stage === 'ready' ? <div data-testid="morpheus-activation-ready" className="mt-5 w-full max-w-[580px]"><h1 className="text-[clamp(28px,4vw,38px)] font-semibold tracking-tight">{t('morpheus.activationV2.ready')}</h1><p className="mt-3 text-sm text-[#a0b6aa]">{t('morpheus.activationV2.readyBody')}</p><button type="button" data-testid="morpheus-activation-enter" disabled={saving} onClick={() => void finish()} className="mt-7 rounded-full bg-[#53edb4] px-6 py-3 text-sm font-semibold text-[#04110a] disabled:opacity-50">{t('morpheus.activationV2.enter')}</button><div className="mt-6"><MorpheusTrayChoice beforeTransfer={() => finish()} onTransferred={() => undefined} /></div></div> : null}
      {error ? <p role="alert" className="mt-4 text-xs text-red-300">{t('morpheus.activationV2.error')}</p> : null}
    </main>
    <footer className="relative z-10 flex h-10 shrink-0 items-center justify-between border-t border-white/10 px-5 text-[11px] text-[#a0b6aa]"><span>{t('morpheus.activationV2.footer')}</span><span>{t('morpheus.activationV2.typeAlways')}</span></footer>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
