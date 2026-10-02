import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useProviderStore } from '@/stores/providers';
import { AcpPermissionCard } from '@/pages/Chat/AcpPermissionCard';
import { AcpMarkdownPart } from '@/pages/Chat/AcpMessageSegment';
import { interleaveMorpheusConversation, projectMorpheusConversation } from '@/lib/morpheus-conversation-projection';
import { useAcpChatSessionStore } from '@/stores/acp-chat-session';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
import { useChatStore } from '@/stores/chat';
import type { MorpheusAssistantPendingTurn, MorpheusAssistantTurn } from '@shared/morpheus/assistant-session-types';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

const EMPTY_PENDING_TURNS: MorpheusAssistantPendingTurn[] = [];
const EMPTY_TURNS: MorpheusAssistantTurn[] = [];
const EMPTY_OBJECTIVES: MorpheusObjectiveRun[] = [];

/** The same ACP messages are projected into compact and full Morpheus surfaces. */
export function MorpheusConversationThread({
  sessionKey,
  compact,
  objectiveRuns = EMPTY_OBJECTIVES,
  renderObjective,
}: {
  sessionKey: string | null;
  compact: boolean;
  objectiveRuns?: readonly MorpheusObjectiveRun[];
  renderObjective?: (run: MorpheusObjectiveRun) => ReactNode;
}) {
  const { t } = useTranslation('dashboard');
  const timeline = useAcpChatSessionStore((state) => state.timeline);
  const activeSessionKey = useAcpChatSessionStore((state) => state.activeSessionKey);
  const sending = useAcpChatSessionStore((state) => state.sending);
  const loading = useAcpChatSessionStore((state) => state.loading);
  const error = useAcpChatSessionStore((state) => state.error);
  const turnTimingsByUserMessageId = useAcpChatSessionStore((state) => state.turnTimingsByUserMessageId);
  const respondPermission = useAcpChatSessionStore((state) => state.respondPermission);
  const pendingTurns = useMorpheusConversationStore((state) => state.snapshot?.pendingTurns ?? EMPTY_PENDING_TURNS);
  const turns = useMorpheusConversationStore((state) => state.snapshot?.turns ?? EMPTY_TURNS);
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
  const entries = useMemo(() => interleaveMorpheusConversation({
    projection, sessionKey, turns, pendingTurns, objectiveRuns,
    turnTimingsByUserMessageId: current ? turnTimingsByUserMessageId : undefined,
  }), [current, objectiveRuns, pendingTurns, projection, sessionKey, turnTimingsByUserMessageId, turns]);
  const threadRef = useRef<HTMLDivElement>(null);
  // Follow new work until the reader deliberately scrolls into older history.
  // A newly submitted request returns to the live end; passive chunks do not.
  const followLatest = useRef(true);
  const lastInput = useRef<string | null>(null);
  useEffect(() => {
    const scroller = threadRef.current?.parentElement?.closest<HTMLElement>('[role="log"]');
    if (!scroller) return;
    // Resize, scroll anchoring and our own scroll-to-end also emit scroll events.
    // Only an older-history gesture may stop following; native compact resize
    // must not mistake an intermediate full-size layout for a reader's choice.
    const readOlder = () => { if (scroller.scrollHeight > scroller.clientHeight) followLatest.current = false; };
    const onScroll = () => {
      if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 40) followLatest.current = true;
    };
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) readOlder(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || event.key === ' ' && event.shiftKey) readOlder();
    };
    let touchY: number | undefined;
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY; };
    const onTouchMove = (event: TouchEvent) => {
      const nextY = event.touches[0]?.clientY;
      if (touchY !== undefined && nextY !== undefined && nextY > touchY) readOlder();
      touchY = nextY;
    };
    const onPointerDown = (event: PointerEvent) => {
      // Native/custom scrollbar dragging is also an explicit reading gesture.
      const right = scroller.getBoundingClientRect().right;
      if (event.target === scroller && event.clientX >= right - Math.max(12, scroller.offsetWidth - scroller.clientWidth)) readOlder();
    };
    const onResize = () => { if (followLatest.current) scroller.scrollTop = scroller.scrollHeight; };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('wheel', onWheel, { passive: true });
    scroller.addEventListener('keydown', onKeyDown);
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: true });
    scroller.addEventListener('pointerdown', onPointerDown);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    observer?.observe(scroller);
    if (threadRef.current) observer?.observe(threadRef.current);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('keydown', onKeyDown);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('pointerdown', onPointerDown);
      observer?.disconnect();
    };
  }, [compact, sessionKey]);
  useLayoutEffect(() => {
    const input = [...entries].reverse().find((entry) => entry.kind !== 'message' || entry.message.role === 'user');
    const inputId = `${sessionKey}:${input?.kind === 'objective' ? input.run.objectiveRunId : input?.kind === 'queued' ? input.turn.turnId : input?.message.messageId ?? ''}`;
    if (lastInput.current !== inputId) followLatest.current = true;
    lastInput.current = inputId;
    const scroller = threadRef.current?.parentElement?.closest<HTMLElement>('[role="log"]');
    if (scroller && followLatest.current) scroller.scrollTop = scroller.scrollHeight;
  }, [entries, sessionKey]);

  return (
    <div ref={threadRef} data-testid={compact ? 'quick-command-conversation' : 'workspace-conversation'}
      className={compact ? 'space-y-3' : 'space-y-4'}>
      {!entries.length && !loading && !sending && !error ? <div data-testid="morpheus-first-success" className="rounded-xl border border-border/60 bg-surface-input p-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{t(configured ? 'morpheus.experience.setup.configured' : 'morpheus.experience.setup.unconfigured')}</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setDraft(t('morpheus.activationV2.suggestions.openYouTube'))} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-white/5">{t('morpheus.activationV2.suggestions.openYouTube')}</button><Link to="/settings?section=connections" className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-white/5">{t('morpheus.experience.settings.connections')}</Link></div>
      </div> : null}
      {entries.map((entry) => {
        if (entry.kind === 'objective') return <div key={`objective:${entry.run.objectiveRunId}`} data-morpheus-entry="objective" data-objective-id={entry.run.objectiveRunId}>{renderObjective?.(entry.run)}</div>;
        if (entry.kind === 'queued') return <div key={`queued:${entry.turn.turnId}`} data-testid="morpheus-conversation-queued" data-morpheus-entry="queued"
          className="ml-6 rounded-xl bg-[#14231a] p-3 text-sm text-[#edf5ef]">
          <span className="mb-2 block text-[11px] text-[#a0b6aa]">{t('morpheus.workspace.you')}</span>
          <p className="whitespace-pre-wrap break-words">{entry.turn.text}</p>
          <p className="mt-2 text-xs text-[#a0b6aa]">{t('morpheus.conversation.queued')}</p>
        </div>;
        const { message } = entry;
        return <div key={`message:${message.id}`} data-testid={`morpheus-conversation-${message.role}`} data-morpheus-entry="message" data-message-id={message.messageId}
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
        </div>;
      })}
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
