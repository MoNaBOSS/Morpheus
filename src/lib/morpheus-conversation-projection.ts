import type { AcpTimelineSnapshot, MessageSegmentItem, PermissionItem } from '@/lib/acp/timeline-types';
import type { MorpheusAssistantPendingTurn, MorpheusAssistantTurn } from '@shared/morpheus/assistant-session-types';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';
import type { AcpTurnTiming } from '@/lib/acp/turn-timings';

export type MorpheusConversationMessage = {
  id: string;
  messageId: string;
  /** Existing ACP user message anchor, retained when bounded history starts at a reply. */
  turnId?: string;
  role: MessageSegmentItem['role'];
  text: string;
  mediaCount: number;
  truncated: boolean;
};

export type MorpheusConversationProjection = {
  messages: MorpheusConversationMessage[];
  permissions: PermissionItem[];
};

export type MorpheusConversationEntry =
  | { kind: 'message'; message: MorpheusConversationMessage }
  | { kind: 'queued'; turn: MorpheusAssistantPendingTurn }
  | { kind: 'objective'; run: MorpheusObjectiveRun };

/** Join existing owners for display without moving a task when it finishes. */
export function interleaveMorpheusConversation({
  projection, sessionKey, turns, pendingTurns, objectiveRuns, turnTimingsByUserMessageId = {},
}: {
  projection: MorpheusConversationProjection;
  sessionKey: string | null;
  turns: readonly MorpheusAssistantTurn[];
  pendingTurns: readonly MorpheusAssistantPendingTurn[];
  objectiveRuns: readonly MorpheusObjectiveRun[];
  /** Existing canonical timing map for this projection's current ACP session. */
  turnTimingsByUserMessageId?: Readonly<Record<string, AcpTurnTiming>>;
}): MorpheusConversationEntry[] {
  const admittedAt = new Map(turns.filter((turn) => turn.conversationId === sessionKey)
    .map((turn) => [turn.turnId, Date.parse(turn.admittedAt)]));
  let currentTurnTime: number | undefined;
  const entries: { entry: MorpheusConversationEntry; time?: number }[] = projection.messages.map((message) => {
    if (message.turnId || message.role === 'user') {
      const turnId = message.turnId ?? message.messageId;
      const admission = admittedAt.get(turnId);
      const timing = turnTimingsByUserMessageId[turnId];
      const transcriptStart = timing?.source === 'transcript' && timing.status === 'complete' ? timing.startedAtMs : undefined;
      currentTurnTime = admission !== undefined && Number.isFinite(admission) ? admission
        : transcriptStart !== undefined && transcriptStart > 0 && Number.isFinite(new Date(transcriptStart).getTime()) ? transcriptStart : undefined;
    }
    return { entry: { kind: 'message', message }, time: currentTurnTime };
  });
  for (const turn of pendingTurns) {
    if (turn.conversationId !== sessionKey || projection.messages.some((message) => message.messageId === turn.turnId || message.turnId === turn.turnId)) continue;
    entries.push({ entry: { kind: 'queued', turn }, time: Date.parse(turn.admittedAt) });
  }
  // Old ACP histories can lack an admission reference. Keep their original order;
  // do not manufacture dates or let missing dates reorder the known conversation.
  const runs = [...objectiveRuns].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const run of runs) {
    const time = Date.parse(run.createdAt);
    const next = entries.findIndex((item) => typeof item.time === 'number' && Number.isFinite(item.time) && item.time > time);
    entries.splice(next < 0 ? entries.length : next, 0, { entry: { kind: 'objective', run }, time });
  }
  return entries.map(({ entry }) => entry);
}

const DEFAULT_MESSAGE_LIMIT = 12;
const DEFAULT_TEXT_LIMIT = 4_000;

/** A bounded display projection of the existing ACP timeline, never a second chat history. */
export function projectMorpheusConversation(
  timeline: AcpTimelineSnapshot,
  sessionKey: string | null,
  options: { messageLimit?: number; textLimit?: number } = {},
): MorpheusConversationProjection {
  if (!sessionKey || timeline.sessionId !== sessionKey) {
    return { messages: [], permissions: [] };
  }

  const messageLimit = Math.max(1, Math.min(50, options.messageLimit ?? DEFAULT_MESSAGE_LIMIT));
  const textLimit = Math.max(100, Math.min(50_000, options.textLimit ?? DEFAULT_TEXT_LIMIT));
  const messages: MorpheusConversationMessage[] = [];
  const messagesByKey = new Map<string, MorpheusConversationMessage>();
  const permissions: PermissionItem[] = [];
  let turnId: string | undefined;

  for (const itemId of timeline.itemOrder) {
    const item = timeline.itemsById[itemId];
    if (item?.kind === 'permission' && item.status === 'pending') {
      permissions.push(item);
      continue;
    }
    if (item?.kind !== 'message-segment') continue;
    if (item.role === 'user') turnId = item.messageId;

    const key = `${item.role}\0${item.messageId}`;
    let message = messagesByKey.get(key);
    if (!message) {
      message = { id: item.id, messageId: item.messageId, turnId, role: item.role, text: '', mediaCount: 0, truncated: false };
      messagesByKey.set(key, message);
      messages.push(message);
    }
    for (const part of item.parts) {
      if (part.kind === 'image' || part.kind === 'attachment') {
        message.mediaCount += 1;
        continue;
      }
      if (part.kind !== 'markdown' && part.kind !== 'error') continue;
      const partText = part.kind === 'markdown' ? part.text : part.message;
      if (!partText) continue;
      const remaining = textLimit - message.text.length;
      if (remaining <= 0) {
        message.truncated = true;
        continue;
      }
      message.text += partText.slice(0, remaining);
      if (partText.length > remaining) message.truncated = true;
    }
  }

  // Keep non-text media visible, but do not render tool/debug material as a reply.
  const visibleMessages = messages.filter((message) => message.text.trim() || message.mediaCount > 0);
  return {
    messages: visibleMessages.slice(-messageLimit),
    permissions: permissions.slice(-3),
  };
}
