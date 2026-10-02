import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Expand, List, Square, X } from 'lucide-react';
import morpheusLogo from '@/assets/morpheus-logo.svg';
import { MatrixRain } from './boot/MatrixRain';
import { MorpheusFluidOrb } from './MorpheusFluidOrb';
import { MorpheusTaskSwitcher } from './MorpheusTaskSwitcher';
import { MorpheusVoiceButton } from './MorpheusVoiceButton';
import { MorpheusConversationThread } from './MorpheusConversationThread';
import { hostEvents } from '@/lib/host-events';
import { hostApi } from '@/lib/host-api';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
import { useMorpheusOperatorStore } from '@/stores/morpheus-operator';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';
import { resolveMorpheusSignalState } from './signal/signal-state';
import { MorpheusQuestionAnswers } from './MorpheusQuestionAnswers';
import { useAcpChatSessionStore } from '@/stores/acp-chat-session';

/** A compact conversation attached to the orb; expanding keeps the same task and draft. */
export function MorpheusQuickCommand() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const open = useMorpheusQuickCommandStore((s) => s.open);
  const trigger = useMorpheusQuickCommandStore((s) => s.trigger);
  const show = useMorpheusQuickCommandStore((s) => s.show);
  const hide = useMorpheusQuickCommandStore((s) => s.hide);
  const inputRef = useRef<HTMLInputElement>(null);
  const objective = useMorpheusConversationStore((s) => s.draftText);
  const setObjective = useMorpheusConversationStore((s) => s.setDraft);
  const selectedConversationId = useMorpheusConversationStore((s) => s.snapshot?.selectedConversationId ?? null);
  const submitConversation = useMorpheusConversationStore((s) => s.submit);
  const conversationSubmitting = useMorpheusConversationStore((s) => s.submitting);
  const conversationWorking = useAcpChatSessionStore((s) => s.sending || s.loading);
  const conversationError = useMorpheusConversationStore((s) => s.dispatchError);
  const blockedTurnId = useMorpheusConversationStore((s) => s.blockedTurnId);
  const retryConversation = useMorpheusConversationStore((s) => s.retryPending);
  const runObjective = useMorpheusCommandStore((s) => s.runObjective);
  const correctObjective = useMorpheusCommandStore((s) => s.correctObjective);
  const submitting = useMorpheusCommandStore((s) => s.submitting);
  const unsupported = useMorpheusCommandStore((s) => s.unsupported);
  const objectiveRun = useMorpheusCommandStore((s) => s.objectiveRun);
  const history = useMorpheusCommandStore((s) => s.objectiveHistory);
  const cancelObjective = useMorpheusCommandStore((s) => s.cancelObjective);
  const voicePhase = useMorpheusVoiceStore((s) => s.phase);
  const voicePresence = useMorpheusVoiceStore((s) => s.presence?.state);
  const cancelVoice = useMorpheusVoiceStore((s) => s.cancel);
  const route = useMorpheusOperatorStore((s) => s.route);
  const clarification = useMorpheusOperatorStore((s) => s.clarification);
  const clearClarification = useMorpheusOperatorStore((s) => s.clearClarification);
  const [showTasks, setShowTasks] = useState(false);
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const voiceBusy = ['requesting', 'listening', 'transcribing'].includes(voicePhase);
  const objectiveActive = Boolean(objectiveRun && !isObjectiveTerminalState(objectiveRun.state));
  const awaitingAnswer = Boolean(clarification) || objectiveRun?.state === 'needs-clarification' || objectiveRun?.state === 'waiting-for-approval';
  const busy = submitting || conversationSubmitting || voiceBusy;
  const compact = trigger !== null;
  const signalState = resolveMorpheusSignalState({ voicePhase, voicePresence: voicePresence === 'asleep' ? 'armed' : voicePresence, objectiveState: conversationWorking || conversationSubmitting ? 'understanding' : objectiveRun?.state });
  const recentRuns = (history?.runOrder ?? []).slice(0, 2).map((id) => history?.runsById[id]).filter((run) => run != null);

  useEffect(() => hostEvents.onMorpheusQuickCommand((payload) => show(payload.trigger)), [show]);
  useEffect(() => {
    let active = true;
    void hostApi.morpheus.companionSurfaceStatus().then((status) => {
      if (active && status.mode === 'compact' && status.trigger) show(status.trigger);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [show]);
  useEffect(() => {
    if (!open || trigger === 'wake-word') return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, trigger]);
  const close = useCallback(async (): Promise<void> => {
    hide();
    if (compact) await hostApi.morpheus.dismissCompanionSurface().catch(() => undefined);
  }, [compact, hide]);
  const expand = async (): Promise<void> => {
    if (compact) await hostApi.morpheus.expandCompanionSurface().catch(() => undefined);
    hide(); navigate('/');
  };
  useEffect(() => {
    if (!open || !compact || busy || conversationWorking || awaitingAnswer || ['speaking', 'preparing-speech', 'waiting-for-approval'].includes(voicePresence ?? '')) return;
    let timer: number;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { hide(); void hostApi.morpheus.dismissCompanionSurface().then(() => hostApi.window.hideToTray()).catch(() => undefined); }, 10_000);
    };
    reset();
    window.addEventListener('keydown', reset); window.addEventListener('pointerdown', reset); window.addEventListener('wheel', reset);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', reset); window.removeEventListener('pointerdown', reset); window.removeEventListener('wheel', reset); };
  }, [open, compact, busy, conversationWorking, awaitingAnswer, voicePresence, hide]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (voiceBusy) cancelVoice(); else void close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelVoice, close, open, voiceBusy]);
  const submit = async (): Promise<void> => {
    const text = objective.trim();
    if (!text || busy) return;
    if (answerFor && objectiveRun?.objectiveRunId === answerFor && objectiveRun.state === 'needs-clarification') {
      await correctObjective(text);
      setAnswerFor(null); setObjective('');
      return;
    }
    const decision = await route(text, 'quick-command');
    if (decision.route === 'objective') {
      if (await runObjective(decision.text, 'quick-command')) setObjective('');
    }
    else if (decision.route === 'conversation') {
      await submitConversation(decision.text, 'compact');
    } else if (decision.route === 'control') setObjective('');
  };

  return <AnimatePresence>{open ? <motion.div
    key="presence" initial={{ opacity: reducedMotion ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }}
    transition={{ duration: reducedMotion ? 0 : 0.16 }} data-morpheus data-testid="morpheus-quick-command"
    data-presentation={compact ? 'compact-window' : 'overlay'}
    className={`fixed inset-0 z-[90000] flex justify-center ${compact ? 'items-stretch bg-[#040907]' : 'items-start bg-black/65 px-4 pt-[10vh] backdrop-blur-lg'}`}
    role="dialog" aria-modal="true" aria-label={t('morpheus.quickCommand.title')}
    onMouseDown={(event) => { if (!compact && event.currentTarget === event.target && !busy) void close(); }}>
    <section className={`relative flex w-full flex-col overflow-hidden border border-[#345341] bg-[#040907] shadow-2xl shadow-black/80 ${compact ? 'h-full border-0' : 'max-h-[80vh] min-h-[340px] max-w-[500px] rounded-2xl'}`}>
      <div aria-hidden className="morpheus-first-launch-rain"><MatrixRain /></div>
      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2"><img src={morpheusLogo} alt="" className="h-5 w-5" /><span className="text-xs font-semibold text-[#edf5ef]">{t('morpheus.title')}</span></div>
        <div className="flex items-center gap-1"><button type="button" aria-label={t('morpheus.workspace.tasks')} aria-expanded={showTasks} onClick={() => setShowTasks((value) => !value)} className="rounded p-2 text-[#a0b6aa] hover:text-white"><List size={16} /></button><button type="button" data-testid="quick-command-expand" aria-label={t('morpheus.quickCommand.openCommandCenter')} onClick={() => void expand()} className="rounded p-2 text-[#a0b6aa] hover:text-white"><Expand size={16} /></button><button type="button" data-testid="quick-command-close" aria-label={t('morpheus.quickCommand.close')} onClick={() => void close()} className="rounded p-2 text-[#a0b6aa] hover:text-white"><X size={16} /></button></div>
      </header>
      {showTasks ? <div className="relative z-20 border-b border-white/10 bg-[#0e1b15] p-3"><MorpheusTaskSwitcher /></div> : null}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="flex items-center gap-3"><MorpheusFluidOrb state={signalState} className="h-11 w-11" label={t(`morpheus.signalOs.signal.${signalState}`)} /><div><p className="text-lg font-semibold text-[#edf5ef]">{t('morpheus.workspace.greeting')}</p><p data-testid="quick-command-live-state" className="text-xs text-[#a0b6aa]">{voiceBusy ? t(`morpheus.voice.states.${voicePhase}`) : t('morpheus.workspace.subtitle')}</p></div></div>
        <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2" role="log" aria-label={t('morpheus.workspace.conversation')}>
          <MorpheusConversationThread sessionKey={selectedConversationId} compact objectiveRuns={recentRuns}
            renderObjective={(run) => <div className="space-y-3"><div className="ml-6 rounded-xl bg-[#14231a] p-3 text-sm text-[#edf5ef]"><span className="mb-2 block text-[11px] text-[#a0b6aa]">{t('morpheus.workspace.you')}</span>{run.objective}</div><div className="text-sm leading-relaxed text-[#d8e7dd]"><span className="mb-2 block text-[11px] text-[#a0b6aa]">{t('morpheus.title')}</span>{run.clarification ?? run.error?.message ?? run.summary ?? t('morpheus.workspace.working')}</div></div>} />
          {conversationError ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{conversationError}{blockedTurnId ? <button type="button" onClick={retryConversation} className="ml-2 underline">{t('morpheus.conversation.retry')}</button> : null}</div> : null}
          {clarification ? <p className="rounded-xl border border-[#345341] bg-[#0e1b15] p-3 text-sm text-[#edf5ef]">{clarification}</p> : null}
          {open && objectiveRun?.state === 'needs-clarification' ? <MorpheusQuestionAnswers
            key={`${objectiveRun.objectiveRunId}:${objectiveRun.iteration}`}
            choices={objectiveRun.clarificationChoices}
            question={objectiveRun.clarification ?? null} speechPending={voicePresence === 'speaking' || voicePresence === 'preparing-speech'}
            inputActive={Boolean(objective.trim()) || voiceBusy} onAnswer={(answer) => { setAnswerFor(objectiveRun.objectiveRunId); setObjective(answer); inputRef.current?.focus(); }} /> : null}
          {unsupported ? <p className="text-xs text-amber-200">{t('morpheus.quickCommand.unsupported')}</p> : null}
        </div>
        <p data-testid="quick-command-objective-state" className="sr-only">{objectiveRun ? `${objectiveRun.objective} ${t(`morpheus.objective.states.${objectiveRun.state}`)}` : ''}</p>
        <span data-testid="quick-command-transcript" className="sr-only">{objectiveRun?.objective ?? objective}</span>
        <form className="morpheus-setup-composer mt-4 flex shrink-0 items-center gap-1" onSubmit={(event) => { event.preventDefault(); void submit(); }}><MorpheusVoiceButton source="quick-command" className="!h-8 !w-8 !rounded-full !border-0 !bg-transparent !text-[#a0b6aa]" /><input ref={inputRef} data-testid="quick-command-input" value={objective} disabled={busy} onChange={(event) => { setObjective(event.target.value); clearClarification(); }} placeholder={t('morpheus.workspace.placeholder')} className="min-w-0 flex-1 bg-transparent text-sm text-[#edf5ef] outline-none placeholder:text-[#a0b6aa]" />{objectiveActive ? <button type="button" data-testid="quick-command-cancel-objective" aria-label={t('morpheus.signalOs.stop')} onClick={() => void cancelObjective()} className="p-2 text-red-300"><Square size={14} /></button> : null}<button type="submit" data-testid="quick-command-submit" aria-label={t('morpheus.command.run')} disabled={!objective.trim() || busy} className="p-2 text-[#53edb4] disabled:opacity-40"><ArrowRight size={18} /></button></form>
      </div>
      <footer className="relative z-10 flex h-10 shrink-0 items-center justify-end border-t border-white/10 px-4 text-[11px] text-[#a0b6aa]">{t('morpheus.workspace.typing')}</footer>
    </section>
  </motion.div> : null}</AnimatePresence>;
}
