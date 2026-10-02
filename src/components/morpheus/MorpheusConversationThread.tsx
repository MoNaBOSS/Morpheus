import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useProviderStore } from '@/stores/providers';
import { AcpPermissionCard } from '@/pages/Chat/AcpPermissionCard';
import { AcpMarkdownPart } from '@/pages/Chat/AcpMessageSegment';
import { projectMorpheusConversation } from '@/lib/morpheus-conversation-projection';
import { useAcpChatSessionStore } from '@/stores/acp-chat-session';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
import { useChatStore } from '@/stores/chat';
import type { MorpheusAssistantPendingTurn } from '@shared/morpheus/assistant-session-types';

const EMPTY_PENDING_TURNS: MorpheusAssistantPendingTurn[] = [];

/** The same ACP messages are projected into compact and full Morpheus surfaces. */
export function MorpheusConversationThread({
  sessionKey,
  compact,
}: {
  sessionKey: string | null;
  compact: boolean;
}) {
  const { t } = useTranslation('dashboard');
  const timeline = useAcpChatSessionStore((state) => state.timeline);
  const activeSessionKey = useAcpChatSessionStore((state) => state.activeSessionKey);
  const sending = useAcpChatSessionStore((state) => state.sending);
  const loading = useAcpChatSessionStore((state) => state.loading);
  const error = useAcpChatSessionStore((state) => state.error);
  const respondPermission = useAcpChatSessionStore((state) => state.respondPermission);
  const pendingTurns = useMorpheusConversationStore((state) => state.snapshot?.pendingTurns ?? EMPTY_PENDING_TURNS);
  const restoreHistory = useMorpheusConversationStore((state) => state.restoreHistory);
  const setDraft = useMorpheusConversationStore((state) => state.setDraft);
  const configured = useProviderStore((state) => state.statuses.some((provider) => provider.hasKey));
  const hasTurnReference = useMorpheusConversationStore((state) => state.snapshot?.turns.some((turn) =>
    turn.conversationId === sessionKey && turn.status !== 'admitted') ?? false);
  const hasSavedSession = useChatStore((state) => state.sessions.some((session) =>
    session.key === sessionKey && !session.createdLocally));
  useEffect(() => {
    if (sessionKey && (hasTurnReference || hasSavedSession)) void restoreHistory(sessionKey);
  }, [hasSavedSession, hasTurnReference, restoreHistory, sessionKey]);
  const projection = useMemo(() => projectMorpheusConversation(timeline, sessionKey, {
    messageLimit: compact ? 8 : 24,
    textLimit: compact ? 4_000 : 20_000,
  }), [compact, sessionKey, timeline]);
  const current = activeSessionKey === sessionKey && timeline.sessionId === sessionKey;
  const awaitingProjection = pendingTurns.filter((turn) => (
    turn.conversationId === sessionKey
    && !projection.messages.some((message) => message.messageId === turn.turnId)
  ));

  return (
    <div data-testid={compact ? 'quick-command-conversation' : 'workspace-conversation'}
      className={compact ? 'space-y-3' : 'space-y-4'}>
      {!projection.messages.length && !awaitingProjection.length && !loading && !sending && !error ? <div data-testid="morpheus-first-success" className="rounded-xl border border-border/60 bg-surface-input p-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{t(configured ? 'morpheus.experience.setup.configured' : 'morpheus.experience.setup.unconfigured')}</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setDraft(t('morpheus.activationV2.suggestions.openYouTube'))} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-white/5">{t('morpheus.activationV2.suggestions.openYouTube')}</button><Link to="/settings?section=connections" className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-white/5">{t('morpheus.experience.settings.connections')}</Link></div>
      </div> : null}
      {projection.messages.map((message) => (
        <div key={message.id} data-testid={`morpheus-conversation-${message.role}`}
          className={message.role === 'user'
            ? 'ml-6 rounded-xl bg-[#14231a] p-3 text-sm text-[#edf5ef]'
            : 'rounded-xl bg-[#0e1b15] p-3 text-sm leading-relaxed text-[#d8e7dd]'}>
          <span className="mb-2 block text-[11px] text-[#a0b6aa]">
            {t(message.role === 'user' ? 'morpheus.workspace.you' : 'morpheus.title')}
          </span>
          {message.text ? message.role === 'assistant' ? <AcpMarkdownPart text={message.text + (message.truncated ? '…' : '')} isAnimating={current && sending}/> : <p className="whitespace-pre-wrap break-words">{message.text}{message.truncated ? '…' : ''}</p> : null}
          {message.mediaCount > 0 ? <p className="mt-2 text-xs text-[#a0b6aa]">
            {t('morpheus.conversation.mediaCount', { count: message.mediaCount })}
          </p> : null}
        </div>
      ))}
      {awaitingProjection.map((turn) => (
        <div key={turn.turnId} data-testid="morpheus-conversation-queued"
          className="ml-6 rounded-xl bg-[#14231a] p-3 text-sm text-[#edf5ef]">
          <span className="mb-2 block text-[11px] text-[#a0b6aa]">{t('morpheus.workspace.you')}</span>
          <p className="whitespace-pre-wrap break-words">{turn.text}</p>
          <p className="mt-2 text-xs text-[#a0b6aa]">{t('morpheus.conversation.queued')}</p>
        </div>
      ))}
      {current ? projection.permissions.map((permission) => (
        <AcpPermissionCard key={permission.id} item={permission}
          onSelect={(requestId, optionId) => { void respondPermission(requestId, optionId); }} />
      )) : null}
      {current && error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">
        {error}
        {sessionKey && !pendingTurns.some((turn) => turn.conversationId === sessionKey)
          ? <button type="button" className="ml-2 underline" onClick={() => void restoreHistory(sessionKey)}>
            {t('morpheus.conversation.retry')}
          </button> : null}
      </p> : null}
      {current && (loading || sending) ? <p role="status" className="text-xs text-[#a0b6aa]">
        {t('morpheus.conversation.waiting')}
      </p> : null}
    </div>
  );
}
