import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, Square } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { MorpheusVoiceButton } from '@/components/morpheus/MorpheusVoiceButton';
import { useMorpheusOperatorStore } from '@/stores/morpheus-operator';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
import { useAcpChatSessionStore } from '@/stores/acp-chat-session';
import { MorpheusLiveVoiceCaption } from '@/components/morpheus/MorpheusLiveVoiceCaption';
import { morpheusSettingsPath } from '@/lib/morpheus-settings-route';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { MorpheusQuestionAnswers } from '@/components/morpheus/MorpheusQuestionAnswers';
import { MorpheusVoiceRecoveryCue } from '@/components/morpheus/MorpheusVoiceRecoveryCue';

export function CommandBar() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const input = useMorpheusConversationStore((state) => state.draftText);
  const setInput = useMorpheusConversationStore((state) => state.setDraft);
  const submitConversation = useMorpheusConversationStore((state) => state.submit);
  const conversationSubmitting = useMorpheusConversationStore((state) => state.submitting);
  const conversationWorking = useAcpChatSessionStore((state) => state.sending);
  const cancelling = useAcpChatSessionStore((state) => state.cancelling);
  const cancelConversation = useAcpChatSessionStore((state) => state.cancel);
  const conversationError = useMorpheusConversationStore((state) => state.dispatchError);
  const blockedTurnId = useMorpheusConversationStore((state) => state.blockedTurnId);
  const retryConversation = useMorpheusConversationStore((state) => state.retryPending);
  const runObjective = useMorpheusCommandStore((state) => state.runObjective);
  const correctObjective = useMorpheusCommandStore((state) => state.correctObjective);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);
  const voicePresence = useMorpheusVoiceStore((state) => state.presence?.state);
  const submitting = useMorpheusCommandStore((state) => state.submitting);
  const unsupported = useMorpheusCommandStore((state) => state.unsupported);
  const route = useMorpheusOperatorStore((state) => state.route);
  const clarification = useMorpheusOperatorStore((state) => state.clarification);
  const clearClarification = useMorpheusOperatorStore((state) => state.clearClarification);
  const editInput = (text: string) => {
    const voice = useMorpheusVoiceStore.getState();
    voice.clearRecovery();
    if (voice.errorKind === 'repeat') voice.dismiss();
    if (['requesting', 'listening', 'transcribing'].includes(voice.phase)
      || ['speaking', 'preparing-speech'].includes(voice.presence?.state ?? '')) voice.cancel();
    setInput(text, objectiveRun?.state === 'needs-clarification' ? objectiveRun : null); clearClarification();
  };

  const submit = async (): Promise<void> => {
    const text = input.trim();
    if (!text || submitting || conversationSubmitting) return;
    try {
      const answerFor = useMorpheusConversationStore.getState().draftAnswerFor;
      if (answerFor) {
        const liveQuestion = useMorpheusCommandStore.getState().objectiveRun;
        if (liveQuestion?.objectiveRunId === answerFor.objectiveRunId && liveQuestion.iteration === answerFor.iteration && liveQuestion.state === 'needs-clarification') {
          await correctObjective(text);
          setInput('');
        }
        // Keep a retired answer bound until the user deliberately edits it.
        return;
      }
      const decision = await route(text, 'command-center');
      if (decision.route === 'objective') {
        if (await runObjective(decision.text, 'command-bar')) setInput('');
      }
      else if (decision.route === 'conversation') await submitConversation(decision.text, 'full');
      else if (decision.route === 'control') setInput('');
    } catch {
      // Main remains the execution authority; no local success is invented.
    }
  };

  return (
    <div data-testid="morpheus-command-bar" className="morpheus-workspace-composer-wrap shrink-0 pt-3">
      {objectiveRun?.state === 'needs-clarification' ? <MorpheusQuestionAnswers
        key={`${objectiveRun.objectiveRunId}:${objectiveRun.iteration}`} question={objectiveRun.clarification ?? null}
        choices={objectiveRun.clarificationChoices} speechPending={voicePresence === 'speaking' || voicePresence === 'preparing-speech'}
        inputActive={Boolean(input.trim()) || ['requesting', 'listening', 'transcribing'].includes(voicePhase)}
        onAnswer={(answer) => { setInput(answer, objectiveRun); document.querySelector<HTMLInputElement>('[data-testid="morpheus-command-input"]')?.focus(); }} /> : null}
      <MorpheusVoiceRecoveryCue source="command-center" onType={() => document.querySelector<HTMLInputElement>('[data-testid="morpheus-command-input"]')?.focus()}
        onRepair={() => navigate(morpheusSettingsPath('voice', '/', 'full'))} />
      <MorpheusLiveVoiceCaption surface="full" onEdit={(text) => { editInput(text); document.querySelector<HTMLInputElement>('[data-testid="morpheus-command-input"]')?.focus(); }} />
      {clarification ? <p data-testid="morpheus-command-clarification" className="mb-2 text-xs text-[#edf5ef]">{clarification}</p> : null}
      {conversationError ? <p role="alert" className="mb-2 text-xs text-red-200">{conversationError}{blockedTurnId ? <button type="button" onClick={retryConversation} className="ml-2 underline">{t('morpheus.conversation.retry')}</button> : null}</p> : null}
      {unsupported ? <div data-testid="morpheus-command-unsupported" className="mb-2 flex items-center justify-between gap-3 text-xs text-[#d8e7dd]"><span>{t('morpheus.command.unsupportedTitle')}</span><Link to={morpheusSettingsPath('connections')} className="text-[#53edb4] underline">{t('morpheus.command.configureProvider')}</Link></div> : null}
      <form className="morpheus-workspace-composer flex h-[52px] items-center gap-3 rounded-full border border-[#3b7657] bg-[#0e1b15]/90 px-4 focus-within:border-[#53edb4]" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <MorpheusVoiceButton source="command-center" className="!h-8 !w-8 !rounded-full !border-0 !bg-transparent !text-[#a0b6aa] hover:!text-[#53edb4]" />
        <input data-testid="morpheus-command-input" value={input} disabled={submitting || conversationSubmitting} placeholder={t('morpheus.workspace.placeholder')} aria-label={t('morpheus.command.label')} onChange={(event) => editInput(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-[#edf5ef] outline-none placeholder:text-[#a0b6aa] disabled:opacity-60" />
        {conversationWorking ? <button type="button" data-testid="morpheus-conversation-stop" disabled={cancelling} aria-label={t('morpheus.signalOs.stop')} onClick={() => void cancelConversation()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-red-300 hover:bg-white/10 disabled:opacity-35"><Square className="h-4 w-4" /></button> : null}
        <button type="submit" data-testid="morpheus-command-submit" disabled={submitting || conversationSubmitting || !input.trim()} aria-label={t('morpheus.command.run')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#53edb4] hover:bg-white/10 disabled:opacity-35">
          {submitting || conversationSubmitting ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-[#a0b6aa]">{t('morpheus.workspace.typing')}</p>
    </div>
  );
}
