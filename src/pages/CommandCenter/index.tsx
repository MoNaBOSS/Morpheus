import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileText, List, Minimize2, MoreHorizontal, PanelBottomClose, Settings2, Square, X } from 'lucide-react';

import morpheusLogo from '@/assets/morpheus-logo.svg';
import { hostApi } from '@/lib/host-api';
import { stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { CommandBar } from './CommandBar';
import { ArtifactsPanel } from './ArtifactsPanel';
import { MatrixRain } from '@/components/morpheus/boot/MatrixRain';
import { MorpheusFluidOrb } from '@/components/morpheus/MorpheusFluidOrb';
import { MorpheusConversationThread } from '@/components/morpheus/MorpheusConversationThread';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusArrivalStore } from '@/stores/morpheus-arrival';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
import { resolveMorpheusSignalState } from '@/components/morpheus/signal/signal-state';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';

/** The full workspace projects real tasks as conversation and useful results. */
export function CommandCenter() {
  const { t } = useTranslation('dashboard');
  const [showMore, setShowMore] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [trayError, setTrayError] = useState(false);
  const onboarding = useMorpheusCompanionStore((state) => state.onboarding);
  const openWelcome = useMorpheusArrivalStore((state) => state.openWelcome);
  const showQuickCommand = useMorpheusQuickCommandStore((state) => state.show);
  const preferredName = onboarding?.preferences.preferredName.trim() ?? '';
  const history = useMorpheusCommandStore((state) => state.objectiveHistory);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const recentArtifacts = useMorpheusCommandStore((state) => state.artifacts);
  const selectedConversationId = useMorpheusConversationStore((state) => state.snapshot?.selectedConversationId ?? null);
  const selectObjective = useMorpheusCommandStore((state) => state.selectObjective);
  const cancelObjective = useMorpheusCommandStore((state) => state.cancelObjective);
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);
  const voicePresence = useMorpheusVoiceStore((state) => state.presence?.state);
  const signalState = resolveMorpheusSignalState({ voicePhase, voicePresence: voicePresence === 'asleep' ? 'armed' : voicePresence, objectiveState: objectiveRun?.state });
  const recentRuns = (history?.runOrder ?? []).slice(0, 8).map((id) => history?.runsById[id]).filter((run) => run != null);
  const activeCount = (history?.runOrder ?? []).filter((id) => {
    const run = history?.runsById[id];
    return run && !isObjectiveTerminalState(run.state);
  }).length;
  const resultArtifacts = objectiveRun?.artifacts ?? recentArtifacts;
  const hasResult = resultArtifacts.length > 0 || Boolean(objectiveRun && (objectiveRun.summary || objectiveRun.error || objectiveRun.clarification));
  const keepInTray = async (): Promise<void> => {
    setTrayError(false);
    stopMorpheusSpeech();
    try { await hostApi.window.hideToTray(); }
    catch { setTrayError(true); }
  };

  return (
    <div data-morpheus data-testid="command-center-page" data-empty={recentRuns.length === 0} className="morpheus-workspace relative flex h-full min-h-0 flex-col overflow-hidden">
      <div aria-hidden className="morpheus-workspace-rain"><MatrixRain /></div>
      <header className="morpheus-workspace-header relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <button type="button" data-testid="morpheus-open-welcome" onClick={openWelcome} className="flex items-center gap-2.5" title={t('morpheus.arrival.companion')}>
          <img src={morpheusLogo} alt="" className="h-5 w-5" />
          <h1 data-testid="command-center-title" className="text-sm font-semibold tracking-tight text-white">{t('morpheus.title')}</h1>
        </button>
        <nav className="flex items-center gap-1" aria-label={t('morpheus.workspace.navigation')}>
          {activeCount > 0 ? <button type="button" data-testid="workspace-tasks-button" aria-expanded={showTasks} onClick={() => setShowTasks((value) => !value)} className="morpheus-workspace-icon-button" aria-label={t('morpheus.workspace.tasks')}><List className="h-[18px] w-[18px]" strokeWidth={1.6} /><span className="sr-only">{activeCount}</span></button> : null}
          <Link to="/chat" data-testid="signal-nav-chat" className="morpheus-workspace-icon-button" aria-label={t('morpheus.workspace.openChat')} title={t('morpheus.workspace.openChat')}><FileText data-testid="sidebar-nav-chat" className="h-[18px] w-[18px]" strokeWidth={1.6} /></Link>
          <button type="button" data-testid="signal-nav-presence" onClick={() => showQuickCommand()} className="morpheus-workspace-icon-button" aria-label={t('morpheus.workspace.openCompact')} title={t('morpheus.workspace.openCompact')}><Minimize2 className="h-[18px] w-[18px]" strokeWidth={1.6} /></button>
          <Link to="/settings" data-testid="sidebar-nav-settings" className="morpheus-workspace-icon-button" aria-label={t('morpheus.signalOs.nav.settings')} title={t('morpheus.signalOs.nav.settings')}><Settings2 className="h-[18px] w-[18px]" strokeWidth={1.6} /></Link>
          <div className="relative">
            <button type="button" data-testid="signal-nav-advanced" className="morpheus-workspace-icon-button" aria-label={t('morpheus.signalOs.more')} aria-expanded={showMore} onClick={() => setShowMore((value) => !value)}><MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.6} /></button>
            {showMore ? <div data-testid="signal-nav-advanced-menu" className="morpheus-workspace-more absolute right-0 top-9 z-30 max-h-[65vh] w-44 overflow-y-auto rounded-lg border border-white/15 p-1 shadow-xl">
              {([
                ['missions', 'missions', 'missions'], ['projects', 'library', 'projects'], ['systems', 'systems', 'systems'],
                ['goals', 'goals', 'goals'], ['agent-profiles', 'agentProfiles', 'agent-profiles'],
                ['workflows', 'workflows', 'workflows'], ['schedules', 'schedules', 'schedules'],
                ['activity', 'activity', 'activity'], ['models', 'models', 'models'], ['agents', 'agents', 'agents'],
                ['channels', 'channels', 'channels'], ['skills', 'skills', 'skills'], ['cron', 'cron', 'cron'],
              ] as const).map(([path, label, id]) => <Link key={path} to={`/${path}`} data-testid={`sidebar-nav-${id}`} onClick={() => setShowMore(false)} className="block rounded px-3 py-2 text-xs text-[#d8e7dd] hover:bg-white/10">{t(`morpheus.signalOs.nav.${label}`)}</Link>)}
            </div> : null}
          </div>
        </nav>
      </header>

      <div className="morpheus-workspace-content relative z-10 mx-auto flex w-full max-w-[1150px] min-h-0 flex-1 flex-col px-7 pb-3 pt-6 max-[640px]:px-5">
        <div className="flex shrink-0 items-center gap-4">
          <MorpheusFluidOrb state={signalState} className="h-20 w-20 shrink-0 max-[640px]:h-16 max-[640px]:w-16" label={t(`morpheus.signalOs.signal.${signalState}`)} />
          <div className="min-w-0">
            <h2 className="text-[clamp(22px,3vw,31px)] font-semibold leading-tight tracking-[-0.035em] text-[#edf5ef]">{preferredName ? t('morpheus.workspace.greetingNamed', { name: preferredName }) : t('morpheus.workspace.greeting')}</h2>
            <p className="mt-1 text-[13px] text-[#a0b6aa]">{t('morpheus.workspace.subtitle')}</p>
          </div>
        </div>

        {showTasks ? <div data-testid="workspace-task-list" className="morpheus-workspace-task-list absolute right-7 top-[118px] z-20 w-[min(360px,calc(100%-3rem))] rounded-xl border border-white/15 p-2 shadow-2xl">
          <div className="flex items-center justify-between px-2 py-1 text-xs text-[#a0b6aa]"><span>{t('morpheus.workspace.tasks')}</span><button type="button" onClick={() => setShowTasks(false)} aria-label={t('morpheus.workspace.close')}><X className="h-4 w-4" /></button></div>
          {recentRuns.filter((run) => !isObjectiveTerminalState(run.state)).map((run) => <button type="button" key={run.objectiveRunId} onClick={() => { selectObjective(run.objectiveRunId); setShowTasks(false); }} className="block w-full truncate rounded px-2 py-2 text-left text-xs text-[#edf5ef] hover:bg-white/10">{run.objective}</button>)}
        </div> : null}

        <div className={`morpheus-workspace-main mt-5 grid min-h-0 flex-1 gap-7 ${hasResult ? 'grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]' : 'grid-cols-1'}`}>
          <section className="morpheus-workspace-thread flex min-h-0 min-w-0 flex-col" aria-label={t('morpheus.workspace.conversation')}>
            <div className="morpheus-workspace-messages min-h-0 flex-1 overflow-y-auto pr-3" role="log" aria-label={t('morpheus.workspace.conversation')}>
              <MorpheusConversationThread sessionKey={selectedConversationId} compact={false} />
              {recentRuns.map((run) => <div key={run.objectiveRunId} className="morpheus-workspace-exchange">
                <button type="button" data-testid={objectiveRun?.objectiveRunId === run.objectiveRunId ? 'workspace-selected-task' : undefined} onClick={() => selectObjective(run.objectiveRunId)} className={`morpheus-workspace-message morpheus-workspace-user-message text-left ${objectiveRun?.objectiveRunId === run.objectiveRunId ? 'is-selected' : ''}`}>
                  <span className="morpheus-workspace-speaker">{t('morpheus.workspace.you')}</span>
                  <span className="block text-sm leading-relaxed text-[#edf5ef]">{run.objective}</span>
                </button>
                <div className="morpheus-workspace-message morpheus-workspace-reply">
                  <span className="morpheus-workspace-speaker">{t('morpheus.title')}</span>
                  <p data-testid={objectiveRun?.objectiveRunId === run.objectiveRunId ? 'command-center-objective-summary' : undefined} className="text-sm leading-relaxed text-[#edf5ef]">{run.clarification ?? run.error?.message ?? run.summary ?? t('morpheus.workspace.working')}</p>
                  {objectiveRun?.objectiveRunId === run.objectiveRunId && !isObjectiveTerminalState(run.state) ? <button type="button" data-testid="plan-cancel-objective" onClick={() => void cancelObjective()} className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#b8c9be] hover:text-white"><Square className="h-3 w-3 fill-current" />{t('morpheus.signalOs.stop')}</button> : null}
                </div>
              </div>)}
            </div>
            <CommandBar />
          </section>

          {hasResult ? <aside data-testid="workspace-result" className="morpheus-workspace-result min-h-0 min-w-0 overflow-y-auto border-l border-white/10 pl-7">
            <FileText className="mb-5 h-5 w-5 text-[#53edb4]" strokeWidth={1.6} />
            <h3 className="text-xl font-semibold tracking-tight text-[#edf5ef]">{t('morpheus.workspace.result')}</h3>
            {objectiveRun ? <><p data-testid="command-center-objective-state" className="mt-2 text-xs text-[#a0b6aa]">{t(`morpheus.objective.states.${objectiveRun.state}`)}</p>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-[#d8e7dd]">{objectiveRun.clarification ?? objectiveRun.error?.message ?? objectiveRun.summary ?? t('morpheus.workspace.working')}</p></> : null}
            {resultArtifacts.length ? <ul className="mt-6 space-y-3 border-t border-white/10 pt-4">{resultArtifacts.filter((artifact) => artifact.kind === 'report').map((artifact) => <li key={artifact.artifactId} data-testid="morpheus-artifact" data-kind={artifact.kind} className="break-all text-xs leading-relaxed text-[#a0b6aa]">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{Object.entries(artifact.data).map(([key, value]) => <div key={key} className="min-w-0"><dt className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#7d9b88]">{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd className="text-sm text-[#d8e7dd]">{value}</dd></div>)}</dl>
            </li>)}</ul> : null}
            {resultArtifacts.some((artifact) => artifact.kind !== 'report') ? <ArtifactsPanel items={resultArtifacts.filter((artifact) => artifact.kind !== 'report')} showRoot={false} /> : null}
          </aside> : null}
        </div>
      </div>
      <footer className="morpheus-workspace-footer relative z-10 flex h-10 shrink-0 items-center justify-between border-t border-white/10 px-5 text-[11px] text-[#a0b6aa]">
        <span data-testid="signal-os-live-state">{t(`morpheus.signalOs.signal.${signalState}`)}</span>
        <div className="flex items-center gap-3">
          {trayError ? <span role="alert" className="text-[#edaa85]">{t('morpheus.arrival.trayUnavailable')}</span> : null}
          <button type="button" data-testid="workspace-tray" onClick={() => void keepInTray()} className="inline-flex items-center gap-1.5 hover:text-[#edf5ef]"><span>{t('morpheus.arrival.tray')}</span><PanelBottomClose className="h-3.5 w-3.5" strokeWidth={1.6} /></button>
        </div>
      </footer>
    </div>
  );
}
