import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileText, List, Minimize2, MoreHorizontal, PanelBottomClose, Settings2, Square, X } from 'lucide-react';

import { MorpheusBrandMark } from '@/components/morpheus/MorpheusBrandMark';
import { hostApi } from '@/lib/host-api';
import { stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { CommandBar } from './CommandBar';
import { ArtifactsPanel } from './ArtifactsPanel';
import { ResearchSource } from './ResearchSource';
import { DesktopControlResult } from './DesktopControlResult';
import { morpheusSettingsPath } from '@/lib/morpheus-settings-route';
import { MorpheusFluidOrb } from '@/components/morpheus/MorpheusFluidOrb';
import { MorpheusConversationThread } from '@/components/morpheus/MorpheusConversationThread';
import { MorpheusConversationHistory } from '@/components/morpheus/MorpheusConversationHistory';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusArrivalStore } from '@/stores/morpheus-arrival';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
import { resolveMorpheusSignalState } from '@/components/morpheus/signal/signal-state';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';
import { useAcpChatSessionStore } from '@/stores/acp-chat-session';
import { morpheusObjectiveMessage, morpheusSimpleActionOutcome } from '@/lib/morpheus-objective-presentation';

/** The full workspace projects real tasks as conversation and useful results. */
export function CommandCenter() {
  const { t } = useTranslation('dashboard');
  const [showMore, setShowMore] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [trayError, setTrayError] = useState(false);
  const [detailsRunId, setDetailsRunId] = useState<string | null>(null);
  const onboarding = useMorpheusCompanionStore((state) => state.onboarding);
  const openWelcome = useMorpheusArrivalStore((state) => state.openWelcome);
  const welcomeOpen = useMorpheusArrivalStore((state) => state.welcomeOpen);
  const compactOpen = useMorpheusQuickCommandStore((state) => state.open);
  const presentationActive = !welcomeOpen && !compactOpen;
  const showQuickCommand = useMorpheusQuickCommandStore((state) => state.show);
  const preferredName = onboarding?.preferences.preferredName.trim() ?? '';
  const history = useMorpheusCommandStore((state) => state.objectiveHistory);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const recentArtifacts = useMorpheusCommandStore((state) => state.artifacts);
  const selectedConversationId = useMorpheusConversationStore((state) => state.snapshot?.selectedConversationId ?? null);
  const conversationWorking = useAcpChatSessionStore((state) => state.activeSessionKey === selectedConversationId && (state.sending || state.loading));
  const selectObjective = useMorpheusCommandStore((state) => state.selectObjective);
  const cancelObjective = useMorpheusCommandStore((state) => state.cancelObjective);
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);
  const voicePresence = useMorpheusVoiceStore((state) => state.presence?.state);
  const voiceRecovery = useMorpheusVoiceStore((state) => Boolean(state.recovery) || state.phase === 'error' && state.errorKind === 'repeat');
  const signalState = resolveMorpheusSignalState({ voicePhase, voicePresence: voicePresence === 'asleep' ? 'armed' : voicePresence, voiceRecovery, objectiveState: conversationWorking ? 'understanding' : objectiveRun?.state });
  const recentRuns = (history?.runOrder ?? []).slice(0, 8).map((id) => history?.runsById[id]).filter((run) => run != null);
  const activeCount = (history?.runOrder ?? []).filter((id) => {
    const run = history?.runsById[id];
    return run && !isObjectiveTerminalState(run.state);
  }).length;
  const resultArtifacts = objectiveRun?.artifacts ?? recentArtifacts;
  const inlineOutcome = morpheusSimpleActionOutcome(objectiveRun);
  const showDetails = detailsRunId === objectiveRun?.objectiveRunId;
  const answeringQuestion = objectiveRun?.state === 'needs-clarification'
    && (objectiveRun.clarificationChoices?.length ?? 0) >= 2
    && (objectiveRun.clarificationChoices?.length ?? 0) <= 4;
  const hasResult = (!inlineOutcome || showDetails)
    && (resultArtifacts.length > 0 || Boolean(objectiveRun && (objectiveRun.summary || objectiveRun.error || !answeringQuestion && objectiveRun.clarification)));
  const keepInTray = async (): Promise<void> => {
    setTrayError(false);
    stopMorpheusSpeech();
    try { await hostApi.window.hideToTray(); }
    catch { setTrayError(true); }
  };

  return (
    <div data-morpheus data-testid="command-center-page" data-empty={recentRuns.length === 0} data-has-result={hasResult} className="morpheus-workspace relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="morpheus-workspace-header relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <button type="button" data-testid="morpheus-open-welcome" onClick={openWelcome} className="flex items-center gap-2.5" title={t('morpheus.arrival.companion')}>
          <MorpheusBrandMark className="h-7 w-7" active={presentationActive} />
          <h1 data-testid="command-center-title" className="text-sm font-semibold tracking-tight text-white">{t('morpheus.title')}</h1>
        </button>
        <nav className="flex items-center gap-1" aria-label={t('morpheus.workspace.navigation')}>
          {activeCount > 0 ? <button type="button" data-testid="workspace-tasks-button" aria-expanded={showTasks} onClick={() => setShowTasks((value) => !value)} className="morpheus-workspace-icon-button" aria-label={t('morpheus.workspace.tasks')}><List className="h-[18px] w-[18px]" strokeWidth={1.6} /><span className="sr-only">{activeCount}</span></button> : null}
          <button type="button" data-testid="signal-nav-chat" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory} className="morpheus-workspace-icon-button" aria-label={t('morpheus.experience.history')} title={t('morpheus.experience.history')}><FileText data-testid="sidebar-nav-chat" className="h-[18px] w-[18px]" strokeWidth={1.6} /></button>
          <button type="button" data-testid="signal-nav-presence" onClick={() => showQuickCommand()} className="morpheus-workspace-icon-button" aria-label={t('morpheus.workspace.openCompact')} title={t('morpheus.workspace.openCompact')}><Minimize2 className="h-[18px] w-[18px]" strokeWidth={1.6} /></button>
          <Link to={morpheusSettingsPath()} data-testid="sidebar-nav-settings" className="morpheus-settings-button" aria-label={t('morpheus.signalOs.nav.settings')}><Settings2 className="h-4 w-4" strokeWidth={1.6} /><span>{t('morpheus.signalOs.nav.settings')}</span></Link>
          <div className="relative">
            <button type="button" data-testid="signal-nav-advanced" className="morpheus-workspace-icon-button" aria-label={t('morpheus.signalOs.more')} aria-expanded={showMore} onClick={() => setShowMore((value) => !value)}><MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.6} /></button>
            {showMore ? <div data-testid="signal-nav-advanced-menu" className="morpheus-workspace-more absolute right-0 top-9 z-30 max-h-[65vh] w-44 overflow-y-auto rounded-lg border border-white/15 p-1 shadow-xl">
              {([
                ['chat', 'chat', 'advanced-chat'], ['settings/advanced', 'settings', 'advanced-settings'], ['missions', 'missions', 'missions'], ['projects', 'library', 'projects'], ['systems', 'systems', 'systems'],
                ['goals', 'goals', 'goals'], ['agent-profiles', 'agentProfiles', 'agent-profiles'],
                ['workflows', 'workflows', 'workflows'], ['schedules', 'schedules', 'schedules'],
                ['activity', 'activity', 'activity'], ['models', 'models', 'models'], ['agents', 'agents', 'agents'],
                ['channels', 'channels', 'channels'], ['skills', 'skills', 'skills'], ['cron', 'cron', 'cron'],
              ] as const).map(([path, label, id]) => <Link key={path} to={`/${path}`} data-testid={`sidebar-nav-${id}`} onClick={() => setShowMore(false)} className="block rounded px-3 py-2 text-xs text-[#d8e7dd] hover:bg-white/10">{t(`morpheus.signalOs.nav.${label}`)}</Link>)}
            </div> : null}
          </div>
        </nav>
      </header>
      {showHistory ? <MorpheusConversationHistory onClose={() => setShowHistory(false)} /> : null}

      <div className="morpheus-workspace-content relative z-10 mx-auto flex w-full min-h-0 flex-1 flex-col">
        <div className="morpheus-workspace-presence flex shrink-0 items-center gap-4">
          <MorpheusFluidOrb state={signalState} active={presentationActive} className="h-16 w-16 shrink-0" label={t(`morpheus.signalOs.signal.${signalState}`)} />
          <div className="min-w-0">
            <h2 className="text-[clamp(22px,3vw,27px)] font-semibold leading-tight tracking-[-0.035em] text-[#edf5ef]">{preferredName ? t('morpheus.workspace.greetingNamed', { name: preferredName }) : t('morpheus.workspace.greeting')}</h2>
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
              <MorpheusConversationThread sessionKey={selectedConversationId} compact={false} objectiveRuns={recentRuns}
                renderObjective={(run) => {
                  const message = morpheusObjectiveMessage(run, t, history?.plansByObjectiveRunId[run.objectiveRunId]);
                  const selected = objectiveRun?.objectiveRunId === run.objectiveRunId;
                  const active = !isObjectiveTerminalState(run.state);
                  const simple = morpheusSimpleActionOutcome(run);
                  return <div className="morpheus-workspace-exchange">
                <button type="button" data-testid={objectiveRun?.objectiveRunId === run.objectiveRunId ? 'workspace-selected-task' : undefined} onClick={() => selectObjective(run.objectiveRunId)} className={`morpheus-workspace-message morpheus-workspace-user-message morpheus-conversation-user-bubble text-left ${objectiveRun?.objectiveRunId === run.objectiveRunId ? 'is-selected' : ''}`}>
                  <span className="morpheus-workspace-speaker">{t('morpheus.workspace.you')}</span>
                  <span className="block text-sm leading-relaxed text-[#edf5ef]">{run.objective}</span>
                </button>
                {message ? <div className="morpheus-workspace-message morpheus-workspace-reply morpheus-conversation-reply">
                  <span className="morpheus-workspace-speaker">{t('morpheus.title')}</span>
                  <p data-testid={selected ? 'command-center-objective-summary' : undefined} className="text-sm leading-relaxed text-[#edf5ef]">{message}</p>
                  {selected && simple ? <button type="button" data-testid="workspace-action-details" aria-expanded={showDetails} onClick={() => setDetailsRunId(showDetails ? null : run.objectiveRunId)} className="mt-2 text-xs text-[#a0b6aa] underline underline-offset-4 hover:text-white">{t(showDetails ? 'morpheus.actionOutcome.hideDetails' : 'morpheus.actionOutcome.showDetails')}</button> : null}
                </div> : <span className="sr-only" role="status">{t(`morpheus.objective.states.${run.state}`)}</span>}
                {selected && active ? <button type="button" data-testid="plan-cancel-objective" onClick={() => void cancelObjective()} className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#b8c9be] hover:text-white"><Square className="h-3 w-3 fill-current" />{t('morpheus.signalOs.stop')}</button> : null}
              </div>;
                }} />
            </div>
            <CommandBar />
          </section>

          {hasResult ? <aside data-testid="workspace-result" className="morpheus-workspace-result min-h-0 min-w-0 overflow-y-auto border-l border-white/10 pl-7">
            <FileText className="mb-5 h-5 w-5 text-[#53edb4]" strokeWidth={1.6} />
            <h3 className="text-xl font-semibold tracking-tight text-[#edf5ef]">{t('morpheus.workspace.result')}</h3>
            {objectiveRun ? <><p data-testid="command-center-objective-state" className="mt-2 text-xs text-[#a0b6aa]">{t(`morpheus.objective.states.${objectiveRun.state}`)}</p>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-[#d8e7dd]">{morpheusObjectiveMessage(objectiveRun, t, history?.plansByObjectiveRunId[objectiveRun.objectiveRunId])}</p></> : null}
            {resultArtifacts.length ? <ul className="mt-6 space-y-3 border-t border-white/10 pt-4">{resultArtifacts.filter((artifact) => artifact.kind === 'report').map((artifact) => <li key={artifact.artifactId} data-testid="morpheus-artifact" data-kind={artifact.kind} className="break-all text-xs leading-relaxed text-[#a0b6aa]">
              {artifact.data.controlKind ? <DesktopControlResult data={artifact.data} /> : artifact.data.sourceType === 'public-https' ? <ResearchSource data={artifact.data} /> : typeof artifact.data.browserSnapshot === 'string' ? <article data-testid="browser-observation-result" className="space-y-3 break-words">
                <h4 className="text-base font-semibold text-[#edf5ef]">{artifact.data.title}</h4>
                <p className="text-xs text-[#a0b6aa]">{artifact.data.url}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#d8e7dd]">{artifact.data.excerpt}</p>
              </article> : <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{Object.entries(artifact.data).map(([key, value]) => <div key={key} className="min-w-0"><dt className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#7d9b88]">{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd className="text-sm text-[#d8e7dd]">{value}</dd></div>)}</dl>}
            </li>)}</ul> : null}
            {resultArtifacts.some((artifact) => artifact.kind !== 'report') ? <ArtifactsPanel items={resultArtifacts.filter((artifact) => artifact.kind !== 'report')} showRoot={false} /> : null}
          </aside> : objectiveRun && inlineOutcome ? <p data-testid="command-center-objective-state" className="sr-only">{t(`morpheus.objective.states.${objectiveRun.state}`)}</p> : null}
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
