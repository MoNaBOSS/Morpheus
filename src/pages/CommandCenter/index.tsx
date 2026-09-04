/** Morpheus Signal OS — Command projection of one Main-owned Objective Core. */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { CommandBar } from './CommandBar';
import { SignalContextHorizon } from './SignalContextHorizon';
import { SignalMissionStage } from './SignalMissionStage';
import { SignalTodayHorizon } from './SignalTodayHorizon';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusSystemsStore } from '@/stores/morpheus-systems';
import { resolveMorpheusSignalState } from '@/components/morpheus/signal/signal-state';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusArrivalStore } from '@/stores/morpheus-arrival';
import { PanelBottomClose } from 'lucide-react';

export function CommandCenter() {
  const { t } = useTranslation('dashboard');
  const openWelcome = useMorpheusArrivalStore((s) => s.openWelcome);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const loadActivity = useMorpheusFoundationStore((state) => state.loadActivity);
  const loadCompanion = useMorpheusCompanionStore((state) => state.loadAll);
  const loadSystems = useMorpheusSystemsStore((state) => state.load);
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);
  const voicePresence = useMorpheusVoiceStore((state) => state.presence?.state);
  const objectiveState = useMorpheusCommandStore((state) => state.objectiveRun?.state);
  const signalState = resolveMorpheusSignalState({
    voicePhase,
    // The Command layer is an explicit invocation surface. A dormant ambient
    // listener is still ready for direct voice or keyboard input here.
    voicePresence: voicePresence === 'asleep' ? 'armed' : voicePresence,
    objectiveState,
  });

  useEffect(() => {
    void Promise.all([loadModels(), loadActivity({ limit: 20 }), loadCompanion(), loadSystems()]);
  }, [loadModels, loadActivity, loadCompanion, loadSystems]);

  return (
    <div data-morpheus data-testid="command-center-page" className="morpheus-signal-os relative flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--morpheus-surface-1))]">
      <div aria-hidden className="morpheus-signal-os-field absolute inset-0" />
      <header className="relative z-10 flex h-[64px] shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
        <div className="flex items-center gap-3">
          <div>
            <h1 data-testid="command-center-title" className="font-serif text-base font-normal tracking-[0.16em]">{t('morpheus.title')}</h1>
            <p className="mt-0.5 text-[8px] uppercase tracking-[0.22em] text-muted-foreground">{t('morpheus.signalOs.commandLayer')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2" aria-live="polite">
          <button type="button" data-testid="morpheus-open-welcome" onClick={openWelcome} className="morpheus-fluid-link mr-5 inline-flex items-center gap-2"><PanelBottomClose size={15} />{t('morpheus.arrival.companion')}</button>
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--morpheus-accent))] shadow-[0_0_10px_hsl(var(--morpheus-glow))]" />
          <span data-testid="signal-os-live-state" className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t(`morpheus.signalOs.signal.${signalState}`)}</span>
        </div>
      </header>

      <div className="relative z-10 shrink-0 border-b border-white/[0.07] px-5 py-3">
        <CommandBar />
      </div>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_270px]" data-testid="signal-command-layout">
        <SignalTodayHorizon />
        <SignalMissionStage />
        <SignalContextHorizon />
      </div>
    </div>
  );
}
