import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AcpPermissionCard } from '@/pages/Chat/AcpPermissionCard';
import { projectMorpheusConversation } from '@/lib/morpheus-conversation-projection';
import { useAcpChatSessionStore } from '@/stores/acp-chat-session';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
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
      {projection.messages.map((message) => (
        <div key={message.id} data-testid={`morpheus-conversation-${message.role}`}
          className={message.role === 'user'
            ? 'ml-6 rounded-xl bg-[#14231a] p-3 text-sm text-[#edf5ef]'
            : 'rounded-xl bg-[#0e1b15] p-3 text-sm leading-relaxed text-[#d8e7dd]'}>
          <span className="mb-2 block text-[11px] text-[#a0b6aa]">
            {t(message.role === 'user' ? 'morpheus.workspace.you' : 'morpheus.title')}
          </span>
          {message.text ? <p className="whitespace-pre-wrap break-words">{message.text}{message.truncated ? '…' : ''}</p> : null}
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
      </p> : null}
      {current && (loading || sending) ? <p role="status" className="text-xs text-[#a0b6aa]">
        {t('morpheus.conversation.waiting')}
      </p> : null}
    </div>
  );
}
